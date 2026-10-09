import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AdminPage, type AdminTab } from "./pages/AdminPage";
import { AttendancePage } from "./pages/AttendancePage";
import { TimetablePage } from "./pages/TimetablePage";
import { QuizzesPage } from "./pages/QuizzesPage";
import { ParentPage } from "./pages/ParentPage";
import { TeacherPage } from "./pages/TeacherPage";
import { PublicHomePage } from "./pages/PublicHomePage";
import { useLanguage, LanguageToggle } from "./i18n";
import { AssistantLauncher } from "./components/AssistantLauncher";
import { UpdateToast } from "./components/UpdateToast";

type View =
  | "dashboard" | "teacher" | "admin" | "attendance" | "timetable" | "quizzes" | "parent"
  | "staff" | "students" | "finance" | "library" | "assessment" | "documents" | "cms" | "backups" | "operations";

type NavigationItem = {
  key: View;
  label: string;
  icon: string;
  group: "Workspace" | "Teaching & learning" | "School operations" | "Administration";
  description: string;
};

const validViews: View[] = [
  "dashboard", "teacher", "admin", "attendance", "timetable", "quizzes", "parent",
  "staff", "students", "finance", "library", "assessment", "documents", "cms", "backups", "operations",
];

const adminTabs: Partial<Record<View, AdminTab>> = {
  admin: "users",
  staff: "staff",
  students: "students",
  finance: "finance",
  library: "library",
  assessment: "assessment",
  documents: "documents",
  cms: "cms",
  backups: "backups",
  operations: "operations",
};

function hasAdminRole(roleKeys: string[]) {
  return roleKeys.some((key) => key === "super_admin" || key === "principal");
}
function canMarkAttendance(roleKeys: string[]) {
  return roleKeys.some((key) => key === "teacher" || key === "class_teacher" || key === "super_admin");
}
function hasTeacherRole(roleKeys: string[]) {
  return roleKeys.some((key) => key === "teacher" || key === "class_teacher");
}

function resolveView(pathname: string): View {
  const candidate = pathname.replace(/^\\/+|\\/+$/g, "").split("/")[0] as View;
  return validViews.includes(candidate) ? candidate : "dashboard";
}

