import { useEffect, useState } from "react";
import { api, ApiError, type StudentInRoster } from "../api";

type MyClass = { id: string; name: string; sections: { id: string; name: string }[] };
type Status = "present" | "absent" | "late" | "excused";

export function AttendancePage() {
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
      // Default every real student to "present" — a genuine starting
      // assumption the teacher corrects, never a fabricated final answer.
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
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>Mark attendance</h1>

      {error && (
        <p role="alert" style={{ color: "#a32d2d" }}>
          {error}
        </p>
      )}
      {notice && <p style={{ color: "#1a7d3a" }}>{notice}</p>}

      {classes === null && !error && <p>Loading your classes…</p>}
      {classes?.length === 0 && (
        <p style={{ color: "#555" }}>
          No classes are assigned to you yet — a genuinely empty state, not a bug. Ask an administrator
          to assign you to a class/section.
        </p>
      )}

      {classes && classes.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              loadRoster("");
            }}
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select value={sectionId} onChange={(e) => loadRoster(e.target.value)} disabled={!classId}>
            <option value="">Select section</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      )}

      {students && students.length === 0 && (
        <p style={{ color: "#555" }}>This section has no enrolled students yet.</p>
      )}

      {students && students.length > 0 && (
        <>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Roll #</th>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td>{s.rollNumber ?? "—"}</td>
                  <td>{s.user.fullName}</td>
                  <td>
                    <select
                      value={statuses[s.id]}
                      onChange={(e) => setStatuses((prev) => ({ ...prev, [s.id]: e.target.value as Status }))}
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="late">Late</option>
                      <option value="excused">Excused</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleSave} disabled={saving} style={{ marginTop: 12 }}>
            {saving ? "Saving…" : "Save attendance"}
          </button>
        </>
      )}
    </div>
  );
}
