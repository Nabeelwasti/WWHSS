import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AdminPage } from "./pages/AdminPage";
import { AttendancePage } from "./pages/AttendancePage";
import { TimetablePage } from "./pages/TimetablePage";
import { QuizzesPage } from "./pages/QuizzesPage";
import { ParentPage } from "./pages/ParentPage";
import { TeacherPage } from "./pages/TeacherPage";
import { PublicHomePage } from "./pages/PublicHomePage";
import { useLanguage, LanguageToggle } from "./i18n";
import { AssistantLauncher } from "./components/AssistantLauncher";
import { UpdateToast } from "./components/UpdateToast";

function hasAdminRole(roleKeys: string[]) {
  return roleKeys.some((k) => k === "super_admin" || k === "principal");
}
function canMarkAttendance(roleKeys: string[]) {
  return roleKeys.some((k) => k === "teacher" || k === "class_teacher" || k === "super_admin");
}
function hasTeacherRole(roleKeys: string[]) {
  return roleKeys.some((k) => k === "teacher" || k === "class_teacher");
}

type View = "dashboard" | "teacher" | "admin" | "attendance" | "timetable" | "quizzes" | "parent";

export default function App() {
  const { user, booting } = useAuth();
  const { t } = useLanguage();
  const [view, setView] = useState<View>(() => {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
    const candidate = path.split("/")[0] as View;
    return ["dashboard", "teacher", "admin", "attendance", "timetable", "quizzes", "parent"].includes(candidate) ? candidate : "dashboard";
  });
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      const candidate = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] as View;
      setView(["dashboard", "teacher", "admin", "attendance", "timetable", "quizzes", "parent"].includes(candidate) ? candidate : "dashboard");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(next: View) {
    setView(next);
    const path = next === "dashboard" ? "/" : "/" + next;
    window.history.pushState({}, "", path);
  }

  if (booting) {
    return (
      <div className="page page-narrow" style={{ textAlign: "center", paddingTop: "20vh" }}>
        <div className="skeleton" style={{ height: 12, width: "60%", margin: "0 auto 8px" }} />
        <div className="skeleton" style={{ height: 12, width: "40%", margin: "0 auto" }} />
      </div>
    );
  }

  if (!user) return showLogin ? <LoginPage /> : <PublicHomePage onLoginClick={() => setShowLogin(true)} />;

  const roleKeys = user.userRoles.map((ur) => ur.role.key);
  const showAdminLink = hasAdminRole(roleKeys);
  const showAttendanceLink = canMarkAttendance(roleKeys);
  const showTeacherLink = hasTeacherRole(roleKeys);
  const showQuizzesLink = Boolean(user.studentProfile);
  const showParentLink = roleKeys.some((k) => k === "parent" || k === "guardian");

  const navItem = (key: View, label: string) => (
    <button className={`nav-link${view === key ? " active" : ""}`} onClick={() => navigate(key)}>
      {label}
    </button>
  );

  return (
    <div>
      <header className="app-header">
        <div className="app-header-row">
          <nav className="app-nav">
            {navItem("dashboard", t("nav.dashboard"))}
            {showTeacherLink && navItem("teacher", "Teacher Portal")}
            {navItem("timetable", t("nav.timetable"))}
            {showQuizzesLink && navItem("quizzes", t("nav.quizzes"))}
            {showAttendanceLink && navItem("attendance", t("nav.attendance"))}
            {showAdminLink && navItem("admin", t("nav.admin"))}
            {showParentLink && navItem("parent", t("nav.parent"))}
          </nav>
          <LanguageToggle />
        </div>
      </header>

      {view === "teacher" && showTeacherLink && <TeacherPage />}
      {view === "admin" && showAdminLink && <AdminPage />}
      {view === "attendance" && showAttendanceLink && <AttendancePage />}
      {view === "timetable" && <TimetablePage />}
      {view === "parent" && showParentLink && <ParentPage />}
      {view === "quizzes" && showQuizzesLink && user.studentProfile && <QuizzesPage studentProfileId={user.studentProfile.id} />}
      {(view === "dashboard" ||
        (view === "teacher" && !showTeacherLink) ||
        (view === "admin" && !showAdminLink) ||
        (view === "attendance" && !showAttendanceLink) ||
        (view === "quizzes" && !showQuizzesLink) ||
        (view === "parent" && !showParentLink)) && <DashboardPage />}

      <AssistantLauncher />
      <UpdateToast />
    </div>
  );
}
