import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { api, ApiError, type TimetableSlotSummary } from "../api";
import { useLanguage, type TranslationKey } from "../i18n.js";

const DAY_KEYS: TranslationKey[] = [
  "days.sunday",
  "days.monday",
  "days.tuesday",
  "days.wednesday",
  "days.thursday",
  "days.friday",
  "days.saturday",
];

export function TimetablePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [slots, setSlots] = useState<TimetableSlotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (user?.studentProfile?.classId && user.studentProfile.sectionId) {
          const res = await api.classTimetable(user.studentProfile.classId, user.studentProfile.sectionId);
          setSlots(res.slots);
        } else {
          const res = await api.myTeachingSchedule();
          setSlots(res.slots);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load the timetable.");
      }
    }
    load();
  }, [user]);

  const byDay = new Map<number, TimetableSlotSummary[]>();
  slots?.forEach((s) => {
    if (!byDay.has(s.dayOfWeek)) byDay.set(s.dayOfWeek, []);
    byDay.get(s.dayOfWeek)!.push(s);
  });

  return (
    <div className="page" style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>{t("timetable.header")}</h1>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {slots === null && !error && <p className="text-muted text-sm">{t("common.loading")}</p>}
      {slots?.length === 0 && (
        <p className="text-muted text-sm">{t("timetable.noPeriods")}</p>
      )}

      {[1, 2, 3, 4, 5, 6, 0].map((day) => {
        const daySlots = byDay.get(day);
        if (!daySlots || daySlots.length === 0) return null;
        return (
          <section key={day} className="card" style={{ marginTop: 16 }}>
            <h2 className="card-title">{t(DAY_KEYS[day])}</h2>
            {daySlots
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((s) => (
                <div key={s.id} className="flex justify-between items-center text-sm" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>
                    <strong>{s.startTime}–{s.endTime}</strong> · {s.subject.name}
                    {s.class ? ` · ${s.class.name}${s.section ? ` (${s.section.name})` : ""}` : ""}
                  </span>
                  <span className="text-muted text-xs">{s.room?.name ?? ""}</span>
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
