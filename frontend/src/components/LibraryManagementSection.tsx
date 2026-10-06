import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type BookSummary } from "../api";

export function LibraryManagementSection() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const result = await api.searchLibrary("");
      setBooks(result.books);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the library catalog.");
    }
  }

  useEffect(() => { refresh(); }, []);

  async function createBook(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.createBook({
        title: String(form.get("title")),
        author: String(form.get("author")),
        isbn: String(form.get("isbn") || "") || undefined,
        category: String(form.get("category") || "") || undefined,
      });
      formElement.reset();
      setError(null);
      setNotice("Book added to the catalog.");
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add the book.");
    }
  }

  async function addCopy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.createBookCopy({
        bookId: String(form.get("bookId")),
        barcode: String(form.get("barcode")),
      });
      formElement.reset();
      setError(null);
      setNotice("Book copy added.");
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add the book copy.");
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Library Catalog Administration</h2>
      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <form onSubmit={createBook} className="card" style={{ margin: 0 }}>
          <h3 className="card-title">Add Book</h3>
          <input className="input" name="title" placeholder="Title" aria-label="Title" required />
          <input className="input" name="author" placeholder="Author" aria-label="Author" required />
          <input className="input" name="isbn" placeholder="ISBN (optional)" aria-label="ISBN" />
          <input className="input" name="category" placeholder="Category (optional)" aria-label="Category" />
          <button className="btn btn-primary" type="submit">Add Book</button>
        </form>

        <form onSubmit={addCopy} className="card" style={{ margin: 0 }}>
          <h3 className="card-title">Add Physical Copy</h3>
          <select className="input" name="bookId" aria-label="Book" required defaultValue="">
            <option value="" disabled>Select book</option>
            {books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
          </select>
          <input className="input" name="barcode" placeholder="Barcode" aria-label="Barcode" required />
          <button className="btn btn-primary" type="submit">Add Copy</button>
        </form>
      </div>

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr><th scope="col">Title</th><th scope="col">Author</th><th scope="col">Category</th><th scope="col">Copies</th><th scope="col">Available</th></tr></thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id}>
                <td>{book.title}</td><td>{book.author}</td><td>{book.category || "—"}</td>
                <td>{book.copies.length}</td><td>{book.copies.filter((copy) => copy.available).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
