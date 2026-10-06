import { useEffect, useState } from "react";
import { api, type ParentChildDashboard } from "../api";
import { useLanguage } from "../i18n";

export function ParentPage() {
  const { t } = useLanguage();
  const [children, setChildren] = useState<{ student: { id: string; admissionNo: string; user: { fullName: string }; class?: { name: string } | null; section?: { name: string } | null } }[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [dashboard, setDashboard] = useState<ParentChildDashboard | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    api.listParentChildren().then((r) => {
      const rows = r.children as typeof children;
      setChildren(rows);
      if (rows[0]) setSelected(rows[0].student.id);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDashboard(null);
    api.getParentChildDashboard(selected).then(setDashboard).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [selected]);

  return (
    <main className="page">
      <section className="card">
        <h1>{t("parent.title")}</h1>
        <p className="text-muted">{t("parent.subtitle")}</p>
        {error && <p role="alert">{error}</p>}
        {children.length === 0 ? <p>{t("parent.noChildren")}</p> : (
          <label>{t("parent.child")}
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {children.map((link) => <option key={link.student.id} value={link.student.id}>{link.student.user.fullName} — {link.student.class?.name ?? "N/A"} {link.student.section?.name ?? ""}</option>)}
            </select>
          </label>
        )}
      </section>
      {dashboard && <div className="grid">
        <section className="card"><h2>{t("parent.attendance")}</h2><p>{dashboard.attendance.filter((a) => a.status === "PRESENT").length} / {dashboard.attendance.length} {t("parent.recentRecords")}</p></section>
        <section className="card"><h2>{t("parent.results")}</h2>{dashboard.exams.length === 0 ? <p>{t("parent.none")}</p> : dashboard.exams.slice(0, 8).map((r) => <p key={r.id}>{r.exam.name} — {r.subject.name}: {String(r.marksObtained)}/{String(r.maxMarks)} {r.grade ?? ""}</p>)}</section>
        <section className="card"><h2>{t("parent.fees")}</h2>{dashboard.invoices.length === 0 ? <p>{t("parent.none")}</p> : dashboard.invoices.slice(0, 8).map((inv) => <p key={inv.id}>{inv.feeStructure.name}: {String(inv.amountDue)} — {inv.status}</p>)}</section>
        <section className="card"><h2>{t("parent.timetable")}</h2>{dashboard.timetable.map((slot, i) => <p key={i}>{slot.dayOfWeek}: {slot.startTime}–{slot.endTime} — {slot.subject.name} ({slot.teacher.fullName})</p>)}</section>
        <section className="card"><h2>{t("parent.notices")}</h2>{dashboard.notices.length === 0 ? <p>{t("parent.none")}</p> : dashboard.notices.map((n) => <article key={n.id}><strong>{n.title}</strong><p>{n.body}</p></article>)}</section>
        <section className="card"><h2>Assignments & LMS</h2>{dashboard.assignments.length === 0 ? <p>{t("parent.none")}</p> : dashboard.assignments.slice(0, 12).map((a) => <article key={a.id}><strong>{a.course.subject.name}: {a.title}</strong><p>{a.description || ""}</p><small>Due {new Date(a.dueAt).toLocaleString()} · {a.submissions[0]?.score ?? "Not graded"}/{a.maxScore}</small></article>)}</section>
        <section className="card"><h2>Library</h2>{dashboard.loans.length === 0 ? <p>{t("parent.none")}</p> : dashboard.loans.slice(0, 12).map((l) => <p key={l.id}>{l.bookCopy.book.title} — {l.returnedAt ? "Returned" : "Due " + new Date(l.dueAt).toLocaleDateString()} {l.fineAmount ? "· Fine " + String(l.fineAmount) : ""}</p>)}</section>
        <section className="card"><h2>Documents</h2>{dashboard.documents.length === 0 ? <p>{t("parent.none")}</p> : dashboard.documents.map((d) => <p key={d.id}>{d.docType} — {d.docNumber}</p>)}</section>
        <section className="card"><h2>Notifications</h2>{dashboard.notifications.length === 0 ? <p>{t("parent.none")}</p> : dashboard.notifications.slice(0, 12).map((n) => <p key={n.id}><strong>{n.title}</strong> — {n.body}</p>)}</section>
      </div>}
    </main>
  );
}
