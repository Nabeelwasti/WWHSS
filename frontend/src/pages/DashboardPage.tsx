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
  const { user } = useAuth();
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
      .then(async (res) => {
        if (cancelled) return;
        const rows = res.scopeIsSchoolWide ? await api.listClasses() : res;
        if (cancelled) return;
        setClasses((rows.classes as ClassSummary[] | null) ?? []);
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
    <main className="page page-wide dashboard-page">
      <section className="dashboard-welcome">
        <div className="welcome-orbit" aria-hidden="true"><span /><span /><span /></div>
        <div className="welcome-copy">
          <span className="welcome-kicker">YOUR CAMPUS AT A GLANCE</span>
          <h2>{t("dash.welcome")}, {user.fullName.split(" ")[0]}</h2>
          <p>One connected place for your school day, learning and progress.</p>
          <div className="welcome-tags">
            {user.userRoles.map((assignment) => <span key={assignment.role.key}>{assignment.role.name}</span>)}
            {!user.userRoles.length && <span>Role assignment pending</span>}
          </div>
        </div>
        <div className="welcome-actions">
          <NotificationsBell />
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div><span className="section-eyebrow">ACADEMIC OVERVIEW</span><h2>{t("dash.myClasses")}</h2></div>
          <span className="section-meta">{schoolWide ? "School-wide access" : "Your assigned scope"}</span>
        </div>
        <div className="dashboard-class-panel">
          {loading && (
            <div className="dashboard-class-grid" role="status" aria-label="Loading classes">
              {[0, 1, 2].map((item) => <div className="dashboard-class-skeleton" key={item} />)}
            </div>
          )}
          {!loading && error && <p role="alert" className="alert alert-danger">{error}</p>}
          {!loading && !error && classes && classes.length === 0 && (
            <div className="dashboard-empty"><span aria-hidden="true">◎</span><strong>No classes are assigned yet</strong><p>Your class and section access will appear here when the school administrator assigns it.</p></div>
          )}
          {!loading && !error && classes && classes.length > 0 && (
            <div className="dashboard-class-grid">
              {classes.map((item, index) => (
                <article className="dashboard-class-card" key={item.id}>
                  <div className={`class-card-symbol symbol-${index % 4}`} aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
                  <div className="class-card-copy"><h3>{item.name}</h3><p>{item.sections?.length ?? 0} section{item.sections?.length === 1 ? "" : "s"}</p></div>
                  <div className="class-card-sections">{item.sections?.length ? item.sections.map((section) => <span key={section.id}>{section.name}</span>) : <span>No sections yet</span>}</div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {user.studentProfile && <div className="dashboard-student-grid">
        <MyProgressSection studentProfileId={user.studentProfile.id} />
        <AssignmentsSection studentProfileId={user.studentProfile.id} />
        <ExamResultsSection studentProfileId={user.studentProfile.id} />
        <FinanceSection studentProfileId={user.studentProfile.id} />
      </div>}

      <div className="dashboard-resource-grid">
        <LibrarySection />
        <section className="dashboard-ai-panel">
          <div className="ai-panel-heading"><span className="ai-panel-icon" aria-hidden="true">✧</span><div><span className="section-eyebrow">CAMPUS INTELLIGENCE</span><h2>Ask your Campus AI</h2></div></div>
          <p>Get help with school processes, learning questions and the information your account is authorized to access.</p>
          <AiChatWidget />
        </section>
        <ChangePasswordSection />
      </div>
    </main>
  );
}
