import { useEffect, useState } from "react";
import { api, ApiError, type BookSummary, type LoanSummary } from "../api";
import { useLanguage } from "../i18n.js";

export function LibrarySection() {
  const { t } = useLanguage();
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
    <section className="card">
      <h2 className="card-title">{t("library.header")}</h2>
      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2 mb-2">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("library.placeholder")}
          aria-label={t("library.placeholder")}
        />
        <button onClick={search} className="btn btn-primary">
          {t("library.search")}
        </button>
      </div>

      {books && (
        <ul className="text-sm" style={{ paddingLeft: 16 }}>
          {books.length === 0 && <li style={{ listStyle: "none" }} className="text-muted">{t("library.noBooks")}</li>}
          {books.map((b) => (
            <li key={b.id}>
              {b.title} — {b.author}{" "}
              <span className="text-muted text-xs">
                ({b.copies.filter((c) => c.available).length}/{b.copies.length} {t("library.available")})
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="card-title text-sm mt-3" style={{ textTransform: "none", letterSpacing: 0 }}>
        {t("library.myLoans")}
      </h3>
      {loans === null && <p className="text-muted text-sm">{t("common.loading")}</p>}
      {loans?.length === 0 && <p className="text-muted text-sm">{t("library.noLoans")}</p>}
      {loans && loans.length > 0 && (
        <ul className="text-sm" style={{ paddingLeft: 16 }}>
          {loans.map((l) => (
            <li key={l.id}>
              {l.bookCopy.book.title} — {l.returnedAt ? t("library.returned") : `${t("library.due")} ${new Date(l.dueAt).toLocaleDateString()}`}
              {l.fineAmount ? ` (fine: ${l.fineAmount})` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
