import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { api, ApiError } from "../api";
import { AssignmentsSection } from "../components/AssignmentsSection";
import { ExamResultsSection } from "../components/ExamResultsSection";
import { NotificationsBell } from "../components/NotificationsBell";
import { LibrarySection } from "../components/LibrarySection";
import { AiChatWidget } from "../components/AiChatWidget";
import { MyProgressSection } from "../components/MyProgressSection";
import { ChangePasswordSection } from "../components/ChangePasswordSection";
import { FinanceSection } from "../components/FinanceSection";
import { useLanguage } from "../i18n";

type ClassSummary = { id: string; name: string; sections: { id: string; name: string }[] };

export function DashboardPage() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [schoolWide, setSchoolWide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .myClasses()
      .then((res) => {
        if (cancelled) return;
        setClasses((res.classes as ClassSummary[] | null) ?? []);
        setSchoolWide(res.scopeIsSchoolWide);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Could not load your classes.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  return (
    <div className="page">
      <header className="flex justify-between items-center">
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>
            {t("dash.welcome")}, {user.fullName.split(" ")[0]}
          </h1>
          <p className="text-muted text-sm" style={{ margin: "2px 0 0" }}>
            {user.userRoles.length > 0
              ? user.userRoles.map((ur) => ur.role.name).join(", ")
              : "No role assigned yet — contact your administrator."}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <NotificationsBell />
          <button onClick={logout} className="btn btn-ghost btn-sm">
            {t("common.signOut")}
          </button>
        </div>
      </header>

      <section className="card">
        <h2 className="card-title">{t("dash.myClasses")}</h2>

        {loading && (
          <div className="flex-col gap-2">
            <div className="skeleton" style={{ height: 16, width: "70%" }} />
            <div className="skeleton" style={{ height: 16, width: "50%" }} />
          </div>
        )}

        {!loading && error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}

        {!loading && !error && schoolWide && (
          <p className="text-muted text-sm">
            Your role has school-wide access. A full class directory view is not built yet — it will use
            the same <code>/api/academics/classes</code> endpoint already live on the backend.
          </p>
        )}

        {!loading && !error && !schoolWide && classes && classes.length === 0 && (
          <p className="text-muted text-sm">
            No classes are assigned to your account yet. This is a genuine empty state — nothing has
            been entered for you, rather than a placeholder.
          </p>
        )}

        {!loading && !error && !schoolWide && classes && classes.length > 0 && (
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {classes.map((c) => (
              <li key={c.id} className="text-sm">
                {c.name} {c.sections?.length ? `(${c.sections.map((s) => s.name).join(", ")})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Only rendered for accounts that actually have a StudentProfile —
          a teacher or parent account genuinely has nothing here, so
          nothing is shown, rather than an empty assignments list implying
          they should have one. */}
      {user.studentProfile && <MyProgressSection studentProfileId={user.studentProfile.id} />}
      {user.studentProfile && <AssignmentsSection studentProfileId={user.studentProfile.id} />}
      {user.studentProfile && <ExamResultsSection studentProfileId={user.studentProfile.id} />}
      {user.studentProfile && <FinanceSection studentProfileId={user.studentProfile.id} />}

      <LibrarySection />
      <AiChatWidget />
      <ChangePasswordSection />

      <section className="card" style={{ background: "var(--surface-2)" }}>
        <h2 className="card-title" style={{ textTransform: "none", letterSpacing: 0 }}>
          Not built yet
        </h2>
        <p className="text-sm text-muted mt-0">
          Admin screens for library cataloging, fee structure setup, and CMS content editing (creating
          books/invoices/notices) still need a UI — reading and using them as a student/parent/teacher
          is done above; the administrative "create/manage" side for these three still goes through the
          API directly for now.
        </p>
      </section>
    </div>
  );
}
