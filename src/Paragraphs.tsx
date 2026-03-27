import { useState, useEffect, useRef } from "react";
import paragraphData from "./paragraphs.json";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Paragraph {
  id: string;
  topic: string;
  label: string;
  text: string;
  difficulty: "easy" | "medium" | "hard";
}

interface ParaProgress {
  read?: number;       // times fully read
  fillScore?: number;  // last fill-in-the-blank score 0-100
  shuffleScore?: number;
}

type ParaProgressMap = Record<string, ParaProgress>;
type Mode = "home" | "read" | "fill" | "shuffle";

// ── Constants ─────────────────────────────────────────────────────────────────
const PARAGRAPHS: Paragraph[] = paragraphData as Paragraph[];
const LS_PARA = "fi_para_v1";
const CONNECTORS = ["koska", "mutta", "lisäksi", "kuitenkin", "joten", "sekä", "että", "siis", "vaikka", "kun"];

// ── LocalStorage ──────────────────────────────────────────────────────────────
function loadParaProgress(): ParaProgressMap {
  try { return JSON.parse(localStorage.getItem(LS_PARA) || "{}"); } catch { return {}; }
}
function saveParaProgress(p: ParaProgressMap) {
  try { localStorage.setItem(LS_PARA, JSON.stringify(p)); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
}

// Key words to blank out: verbs / connectors mixed
const BLANK_TARGETS = [
  "asunut","opiskellut","kehittynyt","opiskellut","kiinnostunut","haastava",
  "uskon","auttaa","käyttämään","teen","vietän","kiireistä","löytää",
  "osata","kommunikoida","kehittää","jatkuva","työskennellä","kehittyä",
  "löytää","toivon","oppiminen","auttaa","käyttää","luovuta","harjoittelu",
  "koska","mutta","lisäksi","kuitenkin","joten","sekä","vaikka",
];

function makeBlankVersion(text: string): { display: string[]; answers: string[]; blanks: number[] } {
  const words = text.split(/(\s+)/);
  const answers: string[] = [];
  const blanks: number[] = [];
  const display = words.map((w, i) => {
    const clean = w.replace(/[.,!?;:]/g, "").toLowerCase();
    if (BLANK_TARGETS.includes(clean) && Math.random() < 0.55) {
      answers.push(w);
      blanks.push(i);
      return "___";
    }
    return w;
  });
  return { display, answers, blanks };
}

// ── Shared mini-components ────────────────────────────────────────────────────
function DiffBadge({ d }: { d: string }) {
  const map: Record<string, string> = { easy: "#22c55e", medium: "#f59e0b", hard: "#ef4444" };
  return <span style={{ background: map[d] || "#888", color: "#fff", borderRadius: 5, padding: "2px 9px", fontSize: 12, fontWeight: 700 }}>{d}</span>;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return <span style={{ background: color + "22", color, borderRadius: 20, padding: "2px 10px", fontSize: 13, fontWeight: 700 }}>{score}%</span>;
}

// ── Highlighted paragraph renderer ───────────────────────────────────────────
function HighlightedText({ text, dark }: { text: string; dark: boolean }) {
  const accent = "#7c5cfc";
  const words = text.split(/(\s+)/);
  return (
    <span>
      {words.map((w, i) => {
        const clean = w.replace(/[.,!?;:]/g, "").toLowerCase();
        if (CONNECTORS.includes(clean)) {
          return (
            <span key={i} style={{ color: accent, fontWeight: 700, background: accent + "18", borderRadius: 3, padding: "0 2px" }}>
              {w}
            </span>
          );
        }
        return <span key={i}>{w}</span>;
      })}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODE: PARAGRAPH VIEWER
// ════════════════════════════════════════════════════════════════════════════
function ParagraphViewer({ para, dark, onDone }: { para: Paragraph; dark: boolean; onDone: () => void }) {
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  // Speak the paragraph
  function speak() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(para.text);
    const voices = window.speechSynthesis.getVoices();
    const fi = voices.find(v => v.lang.startsWith("fi"));
    if (fi) u.voice = fi;
    u.lang = "fi-FI"; u.rate = 0.82; u.pitch = 1.08;
    window.speechSynthesis.speak(u);
  }

  const sentences = splitSentences(para.text);

  return (
    <div>
      {/* Paragraph card */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 18, padding: "22px 20px", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: sub, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Read & listen</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: text }}>{para.label}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DiffBadge d={para.difficulty} />
            <button onClick={speak}
              style={{ background: accent + "18", color: accent, border: "none", borderRadius: 20, padding: "7px 12px", cursor: "pointer", fontSize: 18 }}>
              🔊
            </button>
          </div>
        </div>

        {/* Full paragraph highlighted */}
        <p style={{ fontSize: 17, lineHeight: 1.85, color: text, marginBottom: 18 }}>
          <HighlightedText text={para.text} dark={dark} />
        </p>

        {/* Connector legend */}
        <div style={{ borderTop: `1px dashed ${border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Connectors highlighted</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CONNECTORS.filter(c => para.text.toLowerCase().includes(c)).map(c => (
              <span key={c} style={{ background: accent + "18", color: accent, borderRadius: 20, padding: "3px 10px", fontSize: 13, fontWeight: 700 }}>{c}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Sentence breakdown */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: sub, marginBottom: 10, fontWeight: 600 }}>SENTENCE BY SENTENCE</div>
        {sentences.map((s, i) => (
          <div key={i} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: accent, background: accent + "18", borderRadius: 20, padding: "2px 8px", flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
            <span style={{ fontSize: 16, color: text, lineHeight: 1.6 }}>{s}</span>
          </div>
        ))}
      </div>

      <button onClick={onDone}
        style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
        I've read it — practice now →
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODE: FILL IN THE BLANK
// ════════════════════════════════════════════════════════════════════════════
function FillInTheBlank({ para, dark, onDone }: { para: Paragraph; dark: boolean; onDone: (score: number) => void }) {
  const { display, answers, blanks } = useState(() => makeBlankVersion(para.text))[0];
  const [inputs,    setInputs]  = useState<string[]>(answers.map(() => ""));
  const [checked,   setChecked] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  if (answers.length === 0) {
    // No blankable words found — show full text and skip
    return (
      <div>
        <p style={{ color: text, fontSize: 16, lineHeight: 1.8, marginBottom: 20 }}>{para.text}</p>
        <button onClick={() => onDone(100)} style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>Continue →</button>
      </div>
    );
  }

  function check() { setChecked(true); }

  function calcScore(): number {
    let correct = 0;
    inputs.forEach((inp, i) => {
      const expected = answers[i].replace(/[.,!?;:]/g, "").toLowerCase().trim();
      const given    = inp.replace(/[.,!?;:]/g, "").toLowerCase().trim();
      if (given === expected) correct++;
    });
    return Math.round((correct / answers.length) * 100);
  }

  const score = checked ? calcScore() : 0;

  // Render the paragraph with inline inputs for blanks
  let blankIdx = 0;
  const rendered: React.ReactNode[] = [];
  display.forEach((token, i) => {
    if (token === "___") {
      const bi = blankIdx++;
      const expected = answers[bi].replace(/[.,!?;:]/g, "").toLowerCase().trim();
      const given    = inputs[bi]?.replace(/[.,!?;:]/g, "").toLowerCase().trim();
      const correct  = checked && given === expected;
      const wrong    = checked && given !== expected;
      rendered.push(
        <span key={`blank-${bi}`} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "bottom", margin: "0 2px" }}>
          <input
            ref={el => { inputRefs.current[bi] = el; }}
            value={inputs[bi]}
            onChange={e => {
              if (checked) return;
              const next = [...inputs]; next[bi] = e.target.value; setInputs(next);
            }}
            disabled={checked}
            style={{
              width: Math.max(60, answers[bi].length * 11),
              borderBottom: `2px solid ${correct ? "#22c55e" : wrong ? "#ef4444" : accent}`,
              borderTop: "none", borderLeft: "none", borderRight: "none",
              background: correct ? "#dcfce7" : wrong ? "#fee2e2" : "transparent",
              color: correct ? "#15803d" : wrong ? "#dc2626" : text,
              fontSize: 16, fontWeight: 600, textAlign: "center",
              outline: "none", padding: "2px 4px", borderRadius: "4px 4px 0 0",
            }}
          />
          {wrong && <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700, marginTop: 1 }}>{answers[bi]}</span>}
        </span>
      );
    } else {
      rendered.push(<span key={`word-${i}`}>{token}</span>);
    }
  });

  return (
    <div>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 18, padding: "20px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: sub, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Fill in the blanks</div>
        <div style={{ fontSize: 11, color: sub, marginBottom: 14 }}>{answers.length} words missing · type exactly as they appear</div>
        <div style={{ fontSize: 16, lineHeight: 2.2, color: text }}>
          {rendered}
        </div>
      </div>

      {!checked ? (
        <button onClick={check}
          style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
          Check answers
        </button>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <div style={{ textAlign: "center", background: score >= 80 ? "#dcfce7" : score >= 50 ? "#fef3c7" : "#fee2e2", borderRadius: 16, padding: "14px 28px" }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: score >= 80 ? "#15803d" : score >= 50 ? "#92400e" : "#dc2626" }}>{score}%</div>
              <div style={{ fontSize: 14, color: sub }}>{score >= 80 ? "Excellent! 🎉" : score >= 50 ? "Good effort 👍" : "Keep practising 💪"}</div>
            </div>
          </div>
          <button onClick={() => onDone(score)}
            style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
            {score < 60 ? "Try again →" : "Next →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODE: SENTENCE SHUFFLE
// ════════════════════════════════════════════════════════════════════════════
function SentenceShuffle({ para, dark, onDone }: { para: Paragraph; dark: boolean; onDone: (score: number) => void }) {
  const original = splitSentences(para.text);
  const [shuffled] = useState<string[]>(() => [...original].sort(() => Math.random() - 0.5));
  const [order,   setOrder]   = useState<number[]>(shuffled.map((_, i) => i));
  const [checked, setChecked] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  function calcScore(): number {
    let correct = 0;
    order.forEach((shuffledIdx, pos) => {
      if (shuffled[shuffledIdx] === original[pos]) correct++;
    });
    return Math.round((correct / original.length) * 100);
  }

  const score = checked ? calcScore() : 0;

  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...order]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setOrder(next);
  }
  function moveDown(i: number) {
    if (i === order.length - 1) return;
    const next = [...order]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; setOrder(next);
  }

  const orderedSentences = order.map(i => shuffled[i]);

  return (
    <div>
      <div style={{ fontSize: 12, color: sub, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1.2 }}>
        Sentence shuffle · put them in the right order
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {orderedSentences.map((sentence, pos) => {
          const isCorrect = checked && sentence === original[pos];
          const isWrong   = checked && sentence !== original[pos];
          return (
            <div key={`${pos}-${sentence.slice(0,10)}`}
              style={{
                background: isCorrect ? "#dcfce7" : isWrong ? "#fee2e2" : bg,
                border: `2px solid ${isCorrect ? "#22c55e" : isWrong ? "#ef4444" : border}`,
                borderRadius: 14, padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 10,
                transition: "all 0.2s",
              }}>
              {/* Position number */}
              <span style={{ fontSize: 13, fontWeight: 800, color: isCorrect ? "#15803d" : isWrong ? "#dc2626" : accent, background: (isCorrect ? "#22c55e" : isWrong ? "#ef4444" : accent) + "18", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>
                {pos + 1}
              </span>
              {/* Sentence text */}
              <span style={{ flex: 1, fontSize: 15, color: isCorrect ? "#15803d" : isWrong ? "#dc2626" : text, lineHeight: 1.5 }}>
                {sentence}
              </span>
              {/* Up/down arrows — hidden after check */}
              {!checked && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <button onClick={() => moveUp(pos)} disabled={pos === 0}
                    style={{ background: "none", border: "none", cursor: pos === 0 ? "default" : "pointer", opacity: pos === 0 ? 0.2 : 1, fontSize: 16, padding: "2px 6px", color: accent }}>▲</button>
                  <button onClick={() => moveDown(pos)} disabled={pos === order.length - 1}
                    style={{ background: "none", border: "none", cursor: pos === order.length - 1 ? "default" : "pointer", opacity: pos === order.length - 1 ? 0.2 : 1, fontSize: 16, padding: "2px 6px", color: accent }}>▼</button>
                </div>
              )}
              {isCorrect && <span style={{ fontSize: 18 }}>✓</span>}
              {isWrong   && <span style={{ fontSize: 18 }}>✗</span>}
            </div>
          );
        })}
      </div>

      {/* Correct order (shown after check if score < 100) */}
      {checked && score < 100 && (
        <div style={{ background: dark ? "#1e1e2e" : "#f0eeff", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: sub, marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Correct order</div>
          {original.map((s, i) => (
            <div key={i} style={{ fontSize: 14, color: text, lineHeight: 1.6, marginBottom: 4 }}>
              <span style={{ color: accent, fontWeight: 700 }}>{i + 1}.</span> {s}
            </div>
          ))}
        </div>
      )}

      {!checked ? (
        <button onClick={() => setChecked(true)}
          style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
          Check order
        </button>
      ) : (
        <div>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: score >= 80 ? "#15803d" : score >= 50 ? "#92400e" : "#dc2626" }}>{score}%</div>
            <div style={{ fontSize: 14, color: sub }}>{score === 100 ? "Perfect order! 🎉" : score >= 50 ? "Almost there 👍" : "Keep practising 💪"}</div>
          </div>
          <button onClick={() => onDone(score)}
            style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
            Done →
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PARAGRAPHS MAIN — home screen + mode router
// ════════════════════════════════════════════════════════════════════════════
export default function Paragraphs({ dark }: { dark: boolean }) {
  const [paraProgress, setParaProgress] = useState<ParaProgressMap>(loadParaProgress);
  const [selected, setSelected] = useState<Paragraph | null>(null);
  const [mode,     setMode]     = useState<Mode>("home");

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#1e1e2e" : "#fff";
  const rowBg  = dark ? "#2a2a3e" : "#f8f8fc";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  function updateProgress(id: string, patch: Partial<ParaProgress>) {
    const next = { ...paraProgress, [id]: { ...paraProgress[id], ...patch } };
    setParaProgress(next);
    saveParaProgress(next);
  }

  function openPara(p: Paragraph, m: Mode) {
    setSelected(p); setMode(m);
  }

  function goHome() { setSelected(null); setMode("home"); }

  // ── Sub-mode rendered ──
  if (selected && mode !== "home") {
    const p = selected;
    return (
      <div>
        {/* Back + mode header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={goHome}
            style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{p.label}</div>
            <div style={{ fontSize: 12, color: sub }}>
              {mode === "read" ? "📖 Read & Listen" : mode === "fill" ? "✏️ Fill in the Blank" : "🔀 Sentence Shuffle"}
            </div>
          </div>
        </div>

        {mode === "read" && (
          <ParagraphViewer para={p} dark={dark} onDone={() => {
            updateProgress(p.id, { read: (paraProgress[p.id]?.read || 0) + 1 });
            goHome();
          }} />
        )}
        {mode === "fill" && (
          <FillInTheBlank para={p} dark={dark} onDone={score => {
            updateProgress(p.id, { fillScore: score });
            goHome();
          }} />
        )}
        {mode === "shuffle" && (
          <SentenceShuffle para={p} dark={dark} onDone={score => {
            updateProgress(p.id, { shuffleScore: score });
            goHome();
          }} />
        )}
      </div>
    );
  }

  // ── Home: paragraph list ──
  const totalRead     = Object.values(paraProgress).filter(p => (p.read || 0) > 0).length;
  const avgFill       = (() => { const scores = Object.values(paraProgress).map(p => p.fillScore).filter((s): s is number => s !== undefined); return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null; })();
  const avgShuffle    = (() => { const scores = Object.values(paraProgress).map(p => p.shuffleScore).filter((s): s is number => s !== undefined); return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null; })();

  return (
    <div>
      {/* Stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Read", val: `${totalRead}/${PARAGRAPHS.length}`, color: accent },
          { label: "Fill avg", val: avgFill !== null ? `${avgFill}%` : "—", color: "#22c55e" },
          { label: "Shuffle avg", val: avgShuffle !== null ? `${avgShuffle}%` : "—", color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Paragraph cards */}
      {PARAGRAPHS.map((para, i) => {
        const pp = paraProgress[para.id] || {};
        const hasRead    = (pp.read || 0) > 0;
        const fillScore  = pp.fillScore;
        const shuffleScore = pp.shuffleScore;

        return (
          <div key={para.id} style={{ background: i % 2 === 0 ? bg : rowBg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px", marginBottom: 10 }}>
            {/* Title row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: text, marginBottom: 4 }}>{para.label}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <DiffBadge d={para.difficulty} />
                  {hasRead    && <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700, background: "#dcfce7", borderRadius: 20, padding: "2px 8px" }}>✓ Read</span>}
                  {fillScore    !== undefined && <ScoreBadge score={fillScore} />}
                  {shuffleScore !== undefined && <ScoreBadge score={shuffleScore} />}
                </div>
              </div>
            </div>

            {/* Preview text */}
            <p style={{ fontSize: 14, color: sub, lineHeight: 1.5, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {para.text}
            </p>

            {/* Mode buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
              <button onClick={() => openPara(para, "read")}
                style={{ background: dark ? "#383858" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "9px 6px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                📖 Read
              </button>
              <button onClick={() => openPara(para, "fill")}
                style={{ background: dark ? "#383858" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "9px 6px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ✏️ Fill
              </button>
              <button onClick={() => openPara(para, "shuffle")}
                style={{ background: dark ? "#383858" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "9px 6px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                🔀 Shuffle
              </button>
            </div>
          </div>
        );
      })}

      {/* Exam mode tip */}
      <div style={{ marginTop: 16, background: dark ? "#1e1e2e" : "#f4f2ff", border: `1px dashed ${border}`, borderRadius: 14, padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 4 }}>💡 Exam tip</div>
        <div style={{ fontSize: 13, color: sub, lineHeight: 1.6 }}>
          For YKI/Omnia writing: read a paragraph, close the app, and try writing it from memory. Then compare. Repetition builds fluency.
        </div>
      </div>
    </div>
  );
}