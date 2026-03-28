import { useState, useCallback, useMemo, useEffect } from "react";
import vocabData from "./vocab.json";
import Paragraphs from "./Paragraphs";
import Writing from "./Writing";

// ── Types ────────────────────────────────────────────────────────────────────
interface Word {
  word: string; meaning: string; example: string;
  exampleTranslation: string; category: string;
  difficulty: "easy" | "medium" | "hard";
}
interface WordProgress { known?: boolean; right?: number; wrong?: number; }
type Progress = Record<string, WordProgress>;

const WORDS: Word[] = vocabData as Word[];
const PAGE_SIZE = 10;

// ── LocalStorage ──────────────────────────────────────────────────────────────
const LS_KEY = "fi_vocab_v1";
function loadProgress(): Progress { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } }
function saveProgress(p: Progress) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {} }

// ── Weighted shuffle ──────────────────────────────────────────────────────────
function weightedShuffle(words: Word[], progress: Progress): Word[] {
  const scored = words.map(w => {
    const p = progress[w.word] || {};
    let weight = 1;
    if (p.known) weight *= 0.3;
    const wrong = p.wrong || 0, right = p.right || 0, total = wrong + right;
    if (total > 0) weight *= (1 + (wrong / total) * 3);
    return { word: w, weight };
  });
  const result: Word[] = [], pool = [...scored];
  while (pool.length) {
    const totalW = pool.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * totalW;
    for (let i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) { result.push(pool[i].word); pool.splice(i, 1); break; } }
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function btn(bg: string, color: string, extra?: React.CSSProperties): React.CSSProperties {
  return { background: bg, color, border: "none", borderRadius: 12, padding: "14px 22px", fontSize: 17, fontWeight: 600, cursor: "pointer", transition: "opacity 0.15s", touchAction: "manipulation", WebkitTapHighlightColor: "transparent", ...extra };
}
function DiffBadge({ d }: { d: string }) {
  const map: Record<string, string> = { easy: "#22c55e", medium: "#f59e0b", hard: "#ef4444" };
  return <span style={{ background: map[d] || "#888", color: "#fff", borderRadius: 5, padding: "3px 10px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{d}</span>;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconBook  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
const IconCards = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
const IconQuiz  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IconWrite     = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconParagraph = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>;
const IconStar   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const IconSun   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
const IconMoon  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

// ════════════════════════════════════════════════════════════════════════════
// AUDIO ENGINE  — Web Speech API, Finnish female voice
// ════════════════════════════════════════════════════════════════════════════
type SpeakState = "idle" | "playing" | "paused";

// Singleton utterance tracker so only one thing plays at a time
let _currentUtterance: SpeechSynthesisUtterance | null = null;

function pickFinnishVoice(): SpeechSynthesisVoice | null {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  // Priority: fi-FI female > fi-FI any > fi any > null
  const fiFemale = voices.find(v => v.lang.startsWith("fi") && /female|nais|nainen|satu|aino|anna|heidi/i.test(v.name));
  const fiAny    = voices.find(v => v.lang.startsWith("fi"));
  return fiFemale || fiAny || null;
}

function useSpeak(text: string) {
  const [state, setState] = useState<SpeakState>("idle");

  // When text changes, stop whatever was playing for this hook
  useEffect(() => { return () => { /* cleanup on unmount */ }; }, [text]);

  function play() {
    if (!window.speechSynthesis) return;
    // If we're paused on THIS text, resume
    if (state === "paused" && _currentUtterance?.text === text) {
      window.speechSynthesis.resume();
      setState("playing");
      return;
    }
    // Stop anything currently playing
    window.speechSynthesis.cancel();
    setState("idle");

    const utter = new SpeechSynthesisUtterance(text);
    // Best quality Finnish female settings
    const voice = pickFinnishVoice();
    if (voice) utter.voice = voice;
    utter.lang  = "fi-FI";
    utter.rate  = 0.82;   // slightly slower → clearer pronunciation
    utter.pitch = 1.08;   // slightly higher → more feminine
    utter.volume = 1;

    utter.onstart = () => setState("playing");
    utter.onend   = () => { setState("idle"); _currentUtterance = null; };
    utter.onerror = () => { setState("idle"); _currentUtterance = null; };
    utter.onpause = () => setState("paused");

    _currentUtterance = utter;
    window.speechSynthesis.speak(utter);
    setState("playing");
  }

  function pause() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.pause();
    setState("paused");
  }

  function stop() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setState("idle");
    _currentUtterance = null;
  }

  return { state, play, pause, stop };
}

// Preload voices (Chrome loads them async)
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => window.speechSynthesis.getVoices());
}

