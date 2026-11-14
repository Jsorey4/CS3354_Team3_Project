"""
@author: Aashwat Singh (Markdown comments), Saaqib Shaik (spreadsheet export)
@description: Cleans untrusted text before it is stored or exported. sanitize_markdown() removes every HTML
    tag (and the entire contents of <script>, <iframe>, <object>, <embed>, <svg> and <style>), inline
    on*= event handlers, and every link whose address is not http:, https:, mailto: or a relative path
    (so javascript:, data:, vbscript: and any disguised spelling of them are gone) while keeping normal
    Markdown such as **bold**, *italic*, `code`, lists and @mentions. clean_single_line() / clean_text()
    remove invisible control characters from names and titles. sanitize_spreadsheet_cell() stops
    "formula injection" by making cells that start with = + - @ tab, carriage return or line feed plain
    text in Excel / Google Sheets. Every pattern here runs in time proportional to the text length.
@traces: SE-FR-19, SE-FR-20, SE-FR-28, UC-14, UC-15, UC-21
"""

from __future__ import annotations

import html
import re
from typing import Any

import nh3

_DANGEROUS_CONTENT_TAGS = {"script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "frameset", "frame", "applet"}
# One character class, so the scan after "<" is linear. (The earlier "<\s*/?\s*" form had two adjacent
# \s* runs and backtracked quadratically on "<" followed by thousands of spaces.)
_TAG_LIKE = re.compile(r"<[\s/]*[A-Za-z!?]")
# Allowlist, not blocklist: a link target with any scheme other than these is neutralised.
SAFE_LINK_SCHEMES = frozenset({"http", "https", "mailto"})
_URL_SCHEME = re.compile(r"^([A-Za-z][A-Za-z0-9+.\-]{0,40}):")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
# Characters browsers ignore inside a URL scheme or that are invisible: whitespace, C0 / C1 controls,
# soft hyphen, zero-width characters, bidi overrides, line / paragraph separators, BOM.
_URL_IGNORABLE = re.compile(r"[\s\x00-\x1f\x7f-\x9f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]+")
# Invisible characters that have no place in a name or title (everything above except plain spaces).
_INVISIBLE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]")
_LINE_BREAKS = re.compile(r"[\r\n\t\x0b\x0c\x85\u2028\u2029]+")
_REFERENCE_LINK = re.compile(r"^(\s{0,3}\[[^\]\n]+\]:\s*)(\S+)(.*)$", re.MULTILINE)
# Schemes that run code or read local data. Used where the allowlist cannot be applied (a target broken
# across lines is not a link in Markdown, but a careless renderer could still join it back together).
_SCRIPT_SCHEME = re.compile(r"^(?:javascript|vbscript|data|file|blob|livescript|mocha)\s*:", re.IGNORECASE)
_MAX_PASSES = 5


def _strip_html(text: str) -> str:
    """Removes all tags with nh3 (an HTML5 parser, not regex) and decodes entities, to a fixed point."""
    for _ in range(_MAX_PASSES):
        cleaned = nh3.clean(
            text,
            tags=set(),
            attributes={},
            clean_content_tags=_DANGEROUS_CONTENT_TAGS,
            strip_comments=True,
        )
        cleaned = html.unescape(cleaned)
        if cleaned == text and not _TAG_LIKE.search(cleaned):
            return cleaned
        text = cleaned
        if not _TAG_LIKE.search(text):
            return text
    # Pathological nesting: escape whatever angle brackets remain so no tag can survive.
    return text.replace("<", "‹").replace(">", "›")


def _is_dangerous_url(url: str) -> bool:
    """True unless the target is relative or uses http:, https: or mailto:.

    Browsers decode HTML entities and drop tabs, newlines and control characters inside a scheme
    ("jav&#x09;ascript:", "java\tscript:", "JaVaScRiPt:" all run as script), so the target is decoded
    (repeatedly, for double encoding) and stripped of every ignorable character before the scheme is read.
    """
    candidate = url
    for _ in range(3):
        decoded = html.unescape(candidate)
        if decoded == candidate:
            break
        candidate = decoded
    normalized = _URL_IGNORABLE.sub("", candidate).strip("<>")
    match = _URL_SCHEME.match(normalized)
    if match is None:
        return False  # no scheme: "#section", "/path", "page.html"
    return match.group(1).lower() not in SAFE_LINK_SCHEMES


