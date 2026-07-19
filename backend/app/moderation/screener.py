"""Deterministic content screening for sticky notes (no external I/O)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# A conservative, intentionally small hard-block list. Real deployments would
# back this with a managed service; the interface stays identical.
_BANNED_TERMS: frozenset[str] = frozenset({"slur1", "slur2", "kill yourself", "kys"})
_URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
_MAX_URLS = 1


@dataclass(frozen=True, slots=True)
class ScreenResult:
    allowed: bool
    reasons: list[str] = field(default_factory=list)


class ContentScreener:
    """Screens note text against banned terms and spammy patterns."""

    def screen(self, content: str) -> ScreenResult:
        lowered = content.lower()
        reasons: list[str] = []

        for term in _BANNED_TERMS:
            if term in lowered:
                reasons.append("prohibited_language")
                break

        if len(_URL_RE.findall(content)) > _MAX_URLS:
            reasons.append("excessive_links")

        if _is_shouting(content):
            reasons.append("all_caps_spam")

        return ScreenResult(allowed=not reasons, reasons=reasons)


def _is_shouting(content: str) -> bool:
    letters = [c for c in content if c.isalpha()]
    if len(letters) < 20:
        return False
    uppercase = sum(1 for c in letters if c.isupper())
    return uppercase / len(letters) > 0.9
