import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

export function AiAssessmentStudioSection() {
  const [tests, setTests] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refreshTests() {
    try {
      const res = await api.listAiAssessmentTests();
      setTests(res.tests);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load AI assessment tests.");
    }
  }

  useEffect(() => {
    refreshTests();
  }, []);

  async function handleCreateTest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createAiAssessmentTest({
        title: String(form.get("title")),
        classId: String(form.get("classId")),
        subjectId: String(form.get("subjectId")),
        topic: String(form.get("topic")),
        difficulty: String(form.get("difficulty")),
        durationMin: parseInt(String(form.get("durationMin")), 10),
        totalMarks: parseFloat(String(form.get("totalMarks"))),
        language: String(form.get("language")),
      });
      setNotice("Assessment Test created in DRAFT mode.");
      e.currentTarget.reset();
      refreshTests();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create assessment test.");
    }
  }

  async function handleGenerateQuestions(testId: string) {
    setLoading(true);
    try {
      await api.generateAiAssessmentQuestions(testId, 5);
      setNotice("AI generated test questions successfully.");
      refreshTests();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "AI question generation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveTest(testId: string) {
    try {
      await api.approveAiAssessmentTest(testId);
      setNotice("Test approved for A4 printing and student assessment.");
      refreshTests();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not approve test.");
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">AI Assessment Studio</h2>
      <p className="text-sm text-muted">
        Select → Generate → Preview → Edit → Approve → A4 PDF → Print → Ingest & Score with AI & Teacher Final Authority.
      </p>

      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-danger">{error}</p>}

      {/* Test Creation Form */}
      <form onSubmit={handleCreateTest} className="flex gap-2 flex-wrap" style={{ marginBottom: 16 }}>
        <input className="input" name="title" placeholder="Test Title (e.g. Midterm Physics)" required />
        <input className="input" name="topic" placeholder="Topic (e.g. Newton's Laws)" required />
        <input className="input" name="classId" placeholder="Class ID (UUID)" required />
        <input className="input" name="subjectId" placeholder="Subject ID (UUID)" required />
        <select className="input" name="difficulty" defaultValue="MEDIUM">
          <option value="EASY">EASY</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HARD">HARD</option>
        </select>
        <input className="input" name="durationMin" type="number" defaultValue="60" placeholder="Duration (min)" style={{ width: 100 }} />
        <input className="input" name="totalMarks" type="number" defaultValue="50" placeholder="Total Marks" style={{ width: 100 }} />
        <select className="input" name="language" defaultValue="en">
          <option value="en">English</option>
          <option value="ur">Urdu (اردو)</option>
        </select>
        <button type="submit" className="btn btn-primary">Create Draft Test</button>
      </form>

      {/* Tests List */}
      <h4 style={{ margin: "16px 0 8px 0" }}>Assessment Tests</h4>
      {tests.length === 0 ? (
        <p className="text-sm text-muted">No assessment tests created yet.</p>
      ) : (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th>Title</th>
              <th>Class</th>
              <th>Subject</th>
              <th>Topic</th>
              <th>Status</th>
              <th>Questions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t: any) => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td>{t.title}</td>
                <td>{t.class?.name || "—"}</td>
                <td>{t.subject?.name || "—"}</td>
                <td>{t.topic}</td>
                <td><span className="badge">{t.status}</span></td>
                <td>{t._count?.questions || 0}</td>
                <td>
                  <div className="flex gap-2">
                    {t.status === "DRAFT" && (
                      <button disabled={loading} onClick={() => handleGenerateQuestions(t.id)} className="btn btn-ghost btn-sm">
                        {loading ? "Generating..." : "Generate AI Questions"}
                      </button>
                    )}
                    {t.status === "DRAFT" && t._count?.questions > 0 && (
                      <button onClick={() => handleApproveTest(t.id)} className="btn btn-primary btn-sm">
                        Approve Test
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
