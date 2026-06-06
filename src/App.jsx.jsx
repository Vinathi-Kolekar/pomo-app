import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const DEFAULT_DURATIONS = { focus: 25, short: 5, long: 15 };
const MODE_LABELS = { focus: "Focus", short: "Short break", long: "Long break" };
const PRIORITIES = ["critical", "high", "medium", "low"];
const PRIORITY_COLORS = { critical: "#ff4444", high: "#ff8c00", medium: "#888", low: "#555" };

function formatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function formatDeadline(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.ceil((d - now) / 86400000);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: "#ff4444" };
  if (days === 0) return { label: "Due today", color: "#ff8c00" };
  if (days === 1) return { label: "Due tomorrow", color: "#ff8c00" };
  if (days <= 7) return { label: `${days}d left`, color: "#aaa" };
  return { label: `${days}d left`, color: "#555" };
}

function CircularTimer({ progress, mode }) {
  const r = 90;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - progress);
  return (
    <svg width={220} height={220} viewBox="0 0 220 220" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="110" cy="110" r={r} fill="none" stroke="#1a1a1a" strokeWidth="8" />
      <circle cx="110" cy="110" r={r} fill="none"
        stroke={mode === "focus" ? "#fff" : "#666"} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={dash} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }} />
    </svg>
  );
}

