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
import { DocumentEngineSection } from "./components/DocumentEngineSection";
import { UpdateToast } from "./components/UpdateToast";
import { ChangePasswordSection } from "./components/ChangePasswordSection";

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
  return roleKeys.some((key) => ["super_admin", "principal", "admin", "administrator", "school_admin"].includes(key));
}
function canMarkAttendance(roleKeys: string[]) {
  return roleKeys.some((key) => key === "teacher" || key === "class_teacher" || key === "super_admin");
}
function hasTeacherRole(roleKeys: string[]) {
  return roleKeys.some((key) => key === "teacher" || key === "class_teacher");
}

function resolveView(pathname: string): View {
  const candidate = pathname.replace(/^\/+|\/+$/g, "").split("/")[0] as View;
  return validViews.includes(candidate) ? candidate : "dashboard";
}

export default function App() {
  const { user, booting, logout, error } = useAuth();
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
      <div className="boot-screen" role="status" aria-label={t("app.loadingWorkspace")}>
        <div className="boot-mark">W</div>
        <div className="boot-copy">
          <strong>WWHSS {t("app.digitalCampus")}</strong>
          <span>{t("app.preparingWorkspace")}</span>
        </div>
        <div className="boot-progress"><span /></div>
      </div>
    );
  }

  if (!user) return showLogin ? <LoginPage /> : <PublicHomePage onLoginClick={() => setShowLogin(true)} />;

  if (user.mustChangePassword) {
    return (
      <main className="page page-narrow" style={{ marginTop: "8vh" }}>
        <section className="card">
          <h1 className="card-title">Change your temporary password</h1>
          <p className="text-muted">For your security, you must set a new password before using the campus system.</p>
          <ChangePasswordSection forceOpen />
        </section>
      </main>
    );
  }

  const roleKeys = user.userRoles.map((assignment) => assignment.role.key);
  const isAdmin = hasAdminRole(roleKeys);
  const isTeacher = hasTeacherRole(roleKeys);
  const canAttendance = canMarkAttendance(roleKeys);
  const isStudent = Boolean(user.studentProfile);
  const isParent = roleKeys.some((key) => key === "parent" || key === "guardian");
  const isAccountant = roleKeys.includes("accountant");
  const isLibrarian = roleKeys.includes("librarian");

  const allItems: NavigationItem[] = [
    { key: "dashboard", label: t("nav.dashboard"), icon: "⌂", group: "Workspace", description: t("app.desc.dashboard") },
    ...(isTeacher ? [{ key: "teacher" as const, label: t("app.nav.teacher"), icon: "▤", group: "Teaching & learning" as const, description: t("app.desc.teacher") }] : []),
    { key: "timetable", label: t("nav.timetable"), icon: "▦", group: "Teaching & learning", description: t("app.desc.timetable") },
    ...(canAttendance ? [{ key: "attendance" as const, label: t("nav.attendance"), icon: "✓", group: "Teaching & learning" as const, description: t("app.desc.attendance") }] : []),
    ...(isStudent ? [{ key: "quizzes" as const, label: t("nav.quizzes"), icon: "✎", group: "Teaching & learning" as const, description: t("app.desc.quizzes") }] : []),
    ...(isParent ? [{ key: "parent" as const, label: t("nav.parent"), icon: "♧", group: "Teaching & learning" as const, description: t("app.desc.parent") }] : []),
    ...(isAdmin ? [
      { key: "students" as const, label: t("app.nav.students"), icon: "◎", group: "School operations" as const, description: t("app.desc.students") },
      { key: "staff" as const, label: t("app.nav.staff"), icon: "♙", group: "School operations" as const, description: t("app.desc.staff") },
      { key: "operations" as const, label: t("app.nav.operations"), icon: "⌘", group: "School operations" as const, description: t("app.desc.operations") },
      { key: "assessment" as const, label: t("app.nav.assessment"), icon: "✧", group: "Administration" as const, description: t("app.desc.assessment") },
      { key: "documents" as const, label: t("app.nav.documents"), icon: "▧", group: "Administration" as const, description: t("app.desc.documents") },
      { key: "cms" as const, label: t("app.nav.cms"), icon: "▤", group: "Administration" as const, description: t("app.desc.cms") },
      { key: "backups" as const, label: t("app.nav.backups"), icon: "⟳", group: "Administration" as const, description: t("app.desc.backups") },
      { key: "admin" as const, label: t("app.nav.users"), icon: "⚙", group: "Administration" as const, description: t("app.desc.users") },
    ] : []),
    ...((isAdmin || isAccountant) ? [
      { key: "finance" as const, label: t("app.nav.finance"), icon: "¤", group: "School operations" as const, description: t("app.desc.finance") },
    ] : []),
    ...((isAdmin || isLibrarian) ? [
      { key: "library" as const, label: t("app.nav.library"), icon: "▥", group: "School operations" as const, description: t("app.desc.library") },
    ] : []),
  ];
  const groupLabels: Record<NavigationItem["group"], string> = {
    Workspace: t("app.group.workspace"),
    "Teaching & learning": t("app.group.teaching"),
    "School operations": t("app.group.operations"),
    Administration: t("app.group.admin"),
  };

  const query = search.trim().toLowerCase();
  const visibleItems = query
    ? allItems.filter((item) => `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(query))
    : allItems;

  const groups = ["Workspace", "Teaching & learning", "School operations", "Administration"] as const;
  const currentItem = allItems.find((item) => item.key === view) ?? allItems[0];
  const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
  const requestedAdminTab = adminTabs[view] ?? "users";
  const canAccessAdminView = Boolean(adminTabs[view]) && (
    isAdmin || (view === "finance" && isAccountant) || (view === "library" && isLibrarian)
  );
  const allowedAdminTabs: AdminTab[] = isAdmin
    ? ["users", "staff", "students", "finance", "library", "assessment", "documents", "cms", "backups", "operations"]
    : [
        ...(isAccountant ? ["finance" as const] : []),
        ...(isLibrarian ? ["library" as const] : []),
      ];
  const blockedAdminView = Boolean(adminTabs[view]) && !canAccessAdminView;
  const blockedTeacherView = view === "teacher" && !isTeacher;
  const blockedAttendanceView = view === "attendance" && !canAttendance;
  const blockedStudentView = view === "quizzes" && !isStudent;
  const blockedParentView = view === "parent" && !isParent;

  return (
    <div className="campus-app">
      {error && <p className="auth-error" role="alert">{error}</p>}
      <header className="campus-topbar">
        <button className="campus-brand" onClick={() => navigate("dashboard")} aria-label={t("app.brandHome")}>
          <span className="campus-brand-mark">W</span>
          <span className="campus-brand-copy">
            <strong>WWHSS</strong>
            <small>{t("app.digitalCampus")}</small>
          </span>
        </button>

        <div className="topbar-context">
          <span className="topbar-eyebrow">{t("app.topbarEyebrow")}</span>
          <strong>{currentItem.label}</strong>
        </div>

        <label className="workspace-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("app.searchPlaceholder")}
            aria-label={t("app.searchLabel")}
          />
          <kbd>Ctrl K</kbd>
        </label>

        <div className="topbar-actions">
          <LanguageToggle />
          <button className="topbar-avatar" title={user.fullName} aria-label={`${t("app.signedInAs")} ${user.fullName}`}>{initials || "U"}</button>
          <button className="topbar-signout" onClick={() => void logout()}>{t("common.signOut")}</button>
        </div>
      </header>

      <div className="campus-layout">
        <aside className="campus-sidebar" aria-label={t("app.navLabel")}>
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials || "U"}</div>
            <div className="sidebar-user-copy">
              <strong>{user.fullName}</strong>
              <span>{user.userRoles.length ? user.userRoles.map((assignment) => assignment.role.name).join(" · ")  : t("app.role.pending")}</span>
            </div>
            <span className="session-indicator" title={t("app.sessionSignedIn")} />
          </div>

          {search.trim() && <p className="search-result-count">{visibleItems.length} {t(visibleItems.length === 1 ? "app.search.resultsSingular" : "app.search.resultsPlural")}</p>}

          <nav className="workspace-nav" aria-label={t("app.workspacesLabel")}>
            {groups.map((group) => {
              const items = visibleItems.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <section className="nav-group" key={group}>
                  <h2>{groupLabels[group]}</h2>
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
                <strong>{t("app.search.noMatchTitle")}</strong>
                <span>{t("app.search.suggestions")}</span>
              </div>
            )}
          </nav>

          <div className="sidebar-footer">
            <span className="footer-status-dot" />
            <div><strong>{t("app.secureWorkspace")}</strong><small>{t("app.accessFollowsRole")}</small></div>
          </div>
        </aside>

        <div className="campus-main">
          <section className="page-context" aria-label={t("app.currentWorkspace")}>
            <div>
              <p className="page-breadcrumb">{t("app.digitalCampus")} <span>/</span> {groupLabels[currentItem.group]}</p>
              <h1>{currentItem.label}</h1>
              <p>{currentItem.description}</p>
            </div>
            <span className="workspace-role-pill">{isAdmin ? t("app.role.admin") : isAccountant ? t("app.role.finance") : isLibrarian ? t("app.role.library") : isTeacher ? t("app.role.teacher") : isParent ? t("app.role.family") : isStudent ? t("app.role.student") : t("app.role.school")}</span>
          </section>

          <div className="workspace-content">
            {(view === "dashboard" || blockedAdminView || blockedTeacherView || blockedAttendanceView || blockedStudentView || blockedParentView) && <DashboardPage />}
            {view === "teacher" && isTeacher && <TeacherPage />}
            {view === "attendance" && canAttendance && <AttendancePage />}
            {view === "timetable" && <TimetablePage />}
            {view === "quizzes" && isStudent && user.studentProfile && <QuizzesPage studentProfileId={user.studentProfile.id} />}
            {view === "parent" && isParent && <ParentPage />}
            {view === "documents" && canAccessAdminView && <DocumentEngineSection />}
            {adminTabs[view] && view !== "documents" && canAccessAdminView && <AdminPage key={view} initialTab={requestedAdminTab} allowedTabs={isAdmin ? undefined : allowedAdminTabs} />}
          </div>
        </div>
      </div>

      <AssistantLauncher />
      <UpdateToast />
    </div>
  );
}
