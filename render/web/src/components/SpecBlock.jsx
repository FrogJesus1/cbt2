/**
 * SpecBlock
 *
 * Composer for spec_sheet results. Layout:
 *
 *   SpecBannerCard          — full width
 *   KeywordsBar             — full width, directly below banner
 *   StatLine (+ weapons)  ┐
 *   RatingsPanel          ┘ — side by side (weapons nested inside StatLine's card)
 *   SpecAbilitiesBlock      — full width
 *
 * Sub-components:
 *   spec/SpecBannerCard.jsx
 *   spec/KeywordsBar.jsx
 *   spec/StatLine.jsx          (now accepts weapons prop)
 *   spec/WeaponsPanel.jsx      (standalone, used in demo only)
 *   spec/SpecAbilitiesBlock.jsx
 *   spec/shared.jsx
 */

// ─── Re-exports ────────────────────────────────────────────────────────────

export { SpecBannerCard }       from "./spec/SpecBannerCard";
export { KeywordsBar }          from "./spec/KeywordsBar";
export { StatLine }             from "./spec/StatLine";
export { WeaponsPanel }         from "./spec/WeaponsPanel";
export { WeaponsPanelContent }  from "./spec/WeaponsPanel";
export { SpecAbilitiesBlock }   from "./spec/SpecAbilitiesBlock";

// ─── Imports for the composer ──────────────────────────────────────────────

import { SpecBannerCard }      from "./spec/SpecBannerCard";
import { KeywordsBar }         from "./spec/KeywordsBar";
import { StatLine }            from "./spec/StatLine";
import { SpecAbilitiesBlock }  from "./spec/SpecAbilitiesBlock";
import { C }                   from "./spec/shared";

// ─── SpecBlock ─────────────────────────────────────────────────────────────

export function SpecBlock({ data, meta, onSubmit, onInject, starredUnits, onToggleStar }) {
  if (!data) return null;

  const {
    title       = "",
    subtitle    = "",
    stats       = {},
    weapons     = [],
    abilities   = [],
    keywords    = [],
    ratings     = {},
    drone_notes = [],
    _stub       = false,
  } = data;

  const isStarred = Array.isArray(starredUnits) && starredUnits.includes(title);

  return (
    <div
      className="font-mono"
      style={{
        fontSize:      "13px",
        display:       "flex",
        flexDirection: "column",
        gap:           "6px",
      }}
    >

      {/* Partial data warning */}
      {_stub && (
        <div style={{
          color:      C.amber,
          fontSize:   "12px",
          border:     `1px solid ${C.amber}40`,
          padding:    "6px 12px",
          background: "#140a00",
        }}>
          ⚠ Partial data — unit dossier not fully loaded. Add the faction JSON to get full stats.
        </div>
      )}

      {/* 1. Banner */}
      <SpecBannerCard title={title} subtitle={subtitle} faction={meta?.faction} onInject={onInject} isStarred={isStarred} onToggleStar={onToggleStar} />

      {/* 2. Keywords — full width, directly below banner */}
      {/* faction from meta scopes click commands to this unit's faction */}
      {keywords.length > 0 && (
        <KeywordsBar keywords={keywords} onSubmit={onSubmit} faction={meta?.faction} />
      )}

      {/* 3. Stat line + weapons (left card) | Combat ratings (right card) */}
      {(Object.keys(stats).length > 0 || weapons.length > 0) && (
        <StatLine stats={stats} ratings={ratings} weapons={weapons} />
      )}

      {/* 4. Drone / attachment notes — cyan info chips, one per note */}
      {drone_notes.length > 0 && (
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           "4px",
        }}>
          {drone_notes.map((note, i) => (
            <div key={i} style={{
              color:      C.cyan,
              fontSize:   "12px",
              lineHeight: "1.5",
              border:     `1px solid ${C.cyan}30`,
              background: `${C.cyan}08`,
              padding:    "5px 10px",
              display:    "flex",
              alignItems: "center",
              gap:        "7px",
            }}>
              <span style={{ color: C.cyan, flexShrink: 0, opacity: 0.7 }}>◈</span>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}

      {/* 5. Abilities */}
      {abilities.length > 0 && (
        <SpecAbilitiesBlock abilities={abilities} onSubmit={onSubmit} />
      )}

    </div>
  );
}
