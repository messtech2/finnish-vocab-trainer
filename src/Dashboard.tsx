import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type TaskStatus = "done" | "ongoing" | "missed" | "none";

interface DayData {
  date: string;
  tasks: Record<string, TaskStatus>;
  reflection: string;
  rescheduledFrom?: string;
}

interface DashboardData {
  days: Record<string, DayData>;
  chapters: Record<string, boolean>;
  weekendModeOn: boolean; // new setting — persisted
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const EXAM_DATE  = new Date("2026-05-15T09:00:00");
const START_DATE = new Date("2026-04-11T00:00:00");
const LS_KEY     = "fi_b1_dashboard_v1"; // same key — existing data preserved

const CHAPTERS = [
  { id: "s2_k1", label: "Kappale 1", topic: "Tutustutaan",        grammar: "Verbitaivutus (minä, sinä, hän)",      phase: 0 },
  { id: "s2_k2", label: "Kappale 2", topic: "Arki",               grammar: "Omistusrakenne (minulla on)",          phase: 0 },
  { id: "s2_k3", label: "Kappale 3", topic: "Koti ja perhe",      grammar: "Genetiivi + Adjektiivit",              phase: 0 },
  { id: "s2_k4", label: "Kappale 4", topic: "Työ ja opiskelu",    grammar: "Infinitiivi (haluan oppia)",           phase: 1 },
  { id: "s2_k5", label: "Kappale 5", topic: "Liikkuminen",        grammar: "Missä / Mihin / Mistä (paikkasijat)", phase: 1 },
  { id: "s2_k6", label: "Kappale 6", topic: "Terveys",            grammar: "Partitiivi (syön leipää)",             phase: 2 },
  { id: "s2_k7", label: "Kappale 7", topic: "Vapaa-aika",         grammar: "Imperfekti (menin, söin, tein)",       phase: 2 },
  { id: "s2_k8", label: "Kappale 8", topic: "Yhteiskunta ja työ", grammar: "Konditionaali (haluaisin)",            phase: 3 },
];

// Full weekday task list (Mon–Fri)
const WEEKDAY_TASKS = [
  { id: "read",   emoji: "📘", label: "Book Study",  desc: "Read chapter + study grammar + do exercises", optional: false },
  { id: "vocab",  emoji: "📚", label: "Vocabulary",  desc: "Learn 10–15 words · write 1 sentence each",  optional: false },
  { id: "write",  emoji: "✍️", label: "Writing",     desc: "Write 80–120 words using today's grammar",   optional: false },
  { id: "speak",  emoji: "🗣", label: "Speaking",    desc: "Read aloud · record yourself",                optional: false },
  { id: "review", emoji: "🔁", label: "Review",      desc: "Fix yesterday's mistakes · repeat grammar",   optional: false },
];

// Light weekend task list (Sat–Sun) — 20–30 min max
const WEEKEND_TASKS = [
  { id: "vocab",  emoji: "📚", label: "Vocabulary recap",    desc: "Review 10 words from the week · flashcards (10 min)", optional: false },
  { id: "review", emoji: "🔁", label: "Grammar quick-recap", desc: "Re-read grammar notes · do 2–3 exercises (10 min)",   optional: false },
  { id: "speak",  emoji: "🎧", label: "Listen & repeat",     desc: "Listen to Finnish audio or read a short text (10 min)", optional: true  },
];

const PHASES = [
  { label: "Phase 1", weeks: "Week 1–2", chapters: "Kappale 1–3", focus: "Basics: verbs, ownership, adjectives" },
  { label: "Phase 2", weeks: "Week 3",   chapters: "Kappale 4–5", focus: "Infinitive + Location cases" },
  { label: "Phase 3", weeks: "Week 4",   chapters: "Kappale 6–7", focus: "Partitive + Imperfect tense" },
  { label: "Phase 4", weeks: "Week 5+",  chapters: "Kappale 8 + Review", focus: "Conditional + Full mock exam" },
];

// ─────────────────────────────────────────────────────────────────────────────
// WEEKEND DETECTION
// ─────────────────────────────────────────────────────────────────────────────
function isWeekend(dateKey: string): boolean {
  const dow = new Date(dateKey + "T12:00:00").getDay(); // 0=Sun,6=Sat
  return dow === 0 || dow === 6;
}

// Returns the right task list for a given day, respecting weekend mode
function getTasksForDate(dateKey: string, weekendModeOn: boolean) {
  if (weekendModeOn && isWeekend(dateKey)) return WEEKEND_TASKS;
  return WEEKDAY_TASKS;
}

// All tasks used for a day — needed for status/pct calculations
function allTasksForDay(dateKey: string, weekendModeOn: boolean) {
  return getTasksForDate(dateKey, weekendModeOn);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-PLAN (skips weekend deep work when mode on)
// ─────────────────────────────────────────────────────────────────────────────
function getPlanForDate(dateKey: string): { chapter: typeof CHAPTERS[0]; phase: number } | null {
  const d    = new Date(dateKey + "T12:00:00");
  const diff = Math.floor((d.getTime() - START_DATE.getTime()) / 86400000);
  if (diff < 0 || d >= EXAM_DATE) return null;
  const daySchedule = [
    ...Array(4).fill(0), ...Array(4).fill(1), ...Array(4).fill(2),
    ...Array(4).fill(3), ...Array(3).fill(4), ...Array(4).fill(5),
    ...Array(4).fill(6), ...Array(100).fill(7),
  ];
  const chapIdx = daySchedule[Math.min(diff, daySchedule.length - 1)];
  return { chapter: CHAPTERS[chapIdx], phase: CHAPTERS[chapIdx].phase };
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE — migrates old data, reads weekendModeOn
// ─────────────────────────────────────────────────────────────────────────────
function loadData(): DashboardData {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (!raw) return { days: {}, chapters: {}, weekendModeOn: true };
    const days: Record<string, DayData> = {};
    for (const [k, v] of Object.entries(raw.days || {})) {
      const old = v as any;
      const tasks: Record<string, TaskStatus> = {};
      for (const [tid, val] of Object.entries(old.tasks || {})) {
        tasks[tid] = typeof val === "boolean" ? (val ? "done" : "none") : val as TaskStatus;
      }
      days[k] = { date: k, tasks, reflection: old.reflection || "", rescheduledFrom: old.rescheduledFrom };
    }
    return { days, chapters: raw.chapters || {}, weekendModeOn: raw.weekendModeOn ?? true };
  } catch { return { days: {}, chapters: {}, weekendModeOn: true }; }
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
  const d = new Date(from); d.setHours(12, 0, 0, 0);
  while (d < to) { keys.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return keys;
}

function dayStatus(data: DashboardData, dateKey: string): "none" | "ongoing" | "done" | "missed" {
  const today  = todayKey();
  const day    = data.days[dateKey];
  const tasks  = allTasksForDay(dateKey, data.weekendModeOn);
  const reqIds = tasks.filter(t => !t.optional).map(t => t.id);

  if (!day || Object.keys(day.tasks).length === 0) {
    return dateKey < today ? "missed" : "none";
  }
  const doneCount    = reqIds.filter(id => day.tasks[id] === "done").length;
  const ongoingCount = reqIds.filter(id => day.tasks[id] === "ongoing").length;
  if (doneCount === reqIds.length) return "done";
  if (doneCount > 0 || ongoingCount > 0) return "ongoing";
  if (dateKey < today) return "missed";
  return "none";
}

function completionPct(data: DashboardData, dateKey: string): number {
  const day   = data.days[dateKey];
  if (!day) return 0;
  const tasks = allTasksForDay(dateKey, data.weekendModeOn);
  const done  = tasks.filter(t => day.tasks[t.id] === "done").length;
  return Math.round((done / tasks.length) * 100);
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
// AUTO-RESCHEDULE: push missed required tasks to the next weekday
// ─────────────────────────────────────────────────────────────────────────────
function autoRescheduleMissed(data: DashboardData): DashboardData {
  const today   = todayKey();
  const newDays = { ...data.days };

  // Find next N weekday keys from tomorrow
  function nextWeekdays(n: number): string[] {
    const keys: string[] = [];
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() + 1);
    while (keys.length < n) {
      const k = d.toISOString().slice(0, 10);
      if (!isWeekend(k)) keys.push(k);
      d.setDate(d.getDate() + 1);
    }
    return keys;
  }

  // Collect all missed required tasks from past weekend days when mode is on
  const missedTasks: string[] = [];
  for (const [k, day] of Object.entries(data.days)) {
    if (k >= today) continue;
    if (!(data.weekendModeOn && isWeekend(k))) continue;
    // Weekend day — any heavy tasks that got missed (from pre-mode data)?
    // Nothing to push: weekend mode already reduces load. Skip.
  }

  // Collect missed weekday tasks
  for (const [k] of Object.entries({ ...newDays })) {
    if (k >= today) continue;
    const st = dayStatus(data, k);
    if (st !== "missed") continue;
    if (data.weekendModeOn && isWeekend(k)) continue; // weekends don't count as missed in weekend mode
    missedTasks.push(k);
  }

  if (missedTasks.length === 0) return data;

  // Distribute missed days evenly across next weekdays
  const targets = nextWeekdays(Math.min(missedTasks.length, 5));
  missedTasks.forEach((missedKey, i) => {
    const targetKey = targets[i % targets.length];
    const targetDay = newDays[targetKey] ?? { date: targetKey, tasks: {}, reflection: "" };
    // Mark as rescheduled note in reflection if not already noted
    const note = `\n[Rescheduled from ${missedKey}]`;
    if (!targetDay.reflection?.includes(note.trim())) {
      newDays[targetKey] = {
        ...targetDay,
        reflection: (targetDay.reflection || "") + note,
        rescheduledFrom: missedKey,
      };
    }
  });

  return { ...data, days: newDays };
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKEND MODE TOGGLE BANNER
// ─────────────────────────────────────────────────────────────────────────────
function WeekendModeBanner({ on, onToggle, dark }: { on: boolean; onToggle: () => void; dark: boolean }) {
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#1e1e2e" : "#f8f8fc";
  const border = dark ? "#383858" : "#e4e0f8";

  return (
    <div style={{ background: on ? (dark ? "#0d1a2e" : "#eff6ff") : bg, border: `1.5px solid ${on ? "#3b82f6" : border}`, borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: on ? "#3b82f6" : (dark ? "#e8e8f8" : "#1a1a2e"), display: "flex", alignItems: "center", gap: 8 }}>
          {on ? "🏖 Weekend Mode ON" : "⚙️ Weekend Mode OFF"}
          {on && <span style={{ fontSize: 11, background: "#3b82f622", color: "#3b82f6", borderRadius: 20, padding: "1px 8px", fontWeight: 700 }}>Sat–Sun light plan</span>}
        </div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>
          {on
            ? "Weekends: 20–30 min light tasks only. Family first ✓"
            : "All days treated equally — weekends included"}
        </div>
      </div>
      {/* Toggle switch */}
      <button onClick={onToggle}
        style={{ position: "relative", width: 48, height: 27, borderRadius: 99, border: "none", background: on ? "#3b82f6" : (dark ? "#383858" : "#ddd"), cursor: "pointer", flexShrink: 0, transition: "background 0.2s", WebkitTapHighlightColor: "transparent" }}>
        <div style={{ position: "absolute", top: 3, left: on ? 24 : 3, width: 21, height: 21, borderRadius: 99, background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px #0003" }} />
      </button>
    </div>
  );
}

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
    <div style={{ textAlign: "center", background: urgent ? (dark ? "#2d0a0a" : "#fff1f1") : (dark ? "#1a0f3a" : "#f0eeff"), border: `2px solid ${color}44`, borderRadius: 20, padding: "22px 20px 18px", marginBottom: 16 }}>
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
// TODAY PANEL
// ─────────────────────────────────────────────────────────────────────────────
function TodayPanel({ data, onChange, onOpenDay, dark }: {
  data: DashboardData; onChange: (d: DashboardData) => void;
  onOpenDay: (key: string) => void; dark: boolean;
}) {
  const today     = todayKey();
  const plan      = getPlanForDate(today);
  const weekend   = data.weekendModeOn && isWeekend(today);
  const tasks     = getTasksForDate(today, data.weekendModeOn);
  const dayData   = data.days[today] ?? { date: today, tasks: {}, reflection: "" };
  const doneCount = tasks.filter(t => dayData.tasks[t.id] === "done").length;
  const pct       = Math.round((doneCount / tasks.length) * 100);

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = weekend ? "#3b82f6" : "#7c5cfc";

  const dow = new Date(today + "T12:00:00").toLocaleDateString("fi-FI", { weekday: "long" });

  function cycleTask(id: string) {
    const cur  = dayData.tasks[id] ?? "none";
    const next: TaskStatus = cur === "none" ? "ongoing" : cur === "ongoing" ? "done" : "none";
    const updated = { ...dayData, tasks: { ...dayData.tasks, [id]: next } };
    onChange({ ...data, days: { ...data.days, [today]: updated } });
  }

  const taskIcon = (s: TaskStatus) => s === "done" ? "✓" : s === "ongoing" ? "…" : "○";

  return (
    <div style={{ background: bg, border: `2px solid ${accent}44`, borderRadius: 18, padding: "18px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: text }}>📅 TODAY'S PLAN</div>
            {weekend && (
              <span style={{ fontSize: 11, background: "#3b82f622", color: "#3b82f6", borderRadius: 20, padding: "2px 9px", fontWeight: 800 }}>
                🏖 Weekend — light mode
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: sub, marginTop: 2 }}>
            {dow.charAt(0).toUpperCase() + dow.slice(1)}
            {plan && !weekend && ` · ${plan.chapter.label} · ${plan.chapter.topic}`}
            {weekend && " · 20–30 min max · family first ✓"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: pct === 100 ? "#22c55e" : accent }}>{pct}%</div>
          <div style={{ fontSize: 11, color: sub }}>{doneCount}/{tasks.length}</div>
        </div>
      </div>

      <div style={{ background: dark ? "#383858" : "#e4e0f8", borderRadius: 99, height: 6, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: 6, borderRadius: 99, background: pct === 100 ? "#22c55e" : accent, transition: "width 0.4s" }} />
      </div>

      {/* Plan chips */}
      {weekend ? (
        <div style={{ background: dark ? "#0d1a2e" : "#eff6ff", border: `1px solid #3b82f633`, borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6", marginBottom: 6 }}>🏖 Weekend light plan</div>
          <div style={{ fontSize: 13, color: sub, lineHeight: 1.7 }}>
            No new chapters · No heavy grammar<br />
            Focus: review + listen + stay consistent
          </div>
        </div>
      ) : plan && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
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

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
        {tasks.map(t => {
          const status = dayData.tasks[t.id] ?? "none";
          const sc = dark ? STATUS_COLOR_DARK[status] : STATUS_COLOR[status];
          return (
            <button key={t.id} onClick={() => cycleTask(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, background: sc.bg, border: `2px solid ${sc.border}`, borderRadius: 12, padding: "11px 14px", cursor: "pointer", textAlign: "left", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: sc.text, minWidth: 22, textAlign: "center" }}>{taskIcon(status)}</span>
              <span style={{ fontSize: 15 }}>{t.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: sc.text }}>{t.label}</span>
                  {t.optional && <span style={{ fontSize: 10, color: "#3b82f6", background: "#3b82f622", borderRadius: 20, padding: "1px 7px", fontWeight: 700 }}>optional</span>}
                </div>
                <div style={{ fontSize: 12, color: sub }}>{t.desc}</div>
              </div>
              <span style={{ fontSize: 11, color: sub, background: dark ? "#383858" : "#e4e0f8", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>{status === "none" ? "tap" : status}</span>
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
  const plan      = getPlanForDate(dateKey);
  const weekend   = data.weekendModeOn && isWeekend(dateKey);
  const tasks     = getTasksForDate(dateKey, data.weekendModeOn);
  const dayData   = data.days[dateKey] ?? { date: dateKey, tasks: {}, reflection: "" };
  const today     = todayKey();
  const isPast    = dateKey < today;
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState("");

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#1e1e2e" : "#fff";
  const bg2    = dark ? "#2a2a3e" : "#f8f8fc";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = weekend ? "#3b82f6" : "#7c5cfc";

  const fmtDate = new Date(dateKey + "T12:00:00").toLocaleDateString("fi-FI", { weekday: "long", day: "numeric", month: "long" });
  const status  = dayStatus(data, dateKey);
  const sc      = dark ? STATUS_COLOR_DARK[status] : STATUS_COLOR[status];
  const DIARY_PROMPTS = ["Today I learned…", "I made mistakes in…", "Tomorrow I will improve…", "A sentence I practised…"];

  function update(patch: Partial<DayData>) {
    onChange({ ...data, days: { ...data.days, [dateKey]: { ...dayData, ...patch } } });
  }
  function cycleTask(id: string) {
    const cur  = dayData.tasks[id] ?? "none";
    const next: TaskStatus = cur === "none" ? "ongoing" : cur === "ongoing" ? "done" : "none";
    update({ tasks: { ...dayData.tasks, [id]: next } });
  }
  function reschedule() {
    if (!rescheduleTarget) return;
    const targetDay = data.days[rescheduleTarget] ?? { date: rescheduleTarget, tasks: {}, reflection: "" };
    const note = `\n[Rescheduled from ${dateKey}]`;
    onChange({
      ...data,
      days: {
        ...data.days,
        [rescheduleTarget]: { ...targetDay, reflection: (targetDay.reflection || "") + note, rescheduledFrom: dateKey },
        [dateKey]: { ...dayData, tasks: Object.fromEntries(tasks.map(t => [t.id, "missed" as TaskStatus])) },
      }
    });
    setShowReschedule(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", marginTop: "auto", background: bg, borderRadius: "24px 24px 0 0", maxHeight: "90dvh", overflowY: "auto", padding: "0 0 32px" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 40, height: 4, background: dark ? "#383858" : "#ddd", borderRadius: 99 }} />
        </div>
        <div style={{ padding: "12px 18px 0" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: text }}>{fmtDate}</div>
                {weekend && <span style={{ fontSize: 11, background: "#3b82f622", color: "#3b82f6", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>🏖 Weekend light</span>}
              </div>
              {plan && !weekend && <div style={{ fontSize: 13, color: sub, marginTop: 2 }}>{plan.chapter.label} · {plan.chapter.grammar}</div>}
              {weekend && <div style={{ fontSize: 13, color: "#3b82f6", marginTop: 2 }}>Light review only · 20–30 min max</div>}
              {dayData.rescheduledFrom && <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 2 }}>↪ Rescheduled from {dayData.rescheduledFrom}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, background: sc.bg || bg2, color: sc.text, border: `1px solid ${sc.border}`, borderRadius: 20, padding: "3px 10px", fontWeight: 700 }}>{status}</span>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: sub, cursor: "pointer", padding: 0 }}>×</button>
            </div>
          </div>

          {/* Tasks */}
          <div style={{ fontSize: 12, fontWeight: 700, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            {weekend ? "Light tasks (20–30 min)" : "Today's tasks"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
            {tasks.map(t => {
              const s  = dayData.tasks[t.id] ?? "none";
              const c  = dark ? STATUS_COLOR_DARK[s] : STATUS_COLOR[s];
              const ic = s === "done" ? "✓" : s === "ongoing" ? "…" : "○";
              return (
                <button key={t.id} onClick={() => cycleTask(t.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: c.bg, border: `2px solid ${c.border}`, borderRadius: 12, padding: "11px 14px", cursor: "pointer", textAlign: "left", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: c.text, minWidth: 22, textAlign: "center" }}>{ic}</span>
                  <span style={{ fontSize: 15 }}>{t.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: c.text }}>{t.label}</span>
                      {t.optional && <span style={{ fontSize: 10, color: "#3b82f6", background: "#3b82f622", borderRadius: 20, padding: "1px 7px", fontWeight: 700 }}>optional</span>}
                    </div>
                    <span style={{ fontSize: 12, color: sub }}>{t.desc}</span>
                  </div>
                  <span style={{ fontSize: 11, color: sub }}>{s}</span>
                </button>
              );
            })}
          </div>

          {/* Reschedule */}
          {isPast && status === "missed" && (
            <div style={{ marginBottom: 16 }}>
              {!showReschedule ? (
                <button onClick={() => setShowReschedule(true)}
                  style={{ background: dark ? "#2a2a3e" : "#fef3c7", color: "#92400e", border: `1px solid #f59e0b`, borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ↪ Reschedule to another day
                </button>
              ) : (
                <div style={{ background: bg2, borderRadius: 12, padding: "12px" }}>
                  <div style={{ fontSize: 13, color: text, fontWeight: 700, marginBottom: 8 }}>Move to date:</div>
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
          <div style={{ fontSize: 12, fontWeight: 700, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📝 Daily reflection</div>
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
            style={{ width: "100%", minHeight: 120, background: bg2, color: text, border: `2px solid ${dayData.reflection ? accent : border}`, borderRadius: 14, padding: "12px", fontSize: 16, lineHeight: 1.7, outline: "none", resize: "vertical", fontFamily: "inherit", transition: "border-color 0.2s" }}
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
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  const today  = todayKey();

  const firstDay     = new Date(month.y, month.m, 1);
  const daysInMonth  = new Date(month.y, month.m + 1, 0).getDate();
  const startPad     = firstDay.getDay();

  const cells: (string | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      new Date(month.y, month.m, i + 1).toISOString().slice(0, 10)
    ),
  ];

  const monthLabel = new Date(month.y, month.m).toLocaleDateString("fi-FI", { month: "long", year: "numeric" });
  const inRange = (k: string) => k >= START_DATE.toISOString().slice(0,10) && k < EXAM_DATE.toISOString().slice(0,10);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={() => setMonth(m => { const d = new Date(m.y, m.m-1); return { y: d.getFullYear(), m: d.getMonth() }; })}
          style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>‹</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: text }}>{monthLabel}</span>
        <button onClick={() => setMonth(m => { const d = new Date(m.y, m.m+1); return { y: d.getFullYear(), m: d.getMonth() }; })}
          style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>›</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d, i) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: (i === 0 || i === 6) ? "#3b82f6" : sub, padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((key, i) => {
          if (!key) return <div key={`pad-${i}`} />;
          const wknd    = isWeekend(key);
          const wkndOn  = data.weekendModeOn;
          const st      = dayStatus(data, key);
          const plan    = getPlanForDate(key);
          const isToday = key === today;
          const active  = inRange(key);
          const sc      = dark ? STATUS_COLOR_DARK[st] : STATUS_COLOR[st];
          const wkndBg  = wknd && wkndOn
            ? (dark ? "#0d1a2e" : "#eff6ff")
            : (sc.bg || (dark ? "#1e1e2e" : "#f8f8fc"));
          const wkndBorder = wknd && wkndOn && st === "none"
            ? (dark ? "#1e3a5f" : "#bfdbfe")
            : (isToday ? accent : sc.border);
          const dayNum = parseInt(key.slice(8));

          return (
            <button key={key} onClick={() => onOpenDay(key)}
              style={{ background: wkndBg, border: `2px solid ${wkndBorder}`, borderRadius: 10, padding: "5px 3px", cursor: "pointer", textAlign: "center", boxShadow: isToday ? `0 0 0 2px ${accent}55` : "none", transition: "all 0.15s", WebkitTapHighlightColor: "transparent", opacity: active ? 1 : 0.35 }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 900 : 600, color: isToday ? accent : wknd && wkndOn && st === "none" ? "#3b82f6" : (sc.text || text) }}>
                {dayNum}
              </div>
              {active && !wknd && plan && (
                <div style={{ fontSize: 9, color: sc.text || sub, lineHeight: 1.1, marginTop: 1 }}>
                  {plan.chapter.label.replace("Kappale ", "K")}
                </div>
              )}
              {active && wknd && wkndOn && (
                <div style={{ fontSize: 10, marginTop: 1 }}>🏖</div>
              )}
              {st !== "none" && (
                <div style={{ fontSize: 10, marginTop: 1 }}>
                  {st === "done" ? "✓" : st === "ongoing" ? "…" : "!"}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        {[
          { label: "Not started", color: dark ? "#383858" : "#e4e0f8" },
          { label: "Ongoing",     color: "#f59e0b" },
          { label: "Done",        color: "#22c55e" },
          { label: "Missed",      color: "#ef4444" },
          { label: "Weekend 🏖",  color: "#3b82f6" },
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
// ACTIVITY GRID
// ─────────────────────────────────────────────────────────────────────────────
function ActivityGrid({ data, dark }: { data: DashboardData; dark: boolean }) {
  const sub  = dark ? "#9898b8" : "#777";
  const days: string[] = [];
  const d = new Date(); d.setHours(12,0,0,0);
  for (let i = 59; i >= 0; i--) {
    const dd = new Date(d); dd.setDate(dd.getDate()-i);
    days.push(dd.toISOString().slice(0,10));
  }
  function cellColor(pct: number, wknd: boolean, wkndOn: boolean): string {
    if (wknd && wkndOn) {
      if (pct === 0) return dark ? "#0d1a2e" : "#dbeafe";
      return pct >= 100 ? "#3b82f6" : "#93c5fd";
    }
    if (pct === 0) return dark ? "#1e1e2e" : "#eee9ff";
    if (pct <= 25) return "#c4b5fd";
    if (pct <= 50) return "#a78bfa";
    if (pct <= 75) return "#7c5cfc";
    return "#5b21b6";
  }
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i+7));
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: dark ? "#e8e8f8" : "#1a1a2e", marginBottom: 10 }}>Activity — last 60 days</div>
      <div style={{ display: "flex", gap: 3 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {week.map(key => {
              const pct  = completionPct(data, key);
              const wknd = isWeekend(key);
              return (
                <div key={key} title={`${key}: ${pct}%${wknd && data.weekendModeOn ? " (weekend)" : ""}`}
                  style={{ width: 13, height: 13, borderRadius: 3, background: cellColor(pct, wknd, data.weekendModeOn), border: key === todayKey() ? "1.5px solid #7c5cfc" : "none" }} />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: sub }}>Less</span>
        {[0,25,50,75,100].map(p => <div key={p} style={{ width: 11, height: 11, borderRadius: 2, background: cellColor(p, false, false) }} />)}
        <span style={{ fontSize: 11, color: sub }}>More</span>
        <span style={{ fontSize: 11, color: "#3b82f6", marginLeft: 8 }}>🏖 weekend</span>
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

  const today      = todayKey();
  const studyDays  = dateRange(START_DATE, new Date(today + "T12:00:00"));
  // In weekend mode, weekends count as lighter — don't count them as missed
  const effectiveDays = studyDays.filter(k => !(data.weekendModeOn && isWeekend(k)));
  const weekendDays   = studyDays.filter(k => data.weekendModeOn && isWeekend(k));

  const total   = effectiveDays.length;
  const done    = effectiveDays.filter(k => dayStatus(data, k) === "done").length;
  const ongoing = effectiveDays.filter(k => dayStatus(data, k) === "ongoing").length;
  const missed  = effectiveDays.filter(k => dayStatus(data, k) === "missed").length;
  const wkndDone = weekendDays.filter(k => dayStatus(data, k) === "done").length;
  const pct      = total > 0 ? Math.round(((done + ongoing * 0.5) / total) * 100) : 0;

  let streak = 0;
  const dd = new Date(today + "T12:00:00");
  while (true) {
    const k  = dd.toISOString().slice(0, 10);
    const st = dayStatus(data, k);
    // In weekend mode, weekends don't break the streak
    if (data.weekendModeOn && isWeekend(k)) { dd.setDate(dd.getDate()-1); continue; }
    if (st !== "done" && st !== "ongoing") break;
    streak++;
    dd.setDate(dd.getDate()-1);
    if (streak > 120) break; // safety
  }

  const chapDone = CHAPTERS.filter(c => data.chapters[c.id]).length;
  const status   = pct >= 80 ? "on_track" : pct >= 50 ? "behind" : "critical";
  const cfg = {
    on_track: { label: "🟢 On Track",          color: "#22c55e", bg: dark ? "#0d2e1a" : "#f0fdf4", msg: "Excellent! Keep this pace and you'll be ready." },
    behind:   { label: "🟡 Slightly Behind",   color: "#f59e0b", bg: dark ? "#2e1a00" : "#fef3c7", msg: "Pick it up. Aim for 1 full weekday completed daily." },
    critical: { label: "🔴 Behind Schedule",   color: "#ef4444", bg: dark ? "#2e0d0d" : "#fff1f1", msg: "Urgent! Focus on weekday tasks — skip nothing." },
  }[status];

  return (
    <div>
      {/* Status */}
      <div style={{ background: cfg.bg, border: `2px solid ${cfg.color}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: cfg.color, marginBottom: 4 }}>{cfg.label}</div>
        <div style={{ fontSize: 14, color: text, marginBottom: 10 }}>{cfg.msg}</div>
        <div style={{ background: dark ? "#1e1e2e" : "#fff", borderRadius: 99, height: 10, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: 10, borderRadius: 99, background: cfg.color, transition: "width 0.6s" }} />
        </div>
        <div style={{ fontSize: 13, color: sub, marginTop: 6 }}>
          {pct}% weekday completion · {done} full + {ongoing} partial of {total} weekdays
          {data.weekendModeOn && wkndDone > 0 && ` · ${wkndDone} weekend bonus sessions ✓`}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Weekdays",      val: total,           color: accent },
          { label: "Completed",     val: done,            color: "#22c55e" },
          { label: "Missed",        val: missed,          color: "#ef4444" },
          { label: "Streak 🔥",     val: streak,          color: "#f59e0b" },
          { label: "Chapters",      val: `${chapDone}/8`, color: accent },
          { label: "Wknd bonus ✓", val: wkndDone,        color: "#3b82f6" },
        ].map(s => (
          <div key={s.label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Phase roadmap */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 12 }}>Study roadmap</div>
        {PHASES.map((p, i) => {
          const isDone   = chapDone > (i === 0 ? 2 : i === 1 ? 4 : i === 2 ? 6 : 7);
          const isActive = !isDone && chapDone >= (i === 0 ? 0 : i === 1 ? 3 : i === 2 ? 5 : 7);
          return (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 99, flexShrink: 0, background: isDone ? "#22c55e" : isActive ? accent : (dark ? "#383858" : "#e4e0f8"), display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: isDone || isActive ? "#fff" : sub }}>{isDone ? "✓" : i+1}</span>
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
// CHAPTER TRACKER
// ─────────────────────────────────────────────────────────────────────────────
function ChapterTracker({ data, onChange, dark }: { data: DashboardData; onChange: (d: DashboardData) => void; dark: boolean }) {
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  const done   = CHAPTERS.filter(c => data.chapters[c.id]).length;
  const PC     = ["#7c5cfc","#22c55e","#f59e0b","#ef4444"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Suomen 2 chapters</div>
        <span style={{ fontSize: 13, color: sub }}>{done}/8 done</span>
      </div>
      <div style={{ background: dark ? "#383858" : "#e4e0f8", borderRadius: 99, height: 6, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ width: `${(done/8)*100}%`, height: 6, borderRadius: 99, background: "#22c55e", transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {CHAPTERS.map(ch => {
          const checked = !!data.chapters[ch.id];
          return (
            <button key={ch.id} onClick={() => onChange({ ...data, chapters: { ...data.chapters, [ch.id]: !checked } })}
              style={{ background: checked ? (dark ? "#0d2e1a" : "#f0fdf4") : bg, border: `2px solid ${checked ? "#22c55e" : border}`, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", textAlign: "left", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, marginTop: 1, background: checked ? "#22c55e" : "transparent", border: `2px solid ${checked ? "#22c55e" : (dark ? "#555" : "#ccc")}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {checked && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: checked ? "#22c55e" : text, textDecoration: checked ? "line-through" : "none", opacity: checked ? 0.6 : 1 }}>{ch.label}</span>
                  <span style={{ fontSize: 10, background: PC[ch.phase]+"22", color: PC[ch.phase], borderRadius: 20, padding: "1px 7px", fontWeight: 700 }}>Phase {ch.phase+1}</span>
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
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
type DashSection = "today" | "calendar" | "chapters" | "progress";

export default function Dashboard({ dark }: { dark: boolean }) {
  const [data,     setData]     = useState<DashboardData>(loadData);
  const [section,  setSection]  = useState<DashSection>("today");
  const [modalDay, setModalDay] = useState<string | null>(null);

  const onChange = useCallback((next: DashboardData) => {
    setData(next); saveData(next);
  }, []);

  function toggleWeekendMode() {
    onChange({ ...data, weekendModeOn: !data.weekendModeOn });
  }

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
      <Countdown dark={dark} />

      {/* Weekend mode toggle — always visible, works anywhere */}
      <WeekendModeBanner on={data.weekendModeOn} onToggle={toggleWeekendMode} dark={dark} />

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

      {section === "today"    && <TodayPanel          data={data} onChange={onChange} onOpenDay={setModalDay} dark={dark} />}
      {section === "calendar" && <CalendarView        data={data} onOpenDay={setModalDay} dark={dark} />}
      {section === "chapters" && <ChapterTracker      data={data} onChange={onChange} dark={dark} />}
      {section === "progress" && <PerformanceEvaluator data={data} dark={dark} />}

      {modalDay && (
        <DayModal dateKey={modalDay} data={data} onChange={onChange} onClose={() => setModalDay(null)} dark={dark} />
      )}
    </div>
  );
}