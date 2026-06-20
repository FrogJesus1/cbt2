/**
 * ProfileGate — Login / boot / profile selection screen.
 *
 * Shown before the main app. Recreates Login.dc.html: a CRT "cogitator boot"
 * console (power-on flicker → scanline sweep → streamed boot log → READY),
 * then the auth body (pick a profile · enter a PIN · create a callsign · skip).
 *
 * Boot motion plays once per session (sessionStorage `ct_booted`) and is fully
 * skipped under prefers-reduced-motion. All accents (primary/accent/danger/text)
 * flow through the active theme's --ct-* tokens; the darker-than-app "boot
 * console" shades are fixed phosphor darks with no token equivalent.
 *
 * If only one profile exists and has no PIN, auto-logs in silently.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchProfiles,
  createProfile,
  loginProfile,
  getLastProfile,
  setLastProfile,
  hydrateFromProfile,
} from "@/lib/profile";
import { useEdition } from "@/hooks/useEdition";

// ── Fixed boot-console palette (darker than the app; no token equivalent) ────
const K = {
  card:     "#04060c",
  chrome:   "#03050a",
  cardLine: "#14241a",
  rowBg:    "#070d09",
  rowLine:  "#16301f",
  rowHover: "#0a160d",
  dimGreen: "#2e5a40",
  dotGreen: "#3f6e4e",
};

const prefersReducedMotion = () => {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false; }
  catch { return false; }
};

const readStoredTheme = () => {
  try { return localStorage.getItem("ct_active_theme") || "dark"; } catch { return "dark"; }
};

// Boot log lines (flavour — a powering-on console). Tails colour-coded.
const BOOT_LINES = [
  { text: "booting cogitator core", tail: "OK",                        accent: true  },
  { text: "loading dossiers",       tail: "29 factions · 1,284 units", accent: false },
  { text: "monte carlo engine",     tail: "ONLINE",                    accent: true  },
];

export function ProfileGate({ onLogin }) {
  const [profiles, setProfiles]   = useState(null);  // null = loading
  const [view, setView]           = useState("pick"); // "pick" | "create" | "pin"
  const [selected, setSelected]   = useState(null);   // profile being logged into
  const [error, setError]         = useState(null);
  const [loading, setLoading]     = useState(false);

  // Create form
  const [newName, setNewName]     = useState("");
  const [newPin, setNewPin]       = useState("");
  const [usePin, setUsePin]       = useState(false);

  // PIN entry
  const [pinInput, setPinInput]   = useState("");

  const pinRef  = useRef(null);
  const nameRef = useRef(null);

  const { label: edition } = useEdition();
  const theme = readStoredTheme();

  // ── Boot sequence (once per session, motion-gated) ───────────────────────
  const [booting, setBooting]   = useState(() => {
    try { if (sessionStorage.getItem("ct_booted")) return false; } catch { /* no storage */ }
    return !prefersReducedMotion();
  });
  const [bootStep, setBootStep] = useState(0);  // 0 → power-on · 1-3 boot lines · 4 READY

  useEffect(() => {
    if (!booting) return;
    try { sessionStorage.setItem("ct_booted", "1"); } catch { /* no storage */ }
    const timers = [
      setTimeout(() => setBootStep(1),  560),
      setTimeout(() => setBootStep(2),  820),
      setTimeout(() => setBootStep(3), 1080),
      setTimeout(() => setBootStep(4), 1500),  // READY pill
      setTimeout(() => setBooting(false), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [booting]);

  // ── Load profiles on mount ───────────────────────────────────────────────

  useEffect(() => {
    fetchProfiles()
      .then(list => {
        setProfiles(list);
        // Auto-login: if last profile exists and has no PIN, go straight in
        const last = getLastProfile();
        if (last) {
          const match = list.find(p => p.name === last);
          if (match && !match.has_pin) { doLogin(match.name, null); return; }
          if (match && match.has_pin)  { setSelected(match); setView("pin"); return; }
        }
      })
      .catch(() => setProfiles([]));
  }, []);

  // ── Auto-focus ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (booting) return;
    if (view === "pin")    setTimeout(() => pinRef.current?.focus(), 50);
    if (view === "create") setTimeout(() => nameRef.current?.focus(), 50);
  }, [view, booting]);

  // ── Login ─────────────────────────────────────────────────────────────────

  const doLogin = useCallback(async (name, pin) => {
    setLoading(true);
    setError(null);
    try {
      const profile = await loginProfile(name, pin);
      hydrateFromProfile(profile.state);
      setLastProfile(name);
      onLogin(profile);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, [onLogin]);

  // ── Create ────────────────────────────────────────────────────────────────

  const doCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) { setError("Enter a callsign."); return; }
    setLoading(true);
    setError(null);
    try {
      const profile = await createProfile(name, usePin ? newPin : null);
      hydrateFromProfile(profile.state);
      setLastProfile(name);
      onLogin(profile);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, [newName, newPin, usePin, onLogin]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleProfileClick = (p) => {
    setError(null);
    if (p.has_pin) { setSelected(p); setPinInput(""); setView("pin"); }
    else           { doLogin(p.name, null); }
  };

  const handlePinKey   = (e) => { if (e.key === "Enter") { e.preventDefault(); if (selected) doLogin(selected.name, pinInput); } };
  const submitPin      = ()  => { if (!pinInput.trim()) { setError("Enter your PIN."); return; } if (selected) doLogin(selected.name, pinInput); };
  const goBack         = ()  => { setView("pick"); setError(null); };

  // ── Boot-driven visibility ──────────────────────────────────────────────
  const lineVisible = (i) => !booting || bootStep > i;
  const bannerLit   = !booting || bootStep >= 1;
  const showReady   = booting && bootStep >= 4;
  const showBody    = !booting;

  const heading = loading
    ? "Authenticating…"
    : view === "create" ? "New Profile"
    : view === "pin"    ? "Secure Login"
    : "Authentication Required";
  const headingDot = view === "pin" ? "var(--ct-accent)" : "var(--ct-primary)";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div data-theme={theme} style={S.root}>
      <style>{`.ct-login input::placeholder{color:#335040;}`}</style>
      <div className="ct-login" style={{ width: "480px", maxWidth: "100%" }}>

        {/* caption */}
        <div style={{ marginBottom: "12px" }}>
          <div className="ct-display" style={S.caption}>login</div>
          <div style={S.captionSub}>Authentication gate — pick a profile, enter a PIN, or create a new callsign.</div>
        </div>

        {/* console card */}
        <div style={S.card} className="ct-flicker">

          {/* boot header */}
          <div style={S.header} className={booting ? "ct-power-on" : undefined}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "18px", color: "var(--ct-primary)", textShadow: "0 0 12px rgba(var(--ct-glow-rgb),.6)" }}>⚡</span>
              <span className="ct-display" style={{
                fontSize: "18px", letterSpacing: "0.22em", fontWeight: 700,
                color: bannerLit ? "var(--ct-text)" : "#1c3a24",
                textShadow: bannerLit ? "0 0 14px rgba(var(--ct-glow-rgb),.4)" : "none",
                transition: "color .25s, text-shadow .25s",
              }}>COMBAT TERMINAL</span>
              <span style={{ marginLeft: "auto", fontSize: "9px", letterSpacing: "0.12em", color: K.dimGreen }}>
                · <span style={{ color: "var(--ct-primary)" }}>{edition}</span>
              </span>
            </div>
            <div style={{ marginTop: "14px", fontSize: "10px", lineHeight: 1.85, color: K.dimGreen }}>
              {BOOT_LINES.map((l, i) => (
                <div key={i} style={{
                  opacity: lineVisible(i) ? 1 : 0,
                  transform: lineVisible(i) ? "translateX(0)" : "translateX(-4px)",
                  transition: "opacity .14s, transform .14s",
                }}>
                  {l.text}<span style={{ color: K.dotGreen }}> ………… </span>
                  <span style={{ color: l.accent ? "var(--ct-primary)" : "var(--ct-body-dim)" }}>{l.tail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* auth body */}
          {showBody && (
            <div style={S.body}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: headingDot, boxShadow: `0 0 8px ${headingDot}` }} />
                <span className="ct-display" style={{ fontSize: "11px", letterSpacing: "0.18em", color: "var(--ct-accent)" }}>{heading}</span>
              </div>

              {loading ? (
                <div style={{ fontSize: "12px", color: "#84a890", padding: "6px 0 18px" }}>
                  Verifying credentials with the cogitator…
                </div>
              ) : profiles === null ? (
                <div style={{ fontSize: "12px", color: "#84a890", padding: "6px 0 18px" }}>
                  Scanning for profiles…
                </div>
              ) : view === "pin" && selected ? (
                <PinView
                  selected={selected} pinInput={pinInput} setPinInput={setPinInput}
                  onKey={handlePinKey} onSubmit={submitPin} onBack={goBack}
                  error={error} pinRef={pinRef}
                />
              ) : view === "create" ? (
                <CreateView
                  newName={newName} setNewName={setNewName}
                  usePin={usePin} setUsePin={setUsePin}
                  newPin={newPin} setNewPin={setNewPin}
                  onCreate={doCreate} onBack={goBack} error={error}
                  setError={setError} nameRef={nameRef}
                />
              ) : (
                <PickView
                  profiles={profiles} onPick={handleProfileClick}
                  onCreate={() => { setView("create"); setError(null); }}
                  onSkip={() => onLogin({ name: null, slug: null, has_pin: false, state: {} })}
                  error={error}
                />
              )}
            </div>
          )}

          {/* READY pill (boot only) */}
          {showReady && (
            <div style={{ padding: "0 28px 22px" }}>
              <span className="ct-display" style={{
                fontSize: "11px", letterSpacing: "0.18em", color: K.card,
                background: "var(--ct-primary)", padding: "3px 12px", borderRadius: "3px", fontWeight: 700,
              }}>▸ READY</span>
            </div>
          )}

          {/* prompt footer */}
          <div style={S.footer}>
            <span style={{ color: "var(--ct-primary)", fontSize: "13px" }}>›</span>
            <span style={{ fontSize: "11px", color: K.dimGreen }}>awaiting authentication</span>
            <span className="ct-caret" style={{
              display: "inline-block", width: "7px", height: "13px", marginLeft: "1px",
              background: "var(--ct-primary)", boxShadow: "0 0 6px rgba(var(--ct-glow-rgb),.7)",
            }} />
          </div>

          {/* CRT overlays */}
          {booting && <div className="ct-boot-scan" />}
          <div className="ct-crt-scanlines" />
          <div className="ct-crt-vignette" />
        </div>
      </div>
    </div>
  );
}

