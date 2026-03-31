import { useState, useEffect, useRef, useCallback } from "react";
import paragraphData from "./paragraphs.json";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Paragraph {
  id: string; topic: string; label: string; text: string;
  difficulty: "easy" | "medium" | "hard";
}

// A single version of a text (original submission or any later edit/addition)
interface Version {
  text: string;
  timestamp: number;
  connectorScore: number;
  missingConnectors: string[];
  label?: string; // optional user label like "Edit 1", "Clean copy"
}

interface Attempt {
  id: string;           // prompt id
  versions: Version[];  // versions[0] = original, latest = last
  confidence: number;
  examMode: boolean;
  timestamp: number;    // creation timestamp (= versions[0].timestamp)
}

interface WritingProgress {
  attempts: Attempt[];
  connectorWeakness: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const PARAGRAPHS: Paragraph[] = paragraphData as Paragraph[];

const ALL_CONNECTORS = [
  "koska","mutta","lisäksi","kuitenkin","joten","siksi",
  "vaikka","kun","sekä","että","siis","ensin","sitten",
  "lopuksi","myös","eikä","tai",
];

const PROMPTS: { id: string; prompt: string; hint: string; paraId: string }[] = [
  { id: "intro",   prompt: "Kerro itsestäsi",                        hint: "Nimi, tausta, kuinka kauan Suomessa",       paraId: "intro"   },
  { id: "omnia",   prompt: "Miksi haluat opiskella Omniassa?",        hint: "Syyt, hyödyt, tulevaisuuden tavoitteet",   paraId: "omnia"   },
  { id: "daily",   prompt: "Kuvaile arkeasi Suomessa",                hint: "Mitä teet päivittäin, rutiinit",           paraId: "daily"   },
  { id: "work",    prompt: "Kerro työkokemuksestasi ja opinnoistasi", hint: "Aiempi koulutus, taidot, tavoitteet",      paraId: "work"    },
  { id: "future",  prompt: "Mitkä ovat tulevaisuuden suunnitelmasi?", hint: "Työ, opinnot, unelmat",                    paraId: "future"  },
  { id: "finnish", prompt: "Miksi suomen kieli on tärkeä sinulle?",   hint: "Arki, työ, integraatio",                   paraId: "finnish" },
];

const EXAM_TIMES = [
  { label: "10 min", seconds: 600 },
  { label: "30 min", seconds: 1800 },
  { label: "1 hr",   seconds: 3600 },
];

const LS_WRITING = "fi_writing_v2"; // bumped key so old data doesn't conflict

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function loadWritingProgress(): WritingProgress {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_WRITING) || "null");
    if (raw) return raw;
    // Migrate v1 data if present
    const v1 = JSON.parse(localStorage.getItem("fi_writing_v1") || "null");
    if (v1?.attempts) {
      const migrated: WritingProgress = {
        connectorWeakness: v1.connectorWeakness || {},
        attempts: (v1.attempts as any[]).map((a: any) => ({
          id: a.id,
          confidence: a.confidence ?? 3,
          examMode: a.examMode ?? false,
          timestamp: a.timestamp ?? Date.now(),
          versions: [
            { text: a.text, timestamp: a.timestamp ?? Date.now(), connectorScore: a.connectorScore ?? 0, missingConnectors: a.missingConnectors ?? [] },
            ...(a.rewrite ? [{ text: a.rewrite, timestamp: (a.timestamp ?? Date.now()) + 60000, connectorScore: 0, missingConnectors: [], label: "Rewrite" }] : []),
          ],
        })),
      };
      saveWritingProgress(migrated);
      return migrated;
    }
    return { attempts: [], connectorWeakness: {} };
  } catch { return { attempts: [], connectorWeakness: {} }; }
}
function saveWritingProgress(p: WritingProgress) {
  try { localStorage.setItem(LS_WRITING, JSON.stringify(p)); } catch {}
}

function analyzeConnectors(userText: string, refText: string) {
  const ref  = ALL_CONNECTORS.filter(c => new RegExp(`\\b${c}\\b`, "i").test(refText));
  const used = ref.filter(c => new RegExp(`\\b${c}\\b`, "i").test(userText));
  const missing = ref.filter(c => !new RegExp(`\\b${c}\\b`, "i").test(userText));
  const extra   = ALL_CONNECTORS.filter(c => !ref.includes(c) && new RegExp(`\\b${c}\\b`, "i").test(userText));
  const score   = ref.length > 0 ? Math.round((used.length / ref.length) * 100) : 100;
  return { ref, used, missing, extra, score };
}