def _neutralize_inline_links(text: str) -> str:
    """Replaces dangerous targets of [label](target) links, handling nested parentheses in O(L)."""
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        j = text.find("](", i)
        if j == -1:
            out.append(text[i:])
            break
        out.append(text[i : j + 2])
        k = j + 2
        depth = 1
        broken_by_newline = False
        while k < n and depth > 0:
            ch = text[k]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    break
            elif ch == "\n":
                broken_by_newline = True
                break
            k += 1
        target = text[j + 2 : k]
        # "java\nscript:..." - browsers drop line breaks inside a URL, so look just past the break too
        # (a fixed 64 characters: constant work per link, the scan stays linear).
        split_scheme = broken_by_newline and bool(_SCRIPT_SCHEME.match(_URL_IGNORABLE.sub("", html.unescape(text[j + 2 : k + 64]))))
        if split_scheme or _is_dangerous_url(target):
            out.append("#")
        else:
            out.append(target)
        i = k
    return "".join(out)


def _neutralize_reference_links(text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        if _is_dangerous_url(match.group(2)):
            return f"{match.group(1)}#"
        return match.group(0)

    return _REFERENCE_LINK.sub(repl, text)


_BARE_SCRIPT_SCHEME = re.compile(r"(?i)\b(javascript|vbscript)(\s*):")
_BARE_DATA_URL = re.compile(r"(?i)\b(data)(\s*):(?=\s*[a-z]+/[a-z0-9.+-]+\s*[;,])")


def _neutralize_bare_schemes(text: str) -> str:
    """Breaks remaining bare javascript:/vbscript:/data:<mime> URLs so Markdown auto-linkers ignore them.

    The colon becomes U+2236 (RATIO), which looks alike but is not a URL scheme separator. Ordinary prose
    such as "Data: 5 rows" is left untouched.
    """
    text = _BARE_SCRIPT_SCHEME.sub(lambda m: f"{m.group(1)}{m.group(2)}∶", text)
    return _BARE_DATA_URL.sub(lambda m: f"{m.group(1)}{m.group(2)}∶", text)


def sanitize_markdown(raw_text: str) -> str:
    """Returns Markdown that contains no HTML elements, event handlers or script URLs."""
    if raw_text is None:
        return ""
    text = str(raw_text).replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL_CHARS.sub("", text)
    text = _strip_html(text)
    text = _neutralize_inline_links(text)
    text = _neutralize_reference_links(text)
    text = _neutralize_bare_schemes(text)
    return text.strip()


def clean_text(value: str) -> str:
    """Removes invisible control characters but keeps normal line breaks (notes, descriptions)."""
    return _INVISIBLE.sub("", value.replace("\r\n", "\n").replace("\r", "\n"))


def clean_single_line(value: str) -> str:
    """For names and titles: line breaks become one space, invisible characters are removed, ends trimmed.

    A title can therefore never contain a CR or LF, which is what a calendar-file (.ics) or header
    injection would need.
    """
    return _INVISIBLE.sub("", _LINE_BREAKS.sub(" ", value)).strip()


# Characters that make Excel, LibreOffice or Google Sheets evaluate a cell (CWE-1236): = + - @, the
# control characters a spreadsheet skips before them, and the full-width forms East Asian locales accept.
_FORMULA_TRIGGERS = frozenset("=+-@\uff1d\uff0b\uff0d\uff20")
_FORMULA_LEADING_CONTROLS = frozenset("\t\r\n")
_LEADING_IGNORABLE = re.compile(r"^[\s\x00-\x1f\x7f-\x9f\u00a0\u200b-\u200f\u2028\u2029\u2060\ufeff]+")
# XML 1.0 cannot carry these, so a workbook containing one would fail to save (or to open).
_XML_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]")


def sanitize_spreadsheet_cell(val: Any) -> Any:
    """Prefixes formula-like strings with a single quote so spreadsheets treat them as text (CWE-1236).

    Applied to every string cell of every export. A cell is prefixed when it starts with a tab, carriage
    return or line feed, or when its first visible character is = + - or @ (leading spaces and invisible
    characters do not hide a formula). Numbers, dates and Decimals are passed through untouched.
    """
    if not isinstance(val, str) or not val:
        return val
    val = _XML_ILLEGAL.sub("", val)
    if not val:
        return val
    if val[0] in _FORMULA_LEADING_CONTROLS:
        return "'" + val
    visible = _LEADING_IGNORABLE.sub("", val, count=1)
    if visible and visible[0] in _FORMULA_TRIGGERS:
        return "'" + val
    return val
