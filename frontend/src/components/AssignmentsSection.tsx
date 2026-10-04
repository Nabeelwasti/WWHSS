import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useLanguage } from "../i18n.js";

type Assignment = {
  id: string;
  title: string;
  dueAt: string;
  maxScore: number;
  course: { subject: { name: string } };
  submissions: { id: string; score: number | null; submittedAt: string }[];
};

export function AssignmentsSection({ studentProfileId }: { studentProfileId: string }) {
  const { t } = useLanguage();
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
    <section className="card">
      <h2 className="card-title">{t("assignments.myAssignments")}</h2>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="alert alert-success">
          {notice}
        </p>
      )}

      {assignments === null && !error && <p className="text-muted text-sm">{t("common.loading")}</p>}

      {assignments?.length === 0 && (
        <p className="text-muted text-sm">{t("assignments.noAssignments")}</p>
      )}

      {assignments && assignments.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {assignments.map((a) => {
            const mySubmission = a.submissions[0];
            return (
              <li
                key={a.id}
                style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}
                className="flex justify-between items-center"
              >
                <div>
                  <strong>{a.title}</strong>
                  <div className="text-muted text-xs">
                    {a.course.subject.name} · {t("assignments.due")} {new Date(a.dueAt).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  {mySubmission ? (
                    <span className="text-sm">
                      {mySubmission.score !== null ? `${t("assignments.graded")}: ${mySubmission.score}/${a.maxScore}` : t("assignments.awaiting")}
                    </span>
                  ) : (
                    <button
                      disabled={submittingId === a.id}
                      onClick={() => handleSubmit(a.id)}
                      className="btn btn-primary btn-sm"
                    >
                      {submittingId === a.id ? t("assignments.submitting") : t("assignments.submit")}
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
