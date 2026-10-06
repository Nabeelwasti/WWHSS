import { useState } from "react";
import { AttendancePage } from "./AttendancePage";
import { TimetablePage } from "./TimetablePage";
import { AiAssessmentStudioSection } from "../components/AiAssessmentStudioSection";
import { AssignmentsSection } from "../components/AssignmentsSection";
import { ExamResultsSection } from "../components/ExamResultsSection";
import { useAuth } from "../AuthContext";

type TeacherTab = "overview" | "attendance" | "timetable" | "lms" | "assessment";

export function TeacherPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TeacherTab>("overview");

  if (!user) return null;

  const tabs: [TeacherTab, string][] = [
    ["overview", "Teacher Dashboard"],
    ["attendance", "Attendance"],
    ["timetable", "Timetable"],
    ["lms", "LMS & Student Work"],
    ["assessment", "Assessment Studio"],
  ];

  return (
    <main className="page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <header className="card">
        <h1 style={{ margin: 0, fontSize: 22 }}>Teacher Portal</h1>
        <p className="text-muted text-sm" style={{ marginBottom: 0 }}>
          {user.fullName} — manage the classes, attendance, timetable and assessments actually assigned to your account.
        </p>
      </header>

      <nav className="flex gap-2 flex-wrap" aria-label="Teacher portal sections" style={{ margin: "12px 0" }}>
        {tabs.map(([key, label]) => (
          <button key={key} className={`btn ${tab === key ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <section className="card">
            <h2 className="card-title">Assigned teaching workspace</h2>
            <p className="text-sm text-muted">
              Your backend permission scope remains authoritative. Use the sections above for the operations your
              account is allowed to perform; records outside your class/subject scope are rejected by the API.
            </p>
          </section>
          <AttendancePage />
          <TimetablePage />
        </>
      )}

      {tab === "attendance" && <AttendancePage />}
      {tab === "timetable" && <TimetablePage />}
      {tab === "lms" && (
        <>
          <section className="card">
            <h2 className="card-title">Student work</h2>
            <p className="text-sm text-muted">
              The same authenticated account boundary is used for coursework data. Student-owned assignment and result
              views are shown only when the current identity has a StudentProfile; teacher grading remains protected by
              the backend LMS permissions.
            </p>
          </section>
          {user.studentProfile && <AssignmentsSection studentProfileId={user.studentProfile.id} />}
          {user.studentProfile && <ExamResultsSection studentProfileId={user.studentProfile.id} />}
        </>
      )}
      {tab === "assessment" && <AiAssessmentStudioSection />}
    </main>
  );
}
