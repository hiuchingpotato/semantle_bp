"""British to American spelling rules.

These generate *candidates* only. Every rule here has exceptions that no
reasonable list can enumerate - "-our" turns "colour" into "color" but would
happily turn "four" into "for" - so build_data.py checks each candidate against
the embedding and throws away any pair whose two forms are not near-synonyms.

That check is what makes the rules safe to keep loose: a wrong pair is caught by
the data rather than by remembering to exclude it here.
"""

from __future__ import annotations

# Whole-word swaps that no suffix rule would catch.
IRREGULAR = {
    "aeroplane": "airplane",
    "aluminium": "aluminum",
    "annexe": "annex",
    "arse": "ass",
    "axe": "ax",
    "cheque": "check",
    "chequered": "checkered",
    "cosy": "cozy",
    "doughnut": "donut",
    "draught": "draft",
    "draughts": "drafts",
    "grey": "gray",
    "greyish": "grayish",
    "gaol": "jail",
    "jewellery": "jewelry",
    "kerb": "curb",
    "manoeuvre": "maneuver",
    "manoeuvres": "maneuvers",
    "moustache": "mustache",
    "mould": "mold",
    "moulds": "molds",
    "moulded": "molded",
    "moulding": "molding",
    "moult": "molt",
    "plough": "plow",
    "ploughed": "plowed",
    "ploughing": "plowing",
    "pyjamas": "pajamas",
    "sceptic": "skeptic",
    "sceptical": "skeptical",
    "scepticism": "skepticism",
    "speciality": "specialty",
    "specialities": "specialties",
    "storey": "story",
    "storeys": "stories",
    "sulphur": "sulfur",
    "tyre": "tire",
    "tyres": "tires",
    "whilst": "while",
    "programme": "program",
    "programmes": "programs",
}

# Suffix rewrites, longest first so that "-isation" wins over "-ise".
SUFFIX_RULES: list[tuple[str, str]] = [
    ("isation", "ization"),
    ("isations", "izations"),
    ("ising", "izing"),
    ("ised", "ized"),
    ("iser", "izer"),
    ("isers", "izers"),
    ("ises", "izes"),
    ("ise", "ize"),
    ("yse", "yze"),
    ("ysed", "yzed"),
    ("yses", "yzes"),
    ("ysing", "yzing"),
    ("ours", "ors"),
    ("our", "or"),
    ("oured", "ored"),
    ("ouring", "oring"),
    ("ourful", "orful"),
    ("ourless", "orless"),
    ("ourite", "orite"),
    ("tre", "ter"),
    ("tres", "ters"),
    ("bre", "ber"),
    ("bres", "bers"),
    ("ogue", "og"),
    ("ogues", "ogs"),
    ("lled", "led"),
    ("lling", "ling"),
    ("ller", "ler"),
    ("llers", "lers"),
    ("llor", "lor"),
    ("llors", "lors"),
    ("aemia", "emia"),
    ("aedic", "edic"),
    ("oedic", "edic"),
    ("oeuvre", "euver"),
    ("ence", "ense"),
    ("ences", "enses"),
]

# Words the suffix rules would mangle and the similarity check might not catch,
# because the two forms genuinely are related. Cheaper to name them.
NEVER_ALIAS = {
    "four", "hour", "pour", "tour", "your", "sour", "flour", "devour",
    "velour", "detour", "contour", "amour", "dour", "scour", "labour",
    "wise", "rise", "precise", "promise", "surprise", "exercise", "advertise",
    "compromise", "franchise", "merchandise", "improvise", "supervise",
    "televise", "revise", "devise", "despise", "disguise", "chastise",
    "excise", "incise", "apprise", "comprise", "enterprise", "paradise",
    "concise", "expertise", "noise", "poise", "guise", "anise", "demise",
    "are", "here", "more", "sure", "acre", "genre", "macabre", "mediocre",
    "ogre", "centre",  # centre is handled by the -tre rule, listed for clarity
    "sentence", "silence", "science", "conference", "difference", "evidence",
    "experience", "influence", "presence", "reference", "sequence", "violence",
    "audience", "essence", "absence", "patience", "residence", "confidence",
    "consequence", "existence", "independence", "intelligence", "preference",
    "commence", "convenience", "excellence", "occurrence", "prudence",
}
NEVER_ALIAS.discard("centre")
NEVER_ALIAS.discard("labour")


def candidates(word: str) -> list[str]:
    """American forms this British spelling might map to."""
    if word in NEVER_ALIAS:
        return []
    if word in IRREGULAR:
        return [IRREGULAR[word]]

    out: list[str] = []
    for british, american in sorted(SUFFIX_RULES, key=lambda r: -len(r[0])):
        if word.endswith(british) and len(word) > len(british):
            out.append(word[: -len(british)] + american)
    return out