function wordCount(t: string) { return t.trim().split(/\s+/).filter(Boolean).length; }
function todayKey() { return new Date().toISOString().slice(0, 10); }
function fmtDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("fi-FI", { day: "numeric", month: "short" }) + " " +
         d.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI BITS
// ─────────────────────────────────────────────────────────────────────────────
function ConnectorChip({ word, state, dark }: { word: string; state: "used"|"missing"|"extra"; dark: boolean }) {
  const colors = {
    used:    { bg: "#dcfce7", text: "#15803d", border: "#22c55e" },
    missing: { bg: "#fee2e2", text: "#dc2626", border: "#ef4444" },
    extra:   { bg: "#ede9ff", text: "#7c5cfc", border: "#7c5cfc" },
  };
  const c = colors[state];
  return <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 13, fontWeight: 700 }}>{word}</span>;
}

function ConfidencePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => onChange(n)}
          style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", opacity: n <= value ? 1 : 0.22, padding: "2px" }}>⭐</button>
      ))}
    </div>
  );
}

function RefParagraph({ text, dark }: { text: string; dark: boolean }) {
  const accent = "#7c5cfc";
  return (
    <p style={{ fontSize: 16, lineHeight: 1.9, color: dark ? "#e8e8f8" : "#1a1a2e" }}>
      {text.split(/(\s+)/).map((w, i) => {
        const clean = w.replace(/[.,!?;:]/g, "").toLowerCase();
        return ALL_CONNECTORS.includes(clean)
          ? <mark key={i} style={{ background: accent+"28", color: accent, fontWeight: 700, borderRadius: 3, padding: "0 2px" }}>{w}</mark>
          : <span key={i}>{w}</span>;
      })}
    </p>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "#e4e0f8", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: 5, background: color, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color, minWidth: 36, textAlign: "right" }}>{score}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VERSION EDITOR — inline editor for adding/editing a version
// ─────────────────────────────────────────────────────────────────────────────
interface VersionEditorProps {
  dark: boolean;
  refText: string;
  initialText?: string;
  label: string;
  placeholder: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

function VersionEditor({ dark, refText, initialText = "", label, placeholder, onSave, onCancel }: VersionEditorProps) {
  const [text, setText] = useState(initialText);
  const [showRef, setShowRef] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const accent = "#7c5cfc";
  const border = dark ? "#383858" : "#e4e0f8";
  const sub = dark ? "#9898b8" : "#777";
  const analysis = analyzeConnectors(text, refText);
  const wc = wordCount(text);

  useEffect(() => { ref.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && wc >= 3) onSave(text);
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [text, wc]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>

      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", minHeight: 160,
          background: dark ? "#1e1e2e" : "#fff",
          color: dark ? "#e8e8f8" : "#1a1a2e",
          border: `2px solid ${accent}`,
          borderRadius: 14, padding: "14px", fontSize: 17, lineHeight: 1.8,
          outline: "none", resize: "vertical", fontFamily: "inherit",
        }}
      />

