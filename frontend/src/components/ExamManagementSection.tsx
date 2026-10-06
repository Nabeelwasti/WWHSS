import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type ClassSummary } from "../api";

export function ExamManagementSection() {
  const [exams, setExams] = useState<{ id: string; name: string; startDate: string; endDate: string; academicYear: { label: string } }[]>([]);
  const [years, setYears] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try {
      const [e, y] = await Promise.all([api.listExams(), api.listAcademicYears()]);
      setExams(e.exams);
      setYears(y.academicYears);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load exam administration.");
    }
  }
  useEffect(() => { refresh(); }, []);

  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.createExam({
        name: String(form.get("name")),
        academicYearId: String(form.get("academicYearId")),
        startDate: String(form.get("startDate")),
        endDate: String(form.get("endDate")),
      });
      event.currentTarget.reset();
      setNotice("Exam created in Draft state.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create exam.");
    }
  }

  async function transition(id: string, action: "publish" | "lock" | "finalize") {
    try {
      await api.transitionExam(id, action);
      setNotice("Exam lifecycle updated.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update exam lifecycle.");
    }
  }

  return <section className="card">
    <h2 className="card-title">Exams & Results Lifecycle</h2>
    {error && <p role="alert" className="alert alert-danger">{error}</p>}
    {notice && <p role="status" className="alert alert-success">{notice}</p>}
    <form onSubmit={createExam} className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 16 }}>
      <input className="input" name="name" placeholder="Exam name" aria-label="Exam name" required />
      <select className="input" name="academicYearId" aria-label="Academic year" required defaultValue=""><option value="" disabled>Select academic year</option>{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select>
      <input className="input" type="datetime-local" name="startDate" aria-label="Start date" required />
      <input className="input" type="datetime-local" name="endDate" aria-label="End date" required />
      <button className="btn btn-primary" type="submit">Create Draft Exam</button>
    </form>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th scope="col">Exam</th><th scope="col">Academic Year</th><th scope="col">Dates</th><th scope="col">Lifecycle</th><th scope="col">Actions</th></tr></thead>
        <tbody>{exams.map((exam) => <ExamRow key={exam.id} exam={exam} onTransition={transition} />)}</tbody>
      </table>
    </div>
  </section>;
}

function ExamRow({ exam, onTransition }: { exam: { id: string; name: string; startDate: string; endDate: string; academicYear: { label: string } }; onTransition: (id: string, action: "publish" | "lock" | "finalize") => Promise<void> }) {
  const [status, setStatus] = useState("DRAFT");
  useEffect(() => { api.getExamLifecycle(exam.id).then((r) => setStatus(r.lifecycle.status)).catch(() => undefined); }, [exam.id]);
  const next = status === "DRAFT" ? "publish" : status === "PUBLISHED" ? "lock" : status === "LOCKED" ? "finalize" : null;
  return <tr>
    <td>{exam.name}</td><td>{exam.academicYear.label}</td>
    <td>{new Date(exam.startDate).toLocaleDateString()} — {new Date(exam.endDate).toLocaleDateString()}</td>
    <td><span className="badge">{status}</span></td>
    <td>{next ? <button className="btn btn-ghost btn-sm" onClick={() => onTransition(exam.id, next)}>{next[0].toUpperCase() + next.slice(1)}</button> : <span className="text-muted">Finalized</span>}</td>
  </tr>;
}
