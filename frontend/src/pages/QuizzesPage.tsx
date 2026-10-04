import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useLanguage } from "../i18n.js";

type QuizSummary = {
  id: string;
  title: string;
  course: { subject: { name: string } };
  attempts: { id: string; score: number }[];
  _count: { questions: number };
};
type QuizDetail = { id: string; title: string; questions: { id: string; prompt: string; choices: string[] }[] };

export function QuizzesPage({ studentProfileId }: { studentProfileId: string }) {
  const { t } = useLanguage();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [active, setActive] = useState<QuizDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    api
      .myQuizzes(studentProfileId)
      .then((res) => setQuizzes(res.quizzes))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load quizzes."));
  }, [studentProfileId]);

  async function startQuiz(quizId: string) {
    try {
      const quiz = await api.getQuiz(quizId, studentProfileId);
      setActive(quiz);
      setAnswers({});
      setResult(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this quiz.");
    }
  }

  async function handleSubmit() {
    if (!active) return;
    try {
      const res = await api.submitQuizAttempt(active.id, { studentProfileId, answers });
      setResult(res.score);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit quiz.");
    }
  }

  if (active) {
    const allAnswered = active.questions.every((q) => answers[q.id] !== undefined);
    return (
      <div className="page" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20 }}>{active.title}</h1>

        {result !== null ? (
          <p role="status" className="alert alert-success">
            {t("quizzes.scoreMsg")} <strong>{result}/100</strong>
          </p>
        ) : (
          <>
            {active.questions.map((q, i) => (
              <fieldset key={q.id} style={{ marginBottom: 16, border: "none", padding: 0 }}>
                <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  {i + 1}. {q.prompt}
                </legend>
                {q.choices.map((choice, idx) => (
                  <label key={idx} style={{ display: "block", fontSize: 13, marginLeft: 8, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === idx}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                    />{" "}
                    {choice}
                  </label>
                ))}
              </fieldset>
            ))}
            <button onClick={handleSubmit} disabled={!allAnswered} className="btn btn-primary mt-2">
              {t("quizzes.submitQuiz")}
            </button>
          </>
        )}
        <div style={{ marginTop: 16 }}>
          <button onClick={() => setActive(null)} className="btn btn-secondary">
            {t("quizzes.backToQuizzes")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>{t("quizzes.title")}</h1>
      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {quizzes === null && !error && <p className="text-muted text-sm">{t("common.loading")}</p>}
      {quizzes?.length === 0 && <p className="text-muted text-sm">No quizzes assigned yet.</p>}
      {quizzes?.map((q) => {
        const myAttempt = q.attempts[0];
        return (
          <div key={q.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <span>
              <strong>{q.title}</strong>{" "}
              <span className="text-muted text-xs">({q.course.subject.name}, {q._count.questions} questions)</span>
            </span>
            {myAttempt ? (
              <span className="text-sm">{t("quizzes.completed")}: {myAttempt.score}/100</span>
            ) : (
              <button onClick={() => startQuiz(q.id)} className="btn btn-primary btn-sm">
                {t("quizzes.takeQuiz")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