export default function App() {
  const [durations, setDurations] = useState(DEFAULT_DURATIONS); // minutes
  const [showDurationEdit, setShowDurationEdit] = useState(false);
  const [mode, setMode] = useState("focus");
  const [timeLeft, setTimeLeft] = useState(DEFAULT_DURATIONS.focus * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [totalFocusMin, setTotalFocusMin] = useState(0);
  const [streak] = useState(3);
  const [ambientOn, setAmbientOn] = useState(false);
  const [view, setView] = useState("timer");

  const [tasks, setTasks] = useState([
    { id: 1, title: "Design system audit", priority: "high", deadline: (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); })(), pomos: 0, targetPomos: 3, done: false, notes: "", tags: ["design"], energy: "high" },
    { id: 2, title: "Fix auth bug in staging", priority: "critical", deadline: (() => { const d = new Date(); d.setDate(d.getDate() + 0); return d.toISOString().slice(0, 10); })(), pomos: 1, targetPomos: 2, done: false, notes: "", tags: ["dev"], energy: "high" },
    { id: 3, title: "Write Q3 retrospective", priority: "medium", deadline: (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })(), pomos: 0, targetPomos: 1, done: false, notes: "Include blockers section", tags: ["writing"], energy: "low" },
  ]);
  const [activeTask, setActiveTask] = useState(null);
  const [newTask, setNewTask] = useState({ title: "", priority: "medium", deadline: "", targetPomos: 1, notes: "", tags: "", energy: "medium" });
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("priority");
  const [showCompleted, setShowCompleted] = useState(false);

  const intervalRef = useRef(null);
  const audioCtx = useRef(null);
  const durationsRef = useRef(durations);
  const modeRef = useRef(mode);
  const activeTaskRef = useRef(activeTask);

  useEffect(() => { durationsRef.current = durations; }, [durations]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { activeTaskRef.current = activeTask; }, [activeTask]);

  // derived
  const totalTimeSec = durations[mode] * 60;
  const progress = Math.max(0, Math.min(1, (totalTimeSec - timeLeft) / totalTimeSec));
  const activeTaskData = tasks.find(t => t.id === activeTask) || null;
  const doneTasks = tasks.filter(t => t.done).length;
  const totalPomos = tasks.reduce((s, t) => s + t.pomos, 0);

  const playTick = useCallback(() => {
    if (!ambientOn) return;
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.current.createOscillator();
      const g = audioCtx.current.createGain();
      o.connect(g); g.connect(audioCtx.current.destination);
      o.type = "sine"; o.frequency.value = 800;
      g.gain.setValueAtTime(0.03, audioCtx.current.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.current.currentTime + 0.05);
      o.start(); o.stop(audioCtx.current.currentTime + 0.05);
    } catch (e) {}
  }, [ambientOn]);

  const playDone = useCallback(() => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      [440, 554, 659].forEach((f, i) => {
        const o = audioCtx.current.createOscillator();
        const g = audioCtx.current.createGain();
        o.connect(g); g.connect(audioCtx.current.destination);
        o.type = "sine"; o.frequency.value = f;
        const t = audioCtx.current.currentTime + i * 0.15;
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.start(t); o.stop(t + 0.4);
      });
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          playDone();
          if (modeRef.current === "focus") {
            setSessions(s => s + 1);
            setTotalFocusMin(m => m + durationsRef.current.focus);
            const at = activeTaskRef.current;
            if (at) setTasks(ts => ts.map(t => t.id === at ? { ...t, pomos: t.pomos + 1 } : t));
          }
          return 0;
        }
        if (prev % 60 === 0) playTick();
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, playDone, playTick]);

  const switchMode = (m) => {
    clearInterval(intervalRef.current);
    setMode(m);
    setTimeLeft(durationsRef.current[m] * 60);
    setRunning(false);
    setShowDurationEdit(false);
  };

  const updateDuration = (m, mins) => {
    const v = Math.max(1, Math.min(m === "focus" ? 90 : 30, mins));
    setDurations(d => ({ ...d, [m]: v }));
    if (m === mode && !running) setTimeLeft(v * 60);
  };

  const resetTimer = () => {
    clearInterval(intervalRef.current);
    setTimeLeft(durations[mode] * 60);
    setRunning(false);
    setShowDurationEdit(false);
  };

  const addTask = () => {
    if (!newTask.title.trim()) return;
    setTasks(ts => [{
      id: Date.now(), ...newTask,
      targetPomos: parseInt(newTask.targetPomos) || 1,
      pomos: 0, done: false,
      tags: newTask.tags ? newTask.tags.split(",").map(x => x.trim()).filter(Boolean) : [],
    }, ...ts]);
    setNewTask({ title: "", priority: "medium", deadline: "", targetPomos: 1, notes: "", tags: "", energy: "medium" });
    setAdding(false);
  };

  const toggleDone = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const deleteTask = (id) => { setTasks(ts => ts.filter(t => t.id !== id)); if (activeTask === id) setActiveTask(null); };

  const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  const filteredTasks = tasks
    .filter(t => showCompleted ? true : !t.done)
    .filter(t => filter === "all" ? true : t.priority === filter)
    .sort((a, b) => {
      if (sortBy === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (sortBy === "deadline") return (a.deadline || "z") < (b.deadline || "z") ? -1 : 1;
      if (sortBy === "pomos") return b.pomos - a.pomos;
      return 0;
    });

  const pseudoHeat = Array.from({ length: 28 }, (_, i) =>
    (i % 7 === 0 || i % 11 === 0) ? 3 : (i % 5 === 0) ? 2 : (i % 3 === 0) ? 1 : 0);

  // styles
  const st = {
    app: { minHeight: "100vh", background: "#0a0a0a", color: "#e0e0e0", fontFamily: "'DM Mono','Courier New',monospace", display: "flex", flexDirection: "column" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 28px 16px", borderBottom: "1px solid #1a1a1a" },
    logo: { fontSize: "13px", letterSpacing: "0.25em", color: "#444", textTransform: "uppercase" },
    nav: { display: "flex", gap: "2px", background: "#111", borderRadius: "8px", padding: "3px" },
    navBtn: (a) => ({ background: a ? "#1e1e1e" : "transparent", border: "none", color: a ? "#e0e0e0" : "#444", padding: "7px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.2s" }),
    main: { flex: 1, padding: "28px", maxWidth: "860px", margin: "0 auto", width: "100%", boxSizing: "border-box" },
    timerSec: { display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" },
    modeRow: { display: "flex", gap: "8px" },
    modeBtn: (a) => ({ background: a ? "#fff" : "transparent", color: a ? "#000" : "#444", border: `1px solid ${a ? "#fff" : "#222"}`, borderRadius: "20px", padding: "5px 16px", fontSize: "11px", letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase", transition: "all 0.2s" }),
    timerWrap: { position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 220, height: 220 },
    timerInner: { position: "absolute", textAlign: "center" },
    timeNum: { fontSize: "44px", fontWeight: 400, letterSpacing: "0.04em", color: "#fff", lineHeight: 1 },
    modeLabel: { fontSize: "11px", color: "#444", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "6px" },
    controls: { display: "flex", gap: "12px", alignItems: "center" },
    playBtn: { width: 48, height: 48, borderRadius: "50%", background: "#fff", border: "none", color: "#000", fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    iconBtn: { width: 36, height: 36, borderRadius: "50%", background: "transparent", border: "1px solid #222", color: "#555", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    sessionRow: { display: "flex", gap: "6px", alignItems: "center" },
    dot: (f) => ({ width: 8, height: 8, borderRadius: "50%", background: f ? "#fff" : "#1e1e1e", border: "1px solid #333" }),
    ambientRow: { display: "flex", gap: "8px", alignItems: "center" },
    ambientLabel: { fontSize: "11px", color: "#444" },
    toggle: (on) => ({ width: 32, height: 18, borderRadius: 9, background: on ? "#333" : "#1a1a1a", border: "1px solid #2a2a2a", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px", transition: "background 0.2s" }),
    toggleDot: (on) => ({ width: 12, height: 12, borderRadius: "50%", background: on ? "#fff" : "#333", transition: "transform 0.2s", transform: on ? "translateX(14px)" : "translateX(0)" }),
    durationToggleBtn: { background: "transparent", border: "none", color: "#333", fontSize: "11px", letterSpacing: "0.1em", cursor: "pointer", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" },
    durationPanel: { background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "10px", padding: "18px 20px", marginTop: "8px", width: "100%", maxWidth: 400 },
    durationRow: { marginBottom: "16px" },
    durationHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
    durationLabel: { fontSize: "11px", color: "#444", letterSpacing: "0.1em", textTransform: "uppercase" },
    durationControls: { display: "flex", alignItems: "center", gap: "8px" },
    durationStepBtn: { width: 22, height: 22, borderRadius: "4px", background: "transparent", border: "1px solid #1e1e1e", color: "#555", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
    durationNum: (active) => ({ fontSize: "20px", color: active ? "#fff" : "#555", fontWeight: 400, minWidth: "44px", textAlign: "center", letterSpacing: "-0.02em" }),
    durationUnit: { fontSize: "11px", color: "#333", marginLeft: "2px" },
    rangeHints: { display: "flex", justifyContent: "space-between", marginTop: "2px" },
    rangeHint: { fontSize: "10px", color: "#2a2a2a" },
    durationFooter: { borderTop: "1px solid #1a1a1a", marginTop: "4px", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    resetDefaultsBtn: { background: "transparent", border: "none", color: "#333", fontSize: "11px", cursor: "pointer", letterSpacing: "0.08em" },
    activeCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "14px 18px", width: "100%", maxWidth: 400, display: "flex", justifyContent: "space-between", alignItems: "center" },
    activeCardLabel: { fontSize: "11px", color: "#444", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" },
    activeCardTitle: { fontSize: "14px", color: "#ccc" },
    pomoBar: { display: "flex", gap: "3px", marginTop: "8px" },
    pomoDot: (f) => ({ width: 6, height: 6, borderRadius: "1px", background: f ? "#888" : "#1e1e1e" }),
    suggestBox: { background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "16px 18px", width: "100%", maxWidth: 400 },
    suggestLabel: { fontSize: "10px", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" },
    suggestRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #111", cursor: "pointer" },
    taskHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
    taskSectionTitle: { fontSize: "13px", letterSpacing: "0.15em", color: "#444", textTransform: "uppercase" },
    addBtn: { background: "#fff", color: "#000", border: "none", borderRadius: "6px", padding: "7px 14px", fontSize: "11px", letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase" },
    filterRow: { display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" },
    filterBtn: (a) => ({ background: a ? "#1e1e1e" : "transparent", border: `1px solid ${a ? "#333" : "#1a1a1a"}`, color: a ? "#ccc" : "#444", borderRadius: "5px", padding: "4px 11px", fontSize: "11px", cursor: "pointer", letterSpacing: "0.05em" }),
    form: { background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "20px", marginBottom: "16px" },
    formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" },
    input: { background: "#111", border: "1px solid #1e1e1e", borderRadius: "6px", color: "#ccc", padding: "8px 11px", fontSize: "13px", width: "100%", outline: "none", boxSizing: "border-box" },
    lbl: { fontSize: "10px", color: "#444", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: "5px" },
    sel: { background: "#111", border: "1px solid #1e1e1e", borderRadius: "6px", color: "#ccc", padding: "8px 11px", fontSize: "13px", width: "100%", outline: "none" },
    formBtns: { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" },
    cancelBtn: { background: "transparent", border: "1px solid #1e1e1e", color: "#555", borderRadius: "6px", padding: "7px 14px", fontSize: "11px", cursor: "pointer" },
    saveBtn: { background: "#fff", color: "#000", border: "none", borderRadius: "6px", padding: "7px 16px", fontSize: "11px", cursor: "pointer" },
    taskCard: (done, isActive) => ({ background: isActive ? "#131313" : "#0d0d0d", border: `1px solid ${isActive ? "#2a2a2a" : "#161616"}`, borderLeft: isActive ? "2px solid #fff" : "1px solid #161616", borderRadius: "8px", padding: "14px 16px", marginBottom: "8px", opacity: done ? 0.4 : 1, transition: "all 0.2s" }),
    taskRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" },
    taskCheck: { width: 18, height: 18, borderRadius: "4px", border: "1px solid #2a2a2a", background: "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: "2px" },
    taskName: (done) => ({ fontSize: "14px", color: done ? "#444" : "#ccc", textDecoration: done ? "line-through" : "none", flex: 1, lineHeight: 1.4 }),
    taskMeta: { display: "flex", gap: "8px", alignItems: "center", marginTop: "8px", flexWrap: "wrap" },
    priorityDot: (p) => ({ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_COLORS[p], flexShrink: 0 }),
    metaTxt: { fontSize: "11px", color: "#444" },
    deadlineBadge: (c) => ({ fontSize: "10px", color: c, background: "#0d0d0d", border: `1px solid ${c}22`, borderRadius: "4px", padding: "2px 7px" }),
    tagBadge: { fontSize: "10px", color: "#444", background: "#111", border: "1px solid #1e1e1e", borderRadius: "4px", padding: "2px 7px" },
    energyTxt: (e) => ({ fontSize: "10px", color: e === "high" ? "#888" : e === "medium" ? "#555" : "#333" }),
    delBtn: { background: "transparent", border: "none", color: "#2a2a2a", cursor: "pointer", fontSize: "14px", padding: "2px 4px" },
    statsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" },
    statCard: { background: "#0d0d0d", border: "1px solid #161616", borderRadius: "10px", padding: "18px 20px" },
    statNum: { fontSize: "32px", color: "#fff", lineHeight: 1, letterSpacing: "-0.02em" },
    statLabel: { fontSize: "11px", color: "#444", marginTop: "6px", letterSpacing: "0.08em", textTransform: "uppercase" },
    infoCard: { background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "18px 20px", marginBottom: "12px" },
    infoTitle: { fontSize: "11px", color: "#444", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "12px" },
    streakDots: { display: "flex", gap: "6px" },
    streakDot: (f) => ({ width: 10, height: 10, borderRadius: "50%", background: f ? "#fff" : "#1a1a1a", border: "1px solid #2a2a2a" }),
    heatRow: { display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "8px" },
    heatCell: (v) => ({ width: 14, height: 14, borderRadius: "2px", background: v === 0 ? "#111" : v === 1 ? "#2a2a2a" : v === 2 ? "#555" : "#999" }),
    footer: { borderTop: "1px solid #111", padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    footerStat: { fontSize: "11px", color: "#333" },
  };

  return (
    <div style={st.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet" />

      <header style={st.header}>
        <span style={st.logo}>POMO</span>
        <nav style={st.nav}>
          {["timer", "tasks", "stats"].map(v => (
            <button key={v} style={st.navBtn(view === v)} onClick={() => setView(v)}>{v}</button>
          ))}
        </nav>
        <span style={{ fontSize: "11px", color: "#2a2a2a" }}>{sessions} sessions today</span>
      </header>

      <main style={st.main}>

        {/* ── TIMER VIEW ── */}
        {view === "timer" && (
          <div style={st.timerSec}>
            <div style={st.modeRow}>
              {Object.keys(DEFAULT_DURATIONS).map(m => (
                <button key={m} style={st.modeBtn(mode === m)} onClick={() => switchMode(m)}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>

            <div style={st.timerWrap}>
              <CircularTimer progress={progress} mode={mode} />
              <div style={st.timerInner}>
                <div style={st.timeNum}>{formatTime(timeLeft)}</div>
                <div style={st.modeLabel}>{MODE_LABELS[mode]}</div>
              </div>
            </div>

            <div style={st.sessionRow}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={st.dot(i < sessions % 4)} />
              ))}
              <span style={{ fontSize: "11px", color: "#333", marginLeft: "4px" }}>#{Math.floor(sessions / 4) + 1}</span>
            </div>

            <div style={st.controls}>
              <button style={st.iconBtn} onClick={resetTimer}>↺</button>
              <button style={st.playBtn} onClick={() => setRunning(r => !r)}>
                {running ? "⏸" : "▶"}
              </button>
              <div style={st.ambientRow}>
                <span style={st.ambientLabel}>sound</span>
                <div style={st.toggle(ambientOn)} onClick={() => setAmbientOn(a => !a)}>
                  <div style={st.toggleDot(ambientOn)} />
                </div>
              </div>
            </div>

            {/* Duration editor */}
            {!running && (
              <div style={{ width: "100%", maxWidth: 400 }}>
                <button style={st.durationToggleBtn} onClick={() => setShowDurationEdit(e => !e)}>
                  <span style={{ fontSize: "14px" }}>{showDurationEdit ? "▴" : "▾"}</span>
                  adjust durations
                </button>
                {showDurationEdit && (
                  <div style={st.durationPanel}>
                    {Object.keys(DEFAULT_DURATIONS).map((m, idx, arr) => {
                      const max = m === "focus" ? 90 : 30;
                      return (
                        <div key={m} style={{ ...st.durationRow, marginBottom: idx === arr.length - 1 ? 0 : "16px" }}>
                          <div style={st.durationHeader}>
                            <span style={st.durationLabel}>{MODE_LABELS[m]}</span>
                            <div style={st.durationControls}>
                              <button style={st.durationStepBtn} onClick={() => updateDuration(m, durations[m] - 1)}>−</button>
                              <span style={st.durationNum(mode === m)}>
                                {durations[m]}<span style={st.durationUnit}>m</span>
                              </span>
                              <button style={st.durationStepBtn} onClick={() => updateDuration(m, durations[m] + 1)}>+</button>
                            </div>
                          </div>
                          <input type="range" min="1" max={max} step="1"
                            value={durations[m]}
                            onChange={e => updateDuration(m, parseInt(e.target.value))}
                            style={{ width: "100%", accentColor: mode === m ? "#fff" : "#444", cursor: "pointer" }} />
                          <div style={st.rangeHints}>
                            <span style={st.rangeHint}>1m</span>
                            <span style={st.rangeHint}>{max}m</span>
                          </div>
                        </div>
                      );
                    })}
                    <div style={st.durationFooter}>
                      <button style={st.resetDefaultsBtn}
                        onClick={() => { setDurations(DEFAULT_DURATIONS); if (!running) setTimeLeft(DEFAULT_DURATIONS[mode] * 60); }}>
                        reset to defaults
                      </button>
                      <span style={{ fontSize: "10px", color: "#222" }}>25 / 5 / 15</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Active task or suggestions */}
            {activeTaskData ? (
              <div style={st.activeCard}>
                <div>
                  <div style={st.activeCardLabel}>focusing on</div>
                  <div style={st.activeCardTitle}>{activeTaskData.title}</div>
                  <div style={st.pomoBar}>
                    {Array.from({ length: activeTaskData.targetPomos }).map((_, i) => (
                      <div key={i} style={st.pomoDot(i < activeTaskData.pomos)} />
                    ))}
                  </div>
                </div>
                <button style={st.iconBtn} onClick={() => setActiveTask(null)}>✕</button>
              </div>
            ) : (
              <div style={st.suggestBox}>
                <div style={st.suggestLabel}>suggested focus</div>
                {tasks.filter(t => !t.done).slice(0, 2).map(t => (
                  <div key={t.id} style={st.suggestRow}
                    onClick={() => { setActiveTask(t.id); }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <div style={st.priorityDot(t.priority)} />
                      <span style={{ fontSize: "13px", color: "#999" }}>{t.title}</span>
                    </div>
                    <span style={{ fontSize: "11px", color: "#333" }}>focus →</span>
                  </div>
                ))}
                {tasks.filter(t => !t.done).length === 0 && (
                  <div style={{ fontSize: "12px", color: "#2a2a2a" }}>No tasks yet</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TASKS VIEW ── */}
        {view === "tasks" && (
          <div>
            <div style={st.taskHeader}>
              <span style={st.taskSectionTitle}>Tasks — {filteredTasks.length}</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button style={st.filterBtn(showCompleted)} onClick={() => setShowCompleted(c => !c)}>
                  {showCompleted ? "hide done" : "show done"}
                </button>
                <button style={st.addBtn} onClick={() => setAdding(a => !a)}>+ Add</button>
              </div>
            </div>

            <div style={st.filterRow}>
              <span style={{ fontSize: "10px", color: "#333", marginRight: "4px" }}>filter:</span>
              {["all", ...PRIORITIES].map(f => (
                <button key={f} style={st.filterBtn(filter === f)} onClick={() => setFilter(f)}>{f}</button>
              ))}
              <span style={{ fontSize: "10px", color: "#333", marginLeft: "8px" }}>sort:</span>
              {["priority", "deadline", "pomos"].map(s => (
                <button key={s} style={st.filterBtn(sortBy === s)} onClick={() => setSortBy(s)}>{s}</button>
              ))}
            </div>

            {adding && (
              <div style={st.form}>
                <div style={{ marginBottom: "12px" }}>
                  <label style={st.lbl}>Task name</label>
                  <input style={st.input} placeholder="What needs to be done?" value={newTask.title}
                    onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addTask()} autoFocus />
                </div>
                <div style={st.formGrid}>
                  <div>
                    <label style={st.lbl}>Priority</label>
                    <select style={st.sel} value={newTask.priority} onChange={e => setNewTask(n => ({ ...n, priority: e.target.value }))}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={st.lbl}>Deadline</label>
                    <input type="date" style={st.input} value={newTask.deadline}
                      onChange={e => setNewTask(n => ({ ...n, deadline: e.target.value }))} />
                  </div>
                  <div>
                    <label style={st.lbl}>Pomodoros</label>
                    <input type="number" min="1" max="12" style={st.input} value={newTask.targetPomos}
                      onChange={e => setNewTask(n => ({ ...n, targetPomos: e.target.value }))} />
                  </div>
                  <div>
                    <label style={st.lbl}>Energy needed</label>
                    <select style={st.sel} value={newTask.energy} onChange={e => setNewTask(n => ({ ...n, energy: e.target.value }))}>
                      {["high", "medium", "low"].map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={st.lbl}>Tags (comma-separated)</label>
                  <input style={st.input} placeholder="design, dev, writing..." value={newTask.tags}
                    onChange={e => setNewTask(n => ({ ...n, tags: e.target.value }))} />
                </div>
                <div style={{ marginTop: "12px" }}>
                  <label style={st.lbl}>Notes</label>
                  <input style={st.input} placeholder="Context, links..." value={newTask.notes}
                    onChange={e => setNewTask(n => ({ ...n, notes: e.target.value }))} />
                </div>
                <div style={st.formBtns}>
                  <button style={st.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
                  <button style={st.saveBtn} onClick={addTask}>Add task</button>
                </div>
              </div>
            )}

            {filteredTasks.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#2a2a2a", fontSize: "13px" }}>Nothing here yet</div>
            )}

            {filteredTasks.map(task => {
              const dl = formatDeadline(task.deadline);
              const isActive = activeTask === task.id;
              return (
                <div key={task.id} style={st.taskCard(task.done, isActive)}>
                  <div style={st.taskRow}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", flex: 1 }}>
                      <div style={st.taskCheck} onClick={() => toggleDone(task.id)}>
                        {task.done && <span style={{ fontSize: "10px", color: "#555" }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={st.taskName(task.done)}>{task.title}</div>
                        {task.notes && <div style={{ fontSize: "11px", color: "#333", marginTop: "4px" }}>{task.notes}</div>}
                        <div style={st.taskMeta}>
                          <div style={st.priorityDot(task.priority)} />
                          <span style={{ ...st.metaTxt, color: PRIORITY_COLORS[task.priority] + "99" }}>{task.priority}</span>
                          {dl && <span style={st.deadlineBadge(dl.color)}>{dl.label}</span>}
                          <div style={{ display: "flex", gap: "3px" }}>
                            {Array.from({ length: task.targetPomos }).map((_, i) => (
                              <div key={i} style={st.pomoDot(i < task.pomos)} />
                            ))}
                          </div>
                          <span style={st.metaTxt}>{task.pomos}/{task.targetPomos}🍅</span>
                          <span style={st.energyTxt(task.energy)}>{task.energy} energy</span>
                          {task.tags.map(tag => <span key={tag} style={st.tagBadge}>#{tag}</span>)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {!task.done && (
                        <button style={{ ...st.delBtn, color: isActive ? "#666" : "#2a2a2a" }}
                          onClick={() => { setActiveTask(isActive ? null : task.id); setView("timer"); }}>▶</button>
                      )}
                      <button style={st.delBtn} onClick={() => deleteTask(task.id)}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── STATS VIEW ── */}
        {view === "stats" && (
          <div>
            <div style={{ fontSize: "13px", color: "#333", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "20px" }}>Overview</div>
            <div style={st.statsGrid}>
              <div style={st.statCard}>
                <div style={st.statNum}>{sessions}</div>
                <div style={st.statLabel}>Sessions today</div>
              </div>
              <div style={st.statCard}>
                <div style={st.statNum}>{totalFocusMin}</div>
                <div style={st.statLabel}>Minutes focused</div>
              </div>
              <div style={st.statCard}>
                <div style={st.statNum}>{doneTasks}/{tasks.length}</div>
                <div style={st.statLabel}>Tasks done</div>
              </div>
            </div>

            <div style={st.infoCard}>
              <div style={st.infoTitle}>Current streak — {streak} days</div>
              <div style={st.streakDots}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={st.streakDot(i < streak)} />
                ))}
              </div>
            </div>

            <div style={st.infoCard}>
              <div style={st.infoTitle}>Activity — last 28 days</div>
              <div style={st.heatRow}>
                {pseudoHeat.map((v, i) => <div key={i} style={st.heatCell(v)} />)}
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "10px" }}>
                <span style={{ fontSize: "10px", color: "#333" }}>less</span>
                {[0, 1, 2, 3].map(v => <div key={v} style={st.heatCell(v)} />)}
                <span style={{ fontSize: "10px", color: "#333" }}>more</span>
              </div>
            </div>

            <div style={st.infoCard}>
              <div style={st.infoTitle}>Tasks by priority</div>
              {PRIORITIES.map(p => {
                const count = tasks.filter(t => t.priority === p).length;
                const done = tasks.filter(t => t.priority === p && t.done).length;
                return (
                  <div key={p} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                    <div style={{ ...st.priorityDot(p), width: 8, height: 8 }} />
                    <span style={{ fontSize: "12px", color: "#555", width: 60 }}>{p}</span>
                    <div style={{ flex: 1, height: 4, background: "#111", borderRadius: 2 }}>
                      <div style={{ height: 4, width: count ? `${Math.round((done / count) * 100)}%` : "0%", background: PRIORITY_COLORS[p] + "66", borderRadius: 2, transition: "width 0.5s" }} />
                    </div>
                    <span style={{ fontSize: "11px", color: "#333" }}>{done}/{count}</span>
                  </div>
                );
              })}
            </div>

            <div style={st.infoCard}>
              <div style={st.infoTitle}>Pomodoros per task</div>
              {tasks.filter(t => t.pomos > 0).map(t => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #111" }}>
                  <span style={{ fontSize: "12px", color: "#555" }}>{t.title}</span>
                  <div style={{ display: "flex", gap: "3px" }}>
                    {Array.from({ length: t.pomos }).map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: 1, background: "#333" }} />)}
                  </div>
                </div>
              ))}
              {tasks.every(t => t.pomos === 0) && <div style={{ fontSize: "12px", color: "#2a2a2a" }}>Start a session to see data</div>}
            </div>
          </div>
        )}
      </main>

      <footer style={st.footer}>
        <span style={st.footerStat}>{tasks.filter(t => !t.done).length} tasks remaining</span>
        <span style={st.footerStat}>{streak} day streak</span>
        <span style={st.footerStat}>{totalPomos + sessions} total pomos</span>
      </footer>
    </div>
  );
}
