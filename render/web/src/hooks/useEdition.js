/**
 * useEdition — shell-level rules-edition state (10th / 11th).
 *
 * Backed by localStorage `ct_edition`. DESIGN-ONLY for now: the engine is not
 * reloaded when this changes (the data is currently 10th-edition). The label
 * must render sitewide — chrome chip + footer (+ a mobile `XI` badge later) —
 * and the formal switch control lives in Settings → Math Mode (Phase 6).
 *
 * Multiple consumers stay in sync via a window CustomEvent + the storage event.
 */

import { useState, useEffect, useCallback } from "react";

const CT_EDITION_KEY = "ct_edition";
const DEFAULT_EDITION = "11th";
const EVENT = "ct-edition-changed";

export function readEdition() {
  try {
    const v = localStorage.getItem(CT_EDITION_KEY);
    return v === "10th" || v === "11th" ? v : DEFAULT_EDITION;
  } catch {
    return DEFAULT_EDITION;
  }
}

export const editionLabel     = (ed) => (ed === "10th" ? "10TH ED" : "11TH ED");
export const editionLabelLong = (ed) => (ed === "10th" ? "10TH EDITION" : "11TH EDITION");
export const editionBadge     = (ed) => (ed === "10th" ? "X" : "XI"); // compact roman, for mobile later

export function setEditionValue(ed) {
  const v = ed === "10th" ? "10th" : "11th";
  try { localStorage.setItem(CT_EDITION_KEY, v); } catch { /* storage unavailable */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: v })); } catch { /* no window */ }
  return v;
}

export function useEdition() {
  const [edition, setEd] = useState(readEdition);

  useEffect(() => {
    const onChange  = (e) => setEd(e.detail || readEdition());
    const onStorage = (e) => { if (e.key === CT_EDITION_KEY) setEd(readEdition()); };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((ed) => setEd(setEditionValue(ed)), []);
  const toggle = useCallback(() => setEd((prev) => setEditionValue(prev === "11th" ? "10th" : "11th")), []);

  return {
    edition,
    setEdition:    update,
    toggleEdition: toggle,
    label:         editionLabel(edition),
    labelLong:     editionLabelLong(edition),
    badge:         editionBadge(edition),
  };
}
