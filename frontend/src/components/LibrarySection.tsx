import { useEffect, useState } from "react";
import { api, ApiError, type BookSummary, type LoanSummary } from "../api";

export function LibrarySection() {
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [loans, setLoans] = useState<LoanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .myLoans()
      .then((res) => setLoans(res.loans))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load loans."));
  }, []);

  async function search() {
    try {
      const res = await api.searchLibrary(query);
      setBooks(res.books);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search failed.");
    }
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 14, color: "#666", textTransform: "uppercase" }}>Library</h2>
      {error && (
        <p role="alert" style={{ color: "#a32d2d" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search books…" />
        <button onClick={search}>Search</button>
      </div>

      {books && (
        <ul style={{ fontSize: 13, paddingLeft: 16 }}>
          {books.length === 0 && <li style={{ color: "#555", listStyle: "none" }}>No matching books found.</li>}
          {books.map((b) => (
            <li key={b.id}>
              {b.title} — {b.author}{" "}
              <span style={{ color: "#777" }}>
                ({b.copies.filter((c) => c.available).length}/{b.copies.length} available)
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ fontSize: 13, color: "#666", marginTop: 12 }}>My current & past loans</h3>
      {loans === null && <p style={{ fontSize: 13 }}>Loading…</p>}
      {loans?.length === 0 && <p style={{ fontSize: 13, color: "#555" }}>No borrowing history yet.</p>}
      {loans && loans.length > 0 && (
        <ul style={{ fontSize: 13, paddingLeft: 16 }}>
          {loans.map((l) => (
            <li key={l.id}>
              {l.bookCopy.book.title} — {l.returnedAt ? "returned" : `due ${new Date(l.dueAt).toLocaleDateString()}`}
              {l.fineAmount ? ` (fine: ${l.fineAmount})` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
