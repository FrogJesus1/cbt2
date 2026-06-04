/**
 * Terminal
 *
 * Scrollable output stream for command results.
 * Input is handled by the global CommandBar in App.jsx.
 *
 * Props:
 *   engineId                  active engine id
 *   onExec                    async (rawInput) → result
 *   onStreamChange            (stream) → void  — fires when stream updates
 *   scrollToId                number | null    — scroll to entry with this id
 *   onScrollComplete          () → void        — fires after scroll completes
 *   pendingCommand            string | null    — command injected from global bar
 *   onPendingCommandConsumed  () → void        — fires after pendingCommand is consumed
 *   onInject                  (cmd) → void     — animate-type cmd into global CommandBar
 *   onEdit                    (cmd) → void     — fill CommandBar without submitting (edit & re-run)
 *   onNavigate                (view) → void    — trigger App-level view switch
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { TerminalBlock } from "./TerminalBlock";
import {
  listCampaigns, createCampaign, getCampaign, getCampaignCount,
  slugify,
} from "@/lib/vfs";
import {
  uploadRoster, findRosterByName, deleteSharedRoster,
  fetchRosters, fetchRostersGrouped, fetchRoster,
  labelify,
} from "@/lib/shared-rosters";
import { THEME_REGISTRY, ALL_THEME_IDS } from "@/data/themeRegistry";


// ─── Navigation config ────────────────────────────────────────────────────────
// Map every recognised token (command name + alias) → canonical view id.
// View ids must match App.jsx activeView values exactly.

const NAV_TOKEN_MAP = {
  home:        "main",
  h:           "main",
  units:       "units",
  u:           "units",
  rules:       "rules",
  r:           "rules",
  rosters:     "rosters",
  campaign:    "rosters",
  c:           "rosters",
  settings:    "settings",
  diag:        "diag",
  diagnostics: "diag",
  "status-page": "diag",
};

// Display label used in terminal feedback messages ("Navigating to UNITS...")
const NAV_LABELS = {
  main:     "HOME",
  home:     "HOME",   // kept for back-compat with any stored history entries
  units:    "UNITS",
  rules:    "RULES",
  rosters:  "ROSTERS",
  campaign: "ROSTERS",  // legacy alias
  demo:     "DEMO",
  settings: "SETTINGS",
  diag:     "DIAGNOSTICS",
};

// ─── Roster context helpers ───────────────────────────────────────────────────

/**
 * Parse raw roster text content (CT export format) into a flat unit list.
 *
 * Handles lines like:
 *   "3x Crisis Fireknife Battlesuits (120 pts)"
 *   "Char1: 1x Commander Farsight (85 pts): Warlord, ..."
 *   "1x Ghostkeel Battlesuit (160 pts): ..."
 *
 * Skips: blank lines, # comments, + section headers, • sub-model bullets,
 *        indented continuation lines, enhancement lines.
 *
 * Returns: [{
 *   name: string, faction: string, models: number,
 *   weapons: string[],      // weapon names from loadout (empty if none listed)
 *   is_leader: boolean,     // true if line had CharN: prefix
 *   points: number|null,    // point cost if present
 *   attached_to: string|null, // leader→bodyguard link (from content metadata)
 *   nickname: string|null,    // user-assigned nickname (from content metadata)
 * }]
 */
