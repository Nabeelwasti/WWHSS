import { useEffect, useState } from "react";
import { api, ApiError } from "../api";

type QuizSummary = {
  id: string;
  title: string;
  course: { subject: { name: string } };
  attempts: { id: string; score: number }[];
  _count: { questions: number };
};
type QuizDetail = { id: string; title: string; questions: { id: string; prompt: string; choices: string[] }[] };

export function QuizzesPage({ studentProfileId }: { studentProfileId: string }) {
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
      // The server computes the real score from the actual stored correct
      // answers — this component never sees or trusts a client-side score.
      const res = await api.submitQuizAttempt(active.id, { studentProfileId, answers });
      setResult(res.score);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit quiz.");
    }
  }

  if (active) {
    const allAnswered = active.questions.every((q) => answers[q.id] !== undefined);
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 18 }}>{active.title}</h1>

        {result !== null ? (
          <p style={{ fontSize: 16, color: "#1a7d3a" }}>
            Your real, server-computed score: <strong>{result}/100</strong>
          </p>
        ) : (
          <>
            {active.questions.map((q, i) => (
              <div key={q.id} style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>
                  {i + 1}. {q.prompt}
                </p>
                {q.choices.map((choice, idx) => (
                  <label key={idx} style={{ display: "block", fontSize: 13, marginLeft: 8 }}>
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === idx}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                    />{" "}
                    {choice}
                  </label>
                ))}
              </div>
            ))}
            <button onClick={handleSubmit} disabled={!allAnswered}>
              Submit quiz
            </button>
          </>
        )}
        <div style={{ marginTop: 16 }}>
          <button onClick={() => setActive(null)}>Back to quizzes</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>Quizzes</h1>
      {error && (
        <p role="alert" style={{ color: "#a32d2d" }}>
          {error}
        </p>
      )}
      {quizzes === null && !error && <p>Loading…</p>}
      {quizzes?.length === 0 && <p style={{ color: "#555" }}>No quizzes assigned yet.</p>}
      {quizzes?.map((q) => {
        const myAttempt = q.attempts[0];
        return (
          <div key={q.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <span>
              {q.title} <span style={{ color: "#777", fontSize: 12 }}>({q.course.subject.name}, {q._count.questions} questions)</span>
            </span>
            {myAttempt ? (
              <span style={{ fontSize: 13 }}>Completed: {myAttempt.score}/100</span>
            ) : (
              <button onClick={() => startQuiz(q.id)}>Take quiz</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
