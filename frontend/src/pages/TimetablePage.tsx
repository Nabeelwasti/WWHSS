import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { api, ApiError, type TimetableSlotSummary } from "../api";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function TimetablePage() {
  const { user } = useAuth();
  const [slots, setSlots] = useState<TimetableSlotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (user?.studentProfile?.classId && user.studentProfile.sectionId) {
          // A real student sees their REAL class's timetable — resolved
          // from their actual enrollment, not a guess.
          const res = await api.classTimetable(user.studentProfile.classId, user.studentProfile.sectionId);
          setSlots(res.slots);
        } else {
          // Staff see their own real assigned periods.
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
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>Timetable</h1>

      {error && (
        <p role="alert" style={{ color: "#a32d2d" }}>
          {error}
        </p>
      )}
      {slots === null && !error && <p>Loading…</p>}
      {slots?.length === 0 && (
        <p style={{ color: "#555" }}>No periods scheduled yet — a genuinely empty timetable, not a bug.</p>
      )}

      {[1, 2, 3, 4, 5, 6, 0].map((day) => {
        const daySlots = byDay.get(day);
        if (!daySlots || daySlots.length === 0) return null;
        return (
          <section key={day} style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 14, color: "#666", textTransform: "uppercase" }}>{DAY_NAMES[day]}</h2>
            {daySlots
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
                  <span>
                    {s.startTime}–{s.endTime} · {s.subject.name}
                    {s.class ? ` · ${s.class.name}${s.section ? ` (${s.section.name})` : ""}` : ""}
                  </span>
                  <span style={{ color: "#777" }}>{s.room?.name ?? ""}</span>
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
