import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface DayCompletion {
  date: string;           // "YYYY-MM-DD"
  tasks: Record<string, boolean>;
  reflection: string;
  focusGrammar: string;
}

interface ChapterStatus {
  [key: string]: boolean; // "s2_k1" → true/false
}

interface DashboardData {
  days: Record<string, DayCompletion>;
  chapters: ChapterStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const EXAM_DATE = new Date("2026-05-15T09:00:00");
const LS_KEY = "fi_b1_dashboard_v1";

const SUOMEN2_CHAPTERS = [
  { id: "s2_k1",  label: "Kappale 1",  topic: "Tutustutaan",           grammar: "Verbitaivutus (minä, sinä, hän)" },
  { id: "s2_k2",  label: "Kappale 2",  topic: "Arki",                  grammar: "Omistusrakenne (minulla on)" },
  { id: "s2_k3",  label: "Kappale 3",  topic: "Koti ja perhe",         grammar: "Genetiivi + Adjektiivit" },
  { id: "s2_k4",  label: "Kappale 4",  topic: "Työ ja opiskelu",       grammar: "Infinitiivi (haluan oppia)" },
  { id: "s2_k5",  label: "Kappale 5",  topic: "Liikkuminen",           grammar: "Missä / Mihin / Mistä (paikkasijat)" },
  { id: "s2_k6",  label: "Kappale 6",  topic: "Terveys",               grammar: "Partitiivi (syön leipää)" },
  { id: "s2_k7",  label: "Kappale 7",  topic: "Vapaa-aika",            grammar: "Imperfekti (menin, söin, tein)" },
  { id: "s2_k8",  label: "Kappale 8",  topic: "Yhteiskunta ja työ",    grammar: "Konditionaali (haluaisin)" },
];

const DAILY_TASKS = [
  { id: "read",    emoji: "🟢", label: "Book Study",   desc: "Read chapter text + study grammar + do exercises" },
  { id: "vocab",   emoji: "🔵", label: "Vocabulary",   desc: "Learn 10–15 new words · write 1 sentence per word" },
  { id: "write",   emoji: "🔴", label: "Writing",      desc: "Write 80–120 words using today's grammar" },
  { id: "speak",   emoji: "🟣", label: "Speaking",     desc: "Read your text aloud · record yourself" },
  { id: "review",  emoji: "🟡", label: "Review",       desc: "Repeat difficult grammar · fix mistakes from yesterday" },
];

// Phase plan
const PHASES = [
  { label: "Phase 1", weeks: "Week 1–2", chapters: "Kappale 1–3", focus: "Basics: verbs, ownership, adjectives" },
  { label: "Phase 2", weeks: "Week 3",   chapters: "Kappale 4–5", focus: "Infinitive + Location cases" },
  { label: "Phase 3", weeks: "Week 4",   chapters: "Kappale 6–7", focus: "Partitive + Imperfect tense" },
  { label: "Phase 4", weeks: "Week 5",   chapters: "Kappale 8 + Review", focus: "Conditional + Full mock exam" },
];

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────────────────
function load(): DashboardData {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null") ?? { days: {}, chapters: {} }; }
  catch { return { days: {}, chapters: {} }; }
}
function save(d: DashboardData) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {}
}

