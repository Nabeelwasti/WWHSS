import { useState } from "react";
import { useAuth } from "./AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AdminPage } from "./pages/AdminPage";
import { AttendancePage } from "./pages/AttendancePage";
import { TimetablePage } from "./pages/TimetablePage";
import { QuizzesPage } from "./pages/QuizzesPage";
import { PublicHomePage } from "./pages/PublicHomePage";
import { useLanguage, LanguageToggle } from "./i18n";
import { AssistantLauncher } from "./components/AssistantLauncher";
import { UpdateToast } from "./components/UpdateToast";

// These checks decide which nav links to SHOW — a UI convenience based on
// real role data from /auth/me, NOT the security boundary. The backend
// re-checks the real permission on every request regardless of what this
// menu shows.
function hasAdminRole(roleKeys: string[]) {
  return roleKeys.some((k) => k === "super_admin" || k === "principal");
}
function canMarkAttendance(roleKeys: string[]) {
  return roleKeys.some((k) => k === "teacher" || k === "class_teacher" || k === "super_admin");
}

type View = "dashboard" | "admin" | "attendance" | "timetable" | "quizzes";

export default function App() {
  const { user, booting } = useAuth();
  const { t } = useLanguage();
  const [view, setView] = useState<View>("dashboard");
  const [showLogin, setShowLogin] = useState(false);

  if (booting) {
    return (
      <div className="page page-narrow" style={{ textAlign: "center", paddingTop: "20vh" }}>
        <div className="skeleton" style={{ height: 12, width: "60%", margin: "0 auto 8px" }} />
        <div className="skeleton" style={{ height: 12, width: "40%", margin: "0 auto" }} />
      </div>
    );
  }

  if (!user) {
    // A real public school website for anonymous visitors, with a genuine
    // login option — not a forced login wall for content that should be
    // public (notices, events).
    return showLogin ? <LoginPage /> : <PublicHomePage onLoginClick={() => setShowLogin(true)} />;
  }

  const roleKeys = user.userRoles.map((ur) => ur.role.key);
  const showAdminLink = hasAdminRole(roleKeys);
  const showAttendanceLink = canMarkAttendance(roleKeys);
  const showQuizzesLink = Boolean(user.studentProfile);

  const navItem = (key: View, label: string) => (
    <button className={`nav-link${view === key ? " active" : ""}`} onClick={() => setView(key)}>
      {label}
    </button>
  );

  return (
    <div>
      <header className="app-header">
        <div className="app-header-row">
          <nav className="app-nav">
            {navItem("dashboard", t("nav.dashboard"))}
            {navItem("timetable", t("nav.timetable"))}
            {showQuizzesLink && navItem("quizzes", t("nav.quizzes"))}
            {showAttendanceLink && navItem("attendance", t("nav.attendance"))}
            {showAdminLink && navItem("admin", t("nav.admin"))}
          </nav>
          <LanguageToggle />
        </div>
      </header>

      {view === "admin" && showAdminLink && <AdminPage />}
      {view === "attendance" && showAttendanceLink && <AttendancePage />}
      {view === "timetable" && <TimetablePage />}
      {view === "quizzes" && showQuizzesLink && user.studentProfile && (
        <QuizzesPage studentProfileId={user.studentProfile.id} />
      )}
      {(view === "dashboard" ||
        (view === "admin" && !showAdminLink) ||
        (view === "attendance" && !showAttendanceLink) ||
        (view === "quizzes" && !showQuizzesLink)) && <DashboardPage />}

      {/* Available on every screen once logged in — a real, scoped
          assistant launcher rather than an intrusive forced "tour". */}
      <AssistantLauncher />
      <UpdateToast />
    </div>
  );
}