      {/* Live connector feedback while typing */}
      {wc > 5 && (
        <div style={{ background: dark ? "#1a1a30" : "#f4f2ff", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: sub, fontWeight: 700 }}>🔗 Connectors</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: analysis.score >= 70 ? "#22c55e" : "#f59e0b" }}>{analysis.score}%</span>
          </div>
          {analysis.missing.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {analysis.missing.map(c => <ConnectorChip key={c} word={c} state="missing" dark={dark} />)}
            </div>
          )}
          {analysis.missing.length === 0 && <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>All expected connectors used ✓</span>}
        </div>
      )}

      {/* Reference toggle */}
      <button onClick={() => setShowRef(r => !r)}
        style={{ background: "none", border: `1px dashed ${border}`, borderRadius: 10, padding: "8px 14px", fontSize: 14, color: accent, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
        {showRef ? "▲ Hide reference" : "▼ Peek at reference"}
      </button>
      {showRef && (
        <div style={{ background: dark ? "#1e1e2e" : "#f8f8fc", borderRadius: 12, padding: "14px" }}>
          <RefParagraph text={refText} dark={dark} />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => wc >= 3 && onSave(text)} disabled={wc < 3}
          style={{ flex: 2, background: wc >= 3 ? accent : (dark ? "#383858" : "#e4e0f8"), color: wc >= 3 ? "#fff" : sub, border: "none", borderRadius: 12, padding: "12px", fontSize: 16, fontWeight: 700, cursor: wc >= 3 ? "pointer" : "default", transition: "all 0.2s" }}>
          Save · Ctrl+↵
        </button>
        <button onClick={onCancel}
          style={{ flex: 1, background: dark ? "#2a2a3e" : "#f0eeff", color: sub, border: "none", borderRadius: 12, padding: "12px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
      <div style={{ fontSize: 12, color: sub }}>{wc} words{wc > 0 && wc < 30 ? " · aim for 50+" : wc >= 60 ? " · great length ✓" : ""}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTEMPT DETAIL — expandable card in journal with version history + editing
// ─────────────────────────────────────────────────────────────────────────────
interface AttemptCardProps {
  attempt: Attempt;
  dark: boolean;
  onUpdate: (updated: Attempt) => void;
  onDelete: () => void;
}

function AttemptCard({ attempt, dark, onUpdate, onDelete }: AttemptCardProps) {
  const [open, setOpen] = useState(false);
  const [activeVersion, setActiveVersion] = useState(attempt.versions.length - 1);
  const [editingIdx, setEditingIdx] = useState<number | null>(null); // index of version being edited
  const [addingNew, setAddingNew] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [editingConfidence, setEditingConfidence] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const prompt = PROMPTS.find(p => p.id === attempt.id);
  const para   = PARAGRAPHS.find(p => p.id === prompt?.paraId);
  const latest = attempt.versions[attempt.versions.length - 1];
  const shownVer = attempt.versions[activeVersion];

  const accent = "#7c5cfc", danger = "#ef4444";
  const text  = dark ? "#e8e8f8" : "#1a1a2e";
  const sub   = dark ? "#9898b8" : "#777";
  const bg    = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";

  function saveVersionEdit(idx: number, newText: string) {
    if (!para) return;
    const { score, missing } = analyzeConnectors(newText, para.text);
    const updated = attempt.versions.map((v, i) =>
      i === idx ? { ...v, text: newText, connectorScore: score, missingConnectors: missing, timestamp: Date.now() } : v
    );
    onUpdate({ ...attempt, versions: updated });
    setEditingIdx(null);
    setActiveVersion(idx);
  }

  function addVersion(newText: string) {
    if (!para) return;
    const { score, missing } = analyzeConnectors(newText, para.text);
    const newVer: Version = {
      text: newText, timestamp: Date.now(),
      connectorScore: score, missingConnectors: missing,
      label: `Version ${attempt.versions.length + 1}`,
    };
    const updated = [...attempt.versions, newVer];
    onUpdate({ ...attempt, versions: updated });
    setAddingNew(false);
    setActiveVersion(updated.length - 1);
  }

  function deleteVersion(idx: number) {
    if (attempt.versions.length <= 1) return; // can't delete last version
    const updated = attempt.versions.filter((_, i) => i !== idx);
    onUpdate({ ...attempt, versions: updated });
    setActiveVersion(Math.min(activeVersion, updated.length - 1));
  }

  const scoreColor = (s: number) => s >= 75 ? "#22c55e" : s >= 40 ? "#f59e0b" : danger;

  return (
    <div style={{ background: bg, border: `1px solid ${open ? accent+"66" : border}`, borderRadius: 16, marginBottom: 10, overflow: "hidden", transition: "border-color 0.2s" }}>

      {/* ── Collapsed header ── */}
      <div onClick={() => setOpen(o => !o)}
        style={{ padding: "14px 16px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: text }}>{prompt?.prompt ?? attempt.id}</span>
              {attempt.examMode && <span style={{ fontSize: 11, background: danger+"22", color: danger, borderRadius: 20, padding: "2px 8px", fontWeight: 700, flexShrink: 0 }}>EXAM</span>}
              {attempt.versions.length > 1 && <span style={{ fontSize: 11, background: accent+"22", color: accent, borderRadius: 20, padding: "2px 8px", fontWeight: 700, flexShrink: 0 }}>{attempt.versions.length}v</span>}
            </div>
            <div style={{ fontSize: 13, color: sub, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>{wordCount(latest.text)}w</span>
              <span style={{ color: scoreColor(latest.connectorScore) }}>🔗 {latest.connectorScore}%</span>
              <span>{"⭐".repeat(attempt.confidence)}</span>
              <span>{fmtDate(attempt.timestamp)}</span>
            </div>
          </div>
          <span style={{ fontSize: 18, color: sub, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
        </div>

        {/* Latest text preview (collapsed) */}
        {!open && (
          <p style={{ fontSize: 14, color: sub, lineHeight: 1.5, marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {latest.text}
          </p>
        )}
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${border}` }}>

          {/* Version tabs */}
          {attempt.versions.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 14, flexWrap: "wrap" }}>
              {attempt.versions.map((v, i) => (
                <button key={i} onClick={() => { setActiveVersion(i); setEditingIdx(null); setAddingNew(false); }}
                  style={{
                    background: activeVersion === i ? accent : (dark ? "#383858" : "#f0eeff"),
                    color: activeVersion === i ? "#fff" : accent,
                    border: "none", borderRadius: 20, padding: "5px 12px", fontSize: 13, fontWeight: 700,
                    cursor: "pointer",
                  }}>
                  {v.label || (i === 0 ? "Original" : `Edit ${i}`)}
                  {i > 0 && attempt.versions.length > 2 && activeVersion === i && (
                    <span onClick={e => { e.stopPropagation(); deleteVersion(i); }}
                      style={{ marginLeft: 6, opacity: 0.6, fontWeight: 900, fontSize: 14 }}>×</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Active version — view or edit */}
          {editingIdx === activeVersion ? (
            <div style={{ marginTop: 14 }}>
              <VersionEditor
                dark={dark}
                refText={para?.text ?? ""}
                initialText={shownVer.text}
                label={`Editing: ${shownVer.label || (activeVersion === 0 ? "Original" : `Edit ${activeVersion}`)}`}
                placeholder="Edit your text..."
                onSave={t => saveVersionEdit(activeVersion, t)}
                onCancel={() => setEditingIdx(null)}
              />
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              {/* Text display */}
              <div style={{ background: dark ? "#1e1e2e" : "#f8f8fc", borderRadius: 12, padding: "14px", marginBottom: 12, position: "relative" }}>
                <p style={{ fontSize: 16, lineHeight: 1.85, color: text, whiteSpace: "pre-wrap", margin: 0 }}>{shownVer.text}</p>
                <div style={{ fontSize: 12, color: sub, marginTop: 8 }}>{wordCount(shownVer.text)} words · {fmtDate(shownVer.timestamp)}</div>
              </div>

              {/* Connector analysis for this version */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: sub, fontWeight: 700 }}>🔗 Connectors</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor(shownVer.connectorScore) }}>{shownVer.connectorScore}%</span>
                </div>
                {para && (() => {
                  const a = analyzeConnectors(shownVer.text, para.text);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {a.used.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{a.used.map(c => <ConnectorChip key={c} word={c} state="used" dark={dark} />)}</div>}
                      {a.missing.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{a.missing.map(c => <ConnectorChip key={c} word={c} state="missing" dark={dark} />)}</div>}
                      {a.extra.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{a.extra.map(c => <ConnectorChip key={c} word={c} state="extra" dark={dark} />)}</div>}
                    </div>
                  );
                })()}
              </div>

              {/* Reference */}
              {para && (
                <div style={{ marginBottom: 12 }}>
                  <button onClick={() => setShowRef(r => !r)}
                    style={{ background: "none", border: `1px dashed ${border}`, borderRadius: 10, padding: "7px 14px", fontSize: 13, color: accent, fontWeight: 700, cursor: "pointer", width: "100%", textAlign: "left" }}>
                    {showRef ? "▲ Hide reference" : "▼ Show reference paragraph"}
                  </button>
                  {showRef && (
                    <div style={{ marginTop: 8, background: dark ? "#1e1e2e" : "#f8f8fc", borderRadius: 12, padding: "14px" }}>
                      <RefParagraph text={para.text} dark={dark} />
                    </div>
                  )}
                </div>
              )}

              {/* Version score progression (if multiple versions) */}
              {attempt.versions.length > 1 && (
                <div style={{ background: dark ? "#1e1e2e" : "#f0eeff", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: sub, fontWeight: 700, marginBottom: 8 }}>Progress across versions</div>
                  {attempt.versions.map((v, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: sub, minWidth: 60 }}>{v.label || (i === 0 ? "Original" : `Edit ${i}`)}</span>
                      <ScoreBar score={v.connectorScore} />
                    </div>
                  ))}
                </div>
              )}

              {/* Confidence */}
              <div style={{ marginBottom: 14 }}>
                {editingConfidence ? (
                  <div>
                    <ConfidencePicker value={attempt.confidence} onChange={v => { onUpdate({ ...attempt, confidence: v }); setEditingConfidence(false); }} />
                  </div>
                ) : (
                  <button onClick={() => setEditingConfidence(true)}
                    style={{ background: "none", border: "none", fontSize: 13, color: sub, cursor: "pointer", padding: 0 }}>
                    {"⭐".repeat(attempt.confidence)} · tap to change
                  </button>
                )}
              </div>

              {/* Action row */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => { setEditingIdx(activeVersion); setAddingNew(false); }}
                  style={{ background: dark ? "#383858" : "#ede9ff", color: accent, border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ Edit this version
                </button>
                <button onClick={() => { setAddingNew(true); setEditingIdx(null); }}
                  style={{ background: accent, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  + New version
                </button>
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)}
                    style={{ background: "none", border: `1px solid ${border}`, color: sub, borderRadius: 10, padding: "9px 14px", fontSize: 14, cursor: "pointer", marginLeft: "auto" }}>
                    🗑
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                    <button onClick={onDelete}
                      style={{ background: danger, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                    <button onClick={() => setConfirmDelete(false)}
                      style={{ background: dark ? "#383858" : "#f0eeff", color: sub, border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 14, cursor: "pointer" }}>Cancel</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* New version editor */}
          {addingNew && (
            <div style={{ marginTop: 14, borderTop: `1px dashed ${border}`, paddingTop: 14 }}>
              <VersionEditor
                dark={dark}
                refText={para?.text ?? ""}
                label="Add new version"
                placeholder="Write an improved version from memory..."
                onSave={addVersion}
                onCancel={() => setAddingNew(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL — the full log with editing, filtering, stats
// ─────────────────────────────────────────────────────────────────────────────
function Journal({ progress, onUpdate, dark }: { progress: WritingProgress; onUpdate: (p: WritingProgress) => void; dark: boolean }) {
  const [filter, setFilter] = useState<string>("all");
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc", danger = "#ef4444";

  const weakness = progress.connectorWeakness;
  const sorted   = Object.entries(weakness).sort((a, b) => b[1] - a[1]);
  const todayCount = progress.attempts.filter(a => new Date(a.timestamp).toISOString().slice(0,10) === todayKey()).length;

  const avgConfidence = progress.attempts.length
    ? (progress.attempts.reduce((s, a) => s + a.confidence, 0) / progress.attempts.length).toFixed(1)
    : "—";
  const avgConnector = progress.attempts.length
    ? Math.round(progress.attempts.reduce((s, a) => s + a.versions[a.versions.length-1].connectorScore, 0) / progress.attempts.length)
    : 0;

  const filtered = [...progress.attempts]
    .reverse()
    .filter(a => filter === "all" || a.id === filter || (filter === "exam" && a.examMode));

  function updateAttempt(idx: number, updated: Attempt) {
    // idx is into filtered; find original index
    const original = progress.attempts.findIndex(a => a.timestamp === filtered[idx].timestamp);
    if (original === -1) return;
    const attempts = progress.attempts.map((a, i) => i === original ? updated : a);
    onUpdate({ ...progress, attempts });
  }

  function deleteAttempt(idx: number) {
    const original = progress.attempts.findIndex(a => a.timestamp === filtered[idx].timestamp);
    if (original === -1) return;
    const attempts = progress.attempts.filter((_, i) => i !== original);
    // Recalculate weakness
    const weakness: Record<string, number> = {};
    attempts.forEach(a => a.versions[0].missingConnectors.forEach(c => { weakness[c] = (weakness[c]||0)+1; }));
    onUpdate({ attempts, connectorWeakness: weakness });
  }

  if (progress.attempts.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📓</div>
        <div style={{ fontSize: 17, color: sub }}>Your writing journal is empty. Start writing!</div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Today",        val: todayCount,            color: accent },
          { label: "Confidence",   val: `${avgConfidence}⭐`,  color: "#f59e0b" },
          { label: "Connector avg",val: `${avgConnector}%`,    color: avgConnector >= 70 ? "#22c55e" : danger },
        ].map(s => (
          <div key={s.label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Connector weak spots */}
      {sorted.length > 0 && (
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 8 }}>⚠️ Connector weak spots</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sorted.slice(0, 6).map(([c, count]) => (
              <div key={c} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: text, fontSize: 15 }}>{c}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 70, height: 5, background: dark ? "#383858" : "#e4e0f8", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, count * 20)}%`, height: 5, background: danger, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 12, color: danger, fontWeight: 700 }}>✗{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { id: "all",  label: "All" },
          { id: "exam", label: "Exam only" },
          ...PROMPTS.map(p => ({ id: p.id, label: p.prompt.slice(0, 18) + "…" })),
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{ background: filter === f.id ? accent : (dark ? "#383858" : "#f0eeff"), color: filter === f.id ? "#fff" : accent, border: "none", borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Attempts */}
      <div style={{ fontSize: 13, color: sub, marginBottom: 8 }}>{filtered.length} entr{filtered.length !== 1 ? "ies" : "y"} · tap to expand and edit</div>
      {filtered.map((a, i) => (
        <AttemptCard
          key={a.timestamp}
          attempt={a}
          dark={dark}
          onUpdate={updated => updateAttempt(i, updated)}
          onDelete={() => deleteAttempt(i)}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITING EDITOR (unchanged logic, cleaned up)
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
  const startedAt = useRef<number | null>(examMode ? Date.now() : null);
  const accent = "#7c5cfc", danger = "#ef4444";
  const border = dark ? "#383858" : "#e4e0f8";
  const sub = dark ? "#9898b8" : "#777";

  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Wall-clock exam countdown
  useEffect(() => {
    if (!examMode || locked) return;
    function tick() {
      if (!startedAt.current) return;
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      const next = Math.max(0, examSeconds - elapsed);
      setTimeLeft(next);
      if (next === 0) { setLocked(true); }
    }
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [examMode, locked, examSeconds]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [text]);

  function handleSubmit() {
    if (wordCount(text) < 3 || locked) return;
    setLocked(true); onSubmit(text);
  }

  const mins = Math.floor(timeLeft / 60), secs = timeLeft % 60;
  const isUrgent = examMode && timeLeft <= 120 && timeLeft > 0;
  const wc = wordCount(text);

  return (
    <div>
      {examMode && (
        <div style={{ background: isUrgent ? danger+"15" : (dark ? "#1e1e2e" : "#f0eeff"), border: `2px solid ${isUrgent ? danger : accent}`, borderRadius: 14, padding: "10px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.3s" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isUrgent ? danger : accent, textTransform: "uppercase", letterSpacing: 1 }}>
            {locked && timeLeft === 0 ? "⏰ Time's up" : "⏱ Exam mode"}
          </span>
          <span style={{ fontSize: 28, fontWeight: 900, color: isUrgent ? danger : accent, fontVariantNumeric: "tabular-nums", letterSpacing: -1, animation: isUrgent ? "pulse 0.9s infinite" : "none" }}>
            {String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}
          </span>
        </div>
      )}

      <div style={{ background: dark ? "#2a2a3e" : "#fff", border: `1px solid ${border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: sub, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>
          {examMode ? "📝 Exam prompt — no hints" : "✍️ Writing prompt"}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: dark ? "#e8e8f8" : "#1a1a2e", marginBottom: examMode ? 0 : 8 }}>
          {prompt.prompt}
        </div>
        {!examMode && <div style={{ fontSize: 14, color: sub }}>💡 {prompt.hint}</div>}
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => !locked && setText(e.target.value)}
        disabled={locked}
        placeholder="Kirjoita vastauksesi tähän... (Ctrl+Enter lähettää)"
        style={{ width: "100%", minHeight: 200, background: dark ? "#1e1e2e" : "#fff", color: dark ? "#e8e8f8" : "#1a1a2e", border: `2px solid ${locked ? border : accent}`, borderRadius: 16, padding: "16px", fontSize: 17, lineHeight: 1.8, outline: "none", resize: "vertical", fontFamily: "inherit", opacity: locked ? 0.7 : 1, transition: "border-color 0.2s" }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <span style={{ fontSize: 13, color: sub }}>
          {wc} word{wc !== 1 ? "s" : ""}
          {wc > 0 && wc < 30 ? " · aim for 50+" : wc >= 60 ? " · great length ✓" : ""}
        </span>
        {!locked
          ? <button onClick={handleSubmit} disabled={wc < 3}
              style={{ background: wc >= 3 ? accent : (dark ? "#383858" : "#e4e0f8"), color: wc >= 3 ? "#fff" : sub, border: "none", borderRadius: 12, padding: "11px 22px", fontSize: 16, fontWeight: 700, cursor: wc >= 3 ? "pointer" : "default", transition: "all 0.2s" }}>
              Submit ↵
            </button>
          : <span style={{ fontSize: 13, fontWeight: 700, color: timeLeft === 0 ? danger : accent }}>
              {timeLeft === 0 ? "⏰ Time's up" : "✓ Submitted"}
            </span>
        }
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITING FEEDBACK (post-submission: analysis + confidence + save to journal)
// ─────────────────────────────────────────────────────────────────────────────
interface WritingFeedbackProps {
  userText: string;
  prompt: typeof PROMPTS[0];
  dark: boolean;
  onSave: (confidence: number) => void;
}

function WritingFeedback({ userText, prompt, dark, onSave }: WritingFeedbackProps) {
  const para = PARAGRAPHS.find(p => p.id === prompt.paraId)!;
  const analysis = analyzeConnectors(userText, para.text);
  const [showRef, setShowRef] = useState(false);
  const [confidence, setConfidence] = useState(3);
  const [saved, setSaved] = useState(false);

  const accent = "#7c5cfc";
  const border = dark ? "#383858" : "#e4e0f8";
  const sub = dark ? "#9898b8" : "#777";
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const bg = dark ? "#2a2a3e" : "#fff";

  return (
    <div>
      {/* Your answer */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: sub, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Your answer · {wordCount(userText)} words</div>
        <p style={{ fontSize: 16, lineHeight: 1.8, color: text, whiteSpace: "pre-wrap", margin: 0 }}>{userText}</p>
      </div>

      {/* Connector analysis */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: text }}>🔗 Connector analysis</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: analysis.score >= 75 ? "#22c55e" : analysis.score >= 40 ? "#f59e0b" : "#ef4444" }}>{analysis.score}%</div>
        </div>
        {analysis.used.length > 0 && <div style={{ marginBottom: 8 }}><div style={{ fontSize: 12, color: "#22c55e", fontWeight: 700, marginBottom: 5 }}>✓ Used</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{analysis.used.map(c => <ConnectorChip key={c} word={c} state="used" dark={dark} />)}</div></div>}
        {analysis.missing.length > 0 && <div style={{ marginBottom: 8 }}><div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginBottom: 5 }}>✗ Missing</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{analysis.missing.map(c => <ConnectorChip key={c} word={c} state="missing" dark={dark} />)}</div></div>}
        {analysis.extra.length > 0 && <div><div style={{ fontSize: 12, color: accent, fontWeight: 700, marginBottom: 5 }}>+ Bonus</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{analysis.extra.map(c => <ConnectorChip key={c} word={c} state="extra" dark={dark} />)}</div></div>}
      </div>

      {/* Reference */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
        <button onClick={() => setShowRef(r => !r)}
          style={{ background: "none", border: "none", cursor: "pointer", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>📖 Reference paragraph</span>
          <span style={{ fontSize: 18, color: accent }}>{showRef ? "▲" : "▼"}</span>
        </button>
        {showRef && <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${border}` }}><RefParagraph text={para.text} dark={dark} /></div>}
      </div>

      {/* Confidence */}
      {!saved && (
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 10 }}>How confident did you feel?</div>
          <ConfidencePicker value={confidence} onChange={setConfidence} />
          <div style={{ fontSize: 13, color: sub, marginTop: 6 }}>
            {confidence <= 2 ? "Keep going — it takes time! 💪" : confidence === 3 ? "Good — you're making progress 👍" : "Great confidence! 🔥"}
          </div>
        </div>
      )}

      {!saved ? (
        <button onClick={() => { onSave(confidence); setSaved(true); }}
          style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
          Save to journal →
        </button>
      ) : (
        <div style={{ textAlign: "center", padding: "20px 0", background: bg, border: `1px solid ${border}`, borderRadius: 16 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📓</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: text }}>Saved to journal!</div>
          <div style={{ fontSize: 14, color: sub, marginTop: 4 }}>You can edit, add versions, or rewrite any time from the journal.</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function HomeScreen({ dark, progress, onStart, onViewLog }: { dark: boolean; progress: WritingProgress; onStart: (p: typeof PROMPTS[0], exam: boolean, secs: number) => void; onViewLog: () => void }) {
  const [examSecs, setExamSecs] = useState(1800);
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  const todayCount = progress.attempts.filter(a => new Date(a.timestamp).toISOString().slice(0,10) === todayKey()).length;

  return (
    <div>
      <div style={{ background: todayCount > 0 ? accent+"18" : (dark ? "#1e1e2e" : "#f4f2ff"), border: `2px solid ${todayCount > 0 ? accent : border}`, borderRadius: 16, padding: "14px 18px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: todayCount > 0 ? accent : text }}>{todayCount === 0 ? "Start writing today" : `${todayCount} session${todayCount > 1 ? "s" : ""} today ✓`}</div>
          <div style={{ fontSize: 13, color: sub }}>{progress.attempts.length} total · aim for 1 per day</div>
        </div>
        <button onClick={onViewLog}
          style={{ background: dark ? "#383858" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          📓 Journal
        </button>
      </div>

      <div style={{ fontSize: 13, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>✍️ Practice — hints on</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
        {PROMPTS.map(p => {
          const attempts = progress.attempts.filter(a => a.id === p.id && !a.examMode);
          const last = attempts[attempts.length - 1];
          const lastVer = last?.versions[last.versions.length - 1];
          return (
            <div key={p.id} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 3 }}>{p.prompt}</div>
                <div style={{ fontSize: 13, color: sub }}>
                  {last ? `Last: 🔗 ${lastVer?.connectorScore ?? 0}% · ${"⭐".repeat(last.confidence)} · ${wordCount(lastVer?.text ?? "")}w${attempts.length > 1 ? ` · ${attempts.length} sessions` : ""}` : "Not attempted"}
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

      <div style={{ fontSize: 13, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🎯 Exam simulation — no hints</div>
      <div style={{ background: bg, border: `2px solid ${accent}44`, borderRadius: 16, padding: "16px", marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: sub, marginBottom: 12 }}>Timed · no reference · real exam pressure</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {EXAM_TIMES.map(t => (
            <button key={t.label} onClick={() => setExamSecs(t.seconds)}
              style={{ flex: 1, background: examSecs === t.seconds ? accent : (dark ? "#383858" : "#f0eeff"), color: examSecs === t.seconds ? "#fff" : accent, border: `2px solid ${examSecs === t.seconds ? accent : "transparent"}`, borderRadius: 10, padding: "9px 4px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => { const p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; onStart(p, true, examSecs); }}
          style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
          Start exam →
        </button>
      </div>
      <div style={{ fontSize: 13, color: sub, textAlign: "center" }}>Random prompt will be selected</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
type Screen = "home" | "write" | "feedback" | "log";

export default function Writing({ dark }: { dark: boolean }) {
  const [progress,      setProgress]      = useState<WritingProgress>(loadWritingProgress);
  const [screen,        setScreen]        = useState<Screen>("home");
  const [activePrompt,  setActivePrompt]  = useState<typeof PROMPTS[0] | null>(null);
  const [examMode,      setExamMode]      = useState(false);
  const [examSeconds,   setExamSeconds]   = useState(1800);
  const [submittedText, setSubmittedText] = useState("");

  function persistProgress(p: WritingProgress) { setProgress(p); saveWritingProgress(p); }

  function startSession(prompt: typeof PROMPTS[0], isExam: boolean, secs: number) {
    setActivePrompt(prompt); setExamMode(isExam); setExamSeconds(secs);
    setSubmittedText(""); setScreen("write"); window.scrollTo({ top: 0 });
  }

  function handleSubmit(text: string) {
    setSubmittedText(text); setScreen("feedback"); window.scrollTo({ top: 0 });
  }

  function handleSave(confidence: number) {
    if (!activePrompt) return;
    const para = PARAGRAPHS.find(p => p.id === activePrompt.paraId)!;
    const { score, missing } = analyzeConnectors(submittedText, para.text);
    const weakness = { ...progress.connectorWeakness };
    missing.forEach(c => { weakness[c] = (weakness[c] || 0) + 1; });
    const ver: Version = { text: submittedText, timestamp: Date.now(), connectorScore: score, missingConnectors: missing, label: "Original" };
    const attempt: Attempt = { id: activePrompt.id, versions: [ver], confidence, examMode, timestamp: Date.now() };
    persistProgress({ attempts: [...progress.attempts, attempt], connectorWeakness: weakness });
  }

  function goHome() { setScreen("home"); window.scrollTo({ top: 0 }); }

  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const accent = "#7c5cfc";

  return (
    <div>
      {screen !== "home" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={goHome}
            style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            ← Back
          </button>
          <div style={{ lineHeight: 1.2 }}>
            {screen === "write"    && <><div style={{ fontSize: 14, fontWeight: 700, color: text }}>{activePrompt?.prompt}</div><div style={{ fontSize: 12, color: sub }}>{examMode ? "🎯 Exam simulation" : "✍️ Practice"}</div></>}
            {screen === "feedback" && <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Feedback & analysis</div>}
            {screen === "log"      && <div style={{ fontSize: 14, fontWeight: 700, color: text }}>📓 Writing journal</div>}
          </div>
        </div>
      )}

      {screen === "home"     && <HomeScreen     dark={dark} progress={progress} onStart={startSession} onViewLog={() => { setScreen("log"); window.scrollTo({ top: 0 }); }} />}
      {screen === "write"    && activePrompt && <WritingEditor   prompt={activePrompt} examMode={examMode} examSeconds={examSeconds} dark={dark} onSubmit={handleSubmit} />}
      {screen === "feedback" && activePrompt && <WritingFeedback userText={submittedText} prompt={activePrompt} dark={dark} onSave={handleSave} />}
      {screen === "log"      && <Journal progress={progress} onUpdate={persistProgress} dark={dark} />}
    </div>
  );
}