import { useState, useEffect, useRef, useCallback } from "react";
import paragraphData from "./paragraphs.json";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Paragraph {
  id: string;
  topic: string;
  label: string;
  text: string;
  difficulty: "easy" | "medium" | "hard";
}

interface Attempt {
  id: string;           // prompt id
  text: string;         // user's writing
  rewrite?: string;     // second attempt
  confidence: number;   // 1–5
  connectorScore: number;
  missingConnectors: string[];
  timestamp: number;
  examMode: boolean;
}

interface WritingProgress {
  attempts: Attempt[];
  connectorWeakness: Record<string, number>; // connector → times missed
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const PARAGRAPHS: Paragraph[] = paragraphData as Paragraph[];

const ALL_CONNECTORS = [
  "koska", "mutta", "lisäksi", "kuitenkin", "joten", "siksi",
  "vaikka", "kun", "sekä", "että", "siis", "ensin", "sitten",
  "lopuksi", "myös", "eikä", "tai"
];

const PROMPTS: { id: string; prompt: string; hint: string; paraId: string }[] = [
  { id: "intro",   prompt: "Kerro itsestäsi",                         hint: "Nimi, tausta, kuinka kauan Suomessa",        paraId: "intro"   },
  { id: "omnia",   prompt: "Miksi haluat opiskella Omniassa?",         hint: "Syyt, hyödyt, tulevaisuuden tavoitteet",    paraId: "omnia"   },
  { id: "daily",   prompt: "Kuvaile arkeasi Suomessa",                 hint: "Mitä teet päivittäin, rutiinit",            paraId: "daily"   },
  { id: "work",    prompt: "Kerro työkokemuksestasi ja opinnoistasi",  hint: "Aiempi koulutus, taidot, tavoitteet",       paraId: "work"    },
  { id: "future",  prompt: "Mitkä ovat tulevaisuuden suunnitelmasi?",  hint: "Työ, opinnot, unelmat",                     paraId: "future"  },
  { id: "finnish", prompt: "Miksi suomen kieli on tärkeä sinulle?",    hint: "Arki, työ, integraatio",                    paraId: "finnish" },
];

const EXAM_TIMES = [
  { label: "10 min", seconds: 600 },
  { label: "30 min", seconds: 1800 },
  { label: "1 hr",   seconds: 3600 },
];

const LS_WRITING = "fi_writing_v1";

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function loadWritingProgress(): WritingProgress {
  try { return JSON.parse(localStorage.getItem(LS_WRITING) || "null") ?? { attempts: [], connectorWeakness: {} }; }
  catch { return { attempts: [], connectorWeakness: {} }; }
}
function saveWritingProgress(p: WritingProgress) {
  try { localStorage.setItem(LS_WRITING, JSON.stringify(p)); } catch {}
}

function analyzeConnectors(userText: string, refText: string) {
  const refConnectors = ALL_CONNECTORS.filter(c =>
    new RegExp(`\\b${c}\\b`, "i").test(refText)
  );
  const userConnectors = ALL_CONNECTORS.filter(c =>
    new RegExp(`\\b${c}\\b`, "i").test(userText)
  );
  const missing = refConnectors.filter(c => !userConnectors.includes(c));
  const used    = refConnectors.filter(c =>  userConnectors.includes(c));
  const extra   = userConnectors.filter(c => !refConnectors.includes(c));
  const score   = refConnectors.length > 0
    ? Math.round((used.length / refConnectors.length) * 100)
    : 100;
  return { refConnectors, userConnectors, missing, used, extra, score };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// Connector chip
function ConnectorChip({ word, state, dark }: { word: string; state: "used" | "missing" | "extra" | "neutral"; dark: boolean }) {
  const colors = {
    used:    { bg: "#dcfce7", text: "#15803d", border: "#22c55e" },
    missing: { bg: "#fee2e2", text: "#dc2626", border: "#ef4444" },
    extra:   { bg: "#ede9ff", text: "#7c5cfc", border: "#7c5cfc" },
    neutral: { bg: dark ? "#2a2a3e" : "#f0eeff", text: dark ? "#c4b8ff" : "#7c5cfc", border: "transparent" },
  };
  const c = colors[state];
  return (
    <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 13, fontWeight: 700 }}>
      {word}
    </span>
  );
}

