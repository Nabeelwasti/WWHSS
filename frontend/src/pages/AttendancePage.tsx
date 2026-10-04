import { useEffect, useState } from "react";
import { api, ApiError, type StudentInRoster } from "../api";
import { useLanguage } from "../i18n.js";

type MyClass = { id: string; name: string; sections: { id: string; name: string }[] };
type Status = "present" | "absent" | "late" | "excused";

export function AttendancePage() {
  const { t } = useLanguage();
  const [classes, setClasses] = useState<MyClass[] | null>(null);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<StudentInRoster[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .myClasses()
      .then((res) => setClasses((res.classes as MyClass[] | null) ?? []))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your classes."));
  }, []);

  const selectedClass = classes?.find((c) => c.id === classId);

  async function loadRoster(section: string) {
    setSectionId(section);
    setStudents(null);
    setError(null);
    if (!section) return;
    try {
      const res = await api.studentsInSection(section);
      setStudents(res.students);
      const initial: Record<string, Status> = {};
      res.students.forEach((s) => (initial[s.id] = "present"));
      setStatuses(initial);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the class roster.");
    }
  }

  async function handleSave() {
    if (!students || students.length === 0) return;
    setSaving(true);
    setNotice(null);
    try {
      await api.markAttendance({
        classId,
        sectionId,
        date,
        records: students.map((s) => ({ studentProfileId: s.id, status: statuses[s.id] })),
      });
      setNotice(`Saved attendance for ${students.length} students on ${date}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save attendance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 16px 0" }}>{t("attendance.title")}</h1>

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

      {classes === null && !error && <p className="text-muted text-sm">{t("common.loading")}</p>}
      {classes?.length === 0 && (
        <p className="text-muted text-sm">
          No classes are assigned to you yet. Ask an administrator to assign you to a class/section.
        </p>
      )}

      {classes && classes.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          <select
            className="input"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              loadRoster("");
            }}
            aria-label={t("attendance.selectClass")}
          >
            <option value="">{t("attendance.selectClass")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={sectionId}
            onChange={(e) => loadRoster(e.target.value)}
            disabled={!classId}
            aria-label={t("attendance.selectSection")}
          >
            <option value="">{t("attendance.selectSection")}</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Attendance Date"
          />
        </div>
      )}

      {students && students.length === 0 && (
        <p className="text-muted text-sm">This section has no enrolled students yet.</p>
      )}

      {students && students.length > 0 && (
        <>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th scope="col">{t("attendance.rollNum")}</th>
                <th scope="col">{t("attendance.name")}</th>
                <th scope="col">{t("attendance.status")}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td>{s.rollNumber ?? "—"}</td>
                  <td>{s.user.fullName}</td>
                  <td>
                    <select
                      className="input"
                      value={statuses[s.id]}
                      onChange={(e) => setStatuses((prev) => ({ ...prev, [s.id]: e.target.value as Status }))}
                      aria-label={`Attendance status for ${s.user.fullName}`}
                    >
                      <option value="present">{t("attendance.present")}</option>
                      <option value="absent">{t("attendance.absent")}</option>
                      <option value="late">{t("attendance.late")}</option>
                      <option value="excused">{t("attendance.excused")}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary mt-4">
            {saving ? t("attendance.saving") : t("attendance.save")}
          </button>
        </>
      )}
    </div>
  );
}
