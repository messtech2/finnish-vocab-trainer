import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type TaskStatus = "done" | "ongoing" | "missed" | "none";

interface DayData {
  date: string;
  tasks: Record<string, TaskStatus>;
  reflection: string;
  rescheduledFrom?: string; // original date if rescheduled
}

interface DashboardData {
  days: Record<string, DayData>;
  chapters: Record<string, boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const EXAM_DATE  = new Date("2026-05-15T09:00:00");
const START_DATE = new Date("2026-04-11T00:00:00"); // study start
const LS_KEY     = "fi_b1_dashboard_v1";             // same key — data preserved

const CHAPTERS = [
  { id: "s2_k1", label: "Kappale 1", topic: "Tutustutaan",        grammar: "Verbitaivutus (minä, sinä, hän)",           phase: 0 },
  { id: "s2_k2", label: "Kappale 2", topic: "Arki",               grammar: "Omistusrakenne (minulla on)",               phase: 0 },
  { id: "s2_k3", label: "Kappale 3", topic: "Koti ja perhe",      grammar: "Genetiivi + Adjektiivit",                   phase: 0 },
  { id: "s2_k4", label: "Kappale 4", topic: "Työ ja opiskelu",    grammar: "Infinitiivi (haluan oppia)",                phase: 1 },
  { id: "s2_k5", label: "Kappale 5", topic: "Liikkuminen",        grammar: "Missä / Mihin / Mistä (paikkasijat)",       phase: 1 },
  { id: "s2_k6", label: "Kappale 6", topic: "Terveys",            grammar: "Partitiivi (syön leipää)",                  phase: 2 },
  { id: "s2_k7", label: "Kappale 7", topic: "Vapaa-aika",         grammar: "Imperfekti (menin, söin, tein)",            phase: 2 },
  { id: "s2_k8", label: "Kappale 8", topic: "Yhteiskunta ja työ", grammar: "Konditionaali (haluaisin)",                 phase: 3 },
];

const TASKS = [
  { id: "read",   emoji: "📘", label: "Book Study",  desc: "Read chapter + study grammar + do exercises" },
  { id: "vocab",  emoji: "📚", label: "Vocabulary",  desc: "Learn 10–15 words · write 1 sentence each" },
  { id: "write",  emoji: "✍️", label: "Writing",     desc: "Write 80–120 words using today's grammar" },
  { id: "speak",  emoji: "🗣", label: "Speaking",    desc: "Read aloud · record yourself" },
  { id: "review", emoji: "🔁", label: "Review",      desc: "Fix yesterday's mistakes · repeat hard grammar" },
];

const PHASES = [
  { label: "Phase 1", weeks: "Week 1–2", chapters: "Kappale 1–3", focus: "Basics: verbs, ownership, adjectives" },
  { label: "Phase 2", weeks: "Week 3",   chapters: "Kappale 4–5", focus: "Infinitive + Location cases" },
  { label: "Phase 3", weeks: "Week 4",   chapters: "Kappale 6–7", focus: "Partitive + Imperfect tense" },
  { label: "Phase 4", weeks: "Week 5+",  chapters: "Kappale 8 + Review", focus: "Conditional + Full mock exam" },
];

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-PLAN: assign a chapter to each calendar day from start → exam
// ─────────────────────────────────────────────────────────────────────────────
function getPlanForDate(dateKey: string): { chapter: typeof CHAPTERS[0]; phase: number } | null {
  const d    = new Date(dateKey + "T12:00:00");
  const diff = Math.floor((d.getTime() - START_DATE.getTime()) / 86400000);
  if (diff < 0 || d >= EXAM_DATE) return null;
  // Chapter rotates: each chapter gets ~4–5 days based on phase length
  const daySchedule = [
    ...Array(4).fill(0),  // k1 — 4 days
    ...Array(4).fill(1),  // k2
    ...Array(4).fill(2),  // k3
    ...Array(4).fill(3),  // k4
    ...Array(3).fill(4),  // k5
    ...Array(4).fill(5),  // k6
    ...Array(4).fill(6),  // k7
    ...Array(100).fill(7), // k8 + review fills the rest
  ];
  const idx = Math.min(diff, daySchedule.length - 1);
  const chapIdx = daySchedule[idx];
  return { chapter: CHAPTERS[chapIdx], phase: CHAPTERS[chapIdx].phase };
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE — migrates old boolean task format to new status format
// ─────────────────────────────────────────────────────────────────────────────
function loadData(): DashboardData {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (!raw) return { days: {}, chapters: {} };
    // Migrate old format: tasks were boolean, now TaskStatus
    const days: Record<string, DayData> = {};
    for (const [k, v] of Object.entries(raw.days || {})) {
      const old = v as any;
      const tasks: Record<string, TaskStatus> = {};
      for (const [tid, val] of Object.entries(old.tasks || {})) {
        tasks[tid] = typeof val === "boolean" ? (val ? "done" : "none") : val as TaskStatus;
      }
      days[k] = { date: k, tasks, reflection: old.reflection || "", rescheduledFrom: old.rescheduledFrom };
    }
    return { days, chapters: raw.chapters || {} };
  } catch { return { days: {}, chapters: {} }; }
}
function saveData(d: DashboardData) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function todayKey() { return new Date().toISOString().slice(0, 10); }

function dateRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  while (d < to) {
    keys.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

function dayStatus(data: DashboardData, dateKey: string): "none" | "ongoing" | "done" | "missed" {
  const today = todayKey();
  const day = data.days[dateKey];
  if (!day || Object.keys(day.tasks).length === 0) {
    return dateKey < today ? "missed" : "none";
  }
  const statuses = Object.values(day.tasks);
  const doneCount    = statuses.filter(s => s === "done").length;
  const ongoingCount = statuses.filter(s => s === "ongoing").length;
  if (doneCount === TASKS.length) return "done";
  if (doneCount > 0 || ongoingCount > 0) return "ongoing";
  if (dateKey < today) return "missed";
  return "none";
}

function completionPct(data: DashboardData, dateKey: string): number {
  const day = data.days[dateKey];
  if (!day) return 0;
  const done = Object.values(day.tasks).filter(s => s === "done").length;
  return Math.round((done / TASKS.length) * 100);
}

const STATUS_COLOR = {
  none:    { bg: "transparent", border: "#e4e0f8", text: "#888" },
  ongoing: { bg: "#fef3c7",     border: "#f59e0b", text: "#92400e" },
  done:    { bg: "#dcfce7",     border: "#22c55e", text: "#15803d" },
  missed:  { bg: "#fee2e2",     border: "#ef4444", text: "#dc2626" },
};
const STATUS_COLOR_DARK = {
  none:    { bg: "transparent", border: "#383858", text: "#666" },
  ongoing: { bg: "#3a2a00",     border: "#f59e0b", text: "#f59e0b" },
  done:    { bg: "#0d2e1a",     border: "#22c55e", text: "#22c55e" },
  missed:  { bg: "#2e0d0d",     border: "#ef4444", text: "#ef4444" },
};

// ─────────────────────────────────────────────────────────────────────────────
// COUNTDOWN
// ─────────────────────────────────────────────────────────────────────────────
function Countdown({ dark }: { dark: boolean }) {
  const [days, setDays]   = useState(0);
  const [hours, setHours] = useState(0);

  useEffect(() => {
    function tick() {
      const diff = EXAM_DATE.getTime() - Date.now();
      if (diff <= 0) { setDays(0); setHours(0); return; }
      setDays(Math.floor(diff / 86400000));
      setHours(Math.floor((diff % 86400000) / 3600000));
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const gone   = EXAM_DATE.getTime() <= Date.now();
  const urgent = days <= 14 && !gone;
  const color  = gone ? "#22c55e" : urgent ? "#ef4444" : "#7c5cfc";
  const msg    = gone ? "You made it! 🏆" :
    days > 30 ? "Build the habit. Every day matters." :
    days > 14 ? "Focus. The exam is close." :
    days > 7  ? "⚡ Final push — no days off." :
                "🔥 Last days. Give everything.";

  return (
    <div style={{ textAlign: "center", background: urgent ? (dark ? "#2d0a0a" : "#fff1f1") : (dark ? "#1a0f3a" : "#f0eeff"), border: `2px solid ${color}44`, borderRadius: 20, padding: "22px 20px 18px", marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 2.5, marginBottom: 6 }}>
        {gone ? "🎓 Exam day!" : "B1 EXAM COUNTDOWN · 15 MAY 2026"}
      </div>
      {!gone && (
        <>
          <div style={{ fontSize: 88, fontWeight: 900, lineHeight: 1, color, fontVariantNumeric: "tabular-nums", letterSpacing: -4, animation: urgent ? "pulse 1.2s infinite" : "none" }}>
            {days}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 4 }}>day{days !== 1 ? "s" : ""} left · {hours}h to next</div>
        </>
      )}
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 10 }}>{msg}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TODAY FOCUS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function TodayPanel({ data, onChange, onOpenDay, dark }: {
  data: DashboardData; onChange: (d: DashboardData) => void;
  onOpenDay: (key: string) => void; dark: boolean;
}) {
  const today   = todayKey();
  const plan    = getPlanForDate(today);
  const dayData = data.days[today] ?? { date: today, tasks: {}, reflection: "" };
  const done    = Object.values(dayData.tasks).filter(s => s === "done").length;
  const pct     = Math.round((done / TASKS.length) * 100);

  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  function cycleTask(id: string) {
    const cur = dayData.tasks[id] ?? "none";
    const next: TaskStatus = cur === "none" ? "ongoing" : cur === "ongoing" ? "done" : "none";
    const updated = { ...dayData, tasks: { ...dayData.tasks, [id]: next } };
    onChange({ ...data, days: { ...data.days, [today]: updated } });
  }

  const taskStatusStyle = (s: TaskStatus, d: boolean) => {
    const c = d ? STATUS_COLOR_DARK[s] : STATUS_COLOR[s];
    return { background: c.bg, borderColor: c.border, color: c.text };
  };
  const taskIcon = (s: TaskStatus) => s === "done" ? "✓" : s === "ongoing" ? "…" : "○";

  return (
    <div style={{ background: bg, border: `2px solid ${accent}44`, borderRadius: 18, padding: "18px 16px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: text }}>📅 TODAY'S PLAN</div>
          {plan && (
            <div style={{ fontSize: 13, color: sub, marginTop: 3 }}>
              {plan.chapter.label} · {plan.chapter.topic}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: pct === 100 ? "#22c55e" : accent }}>{pct}%</div>
          <div style={{ fontSize: 11, color: sub }}>{done}/{TASKS.length}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: dark ? "#383858" : "#e4e0f8", borderRadius: 99, height: 6, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: 6, borderRadius: 99, background: pct === 100 ? "#22c55e" : accent, transition: "width 0.4s" }} />
      </div>

      {/* Plan info */}
      {plan && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            { emoji: "📘", label: plan.chapter.label },
            { emoji: "🎯", label: plan.chapter.grammar },
            { emoji: "✍️", label: "Write 100 words" },
            { emoji: "🗣", label: "Record yourself" },
          ].map(item => (
            <span key={item.label} style={{ background: dark ? "#1e1e2e" : "#f4f2ff", borderRadius: 20, padding: "4px 10px", fontSize: 12, color: text }}>
              {item.emoji} {item.label}
            </span>
          ))}
        </div>
      )}

      {/* Quick task checklist — tap to cycle none→ongoing→done */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
        {TASKS.map(t => {
          const status = dayData.tasks[t.id] ?? "none";
          const sc = dark ? STATUS_COLOR_DARK[status] : STATUS_COLOR[status];
          return (
            <button key={t.id} onClick={() => cycleTask(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, background: sc.bg, border: `2px solid ${sc.border}`, borderRadius: 12, padding: "11px 14px", cursor: "pointer", textAlign: "left", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: sc.text, minWidth: 22, textAlign: "center" }}>{taskIcon(status)}</span>
              <span style={{ fontSize: 14 }}>{t.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: sc.text }}>{t.label}</div>
                <div style={{ fontSize: 12, color: sub }}>{t.desc}</div>
              </div>
              <span style={{ fontSize: 11, color: sub, background: dark ? "#383858" : "#e4e0f8", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>
                {status === "none" ? "tap" : status}
              </span>
            </button>
          );
        })}
      </div>

      <button onClick={() => onOpenDay(today)}
        style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 12, padding: "11px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
        📝 Open full day (diary + details)
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DAY MODAL
// ─────────────────────────────────────────────────────────────────────────────
function DayModal({ dateKey, data, onChange, onClose, dark }: {
  dateKey: string; data: DashboardData; onChange: (d: DashboardData) => void;
  onClose: () => void; dark: boolean;
}) {
  const plan    = getPlanForDate(dateKey);
  const dayData = data.days[dateKey] ?? { date: dateKey, tasks: {}, reflection: "" };
  const today   = todayKey();
  const isPast  = dateKey < today;
  const [rescheduleTarget, setRescheduleTarget] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#1e1e2e" : "#fff";
  const bg2    = dark ? "#2a2a3e" : "#f8f8fc";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  function update(patch: Partial<DayData>) {
    const updated = { ...dayData, ...patch };
    onChange({ ...data, days: { ...data.days, [dateKey]: updated } });
  }

  function cycleTask(id: string) {
    const cur  = dayData.tasks[id] ?? "none";
    const next: TaskStatus = cur === "none" ? "ongoing" : cur === "ongoing" ? "done" : "none";
    update({ tasks: { ...dayData.tasks, [id]: next } });
  }

  function reschedule() {
    if (!rescheduleTarget) return;
    // Mark this day's missed tasks on the target day
    const targetDay = data.days[rescheduleTarget] ?? { date: rescheduleTarget, tasks: {}, reflection: "" };
    const merged = { ...targetDay.tasks, ...dayData.tasks };
    const nextData = {
      ...data,
      days: {
        ...data.days,
        [rescheduleTarget]: { ...targetDay, tasks: merged, rescheduledFrom: dateKey },
        [dateKey]: { ...dayData, tasks: Object.fromEntries(TASKS.map(t => [t.id, "missed" as TaskStatus])) },
      }
    };
    onChange(nextData);
    setShowReschedule(false);
  }

  const fmtDate = new Date(dateKey + "T12:00:00").toLocaleDateString("fi-FI", { weekday: "long", day: "numeric", month: "long" });
  const status  = dayStatus(data, dateKey);
  const sc      = dark ? STATUS_COLOR_DARK[status] : STATUS_COLOR[status];

  const DIARY_PROMPTS = ["Today I learned…", "I made mistakes in…", "Tomorrow I will improve…", "A sentence I practised…"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column" }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }} />

      {/* Sheet */}
      <div style={{ position: "relative", marginTop: "auto", background: bg, borderRadius: "24px 24px 0 0", maxHeight: "90dvh", overflowY: "auto", padding: "0 0 32px" }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 40, height: 4, background: dark ? "#383858" : "#ddd", borderRadius: 99 }} />
        </div>

        <div style={{ padding: "12px 18px 0" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: text }}>{fmtDate}</div>
              {plan && <div style={{ fontSize: 13, color: sub, marginTop: 2 }}>{plan.chapter.label} · {plan.chapter.grammar}</div>}
              {dayData.rescheduledFrom && <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 2 }}>↪ Rescheduled from {dayData.rescheduledFrom}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, background: sc.bg || (dark ? "#2a2a3e" : "#f0eeff"), color: sc.text, border: `1px solid ${sc.border}`, borderRadius: 20, padding: "3px 10px", fontWeight: 700 }}>{status}</span>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: sub, cursor: "pointer", padding: 0 }}>×</button>
            </div>
          </div>

          {/* Tasks */}
          <div style={{ fontSize: 13, fontWeight: 700, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tasks</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18 }}>
            {TASKS.map(t => {
              const s  = dayData.tasks[t.id] ?? "none";
              const c  = dark ? STATUS_COLOR_DARK[s] : STATUS_COLOR[s];
              const ic = s === "done" ? "✓" : s === "ongoing" ? "…" : "○";
              return (
                <button key={t.id} onClick={() => cycleTask(t.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: c.bg, border: `2px solid ${c.border}`, borderRadius: 12, padding: "11px 14px", cursor: "pointer", textAlign: "left", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: c.text, minWidth: 22, textAlign: "center" }}>{ic}</span>
                  <span style={{ fontSize: 15 }}>{t.emoji}</span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: c.text }}>{t.label}</span>
                  <span style={{ fontSize: 11, color: sub }}>{s}</span>
                </button>
              );
            })}
          </div>

          {/* Reschedule (past/missed days only) */}
          {(isPast || status === "missed") && (
            <div style={{ marginBottom: 18 }}>
              {!showReschedule ? (
                <button onClick={() => setShowReschedule(true)}
                  style={{ background: dark ? "#2a2a3e" : "#fef3c7", color: "#92400e", border: `1px solid #f59e0b`, borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ↪ Reschedule missed tasks to another day
                </button>
              ) : (
                <div style={{ background: bg2, borderRadius: 12, padding: "12px" }}>
                  <div style={{ fontSize: 13, color: text, fontWeight: 700, marginBottom: 8 }}>Move tasks to date:</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="date" value={rescheduleTarget} onChange={e => setRescheduleTarget(e.target.value)} min={today}
                      style={{ flex: 1, background: dark ? "#1e1e2e" : "#fff", color: text, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", fontSize: 15, outline: "none", fontFamily: "inherit" }} />
                    <button onClick={reschedule} disabled={!rescheduleTarget}
                      style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Move</button>
                    <button onClick={() => setShowReschedule(false)}
                      style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, color: sub, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Diary */}
          <div style={{ fontSize: 13, fontWeight: 700, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📝 Daily Reflection</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {DIARY_PROMPTS.map(p => (
              <button key={p} onClick={() => update({ reflection: (dayData.reflection ? dayData.reflection + "\n" : "") + p + " " })}
                style={{ background: dark ? "#383858" : "#f0eeff", color: accent, border: "none", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {p}
              </button>
            ))}
          </div>
          <textarea
            value={dayData.reflection}
            onChange={e => update({ reflection: e.target.value })}
            placeholder={"Write your reflection...\nToday I learned…\nI struggled with…\nTomorrow I will…"}
            style={{ width: "100%", minHeight: 130, background: bg2, color: text, border: `2px solid ${dayData.reflection ? accent : border}`, borderRadius: 14, padding: "12px", fontSize: 16, lineHeight: 1.7, outline: "none", resize: "vertical", fontFamily: "inherit", transition: "border-color 0.2s" }}
          />
          <div style={{ fontSize: 12, color: sub, marginTop: 4 }}>
            {dayData.reflection.trim().split(/\s+/).filter(Boolean).length} words · auto-saved
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR VIEW
// ─────────────────────────────────────────────────────────────────────────────
function CalendarView({ data, onOpenDay, dark }: {
  data: DashboardData; onOpenDay: (k: string) => void; dark: boolean;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() };
  });

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  const today  = todayKey();

  const firstDay = new Date(month.y, month.m, 1);
  const lastDay  = new Date(month.y, month.m + 1, 0);
  const startPad = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  const cells: (string | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(month.y, month.m, i + 1);
      return d.toISOString().slice(0, 10);
    }),
  ];

  const monthLabel = new Date(month.y, month.m).toLocaleDateString("fi-FI", { month: "long", year: "numeric" });

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={() => setMonth(m => { const d = new Date(m.y, m.m - 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
          style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>‹</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: text }}>{monthLabel}</span>
        <button onClick={() => setMonth(m => { const d = new Date(m.y, m.m + 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
          style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>›</button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: sub, padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((key, i) => {
          if (!key) return <div key={`pad-${i}`} />;
          const st  = dayStatus(data, key);
          const plan = getPlanForDate(key);
          const isToday  = key === today;
          const isInRange = key >= START_DATE.toISOString().slice(0,10) && key < EXAM_DATE.toISOString().slice(0,10);
          const sc = dark ? STATUS_COLOR_DARK[st] : STATUS_COLOR[st];
          const dayNum = parseInt(key.slice(8));

          return (
            <button key={key} onClick={() => onOpenDay(key)}
              style={{
                background: sc.bg || (dark ? "#1e1e2e" : "#f8f8fc"),
                border: `2px solid ${isToday ? accent : sc.border}`,
                borderRadius: 10, padding: "5px 3px",
                cursor: "pointer", textAlign: "center",
                boxShadow: isToday ? `0 0 0 2px ${accent}55` : "none",
                transition: "all 0.15s", WebkitTapHighlightColor: "transparent",
                opacity: isInRange ? 1 : 0.4,
              }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 900 : 600, color: isToday ? accent : sc.text || (dark ? "#e8e8f8" : "#1a1a2e") }}>
                {dayNum}
              </div>
              {isInRange && plan && (
                <div style={{ fontSize: 9, color: sc.text || sub, lineHeight: 1.1, marginTop: 1, overflow: "hidden", maxHeight: 18 }}>
                  {plan.chapter.label.replace("Kappale ", "K")}
                </div>
              )}
              {st !== "none" && (
                <div style={{ fontSize: 10, marginTop: 1 }}>
                  {st === "done" ? "✓" : st === "ongoing" ? "…" : st === "missed" ? "!" : ""}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        {[
          { label: "Not started", color: dark ? "#383858" : "#e4e0f8" },
          { label: "Ongoing",     color: "#f59e0b" },
          { label: "Done",        color: "#22c55e" },
          { label: "Missed",      color: "#ef4444" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: sub }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GITHUB-STYLE ACTIVITY GRID
// ─────────────────────────────────────────────────────────────────────────────
function ActivityGrid({ data, dark }: { data: DashboardData; dark: boolean }) {
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";

  // Last 60 days
  const days: string[] = [];
  const d = new Date(); d.setHours(12, 0, 0, 0);
  for (let i = 59; i >= 0; i--) {
    const dd = new Date(d); dd.setDate(dd.getDate() - i);
    days.push(dd.toISOString().slice(0, 10));
  }

  function cellColor(pct: number): string {
    if (pct === 0) return dark ? "#1e1e2e" : "#eee9ff";
    if (pct <= 25) return "#c4b5fd";
    if (pct <= 50) return "#a78bfa";
    if (pct <= 75) return "#7c5cfc";
    return "#5b21b6";
  }

  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 10 }}>Activity — last 60 days</div>
      <div style={{ display: "flex", gap: 3 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {week.map(key => {
              const pct = completionPct(data, key);
              const isToday = key === todayKey();
              return (
                <div key={key} title={`${key}: ${pct}%`}
                  style={{ width: 13, height: 13, borderRadius: 3, background: cellColor(pct), border: isToday ? "1.5px solid #7c5cfc" : "none", cursor: "default", transition: "transform 0.1s" }} />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: sub }}>Less</span>
        {[0, 25, 50, 75, 100].map(p => (
          <div key={p} style={{ width: 11, height: 11, borderRadius: 2, background: cellColor(p) }} />
        ))}
        <span style={{ fontSize: 11, color: sub }}>More</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE EVALUATOR
// ─────────────────────────────────────────────────────────────────────────────
function PerformanceEvaluator({ data, dark }: { data: DashboardData; dark: boolean }) {
  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  const today   = todayKey();
  const studyDays = dateRange(START_DATE, new Date(today + "T12:00:00"));
  const total   = studyDays.length;
  const done    = studyDays.filter(k => dayStatus(data, k) === "done").length;
  const ongoing = studyDays.filter(k => dayStatus(data, k) === "ongoing").length;
  const missed  = studyDays.filter(k => dayStatus(data, k) === "missed").length;
  const pct     = total > 0 ? Math.round(((done + ongoing * 0.5) / total) * 100) : 0;

  // Streak
  let streak = 0;
  const dd = new Date(today + "T12:00:00");
  while (true) {
    const k = dd.toISOString().slice(0, 10);
    const st = dayStatus(data, k);
    if (st !== "done" && st !== "ongoing") break;
    streak++;
    dd.setDate(dd.getDate() - 1);
  }

  const chapDone = CHAPTERS.filter(c => data.chapters[c.id]).length;

  const status = pct >= 80 ? "on_track" : pct >= 50 ? "behind" : "critical";
  const statusConfig = {
    on_track: { label: "🟢 On Track", color: "#22c55e", bg: dark ? "#0d2e1a" : "#f0fdf4", msg: "Excellent! Keep this pace and you'll be ready." },
    behind:   { label: "🟡 Slightly Behind", color: "#f59e0b", bg: dark ? "#2e1a00" : "#fef3c7", msg: "Pick it up. Aim for 1 full day completed daily." },
    critical: { label: "🔴 Behind Schedule", color: "#ef4444", bg: dark ? "#2e0d0d" : "#fff1f1", msg: "Urgent! Focus on daily tasks — skip nothing." },
  }[status];

  const stats = [
    { label: "Study days",  val: total,          color: accent },
    { label: "Completed",   val: done,            color: "#22c55e" },
    { label: "Ongoing",     val: ongoing,         color: "#f59e0b" },
    { label: "Missed",      val: missed,          color: "#ef4444" },
    { label: "Streak 🔥",   val: streak,          color: "#f59e0b" },
    { label: "Chapters",    val: `${chapDone}/8`, color: accent },
  ];

  return (
    <div>
      {/* Status banner */}
      <div style={{ background: statusConfig.bg, border: `2px solid ${statusConfig.color}`, borderRadius: 16, padding: "16px 18px", marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: statusConfig.color, marginBottom: 4 }}>{statusConfig.label}</div>
        <div style={{ fontSize: 14, color: text, marginBottom: 12 }}>{statusConfig.msg}</div>
        <div style={{ background: dark ? "#1e1e2e" : "#fff", borderRadius: 99, height: 10, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: 10, borderRadius: 99, background: statusConfig.color, transition: "width 0.6s" }} />
        </div>
        <div style={{ fontSize: 13, color: sub, marginTop: 6 }}>{pct}% overall completion ({done} full + {ongoing} partial of {total} days)</div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Phase roadmap */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 12 }}>Study roadmap</div>
        {PHASES.map((p, i) => {
          const isDone   = chapDone > (i === 0 ? 2 : i === 1 ? 4 : i === 2 ? 6 : 7);
          const isActive = !isDone && chapDone >= (i === 0 ? 0 : i === 1 ? 3 : i === 2 ? 5 : 7);
          return (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 99, flexShrink: 0, background: isDone ? "#22c55e" : isActive ? accent : (dark ? "#383858" : "#e4e0f8"), display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: isDone || isActive ? "#fff" : sub }}>{isDone ? "✓" : i + 1}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isDone ? "#22c55e" : isActive ? accent : sub }}>{p.label}</span>
                  <span style={{ fontSize: 11, color: sub }}>{p.weeks}</span>
                  {isActive && <span style={{ fontSize: 11, background: accent+"22", color: accent, borderRadius: 20, padding: "1px 8px", fontWeight: 700 }}>NOW</span>}
                </div>
                <div style={{ fontSize: 12, color: sub }}>{p.chapters} · {p.focus}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Activity grid */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px" }}>
        <ActivityGrid data={data} dark={dark} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAPTER TRACKER (kept from v1)
// ─────────────────────────────────────────────────────────────────────────────
function ChapterTracker({ data, onChange, dark }: { data: DashboardData; onChange: (d: DashboardData) => void; dark: boolean }) {
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  const done   = CHAPTERS.filter(c => data.chapters[c.id]).length;
  const PHASE_COLORS = ["#7c5cfc","#22c55e","#f59e0b","#ef4444"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Suomen 2 chapters</div>
        <span style={{ fontSize: 13, color: sub }}>{done}/8 done</span>
      </div>
      <div style={{ background: dark ? "#383858" : "#e4e0f8", borderRadius: 99, height: 6, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ width: `${(done/8)*100}%`, height: 6, borderRadius: 99, background: "#22c55e", transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {CHAPTERS.map(ch => {
          const checked = !!data.chapters[ch.id];
          const pc = PHASE_COLORS[ch.phase];
          return (
            <button key={ch.id} onClick={() => onChange({ ...data, chapters: { ...data.chapters, [ch.id]: !checked } })}
              style={{ background: checked ? (dark ? "#0d2e1a" : "#f0fdf4") : bg, border: `2px solid ${checked ? "#22c55e" : border}`, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", textAlign: "left", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, marginTop: 1, background: checked ? "#22c55e" : "transparent", border: `2px solid ${checked ? "#22c55e" : (dark ? "#555" : "#ccc")}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {checked && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: checked ? "#22c55e" : text, textDecoration: checked ? "line-through" : "none", opacity: checked ? 0.6 : 1 }}>{ch.label}</span>
                  <span style={{ fontSize: 10, background: pc+"22", color: pc, borderRadius: 20, padding: "1px 7px", fontWeight: 700 }}>Phase {ch.phase+1}</span>
                </div>
                <div style={{ fontSize: 13, color: sub }}>{ch.topic}</div>
                <div style={{ fontSize: 12, color: accent, marginTop: 2, fontStyle: "italic" }}>🎯 {ch.grammar}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
type DashSection = "today" | "calendar" | "chapters" | "progress";

export default function Dashboard({ dark }: { dark: boolean }) {
  const [data,       setData]       = useState<DashboardData>(loadData);
  const [section,    setSection]    = useState<DashSection>("today");
  const [modalDay,   setModalDay]   = useState<string | null>(null);

  const onChange = useCallback((next: DashboardData) => {
    setData(next); saveData(next);
  }, []);

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const accent = "#7c5cfc";

  const sections: { id: DashSection; emoji: string; label: string }[] = [
    { id: "today",    emoji: "📅", label: "Today"    },
    { id: "calendar", emoji: "🗓", label: "Calendar" },
    { id: "chapters", emoji: "📚", label: "Chapters" },
    { id: "progress", emoji: "📊", label: "Progress" },
  ];

  return (
    <div>
      {/* Countdown — always visible */}
      <Countdown dark={dark} />

      {/* Section tabs */}
      <div style={{ display: "flex", background: dark ? "#1e1e2e" : "#f0eeff", borderRadius: 14, padding: 4, marginBottom: 20, gap: 2 }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{ flex: 1, background: section === s.id ? accent : "transparent", color: section === s.id ? "#fff" : sub, border: "none", borderRadius: 11, padding: "9px 4px", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>{s.emoji}</div>
            {s.label}
          </button>
        ))}
      </div>

      {section === "today"    && <TodayPanel       data={data} onChange={onChange} onOpenDay={setModalDay} dark={dark} />}
      {section === "calendar" && <CalendarView      data={data} onOpenDay={setModalDay} dark={dark} />}
      {section === "chapters" && <ChapterTracker    data={data} onChange={onChange} dark={dark} />}
      {section === "progress" && <PerformanceEvaluator data={data} dark={dark} />}

      {/* Day modal */}
      {modalDay && (
        <DayModal
          dateKey={modalDay}
          data={data}
          onChange={onChange}
          onClose={() => setModalDay(null)}
          dark={dark}
        />
      )}
    </div>
  );
}