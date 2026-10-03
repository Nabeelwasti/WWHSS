import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { addBook, addCopy, searchBooks, issueBook, returnBook, listLoansForUser, LibraryError } from "./library.service.js";

export const libraryRouter = Router();
libraryRouter.use(authenticate);

const bookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  isbn: z.string().optional(),
  category: z.string().optional(),
});
libraryRouter.post("/books", authorize("library:manage"), async (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await addBook(parsed.data));
});

libraryRouter.post("/copies", authorize("library:manage"), async (req, res) => {
  const parsed = z.object({ bookId: z.string().uuid(), barcode: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await addCopy(parsed.data));
});

// Searching the catalog is useful to everyone in the school and carries no
// sensitive data — no special permission beyond being authenticated.
libraryRouter.get("/search", async (req, res) => {
  const q = (req.query.q as string) ?? "";
  res.json({ books: await searchBooks(q) });
});

const issueSchema = z.object({ bookCopyId: z.string().uuid(), userId: z.string().uuid(), dueAt: z.string() });
libraryRouter.post("/issue", authorize("library:manage"), async (req, res) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    res.status(201).json(await issueBook(parsed.data));
  } catch (e) {
    if (e instanceof LibraryError) return res.status(409).json({ error: e.message });
    throw e;
  }
});

libraryRouter.post("/loans/:loanId/return", authorize("library:manage"), async (req, res) => {
  try {
    res.json(await returnBook(req.params.loanId));
  } catch (e) {
    if (e instanceof LibraryError) return res.status(409).json({ error: e.message });
    throw e;
  }
});

// Anyone can see their OWN borrowing history — no special permission,
// since the query is scoped to the caller's own id, not client-supplied.
libraryRouter.get("/my-loans", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  res.json({ loans: await listLoansForUser(req.userId) });
});