// Confidence stars
function ConfidencePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => onChange(n)}
          style={{ background: "none", border: "none", fontSize: 26, cursor: "pointer", opacity: n <= value ? 1 : 0.25, transition: "opacity 0.15s", padding: "2px" }}>
          ⭐
        </button>
      ))}
    </div>
  );
}

// Reference paragraph with connectors highlighted
function RefParagraph({ text, dark }: { text: string; dark: boolean }) {
  const accent = "#7c5cfc";
  const tokens = text.split(/(\s+)/);
  return (
    <p style={{ fontSize: 16, lineHeight: 1.9, color: dark ? "#e8e8f8" : "#1a1a2e" }}>
      {tokens.map((token, i) => {
        const clean = token.replace(/[.,!?;:]/g, "").toLowerCase();
        if (ALL_CONNECTORS.includes(clean)) {
          return <mark key={i} style={{ background: accent + "28", color: accent, fontWeight: 700, borderRadius: 3, padding: "0 2px" }}>{token}</mark>;
        }
        return <span key={i}>{token}</span>;
      })}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITING EDITOR
// ─────────────────────────────────────────────────────────────────────────────
interface WritingEditorProps {
  prompt: typeof PROMPTS[0];
  examMode: boolean;
  examSeconds: number;
  dark: boolean;
  onSubmit: (text: string) => void;
}

function WritingEditor({ prompt, examMode, examSeconds, dark, onSubmit }: WritingEditorProps) {
  const [text, setText] = useState("");
  const [timeLeft, setTimeLeft] = useState(examMode ? examSeconds : 0);
  const [locked, setLocked] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accent = "#7c5cfc", danger = "#ef4444";
  const border = dark ? "#383858" : "#e4e0f8";
  const sub = dark ? "#9898b8" : "#888";

  // Focus textarea on mount
  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Exam countdown
  useEffect(() => {
    if (!examMode || locked) return;
    if (timeLeft <= 0) { setLocked(true); return; }
    const id = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [examMode, timeLeft, locked]);

  // Ctrl+Enter to submit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [text]);

  function handleSubmit() {
    if (!text.trim() || locked) return;
    setLocked(true);
    onSubmit(text);
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isUrgent = examMode && timeLeft <= 120 && timeLeft > 0;
  const wc = wordCount(text);
  const bgCard = dark ? "#2a2a3e" : "#fff";

  return (
    <div>
      {/* Exam timer bar */}
      {examMode && (
        <div style={{
          background: isUrgent ? danger + "15" : (dark ? "#1e1e2e" : "#f0eeff"),
          border: `2px solid ${isUrgent ? danger : accent}`,
          borderRadius: 14, padding: "10px 16px", marginBottom: 14,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          transition: "all 0.3s",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isUrgent ? danger : accent, textTransform: "uppercase", letterSpacing: 1 }}>
            {locked && timeLeft === 0 ? "⏰ Time's up" : "⏱ Exam mode"}
          </span>
          <span style={{
            fontSize: 28, fontWeight: 900, color: isUrgent ? danger : accent,
            fontVariantNumeric: "tabular-nums", letterSpacing: -1,
            animation: isUrgent ? "pulse 0.9s infinite" : "none",
          }}>
            {String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}
          </span>
        </div>
      )}

      {/* Prompt card */}
      <div style={{ background: bgCard, border: `1px solid ${border}`, borderRadius: 16, padding: "18px 18px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: sub, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
          {examMode ? "📝 Exam prompt — no hints" : "✍️ Writing prompt"}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: dark ? "#e8e8f8" : "#1a1a2e", marginBottom: examMode ? 0 : 10 }}>
          {prompt.prompt}
        </div>
        {!examMode && (
          <div style={{ fontSize: 14, color: sub }}>💡 {prompt.hint}</div>
        )}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => !locked && setText(e.target.value)}
        disabled={locked}
        placeholder={examMode
          ? "Kirjoita vastauksesi tähän..."
          : "Kirjoita vastauksesi tähän... (Ctrl+Enter lähettää)"
        }
        style={{
          width: "100%", minHeight: 200,
          background: dark ? "#1e1e2e" : "#fff",
          color: dark ? "#e8e8f8" : "#1a1a2e",
          border: `2px solid ${locked ? (dark ? "#383858" : "#e4e0f8") : accent}`,
          borderRadius: 16, padding: "16px", fontSize: 17, lineHeight: 1.8,
          outline: "none", resize: "vertical", fontFamily: "inherit",
          opacity: locked ? 0.75 : 1, transition: "border-color 0.2s",
        }}
      />

      {/* Word count + submit */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <span style={{ fontSize: 13, color: sub }}>
          {wc} word{wc !== 1 ? "s" : ""}
          {wc > 0 && wc < 30 && " · aim for 50+"}
          {wc >= 30 && wc < 60 && " · getting there!"}
          {wc >= 60 && " · great length ✓"}
        </span>
        {!locked && (
          <button onClick={handleSubmit} disabled={wc < 3}
            style={{
              background: wc >= 3 ? accent : (dark ? "#383858" : "#e4e0f8"),
              color: wc >= 3 ? "#fff" : sub,
              border: "none", borderRadius: 12, padding: "11px 22px",
              fontSize: 16, fontWeight: 700, cursor: wc >= 3 ? "pointer" : "default",
              transition: "all 0.2s",
            }}>
            Submit ↵
          </button>
        )}
        {locked && !examMode && (
          <span style={{ fontSize: 13, color: accent, fontWeight: 700 }}>✓ Submitted</span>
        )}
        {locked && examMode && (
          <span style={{ fontSize: 13, color: danger, fontWeight: 700 }}>{timeLeft === 0 ? "⏰ Time's up" : "✓ Submitted"}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITING FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────
interface WritingFeedbackProps {
  userText: string;
  prompt: typeof PROMPTS[0];
  dark: boolean;
  onSave: (confidence: number, rewrite?: string) => void;
}

function WritingFeedback({ userText, prompt, dark, onSave }: WritingFeedbackProps) {
  const para = PARAGRAPHS.find(p => p.id === prompt.paraId)!;
  const analysis = analyzeConnectors(userText, para.text);
  const [showRef, setShowRef] = useState(false);
  const [confidence, setConfidence] = useState(3);
  const [rewriteMode, setRewriteMode] = useState(false);
  const [rewriteText, setRewriteText] = useState("");
  const [saved, setSaved] = useState(false);

  const accent = "#7c5cfc";
  const border = dark ? "#383858" : "#e4e0f8";
  const sub = dark ? "#9898b8" : "#777";
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const bg = dark ? "#2a2a3e" : "#fff";

  function handleSave() {
    onSave(confidence, rewriteText || undefined);
    setSaved(true);
  }

  return (
    <div>
      {/* Your answer */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: sub, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Your answer</div>
        <p style={{ fontSize: 16, lineHeight: 1.8, color: text, whiteSpace: "pre-wrap" }}>{userText}</p>
        <div style={{ marginTop: 8, fontSize: 13, color: sub }}>{wordCount(userText)} words</div>
      </div>

      {/* Connector analysis */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: text }}>🔗 Connector analysis</div>
          <div style={{
            fontSize: 22, fontWeight: 900,
            color: analysis.score >= 75 ? "#22c55e" : analysis.score >= 40 ? "#f59e0b" : "#ef4444"
          }}>
            {analysis.score}%
          </div>
        </div>

        {/* Used */}
        {analysis.used.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 700, marginBottom: 6 }}>✓ Used correctly</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {analysis.used.map(c => <ConnectorChip key={c} word={c} state="used" dark={dark} />)}
            </div>
          </div>
        )}

        {/* Missing */}
        {analysis.missing.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginBottom: 6 }}>✗ Missing from reference</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {analysis.missing.map(c => <ConnectorChip key={c} word={c} state="missing" dark={dark} />)}
            </div>
          </div>
        )}

        {/* Extra (bonus) */}
        {analysis.extra.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: accent, fontWeight: 700, marginBottom: 6 }}>+ Bonus connectors you used</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {analysis.extra.map(c => <ConnectorChip key={c} word={c} state="extra" dark={dark} />)}
            </div>
          </div>
        )}

        {analysis.refConnectors.length === 0 && (
          <div style={{ fontSize: 14, color: sub }}>No connectors expected for this prompt.</div>
        )}
      </div>

      {/* Reference paragraph (hidden by default) */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
        <button onClick={() => setShowRef(r => !r)}
          style={{ background: "none", border: "none", cursor: "pointer", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>📖 Reference paragraph</span>
          <span style={{ fontSize: 20, color: accent }}>{showRef ? "▲" : "▼"}</span>
        </button>
        {showRef && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${border}` }}>
            <div style={{ fontSize: 12, color: sub, marginBottom: 8 }}>Connectors highlighted in purple</div>
            <RefParagraph text={para.text} dark={dark} />
          </div>
        )}
      </div>

      {/* Self evaluation */}
      {!saved && (
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 10 }}>How confident did you feel?</div>
          <ConfidencePicker value={confidence} onChange={setConfidence} />
          <div style={{ fontSize: 13, color: sub, marginTop: 6 }}>
            {confidence <= 2 ? "Keep going — it takes time! 💪" : confidence === 3 ? "Good — you're making progress 👍" : "Great confidence! 🔥"}
          </div>
        </div>
      )}

      {/* Rewrite mode */}
      {showRef && !saved && (
        <div style={{ background: dark ? "#1e1e2e" : "#f0eeff", border: `1px solid ${accent}33`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 4 }}>✍️ Rewrite in your own words</div>
          <div style={{ fontSize: 13, color: sub, marginBottom: 10 }}>Now that you've seen the reference, try again from memory.</div>
          {!rewriteMode ? (
            <button onClick={() => setRewriteMode(true)}
              style={{ background: accent, color: "#fff", border: "none", borderRadius: 12, padding: "10px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              Start rewrite →
            </button>
          ) : (
            <>
              <textarea
                value={rewriteText}
                onChange={e => setRewriteText(e.target.value)}
                autoFocus
                placeholder="Rewrite from memory..."
                style={{
                  width: "100%", minHeight: 140,
                  background: dark ? "#2a2a3e" : "#fff",
                  color: text, border: `2px solid ${accent}`,
                  borderRadius: 12, padding: "12px", fontSize: 16, lineHeight: 1.8,
                  outline: "none", resize: "vertical", fontFamily: "inherit",
                }}
              />
              <div style={{ fontSize: 13, color: sub, marginTop: 4 }}>{wordCount(rewriteText)} words</div>
            </>
          )}
        </div>
      )}

      {/* Save */}
      {!saved ? (
        <button onClick={handleSave}
          style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
          Save & finish
        </button>
      ) : (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: text }}>Session saved!</div>
          <div style={{ fontSize: 14, color: sub, marginTop: 4 }}>Great work. Consistency builds fluency.</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MISTAKE LOG VIEW
// ─────────────────────────────────────────────────────────────────────────────
function MistakeLog({ progress, dark }: { progress: WritingProgress; dark: boolean }) {
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  const danger = "#ef4444";

  const weakness = progress.connectorWeakness;
  const sorted = Object.entries(weakness).sort((a, b) => b[1] - a[1]);
  const todayCount = progress.attempts.filter(a => new Date(a.timestamp).toISOString().slice(0,10) === todayKey()).length;
  const avgConfidence = progress.attempts.length
    ? (progress.attempts.reduce((s, a) => s + a.confidence, 0) / progress.attempts.length).toFixed(1)
    : "—";
  const avgConnector = progress.attempts.length
    ? Math.round(progress.attempts.reduce((s, a) => s + a.connectorScore, 0) / progress.attempts.length)
    : 0;

  if (progress.attempts.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 17, color: sub }}>No attempts yet. Start writing to track your progress!</div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
        {[
          { label: "Today", val: todayCount, color: accent },
          { label: "Confidence", val: `${avgConfidence}⭐`, color: "#f59e0b" },
          { label: "Connector avg", val: `${avgConnector}%`, color: avgConnector >= 70 ? "#22c55e" : danger },
        ].map(s => (
          <div key={s.label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Connector weak spots */}
      {sorted.length > 0 && (
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 10 }}>⚠️ Connector weak spots</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.slice(0, 8).map(([connector, count]) => (
              <div key={connector} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: text, fontSize: 16 }}>{connector}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 80, height: 6, background: dark ? "#383858" : "#e4e0f8", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, count * 20)}%`, height: 6, background: danger, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 13, color: danger, fontWeight: 700, minWidth: 30, textAlign: "right" }}>✗{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent attempts */}
      <div style={{ fontSize: 13, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Recent sessions</div>
      {[...progress.attempts].reverse().slice(0, 5).map((a, i) => {
        const p = PROMPTS.find(pr => pr.id === a.id);
        const d = new Date(a.timestamp);
        return (
          <div key={i} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{p?.prompt ?? a.id}</div>
              {a.examMode && <span style={{ fontSize: 11, background: danger + "22", color: danger, borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>EXAM</span>}
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 13, color: sub }}>
              <span>{wordCount(a.text)} words</span>
              <span>🔗 {a.connectorScore}%</span>
              <span>{"⭐".repeat(a.confidence)}</span>
              {a.rewrite && <span style={{ color: accent }}>✍️ Rewritten</span>}
              <span style={{ marginLeft: "auto" }}>{d.toLocaleDateString("fi-FI")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
interface HomeProps {
  dark: boolean;
  progress: WritingProgress;
  onStart: (prompt: typeof PROMPTS[0], examMode: boolean, examSeconds: number) => void;
  onViewLog: () => void;
}

function HomeScreen({ dark, progress, onStart, onViewLog }: HomeProps) {
  const [examSecs, setExamSecs] = useState(1800);
  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  const todayCount = progress.attempts.filter(a => new Date(a.timestamp).toISOString().slice(0,10) === todayKey()).length;

  return (
    <div>
      {/* Today banner */}
      <div style={{ background: todayCount > 0 ? accent + "18" : (dark ? "#1e1e2e" : "#f4f2ff"), border: `2px solid ${todayCount > 0 ? accent : border}`, borderRadius: 16, padding: "14px 18px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: todayCount > 0 ? accent : text }}>
            {todayCount === 0 ? "Start writing today" : `${todayCount} session${todayCount > 1 ? "s" : ""} today ✓`}
          </div>
          <div style={{ fontSize: 13, color: sub }}>
            {progress.attempts.length} total · aim for 1 per day
          </div>
        </div>
        <button onClick={onViewLog}
          style={{ background: dark ? "#383858" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          📊 Log
        </button>
      </div>

      {/* Practice mode */}
      <div style={{ fontSize: 13, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>✍️ Practice mode — hints on</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
        {PROMPTS.map(p => {
          const attempts = progress.attempts.filter(a => a.id === p.id && !a.examMode);
          const last = attempts[attempts.length - 1];
          return (
            <div key={p.id} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 3 }}>{p.prompt}</div>
                <div style={{ fontSize: 13, color: sub }}>
                  {last ? `Last: 🔗 ${last.connectorScore}% · ${"⭐".repeat(last.confidence)} · ${wordCount(last.text)}w` : "Not attempted"}
                </div>
              </div>
              <button onClick={() => onStart(p, false, 0)}
                style={{ background: accent, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                Write →
              </button>
            </div>
          );
        })}
      </div>

      {/* Exam mode */}
      <div style={{ fontSize: 13, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🎯 Exam simulation — no hints</div>
      <div style={{ background: bg, border: `2px solid ${accent}44`, borderRadius: 16, padding: "16px", marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: sub, marginBottom: 12 }}>Timed · no reference · real exam pressure</div>
        {/* Time picker */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {EXAM_TIMES.map(t => (
            <button key={t.label} onClick={() => setExamSecs(t.seconds)}
              style={{ flex: 1, background: examSecs === t.seconds ? accent : (dark ? "#383858" : "#f0eeff"), color: examSecs === t.seconds ? "#fff" : accent, border: `2px solid ${examSecs === t.seconds ? accent : "transparent"}`, borderRadius: 10, padding: "9px 4px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
        {/* Random prompt exam */}
        <button onClick={() => {
          const p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
          onStart(p, true, examSecs);
        }}
          style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
          Start exam →
        </button>
      </div>
      <div style={{ fontSize: 13, color: sub, textAlign: "center" }}>Random prompt will be selected</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WRITING COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
type Screen = "home" | "write" | "feedback" | "log";

export default function Writing({ dark }: { dark: boolean }) {
  const [progress, setProgress] = useState<WritingProgress>(loadWritingProgress);
  const [screen, setScreen] = useState<Screen>("home");
  const [activePrompt, setActivePrompt] = useState<typeof PROMPTS[0] | null>(null);
  const [examMode, setExamMode] = useState(false);
  const [examSeconds, setExamSeconds] = useState(1800);
  const [submittedText, setSubmittedText] = useState("");

  function startSession(prompt: typeof PROMPTS[0], isExam: boolean, secs: number) {
    setActivePrompt(prompt);
    setExamMode(isExam);
    setExamSeconds(secs);
    setSubmittedText("");
    setScreen("write");
    window.scrollTo({ top: 0 });
  }

  function handleSubmit(text: string) {
    setSubmittedText(text);
    setScreen("feedback");
    window.scrollTo({ top: 0 });
  }

  function handleSave(confidence: number, rewrite?: string) {
    if (!activePrompt) return;
    const para = PARAGRAPHS.find(p => p.id === activePrompt.paraId)!;
    const { score, missing } = analyzeConnectors(submittedText, para.text);

    // Update connector weakness map
    const weakness = { ...progress.connectorWeakness };
    missing.forEach(c => { weakness[c] = (weakness[c] || 0) + 1; });

    const attempt: Attempt = {
      id: activePrompt.id,
      text: submittedText,
      rewrite,
      confidence,
      connectorScore: score,
      missingConnectors: missing,
      timestamp: Date.now(),
      examMode,
    };

    const next: WritingProgress = {
      attempts: [...progress.attempts, attempt],
      connectorWeakness: weakness,
    };
    setProgress(next);
    saveWritingProgress(next);
  }

  function goHome() { setScreen("home"); window.scrollTo({ top: 0 }); }

  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const accent = "#7c5cfc";

  // Back button for sub-screens
  const showBack = screen !== "home";

  return (
    <div>
      {/* Sub-screen header */}
      {showBack && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={goHome}
            style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            ← Back
          </button>
          <div style={{ lineHeight: 1.2 }}>
            {screen === "write" && (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{activePrompt?.prompt}</div>
                <div style={{ fontSize: 12, color: sub }}>{examMode ? "🎯 Exam simulation" : "✍️ Practice"}</div>
              </>
            )}
            {screen === "feedback" && <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Feedback & analysis</div>}
            {screen === "log"      && <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Progress log</div>}
          </div>
        </div>
      )}

      {screen === "home"     && <HomeScreen    dark={dark} progress={progress} onStart={startSession} onViewLog={() => setScreen("log")} />}
      {screen === "write"    && activePrompt && <WritingEditor prompt={activePrompt} examMode={examMode} examSeconds={examSeconds} dark={dark} onSubmit={handleSubmit} />}
      {screen === "feedback" && activePrompt && <WritingFeedback userText={submittedText} prompt={activePrompt} dark={dark} onSave={handleSave} />}
      {screen === "log"      && <MistakeLog   progress={progress} dark={dark} />}
    </div>
  );
}