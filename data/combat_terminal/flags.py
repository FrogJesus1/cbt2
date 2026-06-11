"""
flags.py — single source of truth for modifier-flag parsing, classification,
and callout-note text.

Before this module the same ~40 flags were hand-maintained across four places
that had to be kept in lockstep:
    - engine._flag_int            (integer extraction, reason attribution)
    - engine FLAG_NOTE_MAP + the   (callout-note text shown in combat)
      inline note-building ladder
    - math_adapter._suffix_int     (integer extraction, math)
    - math_adapter._apply_flags    (the actual math effect)

This module collapses the *parsing*, *classification* (offensive vs defensive),
*known-flag set*, and *note text* into one registry.  The math effect itself
still lives in ``math_adapter._apply_flags`` (the authoritative implementation);
``tests/test_combat_math.py`` ties the two together by asserting that every flag
in this registry both produces a note here AND a real change to the modifiers in
_apply_flags — so a flag can never again silently have a math effect with no
visible note, or a note with no math.

A flag token looks like ``ml``, ``invuln4``, ``sus:2`` or ``woundsplus-1``.
``base`` is the flag's stem (``invuln``); ``parametric`` flags carry an integer
``N`` either embedded (``invuln4``) or colon-suffixed (``invuln:4``).
"""

from __future__ import annotations

from typing import Optional


# ─── Parsing primitives (the single int/value extractors) ───────────────────────

def split_key(flag: str) -> str:
    """Return the lowercased pre-colon stem of a flag token."""
    return str(flag).split(":")[0].lower()


def flag_int(flag: str, base: str, default: int = 1) -> int:
    """Extract the integer N from a flag in any of these forms:

        base            → default
        base:N / base:-N
        baseN  / base-N (number embedded in the flag name)

    Single replacement for the former ``engine._flag_int`` and
    ``math_adapter._suffix_int`` (whose semantics were identical).
    """
    s = str(flag)
    key = s.split(":")[0].lower()
    if ":" in s:
        try:
            return int(s.split(":")[1])
        except (ValueError, IndexError):
            return default
    if len(key) > len(base):
        try:
            return int(key[len(base):])
        except ValueError:
            return default
    return default


def flag_value_str(flag: str, base: str, default: str = "?") -> str:
    """Like ``flag_int`` but returns the raw value *string* (preserving leading
    ``-`` and unparsable values), or ``default`` when no value is present.

    Used by note text that historically echoed the raw token (e.g. invuln "?+").
    """
    s = str(flag)
    key = s.split(":")[0].lower()
    if ":" in s:
        v = s.split(":")[1]
        return v if v != "" else default
    if len(key) > len(base):
        return key[len(base):]
    return default


def _note(icon: str, text: str) -> dict:
    return {"icon": icon, "text": text}


# ─── Note builders (one per flag family) ────────────────────────────────────────
# Each returns the {"icon", "text"} dict shown in the combat callout panel.
# These reproduce the text that used to live in engine.FLAG_NOTE_MAP and the
# inline elif ladder in _query_combat.

def _n_invuln(f):
    return _note("diamond", f"Invulnerable save active — {flag_value_str(f, 'invuln')}+ invuln overrides armour save")

def _n_ea(f):
    return _note("zap", f"+{flag_value_str(f, 'ea', default='')} extra attack(s) per model")

def _n_ed(f):
    base = "dmgplus" if split_key(f).startswith("dmgplus") else "ed"
    return _note("zap", f"+{flag_value_str(f, base, default='1')} extra damage per unsaved wound")

def _n_fnp(f):
    v = flag_value_str(f, "fnp")
    return _note("shield", f"Feel No Pain {v}+ — target ignores wounds on {v}+")

def _n_criton(f):
    return _note("lightning", f"Critical hits on {flag_value_str(f, 'criton')}+ instead of 6+")

def _n_critwound(f):
    return _note("lightning", f"Critical wounds on {flag_value_str(f, 'critwound')}+ instead of 6+")

def _n_hitplus(f):
    return _note("target", f"+{flag_value_str(f, 'hitplus', default='1')} to Hit rolls")

def _n_wndplus(f):
    return _note("star", f"+{flag_value_str(f, 'wndplus', default='1')} to Wound rolls")

def _n_woundsplus(f):
    val = flag_value_str(f, "woundsplus", default="1")
    sign = "+" if not str(val).startswith("-") else ""
    return _note("shield", f"{sign}{val} to target Wounds characteristic (min 1)")