function todayKey(): string { return new Date().toISOString().slice(0, 10); }
function fmtDateLabel(k: string): string {
  return new Date(k + "T12:00:00").toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "short" });
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTDOWN DISPLAY
// ─────────────────────────────────────────────────────────────────────────────
function Countdown({ dark }: { dark: boolean }) {
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    function tick() {
      const now  = Date.now();
      const diff = EXAM_DATE.getTime() - now;
      if (diff <= 0) { setDays(0); setHours(0); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      setDays(d);
      setHours(h);
      setUrgent(d <= 14);
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  const gone = EXAM_DATE.getTime() <= Date.now();
  const color = gone ? "#22c55e" : urgent ? "#ef4444" : "#7c5cfc";

  return (
    <div style={{
      textAlign: "center",
      background: gone ? "#dcfce7" : urgent
        ? (dark ? "#2d0a0a" : "#fff1f1")
        : (dark ? "#1a0f3a" : "#f0eeff"),
      border: `2px solid ${color}44`,
      borderRadius: 20,
      padding: "28px 20px 22px",
      marginBottom: 20,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
        {gone ? "🎓 Exam day!" : "B1 Exam Countdown"}
      </div>
      {!gone && (
        <div style={{
          fontSize: 80, fontWeight: 900, lineHeight: 1,
          color,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -4,
          animation: urgent ? "pulse 1.2s infinite" : "none",
        }}>
          {days}
        </div>
      )}
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 6 }}>
        {gone ? "You made it! 🏆" : `day${days !== 1 ? "s" : ""} left`}
      </div>
      {!gone && (
        <div style={{ fontSize: 13, color: dark ? "#9898b8" : "#888", marginTop: 6 }}>
          {hours}h until next full day · exam: 15 May 2026
        </div>
      )}
      {!gone && (
        <div style={{
          marginTop: 14, fontSize: 15, fontWeight: 700,
          color: urgent ? "#ef4444" : (dark ? "#c4b8ff" : "#7c5cfc"),
        }}>
          {days > 30 ? "Build the habit now. Every day counts." :
           days > 14 ? "Focus up. The exam is close." :
           days > 7  ? "⚡ Final push — no days off." :
                       "🔥 Last days. Give everything."}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TODAY'S TASKS
// ─────────────────────────────────────────────────────────────────────────────
function TodayTasks({ data, onChange, dark }: {
  data: DashboardData;
  onChange: (d: DashboardData) => void;
  dark: boolean;
}) {
  const today = todayKey();
  const dayData: DayCompletion = data.days[today] ?? { date: today, tasks: {}, reflection: "", focusGrammar: "" };
  const done = DAILY_TASKS.filter(t => dayData.tasks[t.id]).length;
  const pct  = Math.round((done / DAILY_TASKS.length) * 100);

  function toggleTask(id: string) {
    const updated: DayCompletion = {
      ...dayData,
      tasks: { ...dayData.tasks, [id]: !dayData.tasks[id] },
    };
    const next = { ...data, days: { ...data.days, [today]: updated } };
    onChange(next);
  }

  function setGrammar(val: string) {
    const updated: DayCompletion = { ...dayData, focusGrammar: val };
    const next = { ...data, days: { ...data.days, [today]: updated } };
    onChange(next);
  }

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header + progress */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: text }}>📅 Today's Tasks</div>
          <div style={{ fontSize: 13, color: sub }}>{fmtDateLabel(today)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: pct === 100 ? "#22c55e" : accent }}>{pct}%</div>
          <div style={{ fontSize: 12, color: sub }}>{done}/{DAILY_TASKS.length} done</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: dark ? "#383858" : "#e4e0f8", borderRadius: 99, height: 7, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: 7, borderRadius: 99, background: pct === 100 ? "#22c55e" : accent, transition: "width 0.4s" }} />
      </div>

      {/* Today's focus grammar */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
          🎯 Today's focus grammar
        </div>
        <input
          value={dayData.focusGrammar}
          onChange={e => setGrammar(e.target.value)}
          placeholder="e.g. Imperfekti · Partitiivi · Konditionaali..."
          style={{
            width: "100%", background: "transparent", border: "none",
            color: text, fontSize: 16, fontWeight: 700, outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Task checkboxes */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {DAILY_TASKS.map(t => {
          const checked = !!dayData.tasks[t.id];
          return (
            <button key={t.id} onClick={() => toggleTask(t.id)}
              style={{
                background: checked ? (dark ? "#1a2e1a" : "#f0fdf4") : bg,
                border: `2px solid ${checked ? "#22c55e" : border}`,
                borderRadius: 14, padding: "13px 16px",
                display: "flex", alignItems: "center", gap: 14,
                cursor: "pointer", textAlign: "left",
                transition: "all 0.2s", WebkitTapHighlightColor: "transparent",
              }}>
              {/* Checkbox */}
              <div style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                background: checked ? "#22c55e" : "transparent",
                border: `2px solid ${checked ? "#22c55e" : (dark ? "#555" : "#ccc")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {checked && <span style={{ color: "#fff", fontSize: 15, fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </div>
              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 14 }}>{t.emoji}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: checked ? "#22c55e" : text, textDecoration: checked ? "line-through" : "none", opacity: checked ? 0.7 : 1 }}>
                    {t.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: sub, lineHeight: 1.4 }}>{t.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {pct === 100 && (
        <div style={{ textAlign: "center", marginTop: 14, padding: "12px", background: "#dcfce7", borderRadius: 14 }}>
          <span style={{ fontSize: 20 }}>🎉</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#15803d", marginLeft: 8 }}>All done today! Excellent work.</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY REFLECTION DIARY
// ─────────────────────────────────────────────────────────────────────────────
function DailyDiary({ data, onChange, dark }: {
  data: DashboardData;
  onChange: (d: DashboardData) => void;
  dark: boolean;
}) {
  const today    = todayKey();
  const dayData  = data.days[today] ?? { date: today, tasks: {}, reflection: "", focusGrammar: "" };
  const [saved,  setSaved]  = useState(false);
  const [showOld, setShowOld] = useState(false);

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  function setReflection(val: string) {
    setSaved(false);
    const updated = { ...dayData, reflection: val };
    onChange({ ...data, days: { ...data.days, [today]: updated } });
  }

  function saveReflection() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  // Previous diary entries (most recent first, excluding today)
  const prevEntries = Object.entries(data.days)
    .filter(([k, v]) => k !== today && v.reflection?.trim())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 5);

  const PROMPTS = [
    "Today I learned…",
    "I made mistakes in…",
    "Tomorrow I will improve…",
    "A new sentence I wrote…",
    "What was difficult…",
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: text, marginBottom: 12 }}>📝 Daily Reflection</div>

      {/* Prompt chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {PROMPTS.map(p => (
          <button key={p} onClick={() => setReflection(dayData.reflection + (dayData.reflection ? "\n" : "") + p + " ")}
            style={{ background: dark ? "#383858" : "#f0eeff", color: accent, border: "none", borderRadius: 20, padding: "4px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {p}
          </button>
        ))}
      </div>

      <textarea
        value={dayData.reflection}
        onChange={e => setReflection(e.target.value)}
        placeholder={"Write today's reflection...\n\nToday I learned…\nI made mistakes in…\nTomorrow I will improve…"}
        style={{
          width: "100%", minHeight: 160,
          background: bg, color: text,
          border: `2px solid ${dayData.reflection ? accent : border}`,
          borderRadius: 14, padding: "14px", fontSize: 16, lineHeight: 1.8,
          outline: "none", resize: "vertical", fontFamily: "inherit",
          transition: "border-color 0.2s",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 12, color: sub }}>{dayData.reflection.trim().split(/\s+/).filter(Boolean).length} words</span>
        <button onClick={saveReflection}
          style={{ background: saved ? "#22c55e" : accent, color: "#fff", border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "background 0.2s" }}>
          {saved ? "✓ Saved!" : "Save"}
        </button>
      </div>

      {/* Previous entries */}
      {prevEntries.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setShowOld(o => !o)}
            style={{ background: "none", border: `1px dashed ${border}`, borderRadius: 10, padding: "7px 14px", fontSize: 13, color: sub, cursor: "pointer", width: "100%", textAlign: "left" }}>
            {showOld ? "▲ Hide" : "▼ Previous entries"} ({prevEntries.length})
          </button>
          {showOld && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {prevEntries.map(([k, v]) => (
                <div key={k} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 6 }}>{fmtDateLabel(k)}</div>
                  <p style={{ fontSize: 14, color: text, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{v.reflection}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAPTER TRACKER
// ─────────────────────────────────────────────────────────────────────────────
function ChapterTracker({ data, onChange, dark }: {
  data: DashboardData;
  onChange: (d: DashboardData) => void;
  dark: boolean;
}) {
  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  const done   = SUOMEN2_CHAPTERS.filter(c => data.chapters[c.id]).length;

  function toggle(id: string) {
    const next = { ...data, chapters: { ...data.chapters, [id]: !data.chapters[id] } };
    onChange(next);
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: text }}>📚 Chapter Tracker</div>
        <span style={{ fontSize: 13, color: sub }}>{done}/{SUOMEN2_CHAPTERS.length} chapters</span>
      </div>
      <div style={{ fontSize: 13, color: sub, marginBottom: 10 }}>Suomen 2 — mark chapters as you complete them</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {SUOMEN2_CHAPTERS.map((ch, i) => {
          const checked = !!data.chapters[ch.id];
          // Determine phase
          const phase = i < 3 ? 0 : i < 5 ? 1 : i < 7 ? 2 : 3;
          const phaseColors = ["#7c5cfc", "#22c55e", "#f59e0b", "#ef4444"];
          const phaseColor  = phaseColors[phase];

          return (
            <button key={ch.id} onClick={() => toggle(ch.id)}
              style={{
                background: checked ? (dark ? "#1a2e1a" : "#f0fdf4") : bg,
                border: `2px solid ${checked ? "#22c55e" : border}`,
                borderRadius: 12, padding: "11px 14px",
                display: "flex", alignItems: "flex-start", gap: 12,
                cursor: "pointer", textAlign: "left",
                transition: "all 0.15s", WebkitTapHighlightColor: "transparent",
              }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, marginTop: 1, background: checked ? "#22c55e" : "transparent", border: `2px solid ${checked ? "#22c55e" : (dark ? "#555" : "#ccc")}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                {checked && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: checked ? "#22c55e" : text, textDecoration: checked ? "line-through" : "none", opacity: checked ? 0.6 : 1 }}>
                    {ch.label}
                  </span>
                  <span style={{ fontSize: 11, background: phaseColor+"22", color: phaseColor, borderRadius: 20, padding: "1px 8px", fontWeight: 700 }}>
                    {PHASES[phase].label}
                  </span>
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
// PROGRESS OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function ProgressOverview({ data, dark }: { data: DashboardData; dark: boolean }) {
  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  const allDays    = Object.values(data.days);
  const completed  = allDays.filter(d => DAILY_TASKS.every(t => d.tasks[t.id])).length;
  const chapDone   = SUOMEN2_CHAPTERS.filter(c => data.chapters[c.id]).length;
  const withRefl   = allDays.filter(d => d.reflection?.trim()).length;

  // Streak calculation
  let streak = 0;
  const today = todayKey();
  let d = new Date(today + "T12:00:00");
  while (true) {
    const k = d.toISOString().slice(0, 10);
    const entry = data.days[k];
    if (!entry || !DAILY_TASKS.some(t => entry.tasks[t.id])) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  const stats = [
    { label: "Full days done",   val: completed,        color: "#22c55e" },
    { label: "Day streak",        val: `${streak}🔥`,   color: "#f59e0b" },
    { label: "Chapters done",    val: `${chapDone}/8`,  color: accent },
    { label: "Diary entries",    val: withRefl,         color: "#ec4899" },
  ];

  // Phase progress
  const currentPhase = (() => {
    if (chapDone >= 8) return 3;
    if (chapDone >= 6) return 2;
    if (chapDone >= 4) return 1;
    return 0;
  })();

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: text, marginBottom: 12 }}>📊 Progress Overview</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Phase roadmap */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 12 }}>Study roadmap</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PHASES.map((p, i) => {
            const isActive = i === currentPhase;
            const isDone   = i < currentPhase;
            return (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 28, height: 28, borderRadius: 99, flexShrink: 0, background: isDone ? "#22c55e" : isActive ? accent : (dark ? "#383858" : "#e4e0f8"), display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: isDone || isActive ? "#fff" : sub }}>
                    {isDone ? "✓" : i + 1}
                  </span>
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
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
type DashSection = "today" | "diary" | "chapters" | "progress";

export default function Dashboard({ dark }: { dark: boolean }) {
  const [data,    setData]    = useState<DashboardData>(load);
  const [section, setSection] = useState<DashSection>("today");

  function onChange(next: DashboardData) {
    setData(next);
    save(next);
  }

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  const sections: { id: DashSection; emoji: string; label: string }[] = [
    { id: "today",    emoji: "📅", label: "Today"    },
    { id: "diary",    emoji: "📝", label: "Diary"    },
    { id: "chapters", emoji: "📚", label: "Chapters" },
    { id: "progress", emoji: "📊", label: "Progress" },
  ];

  return (
    <div>
      {/* Big countdown — always visible */}
      <Countdown dark={dark} />

      {/* Section tabs */}
      <div style={{ display: "flex", background: dark ? "#1e1e2e" : "#f0eeff", borderRadius: 14, padding: 4, marginBottom: 20, gap: 2 }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{
              flex: 1, background: section === s.id ? accent : "transparent",
              color: section === s.id ? "#fff" : sub,
              border: "none", borderRadius: 11, padding: "9px 4px",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              transition: "all 0.15s", WebkitTapHighlightColor: "transparent",
            }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>{s.emoji}</div>
            {s.label}
          </button>
        ))}
      </div>

      {section === "today"    && <TodayTasks      data={data} onChange={onChange} dark={dark} />}
      {section === "diary"    && <DailyDiary       data={data} onChange={onChange} dark={dark} />}
      {section === "chapters" && <ChapterTracker   data={data} onChange={onChange} dark={dark} />}
      {section === "progress" && <ProgressOverview data={data} dark={dark} />}
    </div>
  );
}