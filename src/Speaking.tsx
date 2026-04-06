import { useState, useRef, useEffect } from "react";
import dialogueData from "./dialogues.json";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface DialogueLine {
  speaker: string;
  line: string;
  type: "fixed" | "user_input";
  hint?: string;
}

export interface Dialogue {
  id: string;
  title: string;
  category: string;
  difficulty: "A2" | "B1" | "B2";
  userRole: string;
  otherRole: string;
  description: string;
  dialogue: DialogueLine[];
}

type Mode = "read" | "roleplay" | "active";

interface SessionState {
  dialogueId: string;
  mode: Mode;
  responses: Record<number, string>; // lineIndex → user text
  completed: boolean;
  timestamp: number;
}

interface SpeakingProgress {
  sessions: SessionState[];
  completedIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA & STORAGE
// ─────────────────────────────────────────────────────────────────────────────
const DIALOGUES: Dialogue[] = dialogueData as Dialogue[];
const LS_KEY = "fi_speaking_v1";

function loadProgress(): SpeakingProgress {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null") ?? { sessions: [], completedIds: [] }; }
  catch { return { sessions: [], completedIds: [] }; }
}
function saveProgress(p: SpeakingProgress) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const DIFF_COLOR: Record<string, string> = { A2: "#22c55e", B1: "#f59e0b", B2: "#ef4444" };
const CAT_EMOJI: Record<string, string>  = { work: "💼", education: "🎓", daily_life: "🏠", health: "🏥", exam: "📝" };

function speak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const fi = voices.find(v => /female|nainen|satu|aino|anna|heidi/i.test(v.name) && v.lang.startsWith("fi"))
    || voices.find(v => v.lang.startsWith("fi"));
  if (fi) u.voice = fi;
  u.lang = "fi-FI"; u.rate = 0.82; u.pitch = 1.08;
  window.speechSynthesis.speak(u);
}

