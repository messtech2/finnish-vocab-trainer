import { useState, useCallback, useMemo, useEffect } from "react";
import vocabData from "./vocab.json";

// ── Types ────────────────────────────────────────────────────────────────────
interface Word {
  word: string;
  meaning: string;
  example: string;
  exampleTranslation: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
}
interface WordProgress { known?: boolean; right?: number; wrong?: number; }
type Progress = Record<string, WordProgress>;

const WORDS: Word[] = vocabData as Word[];
const PAGE_SIZE = 10;

// ── LocalStorage ─────────────────────────────────────────────────────────────
const LS_KEY = "fi_vocab_v1";
function loadProgress(): Progress { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } }
function saveProgress(p: Progress) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {} }

// ── Weighted shuffle ──────────────────────────────────────────────────────────
function weightedShuffle(words: Word[], progress: Progress): Word[] {
  const scored = words.map(w => {
    const p = progress[w.word] || {};
    let weight = 1;
    if (p.known) weight *= 0.3;
    const wrong = p.wrong || 0; const right = p.right || 0; const total = wrong + right;
    if (total > 0) weight *= (1 + (wrong / total) * 3);
    return { word: w, weight };
  });
  const result: Word[] = []; const pool = [...scored];
  while (pool.length) {
    const totalW = pool.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * totalW;
    for (let i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) { result.push(pool[i].word); pool.splice(i, 1); break; } }
  }
  return result;
}