function parseRosterUnits(roster) {
  if (!roster?.content) return [];
  const { faction, content } = roster;

  // ── First pass: extract embedded metadata lines ─────────────────────────
  // Format: # @nickname:idx:value  or  # @attach:leaderName:unitName
  const embeddedNicknames = {};   // idx → string
  const embeddedAttach = {};      // leaderName → unitName
  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const nickMatch = line.match(/^#\s*@nickname:(\d+):(.+)/);
    if (nickMatch) {
      embeddedNicknames[parseInt(nickMatch[1], 10)] = nickMatch[2].trim();
      continue;
    }
    const attachMatch = line.match(/^#\s*@attach:([^:]+):(.+)/);
    if (attachMatch) {
      embeddedAttach[attachMatch[1].trim()] = attachMatch[2].trim();
      continue;
    }
  }

  // ── Second pass: parse units ────────────────────────────────────────────
  const units = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip comments (including our metadata lines), headers, bullets, enhancements
    if (
      line.startsWith("#") ||
      line.startsWith("+") ||
      line.startsWith("•") ||
      line.startsWith("-") ||
      line.toLowerCase().startsWith("enhancement:")
    ) continue;
    // Detect leader prefix (CharN:)
    const isLeader = /^Char\d+:/i.test(line);
    // Strip optional "Char1: " / "CharN: " prefix (character unit entries)
    const stripped = line.replace(/^Char\d+:\s*/i, "");
    // Match the leading "Nx" count: "3x Crisis Fireknife Battlesuits (120 pts): ..."
    const m = stripped.match(/^(\d+)[xX×]\s+([^(:\n]+)/);
    if (m) {
      const models = parseInt(m[1], 10);
      const name   = m[2].trim();
      if (!name) continue;

      // Extract points: "... (120 pts)" or "(120pts)"
      let points = null;
      const ptsMatch = stripped.match(/\((\d+)\s*pts?\)/i);
      if (ptsMatch) points = parseInt(ptsMatch[1], 10);

      // Extract weapons: everything after the colon that follows the points/name
      let weapons = [];
      const colonIdx = stripped.indexOf(":", (ptsMatch ? ptsMatch.index : name.length));
      if (colonIdx !== -1) {
        const weaponStr = stripped.slice(colonIdx + 1).trim();
        if (weaponStr) {
          weapons = weaponStr.split(",").map(w => {
            return w.trim().replace(/^\d+[xX×]\s*/, "").trim();
          }).filter(Boolean);
        }
      }

      const idx = units.length;
      const nickname = embeddedNicknames[idx] || null;
      const attached_to = (isLeader && embeddedAttach[name]) ? embeddedAttach[name] : null;

      units.push({
        name, faction: faction || "", models, weapons,
        is_leader: isLeader, points, attached_to, nickname,
      });
    }
  }
  return units;
}

/**
 * Serialize nickname and attachment metadata as comment lines to embed
 * in roster content text for Airtable persistence.
 * Returns a string of "# @nickname:..." and "# @attach:..." lines.
 */
function buildRosterMetadata(side) {
  const allNicknames = JSON.parse(localStorage.getItem("ct_unit_nicknames") || "{}");
  const attachments  = JSON.parse(localStorage.getItem("ct_leader_attachments") || "{}");
  const sideNicknames  = allNicknames[side] || {};
  const sideAttachments = attachments[side] || {};

  const lines = [];
  for (const [idx, nick] of Object.entries(sideNicknames)) {
    if (nick) lines.push(`# @nickname:${idx}:${nick}`);
  }
  for (const [leader, unit] of Object.entries(sideAttachments)) {
    if (unit) lines.push(`# @attach:${leader}:${unit}`);
  }
  return lines.join("\n");
}

/**
 * Build a roster_context payload from the currently active rosters.
 * Returns null when both sides have no parsed units (avoids empty POST noise).
 *
 * Each unit includes: name, faction, models, weapons[], is_leader, points,
 *                     attached_to, nickname
 */
function buildRosterContext(activeRosters) {
  const myUnits  = parseRosterUnits(activeRosters.player);
  const oppUnits = parseRosterUnits(activeRosters.enemy);

  // localStorage overrides take priority over embedded content metadata
  // (user may have changed them since last Airtable save)
  const attachments  = JSON.parse(localStorage.getItem("ct_leader_attachments") || "{}");
  const allNicknames = JSON.parse(localStorage.getItem("ct_unit_nicknames") || "{}");

  const enrichUnits = (units, side) => {
    const sideAttachments = (attachments[side] || {});
    const sideNicknames   = (allNicknames[side] || {});
    return units.map((u, i) => {
      const enriched = { ...u };
      // localStorage wins over embedded metadata
      if (u.is_leader && sideAttachments[u.name]) {
        enriched.attached_to = sideAttachments[u.name];
      }
      if (sideNicknames[i]) {
        enriched.nickname = sideNicknames[i];
      }
      return enriched;
    });
  };

  const myFinal  = enrichUnits(myUnits, "player");
  const oppFinal = enrichUnits(oppUnits, "enemy");

  if (!myFinal.length && !oppFinal.length) return null;
  return { my_units: myFinal, opponent_units: oppFinal };
}

// ─── Boot splash ──────────────────────────────────────────────────────────────

const BOOT_LINES = [
  "╔══════════════════════════════════════════════════════════════╗",
  "║  COMBAT TERMINAL  v2.0  ·  Warhammer 40,000 10th Edition     ║",
  "╚══════════════════════════════════════════════════════════════╝",
  "",
  "  Type  help  to list commands.   ↑↓ for history.",
  "",
];

// ─── Component ────────────────────────────────────────────────────────────────

// ─── Theme helpers ────────────────────────────────────────────────────────────
const CT_ACTIVE_KEY = "ct_active_theme";

export function Terminal({
  engineId,
  onExec,
  onStreamChange,
  scrollToId,
  onScrollComplete,
  pendingCommand,
  onPendingCommandConsumed,
  onInject,
  onEdit,          // (cmd: string) → void — populate command bar without submitting (edit & re-run)
  onNavigate,
  onContextRoute,  // (targetContext, cmd) → route command to a different context terminal
  onTheme,         // (themeName: string) → void — update App-level theme state
  theme,           // current theme name (unused in Terminal render, but available for future use)
  contextId,       // which context this terminal belongs to: "main" | "units" | "rosters" | "rules" | "settings"
  contextBootLines, // optional override for the boot splash lines
  starredUnits,    // string[] — names of starred units (for spec star toggle)
  onToggleStar,    // (unitName: string) → void — toggle star on a unit
  profileName,     // string — logged-in user's name (for shared roster uploads)
}) {
  const [stream,         setStream]         = useState([]);
  const [cmdHist,        setCmdHist]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [stubLog,        setStubLog]        = useState([]); // session stub log

  const idRef           = useRef(0);
  const outputRef       = useRef(null);
  const entryRefs       = useRef({});
  // Tracks the stream entry id of the most recent non-rerun combat result.
  // When a rerun result arrives (_in_place: true), that entry's result is
  // updated in-place rather than appending a new combat block.
  const lastCombatIdRef    = useRef(null);
  // Set to true before a silent in-place rerun so the auto-scroll effect skips.
  const suppressScrollRef  = useRef(false);
  // Math Mode — when true, any result that carries meta.math_ledger gets a
  // follow-up math_replay entry injected into the stream automatically.
  // Uses a ref (not state) so the submit() closure always reads current value
  // without needing re-registration.
  const mathModeRef = useRef(false);
  // Tracks the entry being edited — when set, the next submit replaces
  // this entry in-place instead of appending a new one.
  const editingEntryRef = useRef(null);

  // ── Client-side multi-step flow state ────────────────────────────────────
  // When active, the next non-command input is routed to the flow handler
  // instead of the engine.
  //
  // Shape:
  //   null — no active flow
  //   {
  //     type: "roster_select" | "upload_roster" | "rename_roster" |
  //           "edit_roster"   | "delete_roster"  | "role_assign"   |
  //           "new_campaign",
  //     step: string,         — current step name
  //     data: {}              — accumulated flow state
  //   }
  const clientFlowRef = useRef(null);

  // Upload mode tracks which upload command is active ("roster" | "enemy" | "campaign" | null).
  // When set, the next text submission is treated as pasted content for that upload.
  const uploadModeRef = useRef(null);

  // Active loaded rosters for the session (player + enemy).
  // Does NOT back engine session — kept frontend-only until engine wiring is added.
  const activeRostersRef = useRef({ player: null, enemy: null });

  // ── Navigation history stack ─────────────────────────────────────────────
  // Tracks the sequence of views visited via navigation commands so `back` and
  // `forward` work like browser history.  Uses a ref (not state) — changes to
  // the stack should not trigger re-renders; the view switch via onNavigate
  // handles all UI updates.
  //
  // Shape: { history: string[], index: number }
  //   history — ordered array of view ids visited
  //   index   — pointer to the current position in history
  const navStackRef = useRef({ history: ["main"], index: 0 });

  // ── Helpers for navigating the stack ────────────────────────────────────

  /** Navigate to a new view, pushing it onto the history stack. */
  function navPush(view) {
    const stack  = navStackRef.current;
    const base   = stack.history.slice(0, stack.index + 1);
    // If already at this view, treat as no-op for the history stack (still navigate)
    if (base[base.length - 1] !== view) {
      const newHistory = [...base, view];
      navStackRef.current = { history: newHistory, index: newHistory.length - 1 };
    }
    onNavigate?.(view);
  }

  /** Go back one step.  Returns the target view name, or null if already at start. */
  function navBack() {
    const stack = navStackRef.current;
    if (stack.index <= 0) return null;
    const newIdx = stack.index - 1;
    navStackRef.current = { ...stack, index: newIdx };
    const view = stack.history[newIdx];
    onNavigate?.(view);
    return view;
  }

  /** Go forward one step.  Returns the target view name, or null if already at end. */
  function navForward() {
    const stack = navStackRef.current;
    if (stack.index >= stack.history.length - 1) return null;
    const newIdx = stack.index + 1;
    navStackRef.current = { ...stack, index: newIdx };
    const view = stack.history[newIdx];
    onNavigate?.(view);
    return view;
  }

  /** Emit a dim system feedback message into the stream (no pending state). */
  function emitSystem(inputLabel, message) {
    const entryId = ++idRef.current;
    setStream(prev => [...prev, {
      id:      entryId,
      input:   inputLabel,
      result:  { ok: true, result_type: "system_msg", data: message },
      pending: false,
    }]);
  }

  /**
   * Emit a rich client-side result (any result_type) into the stream.
   * Used for roster/campaign commands that never reach the engine.
   */
  function emitLocalResult(inputLabel, result_type, data, meta = {}) {
    const entryId = ++idRef.current;
    setStream(prev => [...prev, {
      id:      entryId,
      input:   inputLabel,
      result:  { ok: true, result_type, data, meta },
      pending: false,
    }]);
  }

  function emitError(inputLabel, message) {
    const entryId = ++idRef.current;
    setStream(prev => [...prev, {
      id:      entryId,
      input:   inputLabel,
      result:  { ok: false, result_type: "error", data: message, meta: {} },
      pending: false,
    }]);
  }

  // ── File/paste upload processing pipeline ────────────────────────────────
  //
  // Called either by UploadBlock (file drag/select) or by the paste intercept
  // in submit() when uploadModeRef is set.
  //
  // Parameters:
  //   content  — raw text string (roster/campaign data)
  //   filename — original filename, or "pasted-input" for typed/pasted text
  //
  // Pipeline: validate → store in flow → ask faction (roster) or name (campaign)

  function processUpload(content, filename) {
    const mode = uploadModeRef.current;
    uploadModeRef.current = null; // clear immediately — one shot

    const label = filename === "pasted-input" ? "paste" : `upload: ${filename}`;

    // ── Guard: empty content ────────────────────────────────────────────────
    if (!content || !content.trim()) {
      emitError(label, "Empty content — nothing to save.");
      return;
    }

    // ── Guard: file type (skip check for pasted text) ───────────────────────
    if (filename !== "pasted-input") {
      const ext = (filename.split(".").pop() || "").toLowerCase();
      if (!["roz", "rozs", "json"].includes(ext)) {
        emitError(label, "Unsupported file type. Accepted: .roz, .rozs, .json");
        return;
      }
    }

    // ── Roster / enemy roster ───────────────────────────────────────────────
    if (mode === "roster" || mode === "enemy") {
      // Start the faction → name flow, pre-seeded with content.
      // isEnemy flag triggers auto-assignment after save.
      clientFlowRef.current = {
        type: "upload_roster",
        step: "faction",
        data: { content, filename, isEnemy: mode === "enemy" },
      };
      emitLocalResult(label, "roster_prompt", {
        message: "Enter the faction for this roster (e.g. tau, space marines, orks):",
        hint:    "Type cancel to abort.",
      });
      return;
    }

    // ── Campaign ────────────────────────────────────────────────────────────
    if (mode === "campaign") {
      // Try to auto-detect a campaign name from JSON content
      let detectedName = null;
      try {
        const parsed = JSON.parse(content);
        detectedName = parsed.name || parsed.campaign_name || parsed.campaignName || null;
      } catch (_) { /* not JSON — fall through to manual name prompt */ }

      if (detectedName) {
        const saved = createCampaign(detectedName);
        if (!saved) {
          emitError(label, `Campaign '${detectedName}' already exists. Type 'load campaign ${detectedName}' to open it.`);
        } else {
          emitSystem(label, `Campaign saved: /campaigns/${detectedName}`);
        }
      } else {
        clientFlowRef.current = { type: "new_campaign", step: "name", data: { content } };
        emitLocalResult(label, "roster_prompt", {
          message: "Enter a name for this campaign:",
          hint:    "Use lowercase with hyphens, e.g. octarius-war  —  or type cancel to abort",
        });
      }
      return;
    }

    // ── Fallback (shouldn't happen) ─────────────────────────────────────────
    emitError(label, "Upload mode not set. Try 'upload roster' again.");
  }

  // Delete a stream entry by id
  const handleDeleteEntry = useCallback((entryId) => {
    setStream(prev => prev.filter(e => e.id !== entryId));
  }, []);

  // Auto-scroll to bottom on new output.
  // Skipped when suppressScrollRef is set (e.g. silent modifier reruns).
  useEffect(() => {
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false;
      return;
    }
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [stream, loading]);

  // Notify parent when stream changes
  useEffect(() => {
    onStreamChange?.(stream);
  }, [stream, onStreamChange]);

  // Scroll to a specific entry when history jump is triggered
  useEffect(() => {
    if (!scrollToId) return;
    const el = entryRefs.current[scrollToId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.transition      = "background-color 0.1s";
      el.style.backgroundColor = "rgba(57,255,20,0.05)";
      setTimeout(() => { el.style.backgroundColor = "transparent"; }, 800);
      onScrollComplete?.();
    }
  }, [scrollToId, onScrollComplete]);

  // ── Client flow step handler ──────────────────────────────────────────────
  //
  // Called when clientFlowRef.current is non-null and the user submits input.
  // Each flow type has named steps; this function advances the step or resolves.
  //
  // Cancellation: typing "cancel" or "esc" from anywhere exits the active flow.

  async function handleFlowStep(input) {
    const flow  = clientFlowRef.current;
    if (!flow) return;

    const lower = input.toLowerCase().trim();

    // Global escape hatch
    if (lower === "cancel" || lower === "esc" || lower === "q") {
      clientFlowRef.current = null;
      emitSystem(input, "Flow cancelled.");
      return;
    }

    // Command-escape for selection flows (roster_select, campaign_select, role_assign, roster_action)
    // If the user types a recognized command keyword, cancel the flow and re-inject the command
    // so it reaches the normal handlers at Priority 8.7/8.8/9.
    const isSelectionFlow = ["roster_select", "campaign_select", "role_assign", "roster_action", "load_roster_pick", "load_roster_faction"].includes(flow.type);
    const COMMAND_PREFIXES = ["upload", "load ", "delete ", "rename ", "edit ", "new ", "rosters", "campaigns", "clear", "help", "spec ", "list ", "set "];
    if (isSelectionFlow && COMMAND_PREFIXES.some(p => lower === p.trim() || lower.startsWith(p))) {
      clientFlowRef.current = null;
      onInject?.(input);
      return;
    }

    // ── roster_select — number picks a roster from the last 'rosters' list ─────
    if (flow.type === "roster_select") {
      const { flat = [], next } = flow.data;
      const n = parseInt(input, 10);

      if (!isNaN(n) && n >= 1 && n <= flat.length) {
        const picked = flat[n - 1];
        clientFlowRef.current = null;
        // If next === "action" or not set, show action menu
        onInject?.(`load roster ${picked.name}`);
        return;
      }

      // Try name match
      const matched = flat.find(r =>
        r.name.toLowerCase().includes(lower) ||
        labelify(r.faction).toLowerCase().includes(lower)
      );
      if (matched) {
        clientFlowRef.current = null;
        onInject?.(`load roster ${matched.name}`);
        return;
      }

      emitError(input, `No roster matching '${input}'. Type a number (1–${flat.length}) or a name.`);
      return;
    }

    // ── roster_action — number resolves action menu (Load/Rename/Edit/Delete) ──
    if (flow.type === "roster_action") {
      const { name, faction } = flow.data;
      const n = parseInt(input, 10);
      const actions = ["load", "rename", "edit", "delete"];

      if (!isNaN(n) && n >= 1 && n <= actions.length) {
        clientFlowRef.current = null;
        const action = actions[n - 1];
        if (action === "load") {
          onInject?.(`set roster player ${name}`);   // shortcut: ask for role via inject
          // Actually show role-assign directly:
          clientFlowRef.current = { type: "role_assign", step: "pick", data: { name, faction } };
          emitLocalResult(input, "role_assign", {
            name,
            faction,
            path: `/rosters/${faction}/${name}`,
          });
        } else {
          onInject?.(`${action} roster ${name}`);
        }
        return;
      }

      emitError(input, "Type a number: 1 Load  2 Rename  3 Edit  4 Delete");
      return;
    }

    // ── role_assign — pick player (1) or enemy (2) ────────────────────────────
    if (flow.type === "role_assign") {
      const { name } = flow.data;
      const n = parseInt(input, 10);

      if (n === 1 || lower === "player") {
        clientFlowRef.current = null;
        onInject?.(`set roster player ${name}`);
        return;
      }
      if (n === 2 || lower === "enemy") {
        clientFlowRef.current = null;
        onInject?.(`set roster enemy ${name}`);
        return;
      }

      emitError(input, "Type 1 for Player or 2 for Enemy.");
      return;
    }

    // ── load_roster_pick — flat list pick → role_assign ──────────────────────
    // Triggered by plain `load roster` (no args).
    // User picks a roster number → goes directly to role_assign (no action menu).
    if (flow.type === "load_roster_pick") {
      const { flat } = flow.data;
      const n = parseInt(input, 10);

      let picked = null;
      if (!isNaN(n) && n >= 1 && n <= flat.length) {
        picked = flat[n - 1];
      } else {
        picked = flat.find(r =>
          r.name.toLowerCase().includes(lower) ||
          labelify(r.faction).toLowerCase().includes(lower)
        ) || null;
      }

      if (!picked) {
        emitError(input, `No roster matching '${input}'. Type a number (1–${flat.length}) or a name.`);
        return;
      }

      clientFlowRef.current = {
        type: "role_assign", step: "pick",
        data: { name: picked.name, faction: picked.faction },
      };
      emitLocalResult(input, "role_assign", {
        name:    picked.name,
        faction: picked.faction,
        path:    `/rosters/${picked.faction}/${picked.name}`,
      });
      return;
    }

    // ── load_roster_faction — faction pick → roster pick → auto-assign ────────
    // Triggered by `load roster my` or `load roster enemy`.
    // Step 1: user picks a faction number → show that faction's rosters.
    // Step 2: user picks a roster number → auto-assign as player or enemy (no role prompt).
    if (flow.type === "load_roster_faction") {
      const { factions, role } = flow.data;

      if (flow.step === "pick_faction") {
        const n = parseInt(input, 10);
        let chosenFaction = null;

        if (!isNaN(n) && n >= 1 && n <= factions.length) {
          chosenFaction = factions[n - 1];
        } else {
          chosenFaction = factions.find(f =>
            f.toLowerCase().includes(lower) ||
            labelify(f).toLowerCase().includes(lower)
          ) || null;
        }

        if (!chosenFaction) {
          emitError(input, `No faction matching '${input}'. Type a number (1–${factions.length}).`);
          return;
        }

        const grouped = await fetchRostersGrouped();
        const factionRosters = (grouped[chosenFaction] || []);
        if (factionRosters.length === 0) {
          emitError(input, `No rosters found for ${labelify(chosenFaction)}.`);
          return;
        }

        // Build roster_list data shape for the second step
        const rostersGrouped = { [chosenFaction]: {} };
        factionRosters.forEach(r => { rostersGrouped[chosenFaction][r.name] = r; });

        flow.step = "pick_roster";
        flow.data.chosenFaction  = chosenFaction;
        flow.data.factionRosters = factionRosters;

        emitLocalResult(input, "roster_list", {
          rosters: rostersGrouped,
          count:   factionRosters.length,
          prompt:  `Select a roster to load as ${role === "player" ? "PLAYER" : "ENEMY"} (type a number):`,
        });
        return;
      }

      if (flow.step === "pick_roster") {
        const { factionRosters } = flow.data;
        const n = parseInt(input, 10);

        let picked = null;
        if (!isNaN(n) && n >= 1 && n <= factionRosters.length) {
          picked = factionRosters[n - 1];
        } else {
          picked = factionRosters.find(r => r.name.toLowerCase().includes(lower)) || null;
        }

        if (!picked) {
          emitError(input, `No roster matching '${input}'. Type a number (1–${factionRosters.length}).`);
          return;
        }

        clientFlowRef.current = null;
        // Auto-assign directly — no role prompt needed since role is pre-determined
        onInject?.(`set roster ${role} ${picked.name}`);
        return;
      }
    }

    // ── upload_roster — step 1: content → step 2: faction → step 3: name ─────
    if (flow.type === "upload_roster") {
      if (flow.step === "content") {
        if (!input.trim()) {
          emitError(input, "Empty input — paste your roster text and press Enter.");
          return;
        }
        flow.data.content = input;
        flow.step = "faction";
        emitLocalResult(input, "roster_prompt", {
          message: "Enter the faction for this roster (e.g. tau, space marines, orks):",
          hint:    "Type cancel to abort.",
        });
        return;
      }

      if (flow.step === "faction") {
        if (!input.trim()) {
          emitError(input, "Faction name cannot be empty.");
          return;
        }
        flow.data.faction = input.trim();
        flow.step = "name";
        emitLocalResult(input, "roster_prompt", {
          message: "Enter a name for this roster (e.g. retaliation-cadre):",
          hint:    `Will be saved at /rosters/${slugify(flow.data.faction)}/<name>`,
        });
        return;
      }

      if (flow.step === "name") {
        if (!input.trim()) {
          emitError(input, "Roster name cannot be empty.");
          return;
        }
        const { faction, content, isEnemy } = flow.data;
        const name    = input.trim();
        const saved   = await uploadRoster(name, faction, content, profileName || "unknown");
        clientFlowRef.current = null;
        emitLocalResult(input, "roster_saved", {
          name:    saved.name,
          faction: saved.faction,
          path:    `/rosters/${saved.faction}/${saved.name}`,
          size:    content.length,
        });
        // Enemy auto-assignment
        if (isEnemy) {
          activeRostersRef.current.enemy = { name: saved.name, faction: saved.faction, id: saved.id, content: saved.content };
          emitSystem(input, `Enemy roster loaded: ${saved.name} (${labelify(saved.faction)})`);
        }
        return;
      }
    }

    // ── edit_roster — new content to overwrite existing roster ────────────────
    if (flow.type === "edit_roster") {
      if (flow.step === "content") {
        if (!input.trim()) {
          emitError(input, "Empty input — paste new roster content and press Enter.");
          return;
        }
        const { name, faction } = flow.data;
        const saved = await uploadRoster(name, faction, input.trim(), profileName || "unknown");
        clientFlowRef.current = null;
        emitLocalResult(input, "roster_saved", {
          name:    saved.name,
          faction: saved.faction,
          path:    `/rosters/${saved.faction}/${saved.name}`,
          size:    input.length,
        });
        return;
      }
    }

    // ── rename_roster ─────────────────────────────────────────────────────────
    if (flow.type === "rename_roster") {
      clientFlowRef.current = null;
      emitError(input, "Rename not available for shared rosters. Upload a new copy instead.");
      return;
    }

    // ── delete_roster — confirm step ─────────────────────────────────────────
    if (flow.type === "delete_roster") {
      if (flow.step === "confirm") {
        const { name, faction, id } = flow.data;
        if (lower === "yes" || lower === "y") {
          const ok = await deleteSharedRoster(id);
          clientFlowRef.current = null;
          if (ok) {
            emitSystem(input, `Roster deleted: /rosters/${faction}/${name}`);
          } else {
            emitError(input, `Could not delete '${name}' — roster not found.`);
          }
        } else {
          clientFlowRef.current = null;
          emitSystem(input, "Delete cancelled.");
        }
        return;
      }
    }

    // ── campaign_select — number picks a campaign ──────────────────────────────
    if (flow.type === "campaign_select") {
      const { flat = [] } = flow.data;
      const n = parseInt(input, 10);

      if (!isNaN(n) && n >= 1 && n <= flat.length) {
        const name = flat[n - 1];
        clientFlowRef.current = null;
        onInject?.(`load campaign ${name}`);
        return;
      }

      const matched = flat.find(name => name.toLowerCase().includes(lower));
      if (matched) {
        clientFlowRef.current = null;
        onInject?.(`load campaign ${matched}`);
        return;
      }

      emitError(input, `No campaign matching '${input}'. Type a number (1–${flat.length}) or a name.`);
      return;
    }

    // ── new_campaign ──────────────────────────────────────────────────────────
    if (flow.type === "new_campaign") {
      if (flow.step === "name") {
        if (!input.trim()) {
          emitError(input, "Campaign name cannot be empty.");
          return;
        }
        const name   = input.trim();
        const result = createCampaign(name);
        clientFlowRef.current = null;
        if (!result) {
          emitError(input, `Campaign '${name}' already exists. Type 'load campaign ${name}' to open it.`);
        } else {
          const campaigns = listCampaigns();
          const count     = getCampaignCount();
          emitSystem(input, `Campaign created: /campaigns/${name}`);
          emitLocalResult(`campaigns`, "campaign_list", { campaigns, count });
        }
        return;
      }
    }



    // Unknown flow type — clear and warn
    clientFlowRef.current = null;
    emitSystem(input, "Flow state reset. Type a command to continue.");
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  //
  // Command priority order (evaluated top-down, first match wins):
  //   0. !!           — repeat last command (no history entry for "!!")
  //   1. clear / cls  — wipe the output stream
  //   2. delete / del — remove last output block
  //   3. back         — navigate to previous view
  //   4. forward/fwd  — navigate to next view
  //   5. history/hist — show command history list
  //   6. issues/stubs — show session stub log
  //   7. theme        — apply/reset a UI colour theme (client-side, no engine call)
  //   8. NAV_TOKEN    — navigate to a named view (home, units, rules, rosters, demo)
  //                     plus single-letter aliases (h, u, r, c, d)
  //   9. engine exec  — send to backend (spec, combat, threat, rule, etc.)
  //
  // Navigation/theme commands (priority 3-8) are web-only; intercepted here,
  // never reaching the engine.

  // Wrap onEdit to intercept the entry ID for in-place replacement
  const handleEditEntry = useCallback((cmd, entryId) => {
    editingEntryRef.current = entryId ?? null;
    if (onEdit) onEdit(cmd);
  }, [onEdit]);

  const submit = useCallback(async (raw) => {
    const trimmed = raw.trim();
    if (!trimmed || loading) return;

    const lower = trimmed.toLowerCase();

    // ── Priority 0: !! — repeat last command ─────────────────────────────────
    if (lower === "!!") {
      if (cmdHist.length === 0) {
        emitSystem("!!", "No previous command to repeat.");
        return;
      }
      // Re-submit the last command; it adds itself to cmdHist
      submit(cmdHist[cmdHist.length - 1]);
      return;
    }

    // All other commands enter the history record
    setCmdHist(prev => [...prev.slice(-49), trimmed]);

    // ── Priority 1: clear / cls ───────────────────────────────────────────────
    if (lower === "clear" || lower === "cls") {
      setStream([]);
      entryRefs.current = {};
      return;
    }

    // ── Priority 2: delete / del — pop the last output block ─────────────────
    if (lower === "delete" || lower === "del") {
      setStream(prev => {
        // Find the last entry that is complete (not pending)
        const completedIds = prev.filter(e => !e.pending).map(e => e.id);
        if (!completedIds.length) return prev;
        const lastId = completedIds[completedIds.length - 1];
        return prev.filter(e => e.id !== lastId);
      });
      // No stream entry for the delete command itself — that's the point
      return;
    }

    // ── Priority 3: back ─────────────────────────────────────────────────────
    if (lower === "back") {
      const view = navBack();
      if (view) {
        emitSystem(trimmed, `Returning to previous location…  [${NAV_LABELS[view] ?? view.toUpperCase()}]`);
      } else {
        emitSystem(trimmed, "Already at the beginning of navigation history.");
      }
      return;
    }

    // ── Priority 4: forward / fwd ─────────────────────────────────────────────
    if (lower === "forward" || lower === "fwd") {
      const view = navForward();
      if (view) {
        emitSystem(trimmed, `Navigating forward…  [${NAV_LABELS[view] ?? view.toUpperCase()}]`);
      } else {
        emitSystem(trimmed, "Already at the latest view.");
      }
      return;
    }

    // ── Priority 5: history / hist ────────────────────────────────────────────
    if (lower === "history" || lower === "hist") {
      const entryId = ++idRef.current;
      setStream(prev => [
        ...prev,
        {
          id:    entryId,
          input: trimmed,
          result: {
            ok:          true,
            result_type: "list",
            data:        cmdHist.length
              ? [...cmdHist].reverse().slice(0, 20)
              : ["(no history yet)"],
            meta: { count: cmdHist.length },
          },
          pending: false,
        },
      ]);
      return;
    }

    // ── Priority 6: issues / stubs — session stub log ─────────────────────────
    if (lower === "issues" || lower === "stubs") {
      const entryId = ++idRef.current;
      setStream(prev => [
        ...prev,
        {
          id:     entryId,
          input:  trimmed,
          result: {
            ok:          true,
            result_type: "stub_log",
            data:        stubLog,
          },
          pending: false,
        },
      ]);
      return;
    }

    // ── Priority 7: theme command ─────────────────────────────────────────────
    // Handled entirely client-side; never reaches the engine.
    // theme           → show current theme
    // theme <name>    → apply a theme (dark, light, console)
    // theme reset     → revert to dark
    if (lower.split(/\s+/)[0] === "theme" && lower.split(/\s+/)[1] !== "list") {
      const themeArg = lower.split(/\s+/)[1] || "";

      if (themeArg === "reset" || themeArg === "default") {
        try { localStorage.setItem(CT_ACTIVE_KEY, "dark"); } catch {}
        onTheme?.("dark");
        emitSystem(trimmed, "Reverting to DARK theme…");

      } else if (ALL_THEME_IDS.includes(themeArg)) {
        try { localStorage.setItem(CT_ACTIVE_KEY, themeArg); } catch {}
        onTheme?.(themeArg);
        emitSystem(trimmed, `Applying theme: ${themeArg.toUpperCase()}…`);

      } else if (!themeArg) {
        emitSystem(
          trimmed,
          `Current: ${theme ?? "dark"}  ·  Available: ${ALL_THEME_IDS.join(", ")}  ·  Type 'theme <name>' to switch.`,
        );

      } else {
        emitSystem(
          trimmed,
          `Theme '${themeArg}' not found.  Available: ${ALL_THEME_IDS.join(", ")}`,
        );
      }
      return;
    }

    // ── Priority 7.1: themes directory ───────────────────────────────────────
    if (lower === "themes" || lower === "theme list" || lower === "theme dir") {
      const themeItems = Object.values(THEME_REGISTRY).map(t => ({
        id:    t.id,
        label: t.label,
      }));
      emitLocalResult(trimmed, "themes_list", themeItems);
      return;
    }

    // ── Priority 7.2: math mode toggle ───────────────────────────────────────
    // Handled entirely client-side — never reaches the engine.
    // Commands: math / mathmode / math on / math off / mathmode on / mathmode off
    // Note: firstToken / tokens are declared later (Priority 8 scope), so we
    // split locally here to avoid a temporal dead zone ReferenceError.
    if (lower.split(/\s+/)[0] === "math" || lower.split(/\s+/)[0] === "mathmode") {
      const stateArg = lower.split(/\s+/)[1] || "";

      if (stateArg === "on") {
        mathModeRef.current = true;

        emitSystem(trimmed,
          "[ MATH MODE ON ]  Post-execution math ledger active. Run a combat query to see the replay.",
        );
      } else if (stateArg === "off") {
        mathModeRef.current = false;
        emitSystem(trimmed, "[ MATH MODE OFF ]  Math ledger display disabled.");
      } else {
        // Status query
        const status = mathModeRef.current ? "ON" : "OFF";
        emitSystem(trimmed,
          `Math Mode is currently ${status}.  Type  math on  or  math off  to toggle.`,
        );
      }
      return;
    }


    // ── Priority 8: navigation page commands ─────────────────────────────────
    // Match on the first token only — so "units foo" still navigates to units.
    const firstToken = lower.split(/\s+/)[0];
    const navView    = NAV_TOKEN_MAP[firstToken];
    if (navView !== undefined) {
      const label = NAV_LABELS[navView] ?? navView.toUpperCase();
      navPush(navView);
      emitSystem(trimmed, `Navigating to ${label}…`);
      return;
    }

    // ── Priority 8.5: cross-context data routing (fallback) ──────────────────
    // Primary routing is handled by App.jsx handleGlobalCommand before any
    // terminal sees the command.  This priority fires only for `list units`
    // commands that reach a non-units terminal through other paths (e.g. direct
    // terminal injection).  Guard prevents routing loops when already in units.
    const tokens = lower.split(/\s+/);
    if (tokens[0] === "list" && tokens[1] === "units" && contextId !== "units") {
      emitSystem(trimmed, `→ UNITS  routing command to units context…`);
      onContextRoute?.("units", trimmed);
      return;
    }
    if ((tokens[0] === "spec" || tokens[0] === "unit" || tokens[0] === "datasheet") && contextId !== "units") {
      emitSystem(trimmed, `→ UNITS  routing spec to units context…`);
      onContextRoute?.("units", trimmed);
      return;
    }

    // ── Priority 8.55: paste intercept — upload mode ─────────────────────────
    // When uploadModeRef is set the user chose to paste text instead of using
    // the file picker. Route the input directly to processUpload.
    if (uploadModeRef.current !== null && !clientFlowRef.current) {
      // Allow global cancellation
      if (lower === "cancel" || lower === "esc" || lower === "q") {
        uploadModeRef.current = null;
        emitSystem(trimmed, "Upload cancelled.");
        return;
      }
      processUpload(trimmed, "pasted-input");
      return;
    }

    // ── Priority 8.6: active client flow step ────────────────────────────────
    // When a multi-step flow is running, route input to the flow handler before
    // anything else (so numbers resolve against the flow, not the engine).
    if (clientFlowRef.current) {
      await handleFlowStep(trimmed);
      return;
    }

    // ── Priority 8.7: roster commands ────────────────────────────────────────
    // All roster commands are handled client-side via shared roster API.

    // rosters / list roster / list rosters
    if (
      lower === "rosters"          ||
      lower === "list roster"      ||
      lower === "list rosters"     ||
      (tokens[0] === "roster" && !tokens[1]) ||
      (tokens[0] === "roster" && tokens[1] === "list")
    ) {
      const allRosters = await fetchRosters();
      const rosters = {};
      for (const r of allRosters) {
        if (!rosters[r.faction]) rosters[r.faction] = {};
        rosters[r.faction][r.name] = r;
      }
      const count = allRosters.length;
      if (count > 0) {
        clientFlowRef.current = { type: "roster_select", step: "pick", data: { flat: allRosters } };
      }
      emitLocalResult(trimmed, "roster_list", { rosters, count });
      return;
    }

    // load roster [my | enemy | <name>]
    //
    // Three paths:
    //   load roster           → show all rosters numbered → pick roster → pick role (player/enemy)
    //   load roster my        → show factions → pick faction → show faction rosters → auto-assign player
    //   load roster enemy     → show factions → pick faction → show faction rosters → auto-assign enemy
    //   load roster <name>    → resolve roster directly → pick role (player/enemy)
    if (tokens[0] === "load" && tokens[1] === "roster") {
      const arg = tokens.slice(2).join(" ").trim().toLowerCase();

      // ── Path: load roster my / load roster enemy ──────────────────────────
      if (arg === "my" || arg === "enemy") {
        const role     = arg === "my" ? "player" : "enemy";
        const grouped = await fetchRostersGrouped();
        const factions = Object.keys(grouped).sort();
        if (factions.length === 0) {
          emitError(trimmed, "No rosters saved. Type 'upload roster' to save your first roster.");
          return;
        }
        clientFlowRef.current = {
          type: "load_roster_faction", step: "pick_faction",
          data: { factions, role },
        };
        emitLocalResult(trimmed, "roster_faction_list", {
          factions,
          role,
          prompt: "Type a faction number or name:",
        });
        return;
      }

      // ── Path: load roster <name> — direct lookup, skip action menu ────────
      if (arg) {
        const roster = await findRosterByName(arg);
        if (!roster) {
          emitError(trimmed, `Roster '${arg}' not found. Type 'rosters' to list saved rosters.`);
          return;
        }
        // Go straight to role_assign — no action menu
        clientFlowRef.current = {
          type: "role_assign", step: "pick",
          data: { name: roster.name, faction: roster.faction },
        };
        emitLocalResult(trimmed, "role_assign", {
          name:    roster.name,
          faction: roster.faction,
          path:    `/rosters/${roster.faction}/${roster.name}`,
        });
        return;
      }

      // ── Path: load roster (no arg) — show all rosters, then pick role ─────
      const allRosters = await fetchRosters();
      const rosters = {};
      for (const r of allRosters) {
        if (!rosters[r.faction]) rosters[r.faction] = {};
        rosters[r.faction][r.name] = r;
      }
      const count = allRosters.length;
      if (count === 0) {
        emitLocalResult(trimmed, "roster_list", { rosters, count });
        return;
      }
      const flat = allRosters;
      clientFlowRef.current = { type: "load_roster_pick", step: "pick", data: { flat } };
      emitLocalResult(trimmed, "roster_list", {
        rosters, count,
        prompt: "Select a roster to load (type a number or name):",
      });
      return;
    }

    // set roster player/enemy <name>
    if (tokens[0] === "set" && tokens[1] === "roster" && (tokens[2] === "player" || tokens[2] === "enemy")) {
      const role = tokens[2];
      const name = tokens.slice(3).join(" ").trim();
      if (!name) {
        emitError(trimmed, `Usage: set roster ${role} <roster name>`);
        return;
      }
      const roster = await findRosterByName(name);
      if (!roster) {
        emitError(trimmed, `Roster '${name}' not found.`);
        return;
      }
      activeRostersRef.current[role] = roster;
      clientFlowRef.current = null;
      emitSystem(
        trimmed,
        `${role.toUpperCase()} roster set → ${roster.name}  [/rosters/${roster.faction}/${roster.name}]`
      );
      // Sync faction + roster units to engine session so unit lookups
      // can auto-prefer this faction and roster-aware views work.
      if (roster.faction) {
        const rosterCtx = buildRosterContext(activeRostersRef.current);
        if (role === "player") {
          onExec?.(`faction ${roster.faction}`, rosterCtx);
        } else {
          onExec?.(`enemy ${roster.faction}`, rosterCtx);
        }
      }
      return;
    }

    // upload enemy roster  (also: upload enemy)
    // Must come before "upload roster" to catch "upload enemy roster" fully.
    if (tokens[0] === "upload" && tokens[1] === "enemy") {
      uploadModeRef.current = "enemy";
      emitLocalResult(trimmed, "upload_block", { mode: "enemy" });
      return;
    }

    // upload roster
    if (tokens[0] === "upload" && tokens[1] === "roster") {
      uploadModeRef.current = "roster";
      emitLocalResult(trimmed, "upload_block", { mode: "roster" });
      return;
    }

    // upload campaign
    if (tokens[0] === "upload" && tokens[1] === "campaign") {
      uploadModeRef.current = "campaign";
      emitLocalResult(trimmed, "upload_block", { mode: "campaign" });
      return;
    }

    // rename roster <name>
    if (tokens[0] === "rename" && tokens[1] === "roster") {
      emitError(trimmed, "Rename not available for shared rosters. Upload a new copy and delete the old one.");
      return;
    }

    // edit roster <name>
    if (tokens[0] === "edit" && tokens[1] === "roster") {
      const name = tokens.slice(2).join(" ").trim();
      const roster = name ? await findRosterByName(name) : null;
      if (!roster) {
        emitError(trimmed, `Usage: edit roster <name>   (roster not found: '${name || ""}')`);
        return;
      }
      clientFlowRef.current = {
        type: "edit_roster", step: "content",
        data: { name: roster.name, faction: roster.faction },
      };
      emitLocalResult(trimmed, "roster_prompt", {
        message: `Paste updated content for '${roster.name}' and press Enter:`,
        hint:    `Currently saved at /rosters/${roster.faction}/${roster.name}`,
      });
      return;
    }

    // delete roster <name>
    if (tokens[0] === "delete" && tokens[1] === "roster") {
      const name = tokens.slice(2).join(" ").trim();
      const roster = name ? await findRosterByName(name) : null;
      if (!roster) {
        emitError(trimmed, `Usage: delete roster <name>   (roster not found: '${name || ""}')`);
        return;
      }
      clientFlowRef.current = {
        type: "delete_roster", step: "confirm",
        data: { name: roster.name, faction: roster.faction, id: roster.id },
      };
      emitLocalResult(trimmed, "roster_prompt", {
        message: `Delete '${roster.name}' (${labelify(roster.faction)})? Type yes to confirm or no to cancel.`,
        hint:    "This action cannot be undone.",
      });
      return;
    }

    // save — saves roster edits when an edit flow completes or if a roster is active
    if (lower === "save") {
      // Only meaningful inside a flow — handled at Priority 8.6
      // If reached here, no flow is active
      emitSystem(trimmed, "Nothing to save. Use 'edit roster <name>' to modify a roster, then type 'save'.");
      return;
    }

    // clear roster player / clear roster enemy
    if (tokens[0] === "clear" && tokens[1] === "roster") {
      const side = (tokens[2] || "").toLowerCase();
      if (side === "player" || side === "my") {
        activeRostersRef.current.player = null;
        emitSystem(trimmed, "Player roster cleared.");
        onExec?.("faction none");
      } else if (side === "enemy") {
        activeRostersRef.current.enemy = null;
        emitSystem(trimmed, "Enemy roster cleared.");
        onExec?.("enemy none");
      } else {
        emitError(trimmed, "Usage: clear roster player  or  clear roster enemy");
      }
      return;
    }

    // ── Priority 8.8: campaign commands ──────────────────────────────────────

    // campaigns / list campaign / list campaigns
    if (
      lower === "campaigns"      ||
      lower === "list campaign"  ||
      lower === "list campaigns" ||
      (tokens[0] === "campaign" && !tokens[1]) ||
      (tokens[0] === "campaign" && tokens[1] === "list")
    ) {
      const campaigns = listCampaigns();
      const count     = getCampaignCount();
      if (count > 0) {
        const flat = Object.keys(campaigns).sort();
        clientFlowRef.current = { type: "campaign_select", step: "pick", data: { flat } };
      }
      emitLocalResult(trimmed, "campaign_list", { campaigns, count });
      return;
    }

    // load campaign [name]
    if (
      (tokens[0] === "load" && tokens[1] === "campaign") ||
      (tokens[0] === "campaign" && tokens[1] === "load")
    ) {
      const name = (tokens[0] === "load" ? tokens.slice(2) : tokens.slice(2)).join(" ").trim();
      if (!name) {
        const campaigns = listCampaigns();
        const count     = getCampaignCount();
        const flat      = Object.keys(campaigns).sort();
        clientFlowRef.current = { type: "campaign_select", step: "pick", data: { flat } };
        emitLocalResult(trimmed, "campaign_list", { campaigns, count });
        return;
      }
      const camp = getCampaign(name);
      if (!camp) {
        emitError(trimmed, `Campaign '${name}' not found. Type 'campaigns' to list saved campaigns.`);
        return;
      }
      // Show campaign as a text card
      const s = camp.state || {};
      emitLocalResult(trimmed, "text",
        `CAMPAIGN: ${name}\n` +
        `─────────────────────────────────────────────\n` +
        `Turn:          ${s.turn ?? 1}\n` +
        `Player wins:   ${s.player_wins ?? 0}\n` +
        `Enemy wins:    ${s.enemy_wins  ?? 0}\n` +
        `Created:       ${camp.config?.created_at?.slice(0, 10) ?? "—"}\n` +
        `Missions:      ${Object.keys(camp.missions || {}).length}\n` +
        (s.notes ? `\nNotes:\n${s.notes}` : "")
      );
      return;
    }

    // new campaign
    if (
      (tokens[0] === "new"      && tokens[1] === "campaign") ||
      (tokens[0] === "campaign" && tokens[1] === "new")
    ) {
      clientFlowRef.current = { type: "new_campaign", step: "name", data: {} };
      emitLocalResult(trimmed, "roster_prompt", {
        message: "Enter a name for this campaign:",
        hint:    "Use lowercase with hyphens, e.g. octarius-war",
      });
      return;
    }


    // ── Priority 9: engine exec ──────────────────────────────────────────────

    // Build roster context once per submission — passed along with every engine
    // POST so the backend session always reflects the active VFS rosters.
    const rosterContext = buildRosterContext(activeRostersRef.current);

    // ── Silent rerun path: modifier toggles call `rerun --<flag>` / `rerun --<flag> null`
    // These update the existing combat block in-place without adding any stream entry
    // or scrolling the terminal, so the user's position is preserved.
    const isRerun = /^rerun(\s|$)/i.test(trimmed);
    if (isRerun && lastCombatIdRef.current !== null) {
      // Don't use setLoading here — it triggers the auto-scroll effect via
      // the [stream, loading] dependency, which would scroll to bottom after
      // suppressScrollRef is consumed by the setStream render.
      try {
        const result = await onExec(trimmed, rosterContext);
        if (result?.data?._in_place) {
          const cleanData   = { ...result.data };
          delete cleanData._in_place;
          const cleanResult = { ...result, data: cleanData };
          suppressScrollRef.current = true;
          setStream(prev => prev.map(e =>
            e.id === lastCombatIdRef.current ? { ...e, result: cleanResult } : e
          ));
        }
      } catch (_) { /* silent — no error entry */ }
      return;
    }

    // ── Edit-in-place: replace the original entry rather than appending ──
    const editTarget = editingEntryRef.current;
    editingEntryRef.current = null;

    const entryId = editTarget ?? ++idRef.current;
    if (editTarget) {
      // Replace the original entry's input and set it to pending
      suppressScrollRef.current = true;
      setStream(prev => prev.map(e =>
        e.id === editTarget
          ? { ...e, input: trimmed, result: null, pending: true }
          : e
      ));
    } else {
      setStream(prev => [
        ...prev,
        { id: entryId, input: trimmed, result: null, pending: true },
      ]);
    }
    setLoading(true);

    try {
      const result = await onExec(trimmed, rosterContext);

      if (result?.result_type === "clear") {
        setStream([]);
        entryRefs.current = {};
        return;
      }

      // Log stubs to the session issues list
      if (result?.data?._stub === true) {
        const now  = new Date();
        const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setStubLog(prev => [
          ...prev,
          {
            command:  trimmed,
            name:     result.data.name    || trimmed,
            dataType: result.data.type    || result.data.phase || "ability",
            faction:  result.data.faction || result.data.source || null,
            time,
          },
        ]);
      }

      // ── In-place rerun fallback: handles rerun when lastCombatIdRef was null ──
      // (shouldn't normally reach here given the early return above, but kept for safety)
      if (result?.data?._in_place && lastCombatIdRef.current !== null) {
        // Strip _in_place flag before storing so it doesn't bleed into the UI
        const cleanData   = { ...result.data };
        delete cleanData._in_place;
        const cleanResult = { ...result, data: cleanData };

        suppressScrollRef.current = true;
        setStream(prev => prev.map(e => {
          if (e.id === lastCombatIdRef.current) {
            return { ...e, result: cleanResult };
          }
          if (e.id === entryId) {
            // Remove the pending rerun entry silently
            return null;
          }
          return e;
        }).filter(Boolean));
        return;  // finally { setLoading(false) } still fires
      }

      // Track the entry id for future reruns — only for fresh (non-in-place) combat
      if (result?.result_type === "combat") {
        lastCombatIdRef.current = entryId;
      }

      setStream(prev =>
        prev.map(e =>
          e.id === entryId ? { ...e, result, pending: false } : e
        )
      );

      // ── Math Mode: inject replay entry ────────────────────────────────────
      // When Math Mode is active and the result carries a math_ledger in meta,
      // append a math_replay block immediately after the normal result.
      // This is a post-execution replay — the normal result always renders first.

      if (
        mathModeRef.current &&
        result?.meta?.math_ledger?.length > 0
      ) {
        const mathEntryId = ++idRef.current;
        setStream(prev => [
          ...prev,
          {
            id:      mathEntryId,
            input:   `[MATH]  ${trimmed}`,
            result: {
              ok:          true,
              result_type: "math_replay",
              data: {
                ledger:   result.meta.math_ledger,
                command:  trimmed,
                attacker: result.meta?.attacker,
                defender: result.meta?.defender,
              },
              meta: {},
            },
            pending: false,
          },
        ]);
      }

    } catch (err) {
      setStream(prev =>
        prev.map(e =>
          e.id === entryId
            ? { ...e, result: { ok: false, result_type: "error", data: String(err) }, pending: false }
            : e
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loading, cmdHist, onExec]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle commands injected from the global CommandBar ───────────────────

  useEffect(() => {
    if (!pendingCommand) return;
    submit(pendingCommand);
    onPendingCommandConsumed?.();
  }, [pendingCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--ct-bg)" }}
    >
      {/* Scrollable output — drag-and-drop a .txt file to upload a roster */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-5 pt-5 pb-3"
        style={{ scrollbarWidth: "thin" }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
        onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const text = ev.target?.result;
            if (typeof text !== "string" || !text.trim()) return;
            // Start upload flow pre-filled with file content
            clientFlowRef.current = {
              type: "upload_roster",
              step: "faction",
              data: { content: text, fileName: file.name },
            };
            emitLocalResult(
              `drop: ${file.name}`,
              "roster_prompt",
              {
                message: `File '${file.name}' loaded (${text.length} chars).  Enter the faction for this roster:`,
                hint:    "e.g. tau, space marines, tyranids  —  or type cancel to abort",
              }
            );
          };
          reader.readAsText(file);
        }}
      >
        {/* Boot splash */}
        <div className="space-y-0 mb-3">
          {(contextBootLines || BOOT_LINES).map((line, i) => (
            <div
              key={`boot-${i}`}
              className="font-mono whitespace-pre leading-6"
              style={{
                color:    i < 3 ? "var(--ct-primary-mid)" : "var(--ct-primary-dim)",
                fontSize: "14px",
              }}
            >
              {line || "\u00A0"}
            </div>
          ))}
        </div>

        {/* Quick-start guide \u2014 main context only, hidden once commands are entered */}
        {contextId === "main" && stream.length === 0 && (() => {
          const cmdStyle = {
            color: "var(--ct-accent, var(--ct-primary-bright))",
            cursor: "pointer",
            background: "rgba(var(--ct-glow-rgb),0.06)",
            padding: "2px 8px",
            borderRadius: "3px",
            border: "1px solid rgba(var(--ct-glow-rgb),0.15)",
          };
          const labelStyle = {
            color: "var(--ct-primary-dim)",
            fontSize: "11px",
            letterSpacing: "0.04em",
            display: "block",
            marginBottom: "3px",
          };
          return (
            <div
              style={{
                border:       "1px solid var(--ct-border)",
                borderRadius: "6px",
                padding:      "14px 18px",
                marginBottom: "16px",
                background:   "var(--ct-bg-dark)",
                fontSize:     "13px",
                fontFamily:   "var(--ct-font-mono, monospace)",
                color:        "var(--ct-primary-dim)",
                lineHeight:   "1.6",
              }}
            >
              <div style={{ color: "var(--ct-primary-mid)", fontWeight: 600, marginBottom: "12px", fontSize: "13px", letterSpacing: "0.1em" }}>
                QUICK START
              </div>

              {/* Example commands */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>

                <div>
                  <span style={labelStyle}>Compare units</span>
                  <span onClick={() => onInject?.("crisis suits vs terminators")} style={cmdStyle}>
                    crisis suits vs terminators
                  </span>
                </div>

                <div>
                  <span style={labelStyle}>Look up a datasheet</span>
                  <span onClick={() => onInject?.("spec riptide")} style={cmdStyle}>
                    spec riptide
                  </span>
                </div>

                <div>
                  <span style={labelStyle}>Add modifiers to combat</span>
                  <span style={{ ...cmdStyle, cursor: "default" }}>
                    crisis suits vs terminators --cover --lethal
                  </span>
                </div>

                <div>
                  <span style={labelStyle}>See all available modifiers</span>
                  <span onClick={() => onInject?.("modifiers")} style={cmdStyle}>
                    modifiers
                  </span>
                </div>

              </div>

              {/* Divider */}
              <div style={{ borderBottom: "1px solid var(--ct-border)", opacity: 0.3, margin: "10px 0" }} />

              {/* Tips */}
              <div style={{ color: "var(--ct-primary-dim)", fontSize: "12px", opacity: 0.8, lineHeight: "1.8" }}>
                <div>
                  Click on <span style={{ color: "var(--ct-primary-bright)" }}>modifiers</span> or <span style={{ color: "var(--ct-primary-bright)" }}>weapon profiles</span> in results to hide them.
                </div>
                <div>
                  Click the <span style={{ color: "var(--ct-primary-bright)" }}>edit icon</span> on any past command to tweak and re-run it.
                </div>
                <div>
                  Type <span onClick={() => onInject?.("clear")} style={{ ...cmdStyle, fontSize: "12px", padding: "1px 6px" }}>clear</span> to reset the terminal.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Command + result stream */}
        <div className="space-y-0">
          {stream.map((entry, idx) => (
            <div
              key={entry.id}
              ref={el => { entryRefs.current[entry.id] = el; }}
              style={{ transition: "background-color 0.3s" }}
            >
              {idx > 0 && (
                <div style={{
                  borderBottom: "1px solid var(--ct-border)",
                  opacity: 0.4,
                  margin: "12px 0",
                }} />
              )}
              <TerminalBlock entry={entry} onSubmit={submit} onInject={onInject} onEdit={handleEditEntry} onUpload={processUpload} onDelete={handleDeleteEntry} starredUnits={starredUnits} onToggleStar={onToggleStar} />
            </div>
          ))}
        </div>

        {/* Loading indicator */}
        {loading && (
          <div
            className="font-mono animate-pulse pl-4 mt-2"
            style={{ color: "var(--ct-border)", fontSize: "14px" }}
          >
            processing…
          </div>
        )}
      </div>


    </div>
  );
}