def _n_dmgred(f):
    base = "dmgreduce" if split_key(f).startswith("dmgreduce") else "dmgred"
    return _note("shield", f"-{flag_value_str(f, base, default='1')} Damage suffered per attack (final damage floored at 1)")

def _n_svplus(f):
    return _note("shield", f"+{flag_value_str(f, 'svplus', default='1')} to target Save rolls (better armour save)")

def _n_svminus(f):
    return _note("shield", f"-{flag_value_str(f, 'svminus', default='1')} to target Save rolls (worse armour save)")

def _n_sus(f):
    base = "sustained" if split_key(f).startswith("sustained") else "sus"
    n = flag_int(f, base, default=1)
    return _note("star", f"Sustained Hits {n} — critical hits generate +{n} extra hit(s)")

def _n_eapdef(f):
    n = flag_int(f, "eapdef", default=1)
    return _note("shield", f"-{n} Armour Penetration — target worsens incoming AP (e.g. Commander in Enforcer Battlesuit)")

def _n_eap(f):
    n = flag_int(f, "eap", default=1)
    return _note("skull", f"+{n} Armour Penetration — improves weapon AP (e.g. AP-1 → AP-{1 + n})")


def _fixed(icon: str, text: str):
    """Note builder for a flag with no parametric value."""
    return lambda _f: _note(icon, text)


# ─── The registry ───────────────────────────────────────────────────────────────
# Fields:
#   base        flag stem
#   parametric  True if the flag carries an integer N (embedded or :N)
#   defensive   True if the flag modifies the DEFENDER (routes Crusade traits)
#   note        callable(flag) -> {icon,text}, or None for "no callout"
#   legend      one-line human description (for docs/help)
#
# Order is irrelevant: lookup uses longest-base-match, with parametric flags
# allowed to match by prefix and fixed flags only by exact stem (mirroring the
# old `key in FLAG_NOTE_MAP` vs `key.startswith(...)` split).