// ─────────────────────────────────────────────────────────────────────────────
// DIALOGUE LIST (home screen)
// ─────────────────────────────────────────────────────────────────────────────
function DialogueList({ dark, progress, onSelect }: {
  dark: boolean;
  progress: SpeakingProgress;
  onSelect: (d: Dialogue) => void;
}) {
  const [filterCat, setFilterCat] = useState("all");
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  const cats = ["all", ...Array.from(new Set(DIALOGUES.map(d => d.category)))];
  const filtered = DIALOGUES.filter(d => filterCat === "all" || d.category === filterCat);
  const totalInputs = (d: Dialogue) => d.dialogue.filter(l => l.type === "user_input").length;

  return (
    <div>
      {/* Stats banner */}
      <div style={{ background: dark ? "#1e1e2e" : "#f0eeff", border: `1px solid ${border}`, borderRadius: 14, padding: "12px 16px", marginBottom: 18, display: "flex", gap: 20 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: accent }}>{progress.completedIds.length}</div>
          <div style={{ fontSize: 11, color: sub }}>Completed</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>{DIALOGUES.length}</div>
          <div style={{ fontSize: 11, color: sub }}>Dialogues</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#f59e0b" }}>{progress.sessions.length}</div>
          <div style={{ fontSize: 11, color: sub }}>Sessions</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: sub, display: "flex", alignItems: "center" }}>
          3 modes ·<br />add via JSON
        </div>
      </div>

      {/* Mode legend */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>3 practice modes</div>
        {[
          { emoji: "🟢", label: "Read", desc: "Follow the full script step by step" },
          { emoji: "🟡", label: "Role Play", desc: "You respond — app plays the other role" },
          { emoji: "🔴", label: "Active", desc: "Type your lines, see hints on demand" },
        ].map(m => (
          <div key={m.label} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 14 }}>{m.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: text, minWidth: 70 }}>{m.label}</span>
            <span style={{ fontSize: 13, color: sub }}>{m.desc}</span>
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {cats.map(c => (
          <button key={c} onClick={() => setFilterCat(c)}
            style={{ background: filterCat === c ? accent : (dark ? "#383858" : "#f0eeff"), color: filterCat === c ? "#fff" : accent, border: "none", borderRadius: 20, padding: "5px 13px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {CAT_EMOJI[c] ?? "📂"} {c === "all" ? "All" : c.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Dialogue cards */}
      {filtered.map(d => {
        const done = progress.completedIds.includes(d.id);
        const sessions = progress.sessions.filter(s => s.dialogueId === d.id);
        return (
          <div key={d.id} style={{ background: bg, border: `1px solid ${done ? "#22c55e66" : border}`, borderRadius: 16, padding: "16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: text }}>{CAT_EMOJI[d.category]} {d.title}</span>
                  {done && <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>✓ Done</span>}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ background: DIFF_COLOR[d.difficulty]+"22", color: DIFF_COLOR[d.difficulty], borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 700 }}>{d.difficulty}</span>
                  <span style={{ fontSize: 12, color: sub }}>{d.dialogue.length} lines · {totalInputs(d)} your turns</span>
                  {sessions.length > 0 && <span style={{ fontSize: 12, color: accent }}>Played {sessions.length}×</span>}
                </div>
                <div style={{ fontSize: 13, color: sub, lineHeight: 1.4 }}>{d.description}</div>
              </div>
            </div>
            <button onClick={() => onSelect(d)}
              style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
              Start →
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE SELECTOR
// ─────────────────────────────────────────────────────────────────────────────
function ModeSwitcher({ mode, onChange, dark }: { mode: Mode; onChange: (m: Mode) => void; dark: boolean }) {
  const accent = "#7c5cfc";
  const modes: { id: Mode; emoji: string; label: string; desc: string }[] = [
    { id: "read",     emoji: "🟢", label: "Read",      desc: "Full script" },
    { id: "roleplay", emoji: "🟡", label: "Role Play", desc: "You respond" },
    { id: "active",   emoji: "🔴", label: "Active",    desc: "Type + hints" },
  ];
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {modes.map(m => (
        <button key={m.id} onClick={() => onChange(m.id)}
          style={{
            flex: 1, background: mode === m.id ? accent : (dark ? "#2a2a3e" : "#f0eeff"),
            color: mode === m.id ? "#fff" : accent,
            border: `2px solid ${mode === m.id ? accent : "transparent"}`,
            borderRadius: 12, padding: "8px 4px",
            cursor: "pointer", textAlign: "center",
          }}>
          <div style={{ fontSize: 16 }}>{m.emoji}</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{m.label}</div>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE DIALOGUE LINE BUBBLE
// ─────────────────────────────────────────────────────────────────────────────
function LineBubble({ line, isUser, dark, onSpeak }: {
  line: DialogueLine; isUser: boolean; dark: boolean; onSpeak?: () => void;
}) {
  const accent = "#7c5cfc";
  const bg     = isUser
    ? (dark ? "#3a2a5e" : "#ede9ff")
    : (dark ? "#2a2a3e" : "#f0f0f8");
  const textColor = dark ? "#e8e8f8" : "#1a1a2e";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: dark ? "#9898b8" : "#888", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {line.speaker}
      </div>
      <div style={{ background: bg, borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding: "13px 16px", maxWidth: "85%", position: "relative" }}>
        <p style={{ fontSize: 18, color: textColor, lineHeight: 1.65, margin: 0 }}>{line.line}</p>
        {line.line && onSpeak && (
          <button onClick={onSpeak}
            style={{ position: "absolute", bottom: -10, right: isUser ? "auto" : 8, left: isUser ? 8 : "auto", background: dark ? "#1e1e2e" : "#fff", border: `1px solid ${accent}33`, borderRadius: 20, padding: "3px 10px", fontSize: 13, color: accent, cursor: "pointer" }}>
            🔊
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USER INPUT BOX
// ─────────────────────────────────────────────────────────────────────────────
function UserInputBox({ line, lineIdx, response, onResponse, onSubmit, mode, dark }: {
  line: DialogueLine;
  lineIdx: number;
  response: string;
  onResponse: (text: string) => void;
  onSubmit: () => void;
  mode: Mode;
  dark: boolean;
}) {
  const [showHint, setShowHint] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accent = "#7c5cfc";
  const sub    = dark ? "#9898b8" : "#777";
  const border = dark ? "#383858" : "#e4e0f8";

  useEffect(() => { textareaRef.current?.focus(); }, [lineIdx]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && response.trim()) onSubmit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [response]);

  const wc = response.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div style={{ background: dark ? "#1e1e2e" : "#f4f2ff", border: `2px solid ${accent}`, borderRadius: 18, padding: "14px 16px", marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        ✍️ Your turn — {line.speaker}
      </div>

      {/* Hint toggle */}
      {line.hint && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={() => setShowHint(h => !h)}
            style={{ background: "none", border: `1px dashed ${border}`, borderRadius: 8, padding: "5px 12px", fontSize: 13, color: sub, cursor: "pointer" }}>
            {showHint ? "▲ Hide hint" : "💡 Show hint"}
          </button>
          {showHint && (
            <div style={{ marginTop: 8, fontSize: 14, color: accent, background: accent+"12", borderRadius: 8, padding: "8px 12px", lineHeight: 1.5 }}>
              {line.hint}
            </div>
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={response}
        onChange={e => onResponse(e.target.value)}
        placeholder="Kirjoita vastauksesi... (Ctrl+↵ to continue)"
        style={{
          width: "100%", minHeight: mode === "active" ? 100 : 80,
          background: dark ? "#2a2a3e" : "#fff",
          color: dark ? "#e8e8f8" : "#1a1a2e",
          border: "none", borderRadius: 12,
          padding: "12px", fontSize: 17, lineHeight: 1.7,
          outline: "none", resize: "vertical", fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <span style={{ fontSize: 12, color: sub }}>{wc} word{wc !== 1 ? "s" : ""}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { speak(response); }}
            disabled={!response.trim()}
            style={{ background: dark ? "#2a2a3e" : "#ede9ff", color: accent, border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 14, cursor: response.trim() ? "pointer" : "default", opacity: response.trim() ? 1 : 0.4 }}>
            🔊 Hear it
          </button>
          <button onClick={onSubmit} disabled={!response.trim()}
            style={{ background: response.trim() ? accent : (dark ? "#383858" : "#e4e0f8"), color: response.trim() ? "#fff" : sub, border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 15, fontWeight: 700, cursor: response.trim() ? "pointer" : "default", transition: "all 0.2s" }}>
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIALOGUE PLAYER
// ─────────────────────────────────────────────────────────────────────────────
function DialoguePlayer({ dialogue, mode, dark, onFinish }: {
  dialogue: Dialogue;
  mode: Mode;
  dark: boolean;
  onFinish: (responses: Record<number, string>) => void;
}) {
  const [step, setStep]         = useState(0);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [draftResp, setDraftResp] = useState("");
  const [autoPlay,  setAutoPlay]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const text   = dark ? "#e8e8f8" : "#1a1a2e";
  const sub    = dark ? "#9898b8" : "#777";
  const bg     = dark ? "#1e1e2e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";

  const lines    = dialogue.dialogue;
  const current  = lines[step];
  const isLast   = step === lines.length - 1;
  const pct      = Math.round(((step + 1) / lines.length) * 100);
  const isUserLine = current?.type === "user_input";
  const userIsThisSpeaker = current?.speaker === dialogue.userRole;

  // In roleplay mode: show OTHER speaker's lines as fixed, user lines as input
  // In read mode: show everything as fixed (no input required)
  // In active mode: user_input lines always require input

  const requiresInput =
    current?.type === "user_input" &&
    (mode === "active" || mode === "roleplay");

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [step]);

  // Auto-read fixed lines in roleplay
  useEffect(() => {
    if (autoPlay && current && !requiresInput && current.line) {
      speak(current.line);
    }
  }, [step, autoPlay]);

  function advance() {
    if (isLast) { onFinish(responses); return; }
    setStep(s => s + 1);
    setDraftResp("");
  }

  function submitResponse() {
    if (!draftResp.trim()) return;
    setResponses(r => ({ ...r, [step]: draftResp }));
    advance();
  }

  function goBack() {
    if (step === 0) return;
    setStep(s => s - 1);
    setDraftResp(responses[step - 1] ?? "");
  }

  // Lines to show (history up to current step)
  const shownLines = lines.slice(0, step + 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Progress bar + controls */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: sub }}>Step {step + 1} / {lines.length}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setAutoPlay(a => !a)}
              style={{ background: autoPlay ? accent : (dark ? "#383858" : "#f0eeff"), color: autoPlay ? "#fff" : accent, border: "none", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {autoPlay ? "🔊 Auto-read on" : "🔊 Auto-read"}
            </button>
          </div>
        </div>
        <div style={{ background: dark ? "#383858" : "#e4e0f8", borderRadius: 99, height: 5, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: 5, background: accent, borderRadius: 99, transition: "width 0.3s" }} />
        </div>
      </div>

      {/* Roles legend */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, fontSize: 12, color: sub }}>
        <span style={{ background: dark ? "#3a2a5e" : "#ede9ff", borderRadius: 20, padding: "3px 10px", color: accent, fontWeight: 700 }}>You: {dialogue.userRole}</span>
        <span style={{ background: dark ? "#2a2a3e" : "#f0f0f8", borderRadius: 20, padding: "3px 10px", fontWeight: 700 }}>Them: {dialogue.otherRole}</span>
      </div>

      {/* Chat bubbles — history */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {shownLines.map((line, i) => {
          const isUserSpkr = line.speaker === dialogue.userRole;
          const isCurrentStep = i === step;

          // Skip current step if it requires input (show input box instead)
          if (isCurrentStep && requiresInput) return null;

          // In roleplay: skip other-speaker lines that are user_input (shouldn't happen but safety)
          const displayLine = line.type === "user_input" && responses[i]
            ? { ...line, line: responses[i] }
            : line;

          if (line.type === "user_input" && !responses[i] && !isCurrentStep) {
            // Skipped input in read mode
            return null;
          }

          return (
            <LineBubble
              key={i}
              line={displayLine}
              isUser={isUserSpkr}
              dark={dark}
              onSpeak={displayLine.line ? () => speak(displayLine.line) : undefined}
            />
          );
        })}
      </div>

      {/* Current step: input or advance button */}
      {requiresInput ? (
        <UserInputBox
          line={current}
          lineIdx={step}
          response={draftResp}
          onResponse={setDraftResp}
          onSubmit={submitResponse}
          mode={mode}
          dark={dark}
        />
      ) : (
        current && (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {step > 0 && (
              <button onClick={goBack}
                style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: sub, border: "none", borderRadius: 12, padding: "12px 16px", fontSize: 15, cursor: "pointer" }}>
                ← Back
              </button>
            )}
            <button onClick={advance}
              style={{ flex: 1, background: accent, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
              {isLast ? "Finish ✓" : "Next →"}
            </button>
          </div>
        )
      )}

      {step > 0 && !requiresInput && (
        <button onClick={goBack}
          style={{ background: "none", border: "none", color: sub, fontSize: 13, cursor: "pointer", marginTop: 8, textAlign: "left", padding: 0 }}>
          ← Go back
        </button>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETION SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function CompletionScreen({ dialogue, mode, responses, dark, onReplay, onHome }: {
  dialogue: Dialogue;
  mode: Mode;
  responses: Record<number, string>;
  dark: boolean;
  onReplay: () => void;
  onHome: () => void;
}) {
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  const userLines = dialogue.dialogue.map((l, i) => ({ ...l, idx: i })).filter(l => l.type === "user_input");
  const answered = userLines.filter(l => responses[l.idx]?.trim());

  return (
    <div>
      <div style={{ textAlign: "center", padding: "24px 0 20px" }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🎉</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: text, marginBottom: 6 }}>Dialogue complete!</div>
        <div style={{ fontSize: 15, color: sub }}>
          {dialogue.title} · {mode === "read" ? "Read" : mode === "roleplay" ? "Role Play" : "Active"} mode
        </div>
        {mode !== "read" && (
          <div style={{ marginTop: 10, fontSize: 15, color: "#22c55e", fontWeight: 700 }}>
            {answered.length} / {userLines.length} turns answered
          </div>
        )}
      </div>

      {/* Review your responses */}
      {mode !== "read" && answered.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Your responses</div>
          {userLines.map(l => {
            const resp = responses[l.idx];
            if (!resp) return null;
            // The previous fixed line (the prompt)
            const prevLine = l.idx > 0 ? dialogue.dialogue[l.idx - 1] : null;
            return (
              <div key={l.idx} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "13px 15px", marginBottom: 8 }}>
                {prevLine && <div style={{ fontSize: 13, color: sub, fontStyle: "italic", marginBottom: 6 }}>"{prevLine.line}"</div>}
                <div style={{ fontSize: 16, color: text, lineHeight: 1.6, marginBottom: 4 }}>{resp}</div>
                <button onClick={() => speak(resp)}
                  style={{ background: "none", border: "none", color: accent, fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 700 }}>
                  🔊 Hear it
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Full dialogue review toggle */}
      <FullDialogueReview dialogue={dialogue} responses={responses} dark={dark} />

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={onReplay}
          style={{ flex: 1, background: dark ? "#2a2a3e" : "#f0eeff", color: accent, border: "none", borderRadius: 14, padding: "14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          Play again
        </button>
        <button onClick={onHome}
          style={{ flex: 1, background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          All dialogues
        </button>
      </div>
    </div>
  );
}

function FullDialogueReview({ dialogue, responses, dark }: {
  dialogue: Dialogue; responses: Record<number, string>; dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const bg   = dark ? "#2a2a3e" : "#fff";
  const border = dark ? "#383858" : "#e4e0f8";
  const accent = "#7c5cfc";
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: text }}>📄 Full dialogue transcript</span>
        <span style={{ fontSize: 18, color: accent }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {dialogue.dialogue.map((l, i) => {
            const isUser = l.type === "user_input";
            const displayText = isUser ? (responses[i] || "[skipped]") : l.line;
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: isUser ? accent : sub, minWidth: 80, paddingTop: 2, flexShrink: 0 }}>{l.speaker}</span>
                <span style={{ fontSize: 15, color: isUser ? text : (dark ? "#c4c4e8" : "#444"), lineHeight: 1.6, fontStyle: isUser && !responses[i] ? "italic" : "normal" }}>{displayText}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SPEAKING COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
type Screen = "list" | "mode_select" | "play" | "done";

export default function Speaking({ dark }: { dark: boolean }) {
  const [progress,    setProgress]    = useState<SpeakingProgress>(loadProgress);
  const [screen,      setScreen]      = useState<Screen>("list");
  const [selected,    setSelected]    = useState<Dialogue | null>(null);
  const [mode,        setMode]        = useState<Mode>("roleplay");
  const [responses,   setResponses]   = useState<Record<number, string>>({});

  const text = dark ? "#e8e8f8" : "#1a1a2e";
  const sub  = dark ? "#9898b8" : "#777";
  const accent = "#7c5cfc";

  function selectDialogue(d: Dialogue) {
    setSelected(d); setScreen("mode_select");
    window.scrollTo({ top: 0 });
  }

  function startPlay() {
    setResponses({}); setScreen("play");
    window.scrollTo({ top: 0 });
  }

  function handleFinish(resp: Record<number, string>) {
    setResponses(resp);
    if (selected) {
      const completedIds = progress.completedIds.includes(selected.id)
        ? progress.completedIds
        : [...progress.completedIds, selected.id];
      const session: SessionState = {
        dialogueId: selected.id, mode,
        responses: resp, completed: true, timestamp: Date.now(),
      };
      const next: SpeakingProgress = {
        completedIds,
        sessions: [...progress.sessions, session],
      };
      setProgress(next); saveProgress(next);
    }
    setScreen("done");
    window.scrollTo({ top: 0 });
  }

  function goHome() { setScreen("list"); window.scrollTo({ top: 0 }); }
  function replay() { startPlay(); }

  // Back button header for sub-screens
  const showBack = screen !== "list";
  const screenTitle: Record<Screen, string> = {
    list: "", mode_select: selected?.title ?? "", play: selected?.title ?? "", done: "Great work!"
  };
  const screenSub: Record<Screen, string> = {
    list: "", mode_select: "Choose a mode",
    play: mode === "read" ? "🟢 Read mode" : mode === "roleplay" ? "🟡 Role Play" : "🔴 Active",
    done: selected?.title ?? "",
  };

  return (
    <div>
      {showBack && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={goHome}
            style={{ background: dark ? "#2a2a3e" : "#f0eeff", color: accent, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            ← Back
          </button>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{screenTitle[screen]}</div>
            <div style={{ fontSize: 12, color: sub }}>{screenSub[screen]}</div>
          </div>
        </div>
      )}

      {screen === "list" && (
        <DialogueList dark={dark} progress={progress} onSelect={selectDialogue} />
      )}

      {screen === "mode_select" && selected && (
        <div>
          <div style={{ background: dark ? "#2a2a3e" : "#fff", border: `1px solid ${dark ? "#383858" : "#e4e0f8"}`, borderRadius: 16, padding: "16px", marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ background: DIFF_COLOR[selected.difficulty]+"22", color: DIFF_COLOR[selected.difficulty], borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 700 }}>{selected.difficulty}</span>
              <span style={{ fontSize: 12, color: sub }}>{selected.dialogue.length} lines · {selected.dialogue.filter(l=>l.type==="user_input").length} your turns</span>
            </div>
            <div style={{ fontSize: 14, color: sub, lineHeight: 1.5 }}>{selected.description}</div>
            <div style={{ marginTop: 10, fontSize: 13, color: sub }}>
              <span style={{ fontWeight: 700, color: text }}>You play: </span>{selected.userRole} &nbsp;|&nbsp;
              <span style={{ fontWeight: 700, color: text }}>They play: </span>{selected.otherRole}
            </div>
          </div>

          <div style={{ fontSize: 13, color: sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Choose your mode</div>
          <ModeSwitcher mode={mode} onChange={setMode} dark={dark} />

          <div style={{ background: dark ? "#1e1e2e" : "#f4f2ff", borderRadius: 12, padding: "12px 14px", marginTop: 14, marginBottom: 18, fontSize: 13, color: sub, lineHeight: 1.6 }}>
            {mode === "read" && "You'll read every line step by step. Good for learning the dialogue first."}
            {mode === "roleplay" && `You play ${selected.userRole}. The app will show the other speaker's lines and wait for you to respond.`}
            {mode === "active" && "Every user_input line needs a typed response. Hints available on demand. Best for exam practice."}
          </div>

          <button onClick={startPlay}
            style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 18, fontWeight: 700, cursor: "pointer" }}>
            {mode === "read" ? "🟢 Start reading" : mode === "roleplay" ? "🟡 Start role play" : "🔴 Start active practice"}
          </button>
        </div>
      )}

      {screen === "play" && selected && (
        <DialoguePlayer
          key={`${selected.id}-${mode}`}
          dialogue={selected}
          mode={mode}
          dark={dark}
          onFinish={handleFinish}
        />
      )}

      {screen === "done" && selected && (
        <CompletionScreen
          dialogue={selected}
          mode={mode}
          responses={responses}
          dark={dark}
          onReplay={replay}
          onHome={goHome}
        />
      )}
    </div>
  );
}