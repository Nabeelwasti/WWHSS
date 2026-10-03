import { useEffect, useState } from "react";
import { api } from "../api";
import { useLanguage, LanguageToggle } from "../i18n";

export function PublicHomePage({ onLoginClick }: { onLoginClick: () => void }) {
  const { t } = useLanguage();
  const [notices, setNotices] = useState<{ id: string; title: string; body: string; publishedAt: string }[] | null>(null);
  const [events, setEvents] = useState<{ id: string; title: string; startAt: string; location: string | null }[] | null>(null);

  useEffect(() => {
    // Genuinely unauthenticated calls — no access token is attached, and
    // none is needed; the backend serves these to any visitor.
    api.publicNotices().then((r) => setNotices(r.notices)).catch(() => setNotices([]));
    api.publicEvents().then((r) => setEvents(r.events)).catch(() => setEvents([]));
  }, []);

  return (
    <div>
      <div style={{ background: "var(--navy)", color: "#fff", padding: "var(--space-6) var(--space-4)" }}>
        <div className="page-wide" style={{ margin: "0 auto", padding: 0 }}>
          <div className="flex justify-between items-center gap-2" style={{ flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: 24, margin: 0 }}>{t("home.schoolName")}</h1>
              <p style={{ margin: "4px 0 0", opacity: 0.8, fontSize: 13 }}>WWHS Digital Campus</p>
            </div>
            <div className="flex gap-2">
              <LanguageToggle />
              <button onClick={onLoginClick} className="btn btn-secondary">
                {t("home.login")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="page page-wide">
        <section className="card card-accent">
          <h2 className="card-title">{t("home.notices")}</h2>
          {notices === null && <SkeletonLines />}
          {notices?.length === 0 && <p className="text-muted text-sm">{t("home.noNotices")}</p>}
          {notices?.map((n) => (
            <div key={n.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
              <strong style={{ fontSize: 14 }}>{n.title}</strong>
              <p className="text-sm text-muted" style={{ margin: "4px 0" }}>{n.body}</p>
              <span className="text-xs text-muted">{new Date(n.publishedAt).toLocaleDateString()}</span>
            </div>
          ))}
        </section>

        <section className="card">
          <h2 className="card-title">{t("home.events")}</h2>
          {events === null && <SkeletonLines />}
          {events?.length === 0 && <p className="text-muted text-sm">{t("home.noEvents")}</p>}
          {events?.map((e) => (
            <div key={e.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }} className="text-sm">
              <strong>{e.title}</strong> — {new Date(e.startAt).toLocaleDateString()}
              {e.location ? ` · ${e.location}` : ""}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function SkeletonLines() {
  return (
    <div className="flex-col gap-2">
      <div className="skeleton" style={{ height: 14, width: "80%" }} />
      <div className="skeleton" style={{ height: 14, width: "60%" }} />
    </div>
  );
}