FLAG_SPECS: list[dict] = [
    # ── Offensive: hit / wound / crit ───────────────────────────────────────────
    {"base": "ml",         "parametric": False, "defensive": False, "note": _fixed("target",    "Markerlights active — +1 to Hit rolls, Ignores Cover"),       "legend": "Markerlights/Guided: +1 to Hit, Ignore Cover"},
    {"base": "lethal",     "parametric": False, "defensive": False, "note": _fixed("lightning", "Lethal Hits — unmodified 6s to Hit auto-wound"),               "legend": "Lethal Hits: unmodified 6s to Hit auto-wound"},
    {"base": "twin",       "parametric": False, "defensive": False, "note": _fixed("star",      "Twin-linked — re-roll all failed wound rolls"),               "legend": "Twin-linked: re-roll all failed wound rolls"},
    {"base": "dev",        "parametric": False, "defensive": False, "note": _fixed("skull",     "Devastating Wounds — critical wounds bypass saves"),          "legend": "Devastating Wounds: crit wounds bypass saves"},
    {"base": "devastating","parametric": False, "defensive": False, "note": None,                                                                              "legend": "Devastating Wounds (alias of dev)"},
    {"base": "torrent",    "parametric": False, "defensive": False, "note": _fixed("target",    "Torrent — weapon auto-hits (no ballistic skill roll needed)"),"legend": "Torrent: weapon auto-hits"},
    {"base": "lance",      "parametric": False, "defensive": False, "note": _fixed("star",      "Lance — +1 to Wound rolls (charged this turn)"),              "legend": "Lance: +1 to Wound rolls"},
    {"base": "heavy",      "parametric": False, "defensive": False, "note": _fixed("target",    "Heavy — Remained Stationary: Heavy weapons get +1 to Hit rolls"), "legend": "Heavy (stationary): +1 to Hit on Heavy weapons"},
    {"base": "oath",       "parametric": False, "defensive": False, "note": _fixed("star",      "Oath of Moment — re-roll all failed Hit and Wound rolls"),    "legend": "Oath of Moment: re-roll all failed Hit and Wound rolls"},
    {"base": "sus",        "parametric": True,  "defensive": False, "note": _n_sus,             "legend": "Sustained Hits N: crit hits add N extra hits"},
    {"base": "sustained",  "parametric": True,  "defensive": False, "note": _n_sus,             "legend": "Sustained Hits N (alias of sus)"},
    {"base": "hitplus",    "parametric": True,  "defensive": False, "note": _n_hitplus,         "legend": "+N to Hit rolls"},
    {"base": "wndplus",    "parametric": True,  "defensive": False, "note": _n_wndplus,         "legend": "+N to Wound rolls"},
    {"base": "criton",     "parametric": True,  "defensive": False, "note": _n_criton,          "legend": "Critical hits on N+ instead of 6+"},
    {"base": "critwound",  "parametric": True,  "defensive": False, "note": _n_critwound,       "legend": "Critical wounds on N+ instead of 6+"},

    # ── Offensive: attacks / damage / AP ────────────────────────────────────────
    {"base": "blast",      "parametric": False, "defensive": False, "note": _fixed("skull",     "Blast — +1 Attack per 5 models in the target unit"), "legend": "Blast: +1 attack per 5 target models"},
    {"base": "rf",         "parametric": False, "defensive": False, "note": _fixed("lightning", "Rapid Fire — +attacks equal to weapon's Rapid Fire value within half range"), "legend": "Rapid Fire (within half range)"},
    {"base": "melta",      "parametric": False, "defensive": False, "note": _fixed("skull",     "Melta — +damage equal to weapon's Melta value within half range"), "legend": "Melta (within half range): +N damage"},
    {"base": "ea",         "parametric": True,  "defensive": False, "note": _n_ea,              "legend": "Extra attacks +N per model"},
    {"base": "ed",         "parametric": True,  "defensive": False, "note": _n_ed,              "legend": "Extra damage +N per unsaved wound"},
    {"base": "dmgplus",    "parametric": True,  "defensive": False, "note": _n_ed,              "legend": "Extra damage +N (alias of ed)"},
    {"base": "eap",        "parametric": True,  "defensive": False, "note": _n_eap,             "legend": "Improve attacker AP by N (AP-1 → AP-2)"},
    {"base": "igncover",   "parametric": False, "defensive": False, "note": _fixed("target",    "Ignore Cover — attacker ignores benefit of cover"),          "legend": "Ignore Cover"},
    {"base": "nocover",    "parametric": False, "defensive": False, "note": _fixed("target",    "Ignore Cover — attacker ignores benefit of cover"),          "legend": "Ignore Cover (alias of igncover)"},

    # ── Offensive: rerolls ──────────────────────────────────────────────────────
    {"base": "rrhit",      "parametric": False, "defensive": False, "note": _fixed("star",      "Re-roll Hits — re-roll all failed Hit rolls"),                "legend": "Re-roll all failed Hit rolls"},
    {"base": "rrhits",     "parametric": False, "defensive": False, "note": _fixed("star",      "Re-roll Hits — re-roll all failed Hit rolls"),                "legend": "Re-roll all failed Hit rolls (alias)"},
    {"base": "rrhit1",     "parametric": False, "defensive": False, "note": _fixed("star",      "Re-roll Hit 1s — re-roll Hit rolls of 1"),                    "legend": "Re-roll Hit rolls of 1"},
    {"base": "rrhits1",    "parametric": False, "defensive": False, "note": _fixed("star",      "Re-roll Hit 1s — re-roll Hit rolls of 1"),                    "legend": "Re-roll Hit rolls of 1 (alias)"},
    {"base": "rrwound1",   "parametric": False, "defensive": False, "note": _fixed("star",      "Re-roll Wound 1s — re-roll Wound rolls of 1"),                "legend": "Re-roll Wound rolls of 1"},
    {"base": "rrwounds1",  "parametric": False, "defensive": False, "note": _fixed("star",      "Re-roll Wound 1s — re-roll Wound rolls of 1"),                "legend": "Re-roll Wound rolls of 1 (alias)"},

    # ── Defensive: saves / damage reduction / target stats ──────────────────────
    {"base": "cover",      "parametric": False, "defensive": True,  "note": _fixed("shield",    "Target in cover — +1 to armour saves"),                       "legend": "Target in cover: +1 armour save"},
    {"base": "stealth",    "parametric": False, "defensive": True,  "note": _fixed("shield",    "Stealth — -1 to Hit rolls against this target"),              "legend": "Stealth: -1 to Hit vs target"},
    {"base": "indirect",   "parametric": False, "defensive": False, "note": _fixed("shield",    "Indirect Fire — -1 to Hit rolls, target benefits from cover"),"legend": "Indirect Fire: -1 to Hit + cover"},
    {"base": "halfdmg",    "parametric": False, "defensive": True,  "note": _fixed("shield",    "Half Damage — damage output halved (e.g. Duty Eternal)"),     "legend": "Half Damage"},
    {"base": "invuln",     "parametric": True,  "defensive": True,  "note": _n_invuln,          "legend": "Override target invulnerable save to N+"},
    {"base": "fnp",        "parametric": True,  "defensive": True,  "note": _n_fnp,             "legend": "Override target Feel No Pain to N+"},
    {"base": "eapdef",     "parametric": True,  "defensive": True,  "note": _n_eapdef,          "legend": "Defender worsens incoming AP by N"},
    {"base": "woundsplus", "parametric": True,  "defensive": True,  "note": _n_woundsplus,      "legend": "+N to target Wounds characteristic (min 1)"},
    {"base": "dmgreduce",  "parametric": True,  "defensive": True,  "note": _n_dmgred,          "legend": "-N Damage suffered per attack"},
    {"base": "dmgred",     "parametric": True,  "defensive": True,  "note": _n_dmgred,          "legend": "-N Damage suffered per attack (alias)"},
    {"base": "svplus",     "parametric": True,  "defensive": True,  "note": _n_svplus,          "legend": "+N to target Save rolls"},
    {"base": "svminus",    "parametric": True,  "defensive": True,  "note": _n_svminus,         "legend": "-N to target Save rolls"},
]