export default function App() {
  const { user, booting, logout } = useAuth();
  const { t } = useLanguage();
  const [view, setView] = useState<View>(() => resolveView(window.location.pathname));
  const [showLogin, setShowLogin] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onPopState = () => setView(resolveView(window.location.pathname));
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function navigate(next: View) {
    setView(next);
    setSearch("");
    const path = next === "dashboard" ? "/" : "/" + next;
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
  }

  if (booting) {
    return (
      <div className="boot-screen" role="status" aria-label="Loading your school workspace">
        <div className="boot-mark">W</div>
        <div className="boot-copy">
          <strong>WWHSS Digital Campus</strong>
          <span>Preparing your secure workspace…</span>
        </div>
        <div className="boot-progress"><span /></div>
      </div>
    );
  }

  if (!user) return showLogin ? <LoginPage /> : <PublicHomePage onLoginClick={() => setShowLogin(true)} />;

  const roleKeys = user.userRoles.map((assignment) => assignment.role.key);
  const isAdmin = hasAdminRole(roleKeys);
  const isTeacher = hasTeacherRole(roleKeys);
  const canAttendance = canMarkAttendance(roleKeys);
  const isStudent = Boolean(user.studentProfile);
  const isParent = roleKeys.some((key) => key === "parent" || key === "guardian");

  const allItems: NavigationItem[] = [
    { key: "dashboard", label: t("nav.dashboard"), icon: "⌂", group: "Workspace", description: "Your personal overview" },
    ...(isTeacher ? [{ key: "teacher" as const, label: "Teacher workspace", icon: "▤", group: "Teaching & learning" as const, description: "Classes, coursework and assessment" }] : []),
    { key: "timetable", label: t("nav.timetable"), icon: "▦", group: "Teaching & learning", description: "Weekly classes and periods" },
    ...(canAttendance ? [{ key: "attendance" as const, label: t("nav.attendance"), icon: "✓", group: "Teaching & learning" as const, description: "Record and review attendance" }] : []),
    ...(isStudent ? [{ key: "quizzes" as const, label: t("nav.quizzes"), icon: "✎", group: "Teaching & learning" as const, description: "Quizzes and assessments" }] : []),
    ...(isParent ? [{ key: "parent" as const, label: t("nav.parent"), icon: "♧", group: "Teaching & learning" as const, description: "Linked child progress and school updates" }] : []),
    ...(isAdmin ? [
      { key: "students" as const, label: "Students & academics", icon: "◎", group: "School operations" as const, description: "Student directory and academic records" },
      { key: "staff" as const, label: "Staff & HR", icon: "♙", group: "School operations" as const, description: "Staff profiles and HR workflows" },
      { key: "finance" as const, label: "Finance & funding", icon: "¤", group: "School operations" as const, description: "Fees, funding, invoices and payments" },
      { key: "library" as const, label: "Library", icon: "▥", group: "School operations" as const, description: "Catalog, copies, issues and returns" },
      { key: "operations" as const, label: "Operations center", icon: "⌘", group: "School operations" as const, description: "Admissions, transport, inventory and assets" },
      { key: "assessment" as const, label: "AI assessment studio", icon: "✧", group: "Administration" as const, description: "Generate, review and publish assessments" },
      { key: "documents" as const, label: "Document center", icon: "▧", group: "Administration" as const, description: "Official school documents and records" },
      { key: "cms" as const, label: "Website & announcements", icon: "▤", group: "Administration" as const, description: "Pages, notices and events" },
      { key: "backups" as const, label: "Backup & recovery", icon: "⟳", group: "Administration" as const, description: "Backup verification and recovery controls" },
      { key: "admin" as const, label: "Users & access", icon: "⚙", group: "Administration" as const, description: "Users, roles and academic structure" },
    ] : []),
  ];

  const query = search.trim().toLowerCase();
  const visibleItems = query
    ? allItems.filter((item) => `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(query))
    : allItems;

  const groups = ["Workspace", "Teaching & learning", "School operations", "Administration"] as const;
  const currentItem = allItems.find((item) => item.key === view) ?? allItems[0];
  const initials = user.fullName.trim().split(/\\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
  const requestedAdminTab = adminTabs[view] ?? "users";
  const blockedAdminView = Boolean(adminTabs[view]) && !isAdmin;
  const blockedTeacherView = view === "teacher" && !isTeacher;
  const blockedAttendanceView = view === "attendance" && !canAttendance;
  const blockedStudentView = view === "quizzes" && !isStudent;
  const blockedParentView = view === "parent" && !isParent;

  return (
    <div className="campus-app">
      <header className="campus-topbar">
        <button className="campus-brand" onClick={() => navigate("dashboard")} aria-label="WWHSS Digital Campus home">
          <span className="campus-brand-mark">W</span>
          <span className="campus-brand-copy">
            <strong>WWHSS</strong>
            <small>Digital Campus</small>
          </span>
        </button>

        <div className="topbar-context">
          <span className="topbar-eyebrow">YOUR SCHOOL, CONNECTED</span>
          <strong>{currentItem.label}</strong>
        </div>

        <label className="workspace-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a tool or workspace…"
            aria-label="Search available workspaces"
          />
          <kbd>Ctrl K</kbd>
        </label>

        <div className="topbar-actions">
          <LanguageToggle />
          <button className="topbar-avatar" title={user.fullName} aria-label={`Signed in as ${user.fullName}`}>{initials || "U"}</button>
          <button className="topbar-signout" onClick={() => void logout()}>{t("common.signOut")}</button>
        </div>
      </header>

      <div className="campus-layout">
        <aside className="campus-sidebar" aria-label="Main navigation">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials || "U"}</div>
            <div className="sidebar-user-copy">
              <strong>{user.fullName}</strong>
              <span>{user.userRoles.length ? user.userRoles.map((assignment) => assignment.role.name).join(" · ") : "Account pending role"}</span>
            </div>
            <span className="session-indicator" title="Signed-in session" />
          </div>

          {search.trim() && <p className="search-result-count">{visibleItems.length} matching workspace{visibleItems.length === 1 ? "" : "s"}</p>}

          <nav className="workspace-nav" aria-label="School workspaces">
            {groups.map((group) => {
              const items = visibleItems.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <section className="nav-group" key={group}>
                  <h2>{group}</h2>
                  {items.map((item) => (
                    <button
                      key={item.key}
                      className={`workspace-nav-item${view === item.key ? " active" : ""}`}
                      onClick={() => navigate(item.key)}
                      aria-current={view === item.key ? "page" : undefined}
                      title={item.description}
                    >
                      <span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span>
                      <span className="workspace-nav-label">{item.label}</span>
                      {view === item.key && <span className="nav-active-mark" />}
                    </button>
                  ))}
                </section>
              );
            })}
            {search.trim() && visibleItems.length === 0 && (
              <div className="nav-empty">
                <strong>No matching tool</strong>
                <span>Try “fees”, “students”, “attendance” or “backup”.</span>
              </div>
            )}
          </nav>

          <div className="sidebar-footer">
            <span className="footer-status-dot" />
            <div><strong>Secure workspace</strong><small>Access follows your school role</small></div>
          </div>
        </aside>

        <div className="campus-main">
          <div className="page-context">
            <div>
              <p className="page-breadcrumb">Digital Campus <span>/</span> {currentItem.group}</p>
              <h1>{currentItem.label}</h1>
              <p>{currentItem.description}</p>
            </div>
            <span className="workspace-role-pill">{isAdmin ? "Administrator access" : isTeacher ? "Teaching workspace" : isParent ? "Family workspace" : isStudent ? "Student workspace" : "School account"}</span>
          </div>

          <div className="workspace-content">
            {(view === "dashboard" || blockedAdminView || blockedTeacherView || blockedAttendanceView || blockedStudentView || blockedParentView) && <DashboardPage />}
            {view === "teacher" && isTeacher && <TeacherPage />}
            {view === "attendance" && canAttendance && <AttendancePage />}
            {view === "timetable" && <TimetablePage />}
            {view === "quizzes" && isStudent && user.studentProfile && <QuizzesPage studentProfileId={user.studentProfile.id} />}
            {view === "parent" && isParent && <ParentPage />}
            {adminTabs[view] && isAdmin && <AdminPage initialTab={requestedAdminTab} />}
          </div>
        </div>
      </div>

      <AssistantLauncher />
      <UpdateToast />
    </div>
  );
}
