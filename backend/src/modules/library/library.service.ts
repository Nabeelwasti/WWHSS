import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";

export class LibraryError extends Error {}

export async function addBook(input: { title: string; author: string; isbn?: string; category?: string }) {
  return prisma.book.create({ data: input });
}

export async function addCopy(input: { bookId: string; barcode: string }) {
  return prisma.bookCopy.create({ data: input });
}

export async function searchBooks(query: string) {
  return prisma.book.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { author: { contains: query, mode: "insensitive" } },
      ],
    },
    include: { copies: true },
    take: 50,
  });
}

// Real availability check, not a UI assumption: a copy can't be issued
// twice, enforced by actually checking its `available` flag inside the
// same operation that flips it.
export async function issueBook(input: { bookCopyId: string; userId: string; dueAt: string }) {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new LibraryError(`User ${input.userId} not found`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bookCopy.updateMany({
      where: { id: input.bookCopyId, available: true },
      data: { available: false },
    });
    if (updated.count === 0) throw new LibraryError("This copy is already on loan or not found");

    const loan = await tx.bookLoan.create({
      data: { bookCopyId: input.bookCopyId, userId: input.userId, dueAt: new Date(input.dueAt) },
    });

    await tx.auditLog.create({
      data: {
        userId: input.userId,
        action: "library:issue",
        resource: `loan:${loan.id}:copy:${input.bookCopyId}`,
      },
    });

    return loan;
  });
}

export async function returnBook(loanId: string) {
  return prisma.$transaction(async (tx) => {
    const loan = await tx.bookLoan.findUnique({ where: { id: loanId } });
    if (!loan) throw new LibraryError("Loan not found");
    if (loan.returnedAt) throw new LibraryError("Already returned");

    await tx.bookCopy.update({ where: { id: loan.bookCopyId }, data: { available: true } });

    // Configurable overdue fine calculation using env.libraryFinePerDay
    const now = new Date();
    const daysLate = Math.max(0, Math.ceil((now.getTime() - loan.dueAt.getTime()) / (1000 * 60 * 60 * 24)));
    const fineAmount = daysLate * env.libraryFinePerDay;

    const updated = await tx.bookLoan.update({
      where: { id: loanId },
      data: { returnedAt: now, fineAmount: fineAmount > 0 ? fineAmount : null },
    });

    await tx.auditLog.create({
      data: {
        userId: loan.userId,
        action: "library:return",
        resource: `loan:${loanId}`,
        metadata: { fineAmount: fineAmount > 0 ? fineAmount : 0, daysLate },
      },
    });

    return updated;
  });
}


export async function listLoansForUser(userId: string) {
  return prisma.bookLoan.findMany({
    where: { userId },
    include: { bookCopy: { include: { book: true } } },
    orderBy: { issuedAt: "desc" },
  });
}