# ─── Derived lookups ────────────────────────────────────────────────────────────

KNOWN_FLAG_BASES = frozenset(spec["base"] for spec in FLAG_SPECS)

DEFENSIVE_FLAG_BASES = frozenset(spec["base"] for spec in FLAG_SPECS if spec["defensive"])


def _match_spec(flag: str) -> Optional[dict]:
    """Find the registry spec for a flag token using longest-base match.

    A *parametric* spec matches by prefix (so ``invuln4`` resolves to ``invuln``);
    a *fixed* spec matches only its exact stem (so ``mlx`` matches nothing —
    mirroring the old ``key in FLAG_NOTE_MAP`` exact check for fixed flags).
    When several bases match (e.g. ``eap`` and ``eapdef`` both prefix ``eapdef``)
    the longest base wins.
    """
    key = split_key(flag)
    best = None
    for spec in FLAG_SPECS:
        base = spec["base"]
        if key == base or (spec["parametric"] and key.startswith(base)):
            if best is None or len(base) > len(best["base"]):
                best = spec
    return best


def note_for(flag: str) -> Optional[dict]:
    """Return the combat-callout note dict for a flag, or None if it has none."""
    spec = _match_spec(flag)
    if spec is None or spec["note"] is None:
        return None
    return spec["note"](flag)


def legend_rows() -> dict:
    """Modifier-flag legend rows derived from FLAG_SPECS, split offensive vs
    defensive.

    The ``legend`` command used to hand-maintain a *separate* copy of every
    flag's description + effect — a fifth place the flag set had to be kept in
    lockstep, free to drift from the parsing/classification/note text used by the
    math. Generating the legend here makes FLAG_SPECS the single source: a flag
    can't exist in the math without also appearing, correctly described, in the
    legend.

    Each row: ``{flag, display, desc, effect}``.  ``effect`` reuses the same
    callout-note text the combat panel shows (so the legend and the in-combat
    note never disagree); flags with no note fall back to their one-line
    ``legend`` description.
    """
    offensive: list[dict] = []
    defensive: list[dict] = []
    for spec in FLAG_SPECS:
        base = spec["base"]
        note = spec["note"](base) if spec["note"] else None
        row = {
            "flag":    f"--{base}",
            "display": f"[{base}]",
            "desc":    spec["legend"],
            "effect":  note["text"] if note else spec["legend"],
        }
        (defensive if spec["defensive"] else offensive).append(row)
    return {"offensive": offensive, "defensive": defensive}


def is_defensive_flag(flag: str) -> bool:
    """True if the flag modifies the defender (see DEFENSIVE_FLAG_BASES).

    Kept byte-for-byte compatible with the previous ``math_adapter`` version so
    the Crusade attacker/defender routing is unchanged.
    """
    key = split_key(flag)
    if key in DEFENSIVE_FLAG_BASES:
        return True
    return any(key.startswith(base) for base in DEFENSIVE_FLAG_BASES)
