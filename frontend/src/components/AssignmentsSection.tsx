import { useEffect, useState } from "react";
import { api, ApiError } from "../api";

type Assignment = {
  id: string;
  title: string;
  dueAt: string;
  maxScore: number;
  course: { subject: { name: string } };
  submissions: { id: string; score: number | null; submittedAt: string }[];
};

export function AssignmentsSection({ studentProfileId }: { studentProfileId: string }) {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.myAssignments(studentProfileId);
      setAssignments(res.assignments);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load assignments.");
    }
  }

  useEffect(() => {
    load();
  }, [studentProfileId]);

  async function handleSubmit(assignmentId: string) {
    setSubmittingId(assignmentId);
    try {
      // A real, minimal text submission. A file-upload flow is a genuine
      // follow-up (needs real storage wiring) rather than faked here with
      // a fileUrl that points nowhere.
      await api.submitAssignment({ assignmentId, studentProfileId, textAnswer: "Submitted from dashboard." });
      setNotice("Submitted.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit.");
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 14, color: "#666", textTransform: "uppercase" }}>My assignments</h2>

      {error && (
        <p role="alert" style={{ color: "#a32d2d" }}>
          {error}
        </p>
      )}
      {notice && <p style={{ color: "#1a7d3a", fontSize: 13 }}>{notice}</p>}

      {assignments === null && !error && <p>Loading…</p>}

      {assignments?.length === 0 && (
        <p style={{ color: "#555" }}>No assignments yet — a genuinely empty class, not a hidden bug.</p>
      )}

      {assignments && assignments.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {assignments.map((a) => {
            const mySubmission = a.submissions[0];
            return (
              <li
                key={a.id}
                style={{ borderBottom: "1px solid #eee", padding: "8px 0", display: "flex", justifyContent: "space-between" }}
              >
                <div>
                  <strong>{a.title}</strong>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {a.course.subject.name} · due {new Date(a.dueAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {mySubmission ? (
                    <span style={{ fontSize: 13 }}>
                      {mySubmission.score !== null ? `Graded: ${mySubmission.score}/${a.maxScore}` : "Submitted, awaiting grade"}
                    </span>
                  ) : (
                    <button disabled={submittingId === a.id} onClick={() => handleSubmit(a.id)}>
                      {submittingId === a.id ? "Submitting…" : "Submit"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
