/**
 * ProfileGate — Login / profile selection screen.
 *
 * Shown before the main app. User picks an existing profile or creates a new one.
 * On successful login, hydrates localStorage from server state and calls onLogin.
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

  // ── Load profiles on mount ───────────────────────────────────────────────

  useEffect(() => {
    fetchProfiles()
      .then(list => {
        setProfiles(list);
        // Auto-login: if last profile exists and has no PIN, go straight in
        const last = getLastProfile();
        if (last) {
          const match = list.find(p => p.name === last);
          if (match && !match.has_pin) {
            doLogin(match.name, null);
            return;
          }
          if (match && match.has_pin) {
            setSelected(match);
            setView("pin");
            return;
          }
        }
      })
      .catch(() => setProfiles([]));
  }, []);

  // ── Auto-focus ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (view === "pin")    setTimeout(() => pinRef.current?.focus(), 50);
    if (view === "create") setTimeout(() => nameRef.current?.focus(), 50);
  }, [view]);

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
    if (!name) { setError("Enter a name"); return; }
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
    if (p.has_pin) {
      setSelected(p);
      setPinInput("");
      setView("pin");
    } else {
      doLogin(p.name, null);
    }
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (selected) doLogin(selected.name, pinInput);
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    doCreate();
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (profiles === null || loading) {
    return (
      <div style={styles.root}>
        <div style={styles.box}>
          <div style={styles.title}>⚡ COMBAT TERMINAL</div>
          <div style={styles.dim}>{loading ? "Logging in…" : "Loading profiles…"}</div>
        </div>
      </div>
    );
  }

  // ── PIN entry view ────────────────────────────────────────────────────────

  if (view === "pin" && selected) {
    return (
      <div style={styles.root}>
        <div style={styles.box}>
          <div style={styles.title}>⚡ COMBAT TERMINAL</div>
          <div style={{ ...styles.dim, marginBottom: "16px" }}>
            Enter PIN for <span style={styles.accent}>{selected.name}</span>
          </div>
          <form onSubmit={handlePinSubmit} style={styles.form}>
            <input
              ref={pinRef}
              type="password"
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              placeholder="PIN"
              style={styles.input}
              autoComplete="off"
            />
            <button type="submit" style={styles.btn}>LOGIN</button>
          </form>
          {error && <div style={styles.error}>{error}</div>}
          <button onClick={() => { setView("pick"); setError(null); }} style={styles.link}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Create profile view ───────────────────────────────────────────────────

  if (view === "create") {
    return (
      <div style={styles.root}>
        <div style={styles.box}>
          <div style={styles.title}>⚡ COMBAT TERMINAL</div>
          <div style={{ ...styles.dim, marginBottom: "16px" }}>New Profile</div>
          <form onSubmit={handleCreateSubmit} style={styles.form}>
            <input
              ref={nameRef}
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Callsign"
              style={styles.input}
              autoComplete="off"
              maxLength={24}
            />
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={usePin}
                onChange={e => setUsePin(e.target.checked)}
                style={{ marginRight: "6px" }}
              />
              <span style={styles.dim}>Set a PIN</span>
            </label>
            {usePin && (
              <input
                type="password"
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                placeholder="PIN (optional security)"
                style={styles.input}
                autoComplete="off"
              />
            )}
            <button type="submit" style={styles.btn}>CREATE</button>
          </form>
          {error && <div style={styles.error}>{error}</div>}
          <button onClick={() => { setView("pick"); setError(null); }} style={styles.link}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Profile picker view ───────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      <div style={styles.box}>
        <div style={styles.title}>⚡ COMBAT TERMINAL</div>
        <div style={{ ...styles.dim, marginBottom: "20px" }}>Select Profile</div>

        {profiles.length === 0 && (
          <div style={{ ...styles.dim, marginBottom: "12px" }}>
            No profiles yet — create one to get started.
          </div>
        )}

        <div style={styles.list}>
          {profiles.map(p => (
            <button
              key={p.name}
              onClick={() => handleProfileClick(p)}
              style={styles.profileBtn}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(57,255,20,0.06)"; e.currentTarget.style.borderColor = "#39ff14"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = "#1a3a1a"; }}
            >
              <span style={styles.profileName}>{p.name}</span>
              {p.has_pin && <span style={styles.pinBadge}>PIN</span>}
            </button>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button onClick={() => { setView("create"); setError(null); }} style={styles.btn}>
          + NEW PROFILE
        </button>
      </div>
    </div>
  );
}

// ─── Inline styles (matches CT dark theme) ───────────────────────────────────

const styles = {
  root: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    height:         "100vh",
    backgroundColor: "#0a0e0a",
    fontFamily:     "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
  },
  box: {
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    padding:        "40px",
    border:         "1px solid #1a3a1a",
    backgroundColor: "#0d120d",
    minWidth:       "320px",
    maxWidth:       "400px",
  },
  title: {
    color:          "#39ff14",
    fontSize:       "18px",
    fontWeight:     700,
    letterSpacing:  "0.18em",
    marginBottom:   "8px",
    textShadow:    "0 0 8px rgba(57,255,20,0.3)",
  },
  dim: {
    color:          "#3a6a3a",
    fontSize:       "12px",
    letterSpacing:  "0.1em",
  },
  accent: {
    color:          "#39ff14",
  },
  form: {
    display:       "flex",
    flexDirection: "column",
    gap:           "10px",
    width:         "100%",
  },
  input: {
    backgroundColor: "#080c08",
    border:          "1px solid #1a3a1a",
    color:           "#39ff14",
    padding:         "10px 12px",
    fontSize:        "14px",
    fontFamily:      "inherit",
    letterSpacing:   "0.08em",
    outline:         "none",
    width:           "100%",
    boxSizing:       "border-box",
  },
  btn: {
    backgroundColor: "transparent",
    border:          "1px solid #39ff14",
    color:           "#39ff14",
    padding:         "10px 16px",
    fontSize:        "13px",
    fontFamily:      "inherit",
    letterSpacing:   "0.15em",
    cursor:          "pointer",
    marginTop:       "8px",
    transition:      "background-color 0.15s",
  },
  link: {
    background:     "none",
    border:         "none",
    color:          "#3a6a3a",
    fontSize:       "12px",
    cursor:         "pointer",
    marginTop:      "12px",
    fontFamily:     "inherit",
    letterSpacing:  "0.08em",
  },
  error: {
    color:       "#ff3b3b",
    fontSize:    "12px",
    marginTop:   "8px",
    textAlign:   "center",
  },
  list: {
    display:       "flex",
    flexDirection: "column",
    gap:           "6px",
    width:         "100%",
    marginBottom:  "16px",
  },
  profileBtn: {
    display:         "flex",
    alignItems:      "center",
    justifyContent:  "space-between",
    padding:         "10px 14px",
    border:          "1px solid #1a3a1a",
    backgroundColor: "transparent",
    cursor:          "pointer",
    fontFamily:      "inherit",
    transition:      "all 0.15s",
    width:           "100%",
    textAlign:       "left",
  },
  profileName: {
    color:          "#39ff14",
    fontSize:       "14px",
    letterSpacing:  "0.1em",
  },
  pinBadge: {
    color:          "#3a6a3a",
    fontSize:       "10px",
    letterSpacing:  "0.12em",
    border:         "1px solid #1a3a1a",
    padding:        "2px 6px",
  },
  checkLabel: {
    display:     "flex",
    alignItems:  "center",
    cursor:      "pointer",
    fontSize:    "12px",
  },
};