// ─── Views ───────────────────────────────────────────────────────────────────

function PickView({ profiles, onPick, onCreate, onSkip, error }) {
  return (
    <>
      {profiles.length === 0 && (
        <div style={{ fontSize: "12px", color: "#84a890", marginBottom: "14px" }}>
          No profiles yet — create a callsign to get started.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "18px" }}>
        {profiles.map(p => {
          const dot = p.has_pin ? "var(--ct-accent)" : "var(--ct-primary)";
          return (
            <div
              key={p.name}
              onClick={() => onPick(p)}
              style={S.profileRow}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ct-primary-mid)"; e.currentTarget.style.background = K.rowHover; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = K.rowLine; e.currentTarget.style.background = K.rowBg; }}
            >
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: dot, flexShrink: 0, boxShadow: `0 0 6px ${dot}` }} />
              <span style={{ flex: 1, fontSize: "14px", color: "var(--ct-text-mid)", letterSpacing: "0.1em" }}>{p.name}</span>
              {p.has_pin && (
                <span style={{ fontSize: "9px", letterSpacing: "0.12em", color: "var(--ct-accent)", border: "1px solid #4a3c1c", padding: "1px 6px", borderRadius: "2px" }}>🔒 PIN</span>
              )}
              <span style={{ color: K.dimGreen, fontSize: "12px" }}>›</span>
            </div>
          );
        })}
      </div>
      {error && <div style={S.error}>{error}</div>}
      <button onClick={onCreate} style={S.ghostBtn}>+ NEW PROFILE</button>
      <div style={{ textAlign: "center", marginTop: "14px" }}>
        <span onClick={onSkip} style={{ fontSize: "11px", letterSpacing: "0.06em", color: K.dimGreen, cursor: "pointer" }}>
          skip — continue without a profile →
        </span>
      </div>
    </>
  );
}

