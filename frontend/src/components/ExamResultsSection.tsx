import { useEffect, useState } from "react";
import { api, ApiError, type ExamResultSummary } from "../api";
import { useLanguage } from "../i18n.js";

export function ExamResultsSection({ studentProfileId }: { studentProfileId: string }) {
  const { t } = useLanguage();
  const [results, setResults] = useState<ExamResultSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .myExamResults(studentProfileId)
      .then((res) => setResults(res.results))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load results."));
  }, [studentProfileId]);

  return (
    <section className="card">
      <h2 className="card-title">{t("exams.myResults")}</h2>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {results === null && !error && <p className="text-muted text-sm">{t("common.loading")}</p>}
      {results?.length === 0 && (
        <p className="text-muted text-sm">{t("exams.noResults")}</p>
      )}
      {results && results.length > 0 && (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th scope="col">{t("exams.exam")}</th>
              <th scope="col">{t("exams.subject")}</th>
              <th scope="col">{t("exams.marks")}</th>
              <th scope="col">{t("exams.grade")}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td>{r.exam.name}</td>
                <td>{r.subject.name}</td>
                <td>
                  {r.marksObtained}/{r.maxMarks}
                </td>
                <td>{r.grade ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
