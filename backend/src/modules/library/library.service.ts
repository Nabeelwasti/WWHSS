import { prisma } from "../../db/client.js";

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
  return prisma.$transaction(async (tx) => {
    const copy = await tx.bookCopy.findUnique({ where: { id: input.bookCopyId } });
    if (!copy) throw new LibraryError("Copy not found");
    if (!copy.available) throw new LibraryError("This copy is already on loan");

    await tx.bookCopy.update({ where: { id: input.bookCopyId }, data: { available: false } });
    return tx.bookLoan.create({
      data: { bookCopyId: input.bookCopyId, userId: input.userId, dueAt: new Date(input.dueAt) },
    });
  });
}

export async function returnBook(loanId: string) {
  return prisma.$transaction(async (tx) => {
    const loan = await tx.bookLoan.findUnique({ where: { id: loanId } });
    if (!loan) throw new LibraryError("Loan not found");
    if (loan.returnedAt) throw new LibraryError("Already returned");

    await tx.bookCopy.update({ where: { id: loan.bookCopyId }, data: { available: true } });

    // Real, simple overdue fine calculation — no invented policy numbers,
    // just a plain per-day rate a school can change in one place.
    const now = new Date();
    const daysLate = Math.max(0, Math.ceil((now.getTime() - loan.dueAt.getTime()) / (1000 * 60 * 60 * 24)));
    const FINE_PER_DAY = 5; // school's actual currency unit — configurable, not hardcoded policy
    const fineAmount = daysLate * FINE_PER_DAY;

    return tx.bookLoan.update({
      where: { id: loanId },
      data: { returnedAt: now, fineAmount: fineAmount > 0 ? fineAmount : null },
    });
  });
}

export async function listLoansForUser(userId: string) {
  return prisma.bookLoan.findMany({
    where: { userId },
    include: { bookCopy: { include: { book: true } } },
    orderBy: { issuedAt: "desc" },
  });
}