// ── SpeakBtn — reusable play/pause/stop button ────────────────────────────
interface SpeakBtnProps { text: string; dark: boolean; size?: "sm" | "md"; }
function SpeakBtn({ text, dark, size = "md" }: SpeakBtnProps) {
  const { state, play, pause, stop } = useSpeak(text);
  const accent = "#7c5cfc";
  const sz = size === "sm" ? 15 : 19;
  const pad = size === "sm" ? "5px 9px" : "7px 13px";
  const gap = size === "sm" ? 4 : 6;

  const isPlaying = state === "playing";
  const isPaused  = state === "paused";
  const isActive  = isPlaying || isPaused;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap, flexShrink: 0 }}>
      {/* Play / Pause */}
      <button
        onClick={e => { e.stopPropagation(); isPlaying ? pause() : play(); }}
        title={isPlaying ? "Pause" : isPaused ? "Resume" : "Listen"}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          background: isActive ? accent : (dark ? "#2a2a3e" : "#ede9ff"),
          color: isActive ? "#fff" : accent,
          border: "none", borderRadius: 20, padding: pad,
          cursor: "pointer", fontSize: sz, fontWeight: 700,
          transition: "all 0.15s", WebkitTapHighlightColor: "transparent",
        }}>
        {isPlaying ? (
          // Pause icon
          <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          // Play icon
          <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        )}
        {isPaused && <span style={{ fontSize: sz - 4 }}>‥</span>}
      </button>
      {/* Stop — only when active */}
      {isActive && (
        <button
          onClick={e => { e.stopPropagation(); stop(); }}
          title="Stop"
          style={{ display: "flex", alignItems: "center", background: dark ? "#2a2a3e" : "#fee2e2", color: "#ef4444", border: "none", borderRadius: 20, padding: pad, cursor: "pointer", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" }}>
          <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VOCABULARY LIST
// ════════════════════════════════════════════════════════════════════════════
function VocabList({ progress, dark }: { progress: Progress; dark: boolean }) {
  const [filterCat,  setFilterCat]  = useState("all");
  const [filterDiff, setFilterDiff] = useState("all");
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [page,       setPage]       = useState(1);

  const cats = useMemo(() => ["all", ...Array.from(new Set(WORDS.map(w => w.category)))], []);
  useEffect(() => { setPage(1); setExpanded(null); }, [search, filterCat, filterDiff]);

  const filtered = useMemo(() => WORDS.filter(w =>
    (filterCat === "all" || w.category === filterCat) &&
    (filterDiff === "all" || w.difficulty === filterDiff) &&
    (w.word.toLowerCase().includes(search.toLowerCase()) || w.meaning.toLowerCase().includes(search.toLowerCase()))
  ), [search, filterCat, filterDiff]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const bg = dark ? "#1e1e2e" : "#fff", rowBg = dark ? "#2a2a3e" : "#f8f8fc";
  const border = dark ? "#383858" : "#e8e8f0", text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub = dark ? "#9898b8" : "#666", pillBg = dark ? "#383858" : "#ede9ff";
  const accent = "#7c5cfc";

  function goPage(n: number) { setPage(n); setExpanded(null); window.scrollTo({ top: 0, behavior: "smooth" }); }

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce<(number | "…")[]>((acc, n, idx, arr) => {
      if (idx > 0 && (n as number) - (arr[idx - 1] as number) > 1) acc.push("…");
      acc.push(n); return acc;
    }, []);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search words or meanings…"
          style={{ background: rowBg, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px", color: text, fontSize: 17, outline: "none", width: "100%" }} />
        <div style={{ display: "flex", gap: 10 }}>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ background: rowBg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 10px", color: text, fontSize: 16, flex: 1 }}>
            {cats.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={filterDiff} onChange={e => setFilterDiff(e.target.value)}
            style={{ background: rowBg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 10px", color: text, fontSize: 16, flex: 1 }}>
            {["all","easy","medium","hard"].map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 14, color: sub }}>{filtered.length} word{filtered.length !== 1 ? "s" : ""} · page {page} of {totalPages}</div>
      </div>

      <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${border}` }}>
        {paginated.length === 0 && <div style={{ padding: "36px 20px", textAlign: "center", color: sub, fontSize: 17 }}>No words match.</div>}
        {paginated.map((w, i) => {
          const p = progress[w.word] || {}, isExp = expanded === w.word;
          return (
            <div key={w.word} onClick={() => setExpanded(isExp ? null : w.word)}
              style={{ background: i % 2 === 0 ? bg : rowBg, borderBottom: i < paginated.length - 1 ? `1px solid ${border}` : "none", padding: "16px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                    <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, fontWeight: 700, color: text }}>{w.word}</span>
                    {p.known && <span style={{ fontSize: 16, color: "#22c55e", fontWeight: 700 }}>✓</span>}
                    <SpeakBtn text={w.word} dark={dark} size="sm" />
                  </div>
                  <div style={{ color: sub, fontSize: 16, lineHeight: 1.4 }}>{w.meaning}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  <DiffBadge d={w.difficulty} />
                  <span style={{ background: pillBg, color: dark ? "#c4b8ff" : accent, borderRadius: 6, padding: "3px 9px", fontSize: 13, fontWeight: 600 }}>{w.category}</span>
                </div>
              </div>
              {isExp && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${border}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <div style={{ fontStyle: "italic", color: text, fontSize: 16, lineHeight: 1.6, flex: 1 }}>"{w.example}"</div>
                    <SpeakBtn text={w.example} dark={dark} size="sm" />
                  </div>
                  <div style={{ color: sub, fontSize: 15 }}>{w.exampleTranslation}</div>
                  {(p.wrong || 0) > 0 && <div style={{ marginTop: 8, fontSize: 14, color: "#ef4444" }}>Missed {p.wrong}× in quiz</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
          <button onClick={() => goPage(page - 1)} disabled={page === 1}
            style={btn(dark ? "#2a2a3e" : "#ede9ff", dark ? "#9898b8" : accent, { padding: "11px 20px", fontSize: 22, lineHeight: 1, opacity: page === 1 ? 0.3 : 1 })}>‹</button>
          {pageNumbers.map((n, i) =>
            n === "…" ? <span key={`e${i}`} style={{ color: sub, fontSize: 18, padding: "0 2px" }}>…</span>
              : <button key={n} onClick={() => goPage(n as number)}
                  style={btn(page === n ? accent : (dark ? "#2a2a3e" : "#ede9ff"), page === n ? "#fff" : (dark ? "#c4b8ff" : accent), { padding: "11px 0", minWidth: 46, fontSize: 16 })}>{n}</button>
          )}
          <button onClick={() => goPage(page + 1)} disabled={page === totalPages}
            style={btn(dark ? "#2a2a3e" : "#ede9ff", dark ? "#9898b8" : accent, { padding: "11px 20px", fontSize: 22, lineHeight: 1, opacity: page === totalPages ? 0.3 : 1 })}>›</button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FLASHCARDS
// ════════════════════════════════════════════════════════════════════════════
function Flashcards({ progress, setProgress, dark }: { progress: Progress; setProgress: (p: Progress) => void; dark: boolean }) {
  const deck = useMemo(() => weightedShuffle(WORDS, progress), []);
  const [idx, setIdx] = useState(0), [flipped, setFlipped] = useState(false), [done, setDone] = useState(false);
  const card = deck[idx], p = progress[card?.word] || {};
  const known = WORDS.filter(w => (progress[w.word] || {}).known).length;
  const text = dark ? "#e8e8f8" : "#1a1a2e", sub = dark ? "#9898b8" : "#777", accent = "#7c5cfc";

  function markKnown(val: boolean) {
    const newP = { ...progress, [card.word]: { ...p, known: val } };
    setProgress(newP); saveProgress(newP); next();
  }
  function next() { setFlipped(false); if (idx + 1 >= deck.length) { setDone(true); return; } setIdx(i => i + 1); }

  if (done) return (
    <div style={{ textAlign: "center", padding: "60px 16px" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: text, marginBottom: 10 }}>Session complete!</div>
      <div style={{ color: sub, fontSize: 18, marginBottom: 36 }}>{known} / {WORDS.length} words marked as known</div>
      <button onClick={() => window.location.reload()} style={btn(accent, "#fff", { width: "100%", padding: "16px" })}>Start new session</button>
    </div>
  );

  const pct = Math.round((idx / deck.length) * 100);
  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 16, color: sub }}>{idx + 1} / {deck.length}</span>
        <span style={{ fontSize: 16, color: sub }}>✓ {known} known</span>
      </div>
      <div style={{ background: dark ? "#383858" : "#e8e4ff", borderRadius: 99, height: 7, marginBottom: 24 }}>
        <div style={{ width: `${pct}%`, height: 7, borderRadius: 99, background: accent, transition: "width 0.3s" }} />
      </div>
      <div onClick={() => setFlipped(f => !f)}
        style={{ background: dark ? "#2a2a3e" : "#fff", border: `2px solid ${dark ? "#5540cc" : "#c4b5fd"}`, borderRadius: 22, minHeight: 210, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "32px 24px", cursor: "pointer", textAlign: "center", boxShadow: dark ? "0 8px 40px #00000066" : "0 8px 40px #c4b5fd44", userSelect: "none", WebkitTapHighlightColor: "transparent" }}>
        {!flipped ? (
          <>
            <div style={{ fontSize: 13, color: sub, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Finnish word</div>
            <div style={{ fontSize: 40, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, color: text, marginBottom: 14 }}>{card.word}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <DiffBadge d={card.difficulty} />
              <SpeakBtn text={card.word} dark={dark} />
            </div>
            <div style={{ color: sub, fontSize: 15, marginTop: 18 }}>Tap card to reveal</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 28, fontWeight: 700, color: text, marginBottom: 10 }}>{card.meaning}</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
              <div style={{ fontStyle: "italic", color: dark ? "#c4b8ff" : accent, fontSize: 16, lineHeight: 1.6, flex: 1 }}>"{card.example}"</div>
              <SpeakBtn text={card.example} dark={dark} size="sm" />
            </div>
            <div style={{ color: sub, fontSize: 15, lineHeight: 1.5 }}>{card.exampleTranslation}</div>
          </>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
        <button onClick={() => markKnown(false)} style={btn("#fee2e2", "#dc2626", { padding: "15px", fontSize: 16 })}>✗ Still learning</button>
        <button onClick={() => markKnown(true)}  style={btn("#dcfce7", "#16a34a", { padding: "15px", fontSize: 16 })}>✓ Know it!</button>
      </div>
      <button onClick={() => setFlipped(f => !f)} style={btn(dark ? "#383858" : "#ede9ff", dark ? "#c4b8ff" : accent, { width: "100%", marginTop: 10, padding: "12px", fontSize: 15 })}>{flipped ? "Hide" : "Flip card"}</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// QUIZ
// ════════════════════════════════════════════════════════════════════════════
function Quiz({ progress, setProgress, dark }: { progress: Progress; setProgress: (p: Progress) => void; dark: boolean }) {
  const [current,   setCurrent]  = useState<Word | null>(null);
  const [options,   setOptions]  = useState<string[]>([]);
  const [selected,  setSelected] = useState<string | null>(null);
  const [score,     setScore]    = useState({ right: 0, wrong: 0 });
  const [streak,    setStreak]   = useState(0);
  const [feedback,  setFeedback] = useState<"correct" | "wrong" | null>(null);

  const text = dark ? "#e8e8f8" : "#1a1a2e", sub = dark ? "#9898b8" : "#777";
  const border = dark ? "#383858" : "#e0ddf8", accent = "#7c5cfc";

  const pickQuestion = useCallback(() => {
    const pool = weightedShuffle(WORDS, progress);
    const q = pool[0];
    const wrong = WORDS.filter(w => w.word !== q.word).sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [...wrong.map(w => w.meaning), q.meaning].sort(() => Math.random() - 0.5);
    setCurrent(q); setOptions(opts); setSelected(null); setFeedback(null);
  }, [progress]);

  useState(() => { pickQuestion(); });

  function answer(opt: string) {
    if (selected !== null || !current) return;
    setSelected(opt);
    const correct = opt === current.meaning;
    const p = progress[current.word] || {};
    const newP = { ...progress, [current.word]: { ...p, right: (p.right||0)+(correct?1:0), wrong: (p.wrong||0)+(correct?0:1) } };
    setProgress(newP); saveProgress(newP);
    setFeedback(correct ? "correct" : "wrong");
    if (correct) { setScore(s => ({ ...s, right: s.right+1 })); setStreak(s => s+1); }
    else         { setScore(s => ({ ...s, wrong: s.wrong+1 })); setStreak(0); }
    // Auto-advance after 1.4s
    setTimeout(() => pickQuestion(), 1400);
  }

  if (!current) return <div style={{ textAlign: "center", padding: 40, color: sub }}>Loading…</div>;

  const total = score.right + score.wrong;
  const pct   = total > 0 ? Math.round((score.right / total) * 100) : 0;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>

      {/* Compact score strip */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, padding: "10px 14px", background: dark ? "#1e1e2e" : "#f0eeff", borderRadius: 12 }}>
        <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 16 }}>✓ {score.right}</span>
        <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 16 }}>✗ {score.wrong}</span>
        <span style={{ color: accent,    fontWeight: 700, fontSize: 16 }}>{pct}%</span>
        <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 16 }}>🔥 {streak}</span>
      </div>

      {/* Question card */}
      <div style={{
        background: feedback === "correct" ? "#dcfce7" : feedback === "wrong" ? "#fee2e2" : (dark ? "#2a2a3e" : "#fff"),
        border: `2px solid ${feedback === "correct" ? "#22c55e" : feedback === "wrong" ? "#ef4444" : (dark ? "#5540cc" : "#c4b5fd")}`,
        borderRadius: 20, padding: "26px 20px", textAlign: "center", marginBottom: 14,
        transition: "background 0.25s, border-color 0.25s",
        boxShadow: dark ? "0 4px 24px #00000055" : "0 4px 24px #c4b5fd33",
      }}>
        <div style={{ fontSize: 12, color: sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>What does this mean?</div>
        <div style={{ fontSize: 34, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, color: text, marginBottom: 10 }}>{current.word}</div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
          <DiffBadge d={current.difficulty} />
          <SpeakBtn text={current.word} dark={dark} size="sm" />
        </div>
        {feedback && (
          <div style={{ marginTop: 12, fontSize: 14, color: feedback === "correct" ? "#15803d" : "#dc2626", fontStyle: "italic", lineHeight: 1.5 }}>
            {current.example}
          </div>
        )}
      </div>

      {/* Answer options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {options.map(opt => {
          const isCorrect  = opt === current.meaning;
          const isSelected = opt === selected;
          let obg = dark ? "#2a2a3e" : "#fff";
          let bc  = dark ? "#383858" : border;
          let tc  = text;
          if (selected !== null) {
            if (isCorrect)       { obg = "#dcfce7"; bc = "#22c55e"; tc = "#15803d"; }
            else if (isSelected) { obg = "#fee2e2"; bc = "#ef4444"; tc = "#dc2626"; }
          }
          return (
            <button key={opt} onClick={() => answer(opt)}
              style={{
                background: obg, border: `2px solid ${bc}`, borderRadius: 14,
                padding: "15px 16px", fontSize: 16, color: tc,
                cursor: selected ? "default" : "pointer", textAlign: "left",
                transition: "all 0.2s",
                fontWeight: isSelected || (selected !== null && isCorrect) ? 700 : 400,
                WebkitTapHighlightColor: "transparent", lineHeight: 1.4,
              }}>
              {opt}
              {selected !== null && isCorrect  && " ✓"}
              {selected !== null && isSelected && !isCorrect && " ✗"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DAILY SET  — 10 smart-picked words, spaced-repetition style
// ════════════════════════════════════════════════════════════════════════════
const SET_SIZE = 10;
const LS_STREAK = "fi_streak_v1";

function loadStreak() { try { return JSON.parse(localStorage.getItem(LS_STREAK) || '{"count":0,"lastDate":""}'); } catch { return { count: 0, lastDate: "" }; } }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// Score each word: higher = needs more practice
function urgencyScore(w: Word, p: WordProgress): number {
  const right = p.right || 0, wrong = p.wrong || 0, total = right + wrong;
  if (p.known && total > 3) return 0.1;           // mastered — barely show
  if (total === 0) return 2;                        // never seen — high priority
  const errorRate = wrong / total;
  const recency = total < 3 ? 1.5 : 1;             // seen fewer than 3 times → boost
  const diffBoost = w.difficulty === "hard" ? 1.3 : w.difficulty === "medium" ? 1.1 : 1;
  return (0.5 + errorRate * 2) * recency * diffBoost;
}

function buildDailySet(progress: Progress): Word[] {
  const scored = WORDS.map(w => ({ word: w, score: urgencyScore(w, progress[w.word] || {}) }));
  scored.sort((a, b) => b.score - a.score);
  // Take top priority words, but sprinkle in 2 "known" words for confidence
  const needsPractice = scored.filter(x => x.score > 0.3).slice(0, SET_SIZE - 2).map(x => x.word);
  const easy = scored.filter(x => x.score <= 0.3).slice(0, 2).map(x => x.word);
  const set = [...needsPractice, ...easy].slice(0, SET_SIZE);
  // Shuffle
  return set.sort(() => Math.random() - 0.5);
}

function DailySet({ progress, setProgress, dark }: { progress: Progress; setProgress: (p: Progress) => void; dark: boolean }) {
  const [phase,     setPhase]     = useState<"intro" | "learn" | "done">("intro");
  const [set,       setSet]       = useState<Word[]>([]);
  const [idx,       setIdx]       = useState(0);
  const [flipped,   setFlipped]   = useState(false);
  const [results,   setResults]   = useState<Record<string, "got" | "missed">>({});
  const [streak,    setStreak]    = useState(loadStreak);

  const accent = "#7c5cfc", text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub = dark ? "#9898b8" : "#777", border = dark ? "#383858" : "#e4e0f8";
  const cardBg = dark ? "#2a2a3e" : "#fff", bg = dark ? "#1e1e2e" : "#f8f8fc";

  // Stats for intro screen
  const neverSeen  = WORDS.filter(w => !(progress[w.word]?.right || 0) && !(progress[w.word]?.wrong || 0)).length;
  const struggling = WORDS.filter(w => { const p = progress[w.word] || {}; const t = (p.right||0)+(p.wrong||0); return t > 0 && (p.wrong||0)/t > 0.4; }).length;
  const mastered   = WORDS.filter(w => progress[w.word]?.known).length;

  function startSet() {
    const s = buildDailySet(progress);
    setSet(s); setIdx(0); setFlipped(false); setResults({}); setPhase("learn");
  }

  function mark(outcome: "got" | "missed") {
    const word = set[idx];
    const newResults = { ...results, [word.word]: outcome };
    setResults(newResults);

    // Update progress
    const p = progress[word.word] || {};
    const newP: Progress = {
      ...progress,
      [word.word]: {
        ...p,
        right: (p.right || 0) + (outcome === "got" ? 1 : 0),
        wrong: (p.wrong || 0) + (outcome === "missed" ? 1 : 0),
        known: outcome === "got" && (p.right || 0) >= 2 ? true : p.known,
      }
    };
    setProgress(newP);
    saveProgress(newP);

    if (idx + 1 >= set.length) {
      // Update streak
      const today = todayStr();
      const s = loadStreak();
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const newStreak = { count: s.lastDate === today ? s.count : s.lastDate === yesterdayStr ? s.count + 1 : 1, lastDate: today };
      localStorage.setItem(LS_STREAK, JSON.stringify(newStreak));
      setStreak(newStreak);
      setPhase("done");
    } else {
      setFlipped(false);
      setTimeout(() => setIdx(i => i + 1), 120);
    }
  }

  const gotCount    = Object.values(results).filter(r => r === "got").length;
  const missedCount = Object.values(results).filter(r => r === "missed").length;

  // ── INTRO ──
  if (phase === "intro") return (
    <div>
      {/* Streak banner */}
      <div style={{ background: streak.count > 0 ? "linear-gradient(135deg, #f59e0b22, #ef444422)" : (dark ? "#1e1e2e" : "#fff"), border: `2px solid ${streak.count > 0 ? "#f59e0b" : border}`, borderRadius: 16, padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 38 }}>{streak.count >= 7 ? "🏆" : streak.count >= 3 ? "🔥" : "⭐"}</span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: streak.count > 0 ? "#f59e0b" : text }}>{streak.count} day streak</div>
          <div style={{ fontSize: 14, color: sub }}>{streak.count === 0 ? "Start your streak today!" : streak.count >= 7 ? "Incredible consistency!" : streak.count >= 3 ? "You're on fire! Keep going." : "Building momentum…"}</div>
        </div>
      </div>

      {/* Stats overview */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "New words", val: neverSeen,  color: "#7c5cfc", emoji: "🆕" },
          { label: "Struggling", val: struggling, color: "#ef4444", emoji: "💪" },
          { label: "Mastered",   val: mastered,   color: "#22c55e", emoji: "✅" },
        ].map(s => (
          <div key={s.label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 22 }}>{s.emoji}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.val}</div>
            <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Today's set info */}
      <div style={{ background: cardBg, border: `2px solid ${accent}22`, borderRadius: 18, padding: "20px", marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: text, marginBottom: 8 }}>📚 Today's set</div>
        <div style={{ fontSize: 14, color: sub, lineHeight: 1.7 }}>
          {SET_SIZE} words hand-picked by difficulty and your past mistakes.<br />
          Focus on what you actually struggle with — not random review.
        </div>
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {buildDailySet(progress).map(w => (
            <span key={w.word} style={{ background: dark ? "#383858" : "#ede9ff", color: dark ? "#c4b8ff" : accent, borderRadius: 20, padding: "4px 12px", fontSize: 14, fontWeight: 600 }}>{w.word}</span>
          ))}
        </div>
      </div>

      <button onClick={startSet} style={btn(accent, "#fff", { width: "100%", padding: "17px", fontSize: 18, borderRadius: 16 })}>
        Start today's set →
      </button>
    </div>
  );

  // ── DONE ──
  if (phase === "done") {
    const pct = Math.round((gotCount / set.length) * 100);
    const grade = pct === 100 ? "🏆 Perfect!" : pct >= 80 ? "🔥 Great work!" : pct >= 60 ? "👍 Good effort!" : "💪 Keep going!";
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{pct === 100 ? "🏆" : pct >= 80 ? "🌟" : "💪"}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: text, marginBottom: 6 }}>{grade}</div>
        <div style={{ fontSize: 16, color: sub, marginBottom: 24 }}>
          {streak.count} day streak · {gotCount}/{set.length} words nailed
        </div>

        {/* Score bar */}
        <div style={{ background: dark ? "#2a2a3e" : "#f0eeff", borderRadius: 99, height: 12, marginBottom: 24, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: 12, borderRadius: 99, background: pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444", transition: "width 1s ease" }} />
        </div>

        {/* Per-word results */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28, textAlign: "left" }}>
          {set.map(w => {
            const r = results[w.word];
            return (
              <div key={w.word} style={{ background: r === "got" ? "#dcfce7" : "#fee2e2", borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 18, fontWeight: 700, color: r === "got" ? "#15803d" : "#dc2626" }}>{w.word}</span>
                  <span style={{ fontSize: 14, color: r === "got" ? "#15803d" : "#dc2626", marginLeft: 10 }}>{w.meaning}</span>
                </div>
                <span style={{ fontSize: 20 }}>{r === "got" ? "✓" : "✗"}</span>
              </div>
            );
          })}
        </div>

        <button onClick={() => setPhase("intro")} style={btn(accent, "#fff", { width: "100%", padding: "16px", fontSize: 17 })}>
          ← Back to overview
        </button>
      </div>
    );
  }

  // ── LEARN (flashcard-style) ──
  const card = set[idx];
  const pctDone = Math.round((idx / set.length) * 100);

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      {/* Progress */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 15, color: sub }}>Word {idx + 1} of {set.length}</span>
        <span style={{ fontSize: 15, color: sub }}>✓ {gotCount} &nbsp; ✗ {missedCount}</span>
      </div>
      <div style={{ background: dark ? "#383858" : "#e8e4ff", borderRadius: 99, height: 7, marginBottom: 22 }}>
        <div style={{ width: `${pctDone}%`, height: 7, borderRadius: 99, background: accent, transition: "width 0.4s" }} />
      </div>

      {/* Card */}
      <div onClick={() => setFlipped(f => !f)}
        style={{ background: cardBg, border: `2px solid ${dark ? "#5540cc" : "#c4b5fd"}`, borderRadius: 22, minHeight: 210, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "32px 24px", cursor: "pointer", textAlign: "center", boxShadow: dark ? "0 8px 40px #00000066" : "0 8px 40px #c4b5fd44", userSelect: "none", WebkitTapHighlightColor: "transparent", transition: "box-shadow 0.2s" }}>
        {!flipped ? (
          <>
            <div style={{ fontSize: 13, color: sub, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>Do you know this word?</div>
            <div style={{ fontSize: 40, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, color: text, marginBottom: 14 }}>{card.word}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <DiffBadge d={card.difficulty} />
              <SpeakBtn text={card.word} dark={dark} />
            </div>
            <div style={{ color: sub, fontSize: 15, marginTop: 20 }}>Tap to reveal</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 28, fontWeight: 700, color: text, marginBottom: 10 }}>{card.meaning}</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <div style={{ fontStyle: "italic", color: dark ? "#c4b8ff" : accent, fontSize: 16, lineHeight: 1.6, flex: 1 }}>"{card.example}"</div>
              <SpeakBtn text={card.example} dark={dark} size="sm" />
            </div>
            <div style={{ color: sub, fontSize: 15 }}>{card.exampleTranslation}</div>
          </>
        )}
      </div>

      {/* Actions */}
      {!flipped ? (
        <button onClick={() => setFlipped(true)} style={btn(dark ? "#383858" : "#ede9ff", dark ? "#c4b8ff" : accent, { width: "100%", marginTop: 14, padding: "15px", fontSize: 17 })}>
          Reveal →
        </button>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <button onClick={() => mark("missed")} style={btn("#fee2e2", "#dc2626", { padding: "15px", fontSize: 16 })}>✗ Didn't know</button>
          <button onClick={() => mark("got")}    style={btn("#dcfce7", "#16a34a", { padding: "15px", fontSize: 16 })}>✓ Got it!</button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EXAM TIMER — dropdown panel, state lives in App so chip stays in sync
// ════════════════════════════════════════════════════════════════════════════
const PRESETS = [{ label: "30 min", seconds: 1800 }, { label: "1 hr", seconds: 3600 }, { label: "1.5 hr", seconds: 5400 }];

interface TimerProps {
  dark: boolean;
  remaining: number; setRemaining: (n: number) => void;
  running: boolean;  setRunning:   (b: boolean) => void;
  totalSecs: number; setTotalSecs: (n: number) => void;
  onClose: () => void;
}

function ExamTimer({ dark, remaining, setRemaining, running, setRunning, totalSecs, setTotalSecs, onClose }: TimerProps) {
  const [editing,    setEditing]    = useState(false);
  const [customMins, setCustomMins] = useState("30");

  const accent = "#7c5cfc", danger = "#ef4444", warning = "#f59e0b";
  const text = dark ? "#e8e8f8" : "#1a1a2e", sub = dark ? "#9898b8" : "#777";
  const cardBg = dark ? "#1e1e2e" : "#fff", border = dark ? "#383858" : "#e4e0f8";

  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) { setRunning(false); return; }
    const id = setInterval(() => setRemaining(remaining - 1), 1000);
    return () => clearInterval(id);
  }, [running, remaining]);

  const mins = Math.floor(remaining / 60), secs = remaining % 60;
  const timeStr = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  const pct = remaining / totalSecs;
  const isDanger = remaining <= 300, isWarn = remaining <= 600, done = remaining === 0;
  const timerColor = isDanger ? danger : isWarn ? warning : accent;

  function applyPreset(s: number) { setTotalSecs(s); setRemaining(s); setRunning(false); setEditing(false); }
  function applyCustom() {
    const m = parseFloat(customMins);
    if (!isNaN(m) && m > 0) applyPreset(Math.round(m * 60));
    setEditing(false);
  }

  return (
    <div style={{ background: cardBg, border: `2px solid ${done ? danger : isDanger ? danger + "99" : border}`, borderRadius: 20, overflow: "hidden", boxShadow: dark ? "0 16px 48px #00000088" : "0 16px 48px #c4b5fd55", transition: "border-color 0.3s" }}>

      {/* ── Big countdown display ── */}
      <div style={{ background: done ? danger + "18" : isDanger ? danger + "10" : isWarn ? warning + "10" : (dark ? "#13132a" : "#f4f2ff"), padding: "28px 24px 22px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: sub, textTransform: "uppercase", letterSpacing: 1.5 }}>⏱ Exam Timer</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {running && !done && <span style={{ fontSize: 11, background: timerColor + "22", color: timerColor, borderRadius: 20, padding: "2px 8px", fontWeight: 800 }}>LIVE</span>}
            {done && <span style={{ fontSize: 11, background: danger + "22", color: danger, borderRadius: 20, padding: "2px 8px", fontWeight: 800 }}>TIME'S UP</span>}
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: sub, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Giant time */}
        <div style={{
          fontSize: 72, fontWeight: 900, letterSpacing: -3, color: timerColor,
          fontVariantNumeric: "tabular-nums", lineHeight: 1,
          animation: isDanger && running && !done ? "pulse 0.9s infinite" : "none",
        }}>
          {done ? "00:00" : timeStr}
        </div>
        {done && <div style={{ fontSize: 30, marginTop: 6 }}>⏰</div>}
        {!done && (
          <div style={{ fontSize: 14, color: sub, marginTop: 10 }}>
            {isDanger ? "🔥 Final stretch!" : isWarn ? "⚡ 10 minutes left" : `${Math.ceil(remaining / 60)} min remaining`}
          </div>
        )}

        {/* Drain bar */}
        <div style={{ background: dark ? "#2a2a3e" : "#e8e4ff", borderRadius: 99, height: 6, marginTop: 18, overflow: "hidden" }}>
          <div style={{ width: `${pct * 100}%`, height: 6, borderRadius: 99, background: timerColor, transition: "width 1s linear, background 0.5s" }} />
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Start / Pause + Reset */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setRunning(!running)} disabled={done}
            style={{ flex: 2, background: running ? (dark ? "#2a2a3e" : "#fee2e2") : accent, color: running ? danger : "#fff", border: running ? `2px solid ${danger}` : "none", borderRadius: 12, padding: "13px", fontSize: 17, fontWeight: 700, cursor: done ? "not-allowed" : "pointer", opacity: done ? 0.5 : 1, transition: "all 0.2s" }}>
            {running ? "⏸ Pause" : done ? "Done" : "▶ Start"}
          </button>
          <button onClick={() => { setRemaining(totalSecs); setRunning(false); }}
            style={{ flex: 1, background: dark ? "#2a2a3e" : "#f0eeff", color: sub, border: "none", borderRadius: 12, padding: "13px", fontSize: 17, fontWeight: 600, cursor: "pointer" }}>
            ↺
          </button>
        </div>

        {/* Presets */}
        <div style={{ display: "flex", gap: 8 }}>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p.seconds)}
              style={{ flex: 1, background: totalSecs === p.seconds ? accent : (dark ? "#2a2a3e" : "#f0eeff"), color: totalSecs === p.seconds ? "#fff" : accent, border: `2px solid ${totalSecs === p.seconds ? accent : "transparent"}`, borderRadius: 10, padding: "9px 4px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom */}
        {editing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" min="1" max="300" value={customMins} onChange={e => setCustomMins(e.target.value)}
              placeholder="minutes…"
              style={{ flex: 1, background: dark ? "#2a2a3e" : "#f8f8fc", border: `1px solid ${border}`, borderRadius: 10, padding: "10px 14px", color: text, fontSize: 16, outline: "none" }} />
            <button onClick={applyCustom} style={{ background: accent, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Set</button>
            <button onClick={() => setEditing(false)} style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: sub, border: "none", borderRadius: 10, padding: "10px 12px", fontSize: 15, cursor: "pointer" }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)}
            style={{ background: "none", border: `1px dashed ${border}`, borderRadius: 10, padding: "9px", fontSize: 14, color: sub, cursor: "pointer", fontWeight: 500 }}>
            + Custom time
          </button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// APP SHELL
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState<"daily" | "list" | "flash" | "quiz" | "para" | "write">("daily");
  const [dark,       setDark]       = useState(() => { try { return localStorage.getItem("fi_dark") === "1"; } catch { return false; } });
  const [progress,   setProgress]   = useState<Progress>(loadProgress);
  // Timer state lifted here so header chip stays live even when panel is closed
  const [timerOpen,  setTimerOpen]  = useState(false);
  const [totalSecs,  setTotalSecs]  = useState(1800);
  const [remaining,  setRemaining]  = useState(1800);
  const [timerOn,    setTimerOn]    = useState(false);

  function toggleDark() { setDark(d => { localStorage.setItem("fi_dark", d ? "0" : "1"); return !d; }); }

  const bg = dark ? "#13132a" : "#f4f2ff", text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub = dark ? "#9898b8" : "#888", border = dark ? "#383858" : "#e4e0f8";
  const navBg = dark ? "#1e1e2e" : "#fff", accent = "#7c5cfc", danger = "#ef4444";

  const known     = Object.values(progress).filter(p => p.known).length;
  const practiced = Object.values(progress).filter(p => (p.right || 0) > 0).length;

  const isDanger  = remaining <= 300 && remaining > 0;
  const isWarn    = remaining <= 600 && remaining > 0;
  const timerDone = remaining === 0;
  const chipColor = timerDone ? danger : isDanger ? danger : isWarn ? "#f59e0b" : accent;
  const timerIdle = !timerOn && remaining === totalSecs;

  const tabs = [
    { id: "daily" as const, label: "Daily",  icon: <IconStar      /> },
    { id: "list"  as const, label: "Words",  icon: <IconBook      /> },
    { id: "flash" as const, label: "Cards",  icon: <IconCards     /> },
    { id: "quiz"  as const, label: "Quiz",   icon: <IconQuiz      /> },
    { id: "para"  as const, label: "Texts",  icon: <IconParagraph /> },
    { id: "write" as const, label: "Write",  icon: <IconWrite     /> },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: bg, color: text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif", transition: "background 0.2s, color 0.2s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Newsreader:ital,wght@0,600;0,700;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 18px; -webkit-text-size-adjust: 100%; }
        body { overscroll-behavior-y: contain; }
        button, select, input { font-family: inherit; }
        button:active { opacity: 0.72 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #7c5cfc44; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes dropIn { from{opacity:0;transform:translateY(-8px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
      `}</style>

      {/* ── Header ── */}
      <header style={{ background: navBg, borderBottom: `1px solid ${border}`, padding: "0 16px", position: "sticky", top: 0, zIndex: 200, boxShadow: dark ? "0 2px 16px #00000055" : "0 2px 16px #c4b5fd22" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", height: 60, gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto" }}>
            <span style={{ fontSize: 26 }}>🇫🇮</span>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: text }}>Finnish B1.1</div>
              <div style={{ fontSize: 12, color: sub }}>Vocab Trainer</div>
            </div>
          </div>

          {/* Timer pill button */}
          <button onClick={() => setTimerOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: timerOpen ? chipColor : (!timerIdle ? chipColor + "18" : (dark ? "#2a2a3e" : "#f0eeff")),
              border: `2px solid ${!timerIdle && !timerOpen ? chipColor : timerOpen ? chipColor : "transparent"}`,
              borderRadius: 22, padding: "7px 14px", cursor: "pointer",
              color: timerOpen ? "#fff" : chipColor,
              fontWeight: 700, fontSize: 15,
              WebkitTapHighlightColor: "transparent", transition: "all 0.2s",
              animation: isDanger && timerOn && !timerOpen ? "pulse 0.9s infinite" : "none",
            }}>
            <span style={{ fontSize: 16 }}>⏱</span>
            <span style={{ fontVariantNumeric: "tabular-nums", letterSpacing: -0.3, minWidth: timerIdle ? 0 : 40 }}>
              {timerIdle
                ? <span style={{ fontSize: 13, fontWeight: 600 }}>Timer</span>
                : timerDone ? "Done" : `${String(Math.floor(remaining/60)).padStart(2,"0")}:${String(remaining%60).padStart(2,"0")}`
              }
            </span>
          </button>

          <button onClick={toggleDark}
            style={{ background: dark ? "#383858" : "#ede9ff", border: "none", borderRadius: 20, padding: "8px 12px", cursor: "pointer", color: dark ? "#c4b8ff" : accent, display: "flex", alignItems: "center", WebkitTapHighlightColor: "transparent" }}>
            {dark ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </header>

      {/* ── Timer dropdown (fixed top-right, under header) ── */}
      {timerOpen && (
        <>
          {/* Backdrop */}
          <div onClick={() => setTimerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 149 }} />
          <div style={{ position: "fixed", top: 68, right: 12, zIndex: 150, width: "min(360px, calc(100vw - 24px))", animation: "dropIn 0.18s ease" }}>
            <ExamTimer
              dark={dark}
              remaining={remaining}  setRemaining={setRemaining}
              running={timerOn}      setRunning={setTimerOn}
              totalSecs={totalSecs}  setTotalSecs={setTotalSecs}
              onClose={() => setTimerOpen(false)}
            />
          </div>
        </>
      )}

      {/* ── Stats strip ── */}
      <div style={{ background: dark ? "#1a1a30" : "#eee9ff", padding: "8px 16px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", gap: 18, fontSize: 14, color: sub }}>
          <span>📚 {WORDS.length} words</span>
          <span>✅ {known} known</span>
          <span>📈 {practiced} practiced</span>
        </div>
      </div>

      {/* ── Main ── */}
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "22px 16px 110px" }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: text, marginBottom: 5 }}>
            {tab === "daily" && "Daily Set"}
            {tab === "list"  && "Vocabulary List"}
            {tab === "flash" && "Flashcards"}
            {tab === "quiz"  && "Quiz Mode"}
            {tab === "para"  && "Paragraph Practice"}
            {tab === "write" && "Writing Practice"}
          </h1>
          <p style={{ fontSize: 15, color: sub, lineHeight: 1.5 }}>
            {tab === "daily" && "10 words picked for you based on what you need most."}
            {tab === "list"  && "Tap any word to reveal its example sentence."}
            {tab === "flash" && "Known words appear less often. Tricky ones come back more."}
            {tab === "quiz"  && "Adaptive — missed words appear more until you master them."}
            {tab === "para"  && "Read, fill blanks & rebuild sentences. YKI / Omnia exam prep."}
            {tab === "write" && "Write Finnish from scratch. Exam simulation + connector feedback."}
          </p>
        </div>
        {tab === "daily" && <DailySet   progress={progress} setProgress={setProgress} dark={dark} />}
        {tab === "list"  && <VocabList  progress={progress} dark={dark} />}
        {tab === "flash" && <Flashcards key="flash" progress={progress} setProgress={setProgress} dark={dark} />}
        {tab === "quiz"  && <Quiz       progress={progress} setProgress={setProgress} dark={dark} />}
        {tab === "para"  && <Paragraphs dark={dark} />}
        {tab === "write" && <Writing    dark={dark} />}
      </main>

      {/* ── Bottom nav ── */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: navBg, borderTop: `1px solid ${border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", boxShadow: dark ? "0 -2px 20px #00000055" : "0 -2px 20px #c4b5fd22" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, background: "none", border: "none", borderTop: tab === t.id ? `3px solid ${accent}` : "3px solid transparent", padding: "12px 8px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, color: tab === t.id ? accent : sub, fontWeight: tab === t.id ? 700 : 500, fontSize: 13, cursor: "pointer", transition: "color 0.15s", WebkitTapHighlightColor: "transparent" }}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}