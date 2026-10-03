import { useEffect, useState } from "react";
import { api, ApiError, type ExamResultSummary } from "../api";

export function ExamResultsSection({ studentProfileId }: { studentProfileId: string }) {
  const [results, setResults] = useState<ExamResultSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .myExamResults(studentProfileId)
      .then((res) => setResults(res.results))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load results."));
  }, [studentProfileId]);

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 14, color: "#666", textTransform: "uppercase" }}>My results</h2>

      {error && (
        <p role="alert" style={{ color: "#a32d2d" }}>
          {error}
        </p>
      )}
      {results === null && !error && <p>Loading…</p>}
      {results?.length === 0 && (
        <p style={{ color: "#555" }}>No results recorded yet — nothing has been entered, not a hidden bug.</p>
      )}
      {results && results.length > 0 && (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Exam</th>
              <th>Subject</th>
              <th>Marks</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
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