// ── Shared button style ───────────────────────────────────────────────────────
function btn(bg: string, color: string, extra?: React.CSSProperties): React.CSSProperties {
  return { background: bg, color, border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer", transition: "opacity 0.15s", touchAction: "manipulation", WebkitTapHighlightColor: "transparent", ...extra };
}

// ── DiffBadge ─────────────────────────────────────────────────────────────────
function DiffBadge({ d }: { d: string }) {
  const map: Record<string, string> = { easy: "#22c55e", medium: "#f59e0b", hard: "#ef4444" };
  return <span style={{ background: map[d] || "#888", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, whiteSpace: "nowrap" }}>{d}</span>;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconBook  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
const IconCards = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
const IconQuiz  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IconSun   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
const IconMoon  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;

// ════════════════════════════════════════════════════════════════════════════
// VOCABULARY LIST  (with pagination)
// ════════════════════════════════════════════════════════════════════════════
function VocabList({ progress, dark }: { progress: Progress; dark: boolean }) {
  const [filterCat,  setFilterCat]  = useState("all");
  const [filterDiff, setFilterDiff] = useState("all");
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [page,       setPage]       = useState(1);

  const cats = useMemo(() => ["all", ...Array.from(new Set(WORDS.map(w => w.category)))], []);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); setExpanded(null); }, [search, filterCat, filterDiff]);

  const filtered = useMemo(() => WORDS.filter(w =>
    (filterCat  === "all" || w.category   === filterCat) &&
    (filterDiff === "all" || w.difficulty === filterDiff) &&
    (w.word.toLowerCase().includes(search.toLowerCase()) ||
     w.meaning.toLowerCase().includes(search.toLowerCase()))
  ), [search, filterCat, filterDiff]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const bg     = dark ? "#1e1e2e" : "#fff";
  const rowBg  = dark ? "#2a2a3e" : "#f8f8fc";
  const border = dark ? "#383858" : "#e8e8f0";
  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#666";
  const pillBg = dark ? "#383858" : "#ede9ff";
  const accent = "#7c5cfc";

  function goPage(n: number) {
    setPage(n);
    setExpanded(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Build page number list with ellipsis
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce<(number | "…")[]>((acc, n, idx, arr) => {
      if (idx > 0 && (n as number) - (arr[idx - 1] as number) > 1) acc.push("…");
      acc.push(n); return acc;
    }, []);

  return (
    <div>
      {/* ── Search & filter ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search words or meanings…"
          style={{ background: rowBg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 14px", color: text, fontSize: 15, outline: "none", width: "100%" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ background: rowBg, border: `1px solid ${border}`, borderRadius: 10, padding: "10px", color: text, fontSize: 14, flex: 1 }}>
            {cats.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={filterDiff} onChange={e => setFilterDiff(e.target.value)}
            style={{ background: rowBg, border: `1px solid ${border}`, borderRadius: 10, padding: "10px", color: text, fontSize: 14, flex: 1 }}>
            {["all", "easy", "medium", "hard"].map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: sub }}>
          {filtered.length} word{filtered.length !== 1 ? "s" : ""} · page {page} of {totalPages}
        </div>
      </div>

      {/* ── Word rows ── */}
      <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${border}` }}>
        {paginated.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: sub, fontSize: 14 }}>
            No words match your filters.
          </div>
        )}
        {paginated.map((w, i) => {
          const p      = progress[w.word] || {};
          const isExp  = expanded === w.word;
          return (
            <div key={w.word}
              onClick={() => setExpanded(isExp ? null : w.word)}
              style={{
                background: i % 2 === 0 ? bg : rowBg,
                borderBottom: i < paginated.length - 1 ? `1px solid ${border}` : "none",
                padding: "14px 16px", cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                {/* Left: word + meaning */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 18, fontWeight: 700, color: text }}>{w.word}</span>
                    {p.known && <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ color: sub, fontSize: 14, lineHeight: 1.4 }}>{w.meaning}</div>
                </div>
                {/* Right: badges */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                  <DiffBadge d={w.difficulty} />
                  <span style={{ background: pillBg, color: dark ? "#c4b8ff" : accent, borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>{w.category}</span>
                </div>
              </div>
              {/* Expanded example */}
              {isExp && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${border}` }}>
                  <div style={{ fontStyle: "italic", color: text, fontSize: 14, lineHeight: 1.6, marginBottom: 4 }}>"{w.example}"</div>
                  <div style={{ color: sub, fontSize: 13 }}>{w.exampleTranslation}</div>
                  {(p.wrong || 0) > 0 && <div style={{ marginTop: 6, fontSize: 12, color: "#ef4444" }}>Missed {p.wrong}× in quiz</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Pagination controls ── */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, flexWrap: "wrap" }}>
          <button
            onClick={() => goPage(page - 1)}
            disabled={page === 1}
            style={btn(dark ? "#2a2a3e" : "#ede9ff", dark ? "#9898b8" : accent, { padding: "10px 18px", fontSize: 20, lineHeight: 1, opacity: page === 1 ? 0.3 : 1 })}>
            ‹
          </button>

          {pageNumbers.map((n, i) =>
            n === "…"
              ? <span key={`e${i}`} style={{ color: sub, padding: "0 2px", fontSize: 16 }}>…</span>
              : <button key={n} onClick={() => goPage(n as number)}
                  style={btn(
                    page === n ? accent : (dark ? "#2a2a3e" : "#ede9ff"),
                    page === n ? "#fff"  : (dark ? "#c4b8ff" : accent),
                    { padding: "10px 0", minWidth: 42, fontSize: 14 }
                  )}>
                  {n}
                </button>
          )}

          <button
            onClick={() => goPage(page + 1)}
            disabled={page === totalPages}
            style={btn(dark ? "#2a2a3e" : "#ede9ff", dark ? "#9898b8" : accent, { padding: "10px 18px", fontSize: 20, lineHeight: 1, opacity: page === totalPages ? 0.3 : 1 })}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FLASHCARDS
// ════════════════════════════════════════════════════════════════════════════
function Flashcards({ progress, setProgress, dark }: { progress: Progress; setProgress: (p: Progress) => void; dark: boolean }) {
  const deck   = useMemo(() => weightedShuffle(WORDS, progress), []);
  const [idx,     setIdx]     = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done,    setDone]    = useState(false);

  const card  = deck[idx];
  const p     = progress[card?.word] || {};
  const known = WORDS.filter(w => (progress[w.word] || {}).known).length;

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const accent = "#7c5cfc";

  function markKnown(val: boolean) {
    const newP = { ...progress, [card.word]: { ...p, known: val } };
    setProgress(newP); saveProgress(newP); next();
  }
  function next() {
    setFlipped(false);
    if (idx + 1 >= deck.length) { setDone(true); return; }
    setIdx(i => i + 1);
  }

  if (done) return (
    <div style={{ textAlign: "center", padding: "60px 16px" }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>🎉</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: text, marginBottom: 8 }}>Session complete!</div>
      <div style={{ color: sub, marginBottom: 32 }}>{known} / {WORDS.length} words marked as known</div>
      <button onClick={() => window.location.reload()} style={btn(accent, "#fff", { width: "100%", padding: "15px" })}>Start new session</button>
    </div>
  );

  const pct = Math.round((idx / deck.length) * 100);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: sub }}>{idx + 1} / {deck.length}</span>
        <span style={{ fontSize: 13, color: sub }}>✓ {known} known</span>
      </div>
      <div style={{ background: dark ? "#383858" : "#e8e4ff", borderRadius: 99, height: 6, marginBottom: 22 }}>
        <div style={{ width: `${pct}%`, height: 6, borderRadius: 99, background: accent, transition: "width 0.3s" }} />
      </div>

      {/* Flip card */}
      <div onClick={() => setFlipped(f => !f)}
        style={{ background: dark ? "#2a2a3e" : "#fff", border: `2px solid ${dark ? "#5540cc" : "#c4b5fd"}`, borderRadius: 22, minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "36px 24px", cursor: "pointer", textAlign: "center", boxShadow: dark ? "0 8px 40px #00000066" : "0 8px 40px #c4b5fd44", userSelect: "none", WebkitTapHighlightColor: "transparent" }}>
        {!flipped ? (
          <>
            <div style={{ fontSize: 34, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, color: text, marginBottom: 14 }}>{card.word}</div>
            <DiffBadge d={card.difficulty} />
            <div style={{ color: sub, fontSize: 13, marginTop: 18 }}>Tap to reveal</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, color: text, marginBottom: 12 }}>{card.meaning}</div>
            <div style={{ fontStyle: "italic", color: dark ? "#c4b8ff" : accent, fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>"{card.example}"</div>
            <div style={{ color: sub, fontSize: 13 }}>{card.exampleTranslation}</div>
          </>
        )}
      </div>

      {/* 2×2 action grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
        <button onClick={() => markKnown(false)} style={btn("#fee2e2", "#dc2626", { padding: "14px", fontSize: 15 })}>✗ Still learning</button>
        <button onClick={() => markKnown(true)}  style={btn("#dcfce7", "#16a34a", { padding: "14px", fontSize: 15 })}>✓ Know it!</button>
        <button onClick={() => setFlipped(f => !f)} style={btn(dark ? "#383858" : "#ede9ff", dark ? "#c4b8ff" : accent, { padding: "12px" })}>
          {flipped ? "Hide" : "Flip"}
        </button>
        <button onClick={next} style={btn(dark ? "#2a2a3e" : "#f0eff8", dark ? "#9898b8" : "#555", { padding: "12px" })}>Skip →</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// QUIZ
// ════════════════════════════════════════════════════════════════════════════
function Quiz({ progress, setProgress, dark }: { progress: Progress; setProgress: (p: Progress) => void; dark: boolean }) {
  const [current,  setCurrent]  = useState<Word | null>(null);
  const [options,  setOptions]  = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [score,    setScore]    = useState({ right: 0, wrong: 0 });
  const [streak,   setStreak]   = useState(0);

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#2a2a3e" : "#f8f8fc";
  const border = dark ? "#383858" : "#e0ddf8";
  const accent = "#7c5cfc";

  const pickQuestion = useCallback(() => {
    const pool  = weightedShuffle(WORDS, progress);
    const q     = pool[0];
    const wrong = WORDS.filter(w => w.word !== q.word).sort(() => Math.random() - 0.5).slice(0, 3);
    const opts  = [...wrong.map(w => w.meaning), q.meaning].sort(() => Math.random() - 0.5);
    setCurrent(q); setOptions(opts); setSelected(null);
  }, [progress]);

  useState(() => { pickQuestion(); });

  function answer(opt: string) {
    if (selected !== null || !current) return;
    setSelected(opt);
    const correct = opt === current.meaning;
    const p       = progress[current.word] || {};
    const newP    = { ...progress, [current.word]: { ...p, right: (p.right || 0) + (correct ? 1 : 0), wrong: (p.wrong || 0) + (correct ? 0 : 1) } };
    setProgress(newP); saveProgress(newP);
    if (correct) { setScore(s => ({ ...s, right: s.right + 1 })); setStreak(s => s + 1); }
    else         { setScore(s => ({ ...s, wrong: s.wrong + 1 }));  setStreak(0); }
  }

  if (!current) return <div style={{ textAlign: "center", padding: 40, color: sub }}>Loading…</div>;

  const total = score.right + score.wrong;
  const pct   = total > 0 ? Math.round((score.right / total) * 100) : 0;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
        {[
          { label: "Correct",   val: score.right, color: "#22c55e" },
          { label: "Wrong",     val: score.wrong,  color: "#ef4444" },
          { label: "Accuracy",  val: `${pct}%`,    color: accent },
          { label: "🔥 Streak", val: streak,        color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "10px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 10, color: sub, marginTop: 2, lineHeight: 1.2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Question */}
      <div style={{ background: dark ? "#2a2a3e" : "#fff", border: `2px solid ${dark ? "#5540cc" : "#c4b5fd"}`, borderRadius: 20, padding: "28px 20px", textAlign: "center", marginBottom: 14, boxShadow: dark ? "0 4px 24px #00000055" : "0 4px 24px #c4b5fd33" }}>
        <div style={{ fontSize: 12, color: sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>What does this mean?</div>
        <div style={{ fontSize: 32, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 700, color: text, marginBottom: 10 }}>{current.word}</div>
        <DiffBadge d={current.difficulty} />
      </div>

      {/* Options — large tap targets */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {options.map(opt => {
          const isCorrect  = opt === current.meaning;
          const isSelected = opt === selected;
          let obg = dark ? "#2a2a3e" : "#fff";
          let bc  = dark ? "#383858" : "#ddd8f8";
          let tc  = text;
          if (selected !== null) {
            if (isCorrect)           { obg = "#dcfce7"; bc = "#22c55e"; tc = "#15803d"; }
            else if (isSelected)     { obg = "#fee2e2"; bc = "#ef4444"; tc = "#dc2626"; }
          }
          return (
            <button key={opt} onClick={() => answer(opt)}
              style={{ background: obg, border: `2px solid ${bc}`, borderRadius: 14, padding: "16px 18px", fontSize: 15, color: tc, cursor: selected ? "default" : "pointer", textAlign: "left", transition: "all 0.15s", fontWeight: (isSelected || (selected !== null && isCorrect)) ? 700 : 400, WebkitTapHighlightColor: "transparent" }}>
              {opt}
              {selected !== null && isCorrect  && "  ✓"}
              {selected !== null && isSelected && !isCorrect && "  ✗"}
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <div style={{ textAlign: "center" }}>
          <div style={{ color: sub, fontSize: 13, marginBottom: 14, fontStyle: "italic", lineHeight: 1.6 }}>
            "{current.example}"<br />{current.exampleTranslation}
          </div>
          <button onClick={pickQuestion} style={btn(accent, "#fff", { width: "100%", padding: "15px", fontSize: 16 })}>
            Next question →
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// APP SHELL
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab,      setTab]      = useState<"list" | "flash" | "quiz">("list");
  const [dark,     setDark]     = useState(() => { try { return localStorage.getItem("fi_dark") === "1"; } catch { return false; } });
  const [progress, setProgress] = useState<Progress>(loadProgress);

  function toggleDark() { setDark(d => { localStorage.setItem("fi_dark", d ? "0" : "1"); return !d; }); }

  const bg     = dark ? "#13132a" : "#f4f2ff";
  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#888";
  const border = dark ? "#383858" : "#e4e0f8";
  const navBg  = dark ? "#1e1e2e" : "#fff";
  const accent = "#7c5cfc";

  const known     = Object.values(progress).filter(p => p.known).length;
  const practiced = Object.values(progress).filter(p => (p.right || 0) > 0).length;

  const tabs = [
    { id: "list"  as const, label: "Words", icon: <IconBook  /> },
    { id: "flash" as const, label: "Cards", icon: <IconCards /> },
    { id: "quiz"  as const, label: "Quiz",  icon: <IconQuiz  /> },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: bg, color: text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif", transition: "background 0.2s, color 0.2s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Newsreader:ital,wght@0,600;0,700;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 16px; -webkit-text-size-adjust: 100%; }
        body { overscroll-behavior-y: contain; }
        button, select, input { font-family: inherit; }
        button:active { opacity: 0.72 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #7c5cfc44; border-radius: 2px; }
      `}</style>

      {/* ── Top bar ── */}
      <header style={{ background: navBg, borderBottom: `1px solid ${border}`, padding: "0 16px", position: "sticky", top: 0, zIndex: 100, boxShadow: dark ? "0 2px 16px #00000055" : "0 2px 16px #c4b5fd22" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto" }}>
            <span style={{ fontSize: 24 }}>🇫🇮</span>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: text }}>Finnish B1.1</div>
              <div style={{ fontSize: 11, color: sub }}>Vocab Trainer</div>
            </div>
          </div>
          <button onClick={toggleDark}
            style={{ background: dark ? "#383858" : "#ede9ff", border: "none", borderRadius: 20, padding: "7px 12px", cursor: "pointer", color: dark ? "#c4b8ff" : accent, display: "flex", alignItems: "center", WebkitTapHighlightColor: "transparent" }}>
            {dark ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </header>

      {/* ── Stats strip ── */}
      <div style={{ background: dark ? "#1a1a30" : "#eee9ff", padding: "7px 16px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", gap: 16, fontSize: 12, color: sub }}>
          <span>📚 {WORDS.length} words</span>
          <span>✅ {known} known</span>
          <span>📈 {practiced} practiced</span>
        </div>
      </div>

      {/* ── Page content ── */}
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 100px" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: text, marginBottom: 4 }}>
            {tab === "list"  && "Vocabulary List"}
            {tab === "flash" && "Flashcards"}
            {tab === "quiz"  && "Quiz Mode"}
          </h1>
          <p style={{ fontSize: 13, color: sub, lineHeight: 1.5 }}>
            {tab === "list"  && "Tap any word to reveal its example sentence."}
            {tab === "flash" && "Known words appear less often. Tricky ones come back more."}
            {tab === "quiz"  && "Adaptive — missed words appear more until you master them."}
          </p>
        </div>

        {tab === "list"  && <VocabList  progress={progress} dark={dark} />}
        {tab === "flash" && <Flashcards key="flash" progress={progress} setProgress={setProgress} dark={dark} />}
        {tab === "quiz"  && <Quiz       progress={progress} setProgress={setProgress} dark={dark} />}
      </main>

      {/* ── Bottom navigation ── */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: navBg, borderTop: `1px solid ${border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", boxShadow: dark ? "0 -2px 20px #00000055" : "0 -2px 20px #c4b5fd22" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, background: "none", border: "none", borderTop: tab === t.id ? `2px solid ${accent}` : "2px solid transparent", padding: "10px 8px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: tab === t.id ? accent : sub, fontWeight: tab === t.id ? 700 : 500, fontSize: 11, cursor: "pointer", transition: "color 0.15s", WebkitTapHighlightColor: "transparent" }}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
