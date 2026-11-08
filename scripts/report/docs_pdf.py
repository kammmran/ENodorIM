"""Typeset docs/DOKUMANTASYON-TR.md as a PDF.

The Markdown file is the single source: this script converts it rather than
restating it, so the PDF cannot drift from the document people read in the
repository.

    .venv/bin/python -m scripts.report.docs_pdf
    # -> reports/dokumantasyon_tr.tex and reports/dokumantasyon_tr.pdf

Needs XeLaTeX (TinyTeX is enough). Turkish hyphenation patterns are not
installed, so paragraphs are set with a generous emergency stretch instead.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "DOKUMANTASYON-TR.md"
OUT = ROOT / "reports" / "dokumantasyon_tr.tex"

# Symbols the text uses that Latin Modern has no glyph for, mapped to maths
# rather than dropped silently. Order matters: two-character sequences first.
SYMBOLS = [
    ("²⁺", r"\(^{2+}\)"), ("⁻", r"\(^{-}\)"), ("⁺", r"\(^{+}\)"),
    ("²", r"\(^{2}\)"), ("ᵢ", r"\(_{i}\)"), ("₂", r"\(_{2}\)"),
    ("Σ", r"\(\Sigma\)"), ("Δ", r"\(\Delta\)"), ("τ", r"\(\tau\)"),
    ("α", r"\(\alpha\)"), ("β", r"\(\beta\)"), ("µ", r"\(\mu\)"), ("μ", r"\(\mu\)"),
    ("≥", r"\(\geq\)"), ("≤", r"\(\leq\)"), ("≈", r"\(\approx\)"),
    ("×", r"\(\times\)"), ("→", r"\(\rightarrow\)"), ("−", "--"),
    ("·", r"\(\cdot\)"), ("’", "'"), ("‘", "'"), ("“", "``"), ("”", "''"),
]

# Latin Modern Mono has no Greek or maths glyphs and Verbatim cannot fall back
# to maths, so code blocks get an ASCII transliteration of the few we use.
VERBATIM = [("Σ", "Sum"), ("ᵢ", "i"), ("≈", "~"), ("²⁺", "2+"), ("≥", ">="),
            ("≤", "<="), ("×", "x"), ("−", "-"), ("·", "*"), ("→", "->"),
            ("τ", "tau"), ("µ", "u"), ("μ", "u")]

ESCAPES = {"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$",
           "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}",
           "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}


def escape(s: str) -> str:
    out = "".join(ESCAPES.get(c, c) for c in s)
    for a, b in SYMBOLS:
        out = out.replace(a, b)
    return out


def inline(s: str) -> str:
    """Markdown inline markup -> LaTeX, with code spans kept verbatim."""
    parts = re.split(r"(`[^`]+`)", s)
    done = []
    for part in parts:
        if part.startswith("`") and part.endswith("`") and len(part) > 1:
            done.append(r"\texttt{\small " + escape(part[1:-1]) + "}")
            continue
        # Links before escaping, so the URL survives intact.
        links: list[str] = []

        def keep(tex: str) -> str:
            links.append(tex)
            return f"\x00{len(links) - 1}\x00"

        part = re.sub(r"\[([^\]]+)\]\(([^)]+)\)",
                      lambda m: keep(r"\href{%s}{%s}" % (m.group(2), inline(m.group(1)))), part)
        part = re.sub(r"<(https?://[^>]+)>", lambda m: keep(r"\url{%s}" % m.group(1)), part)
        # A DOI is one long unbreakable word; narrow table columns need it to
        # be breakable after the slashes and dots.
        def doi_link(m: re.Match[str]) -> str:
            d = m.group(2).rstrip(".")
            shown = escape(d).replace("/", "/" + r"\allowbreak ").replace(".", "." + r"\allowbreak ")
            return keep(r"\href{https://doi.org/%s}{doi:\allowbreak %s}" % (d, shown))

        part = re.sub(r"\b(doi:)(\S+?)(?=[\s,;)]|$)", doi_link, part)
        part = escape(part)
        # Straight quote pairs -> proper opening and closing quotes.
        part = re.sub(r'"([^"]*)"', r"``\1''", part)
        part = re.sub(r"\*\*([^*]+)\*\*", r"\\textbf{\1}", part)
        part = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\\emph{\1}", part)
        part = re.sub(r"\x00(\d+)\x00", lambda m: links[int(m.group(1))], part)
        done.append(part)
    return "".join(done)


def table(rows: list[list[str]]) -> str:
    """Pipe table -> longtable, column widths from the content's own weight."""
    head, body = rows[0], rows[1:]
    n = len(head)
    weights = [max(len(r[i]) for r in rows if i < len(r)) ** 0.6 for i in range(n)]
    total = sum(weights)
    # The gutters below cost real width, so the columns get less than the line.
    widths = [0.93 * w / total for w in weights]
    spec = "".join(r"@{}p{%.3f\linewidth}@{\hspace{5pt}}" % w for w in widths[:-1]) \
        + r"@{}p{%.3f\linewidth}@{}" % widths[-1]
    lines = [r"\begin{small}", r"\begin{longtable}{%s}" % spec, r"\toprule"]
    lines.append(" & ".join(r"\textbf{%s}" % inline(c) for c in head) + r" \\")
    lines += [r"\midrule", r"\endfirsthead", r"\toprule"]
    lines.append(" & ".join(r"\textbf{%s}" % inline(c) for c in head) + r" \\")
    lines += [r"\midrule", r"\endhead", r"\bottomrule", r"\endfoot"]
    for r in body:
        cells = (r + [""] * n)[:n]
        lines.append(" & ".join(inline(c) for c in cells) + r" \\")
    lines += [r"\end{longtable}", r"\end{small}"]
    return "\n".join(lines)


