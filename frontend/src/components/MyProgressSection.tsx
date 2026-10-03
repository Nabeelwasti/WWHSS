import { useEffect, useState } from "react";
import { api, ApiError, type EngagementSummary } from "../api";
import { useLanguage, type TranslationKey } from "../i18n";

// Deliberately framed around encouragement, not comparison: it shows a
// child only THEIR OWN numbers, never a class ranking. Research on
// disengaged students consistently points to recognition of effort working
// better than public comparison or punishment, and publicly ranking
// children from low-income families risks shaming the ones who most need
// to feel they belong. Every number here comes from real attendance
// records — nothing is invented to make a child feel good.

function encouragementKey(s: EngagementSummary): TranslationKey {
  if (s.recordedDays === 0) return "progress.msg.none";
  if (s.currentStreak >= 10) return "progress.msg.10";
  if (s.currentStreak >= 5) return "progress.msg.5";
  if (s.currentStreak >= 1) return "progress.msg.1";
  return "progress.msg.0";
}

export function MyProgressSection({ studentProfileId }: { studentProfileId: string }) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<EngagementSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .engagementSummary(studentProfileId)
      .then((res) => setSummary(res.summary))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your progress."));
  }, [studentProfileId]);

  return (
    <section className="card card-positive">
      <h2 className="card-title" style={{ color: "var(--success)" }}>
        {t("progress.title")}
      </h2>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {!summary && !error && (
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 44 }} />
          ))}
        </div>
      )}

      {summary && (
        <>
          <div className="stat-grid">
            <Stat label={t("progress.streak")} value={String(summary.currentStreak)} highlight />
            <Stat label={t("progress.best")} value={String(summary.bestStreak)} />
            <Stat label={t("progress.attended")} value={String(summary.attendedDays)} />
            <Stat label={t("progress.rate")} value={summary.attendanceRate === null ? "—" : `${summary.attendanceRate}%`} />
          </div>
          <p className="text-sm mt-2" style={{ color: "var(--success)", marginBottom: 0 }}>
            {t(encouragementKey(summary))}
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-value" style={highlight ? { color: "var(--success)" } : undefined}>
        {highlight && value !== "0" ? `🔥 ${value}` : value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