function PinView({ selected, pinInput, setPinInput, onKey, onSubmit, onBack, error, pinRef }) {
  return (
    <>
      <div style={{ fontSize: "12px", color: "#84a890", marginBottom: "14px" }}>
        Enter PIN for <span style={{ color: "var(--ct-text-mid)", fontWeight: 600 }}>{selected.name}</span>
      </div>
      <input
        ref={pinRef} type="password" value={pinInput}
        onChange={e => setPinInput(e.target.value)} onKeyDown={onKey}
        placeholder="• • • •" autoComplete="off"
        style={{ ...S.input, fontSize: "18px", letterSpacing: "0.5em", textAlign: "center", marginBottom: "10px" }}
      />
      {error && <div style={{ ...S.error, marginBottom: "10px" }}>{error}</div>}
      <button onClick={onSubmit} style={S.solidBtn}>▸ LOGIN</button>
      <div style={{ textAlign: "center", marginTop: "14px" }}>
        <span onClick={onBack} style={S.backLink}>← back</span>
      </div>
    </>
  );
}

function CreateView({ newName, setNewName, usePin, setUsePin, newPin, setNewPin, onCreate, onBack, error, setError, nameRef }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
      <div>
        <div className="ct-display" style={{ fontSize: "9px", letterSpacing: "0.14em", color: K.dimGreen, marginBottom: "5px" }}>Callsign</div>
        <input
          ref={nameRef} value={newName} maxLength={24} autoComplete="off"
          onChange={e => { setNewName(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onCreate(); } }}
          placeholder="e.g. COMMANDER_VOSS"
          style={{ ...S.input, letterSpacing: "0.08em" }}
        />
      </div>
      <div onClick={() => setUsePin(v => !v)} style={{ display: "flex", alignItems: "center", gap: "9px", cursor: "pointer" }}>
        <span style={{
          width: "16px", height: "16px", borderRadius: "3px",
          border: `1px solid ${usePin ? "var(--ct-primary)" : "#2e3630"}`,
          background: usePin ? "var(--ct-primary)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "10px", color: K.card, flexShrink: 0,
        }}>{usePin ? "✓" : ""}</span>
        <span style={{ fontSize: "12px", color: "#84a890" }}>Protect with a PIN</span>
      </div>
      {usePin && (
        <input
          type="password" value={newPin} autoComplete="off"
          onChange={e => setNewPin(e.target.value)}
          placeholder="set a PIN"
          style={{ ...S.input, letterSpacing: "0.3em" }}
        />
      )}
      {error && <div style={S.error}>{error}</div>}
      <button onClick={onCreate} style={{ ...S.solidBtn, marginTop: "2px" }}>▸ CREATE &amp; ENTER</button>
      <div style={{ textAlign: "center" }}>
        <span onClick={onBack} style={S.backLink}>← back</span>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  root: {
    minHeight: "100vh", boxSizing: "border-box", padding: "40px",
    background: "var(--ct-bg-dark)",
    fontFamily: "'IBM Plex Mono', monospace",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  },
  caption: {
    fontSize: "11px", letterSpacing: "0.28em", color: "var(--ct-primary-dim)",
    textTransform: "uppercase", fontWeight: 600,
  },
  captionSub: { fontSize: "12px", color: "var(--ct-primary-dim)", marginTop: "3px" },
  card: {
    position: "relative", borderRadius: "3px", overflow: "hidden",
    boxShadow: "0 10px 40px rgba(0,0,0,.4)",
    background: K.card, color: "var(--ct-primary)",
  },
  header: {
    padding: "24px 28px 18px", borderBottom: `1px solid ${K.cardLine}`, background: K.chrome,
    position: "relative", zIndex: 1,
  },
  body: { padding: "22px 28px 26px", position: "relative", zIndex: 1 },
  footer: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "11px 28px", borderTop: `1px solid ${K.cardLine}`, background: K.chrome,
    position: "relative", zIndex: 1,
  },
  profileRow: {
    display: "flex", alignItems: "center", gap: "11px",
    padding: "13px 15px", border: `1px solid ${K.rowLine}`, borderRadius: "5px",
    background: K.rowBg, cursor: "pointer", transition: "border-color .15s, background .15s",
  },
  input: {
    width: "100%", boxSizing: "border-box", background: K.rowBg,
    border: `1px solid ${K.rowLine}`, color: "var(--ct-primary)",
    fontFamily: "inherit", fontSize: "14px", padding: "11px 13px",
    borderRadius: "5px", outline: "none",
  },
  solidBtn: {
    width: "100%", background: "var(--ct-primary)", border: "none", color: K.card,
    fontFamily: "inherit", fontWeight: 700, fontSize: "13px", letterSpacing: "0.16em",
    padding: "13px", borderRadius: "5px", cursor: "pointer",
  },
  ghostBtn: {
    width: "100%", background: "transparent", border: "1px solid var(--ct-primary-mid)",
    color: "var(--ct-primary)", fontFamily: "inherit", fontSize: "12px",
    letterSpacing: "0.16em", padding: "12px", borderRadius: "5px", cursor: "pointer",
  },
  backLink: { fontSize: "11px", color: K.dimGreen, cursor: "pointer" },
  error: { color: "var(--ct-danger)", fontSize: "11px", textAlign: "center" },
};