def convert(md: str) -> tuple[str, str]:
    lines = md.split("\n")
    body: list[str] = []
    title = "Dokümantasyon"
    i, n = 0, len(lines)
    para: list[str] = []
    list_stack: list[str] = []          # "itemize" / "enumerate"

    def flush_para() -> None:
        if para:
            # A line ending in two spaces is a Markdown hard break; the last
            # line of a paragraph cannot carry one in LaTeX.
            text = ""
            for k, (raw, hard) in enumerate(para):
                text += raw + ("\x01" if hard and k < len(para) - 1 else " ")
            # The marker goes in before escaping and becomes a break after it,
            # so the backslashes are not escaped along with the prose.
            body.append(inline(text.strip()).replace("\x01", r" \\" + "\n"))
            body.append("")
            para.clear()

    def close_lists() -> None:
        while list_stack:
            body.append(r"\end{%s}" % list_stack.pop())
        body.append("")

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_para(); close_lists()
            i += 1
            code = []
            while i < n and not lines[i].strip().startswith("```"):
                code.append(lines[i]); i += 1
            i += 1
            for a, b in VERBATIM:
                code = [c.replace(a, b) for c in code]
            body += [r"\begin{Verbatim}[fontsize=\small, xleftmargin=1em]", *code,
                     r"\end{Verbatim}", ""]
            continue

        if not stripped:
            flush_para()
            if list_stack:
                close_lists()
            i += 1
            continue

        if stripped == "---":
            flush_para(); close_lists()
            body += [r"\vspace{0.4\baselineskip}", r"\hrule", r"\vspace{0.9\baselineskip}", ""]
            i += 1
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            flush_para(); close_lists()
            level, text = len(m.group(1)), m.group(2)
            if level == 1:
                title = text
                body += [r"\maketitle", ""]
            else:
                cmd = {2: "section", 3: "subsection", 4: "subsubsection"}[level]
                # Drop the leading section number; LaTeX numbers these itself.
                body += [r"\%s{%s}" % (cmd, inline(re.sub(r"^\d+(\.\d+)*\.?\s+", "", text))), ""]
            i += 1
            continue

        if stripped.startswith("|"):
            flush_para(); close_lists()
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                raw = lines[i].strip().strip("|")
                cells = [c.strip() for c in raw.split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                    rows.append(cells)
                i += 1
            if rows:
                body += [table(rows), ""]
            continue

        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if m:
            flush_para()
            indent, marker, text = len(m.group(1)), m.group(2), m.group(3)
            kind = "itemize" if marker in "-*" else "enumerate"
            depth = indent // 2 + 1
            while len(list_stack) > depth:
                body.append(r"\end{%s}" % list_stack.pop())
            if len(list_stack) < depth:
                body.append(r"\begin{%s}" % kind)
                list_stack.append(kind)
            elif list_stack[-1] != kind:
                body.append(r"\end{%s}" % list_stack.pop())
                body.append(r"\begin{%s}" % kind)
                list_stack.append(kind)
            # Wrapped continuation lines belong to this item.
            item = [text]
            while i + 1 < n and lines[i + 1].strip() and not re.match(
                    r"^(\s*)([-*]|\d+\.)\s+|^\s*[|#`]|^---$", lines[i + 1]) \
                    and len(lines[i + 1]) - len(lines[i + 1].lstrip()) > indent:
                i += 1
                item.append(lines[i].strip())
            body.append(r"\item " + inline(" ".join(item)))
            i += 1
            continue

        para.append((stripped, line.endswith("  ")))
        i += 1

    flush_para()
    close_lists()
    return title, "\n".join(body)


PREAMBLE = r"""\documentclass[11pt,a4paper]{article}
\usepackage{fontspec}
% Load Latin Modern by file, so no system font registration is needed. It
% carries the full Turkish alphabet, dotless i and breves included.
\setmainfont{lmroman10-regular.otf}[
  BoldFont      = lmroman10-bold.otf,
  ItalicFont    = lmroman10-italic.otf,
  BoldItalicFont= lmroman10-bolditalic.otf]
\setsansfont{lmsans10-regular.otf}[
  BoldFont   = lmsans10-bold.otf,
  ItalicFont = lmsans10-oblique.otf]
\setmonofont{lmmono10-regular.otf}[
  BoldFont   = lmmonolt10-bold.otf,
  ItalicFont = lmmono10-italic.otf,
  Scale      = MatchLowercase]
\usepackage[a4paper,margin=2.4cm,bottom=2.6cm]{geometry}
\usepackage{booktabs,longtable,array,fancyvrb,microtype}
\usepackage[table]{xcolor}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\setlist{nosep,leftmargin=1.3em}
\titleformat{\section}{\large\bfseries}{\thesection}{0.7em}{}
\titleformat{\subsection}{\normalsize\bfseries}{\thesubsection}{0.6em}{}
\titlespacing*{\section}{0pt}{1.4\baselineskip}{0.4\baselineskip}
\titlespacing*{\subsection}{0pt}{1.0\baselineskip}{0.3\baselineskip}
\renewcommand{\arraystretch}{1.15}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.55\baselineskip}
% The Markdown numbers its sections from 0 (the summary); match it.
\setcounter{section}{-1}
% No Turkish hyphenation patterns in this TeX installation, so give the
% paragraph breaker room instead of letting it overflow the margin.
\sloppy
\emergencystretch=2.5em
\hyphenpenalty=1200
\usepackage{fancyhdr}
"""


def main() -> int:
    md = SRC.read_text(encoding="utf-8")
    title, body = convert(md)
    tex = PREAMBLE.replace(r"\usepackage{fancyhdr}" + "\n", "")
    tex += "\n".join([
        r"\title{\bfseries " + escape(title) + "}",
        r"\author{Kamran Heydarov}",
        r"\date{15 Ekim 2026}",
        r"\begin{document}",
        body,
        r"\end{document}", ""])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(tex, encoding="utf-8")
    print("wrote", OUT.relative_to(ROOT))

    if not shutil.which("xelatex"):
        print("xelatex not found; .tex written but not compiled", file=sys.stderr)
        return 1
    for _ in range(2):  # twice, so longtable column widths settle
        r = subprocess.run(["xelatex", "-interaction=nonstopmode", "-halt-on-error",
                            OUT.name], cwd=OUT.parent, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stdout[-4000:], file=sys.stderr)
            return r.returncode
    for ext in (".aux", ".log", ".out"):
        OUT.with_suffix(ext).unlink(missing_ok=True)
    print("wrote", OUT.with_suffix(".pdf").relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
