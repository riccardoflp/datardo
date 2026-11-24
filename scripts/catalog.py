#!/usr/bin/env python3
r"""Checks a feature catalog and writes its index.

A catalog is a folder of Markdown files, one per area, each card headed `### \`area.action\` — Title`.
This script finds every card, checks that identifiers are unique, that every identifier written in backticks
anywhere in the documents names a card, that a link to a card points to its heading, that each card has the lines its
kind requires, that no document uses a word the glossary says to avoid, that no document's file name starts with a
number, and writes the index `README.md` of the catalog, keeping the status each card already had there.

The roadmap is the first `*roadmap*.md` of the docs folder, unless `--roadmap` names another. When it has milestones
(`## M1 — …`), every card not yet built (Specified, Reviewed) or that Differs must start an item of exactly one
milestone's `### Features` list, or of the `## Not planned` section; an item written as a planned name in italics
(`*area.action*`) whose card exists is reported, to be turned into a link. The index then shows each card's milestone.
A card built in one milestone may be changed by later ones: their items start with `*(changed)*`, and the index shows
every milestone of the card.

The checks of the rules a project may pick (the rules to offer of the code rules) run only when asked:

--sources   The folders of the product's sources. Every place a card lists in **Entry points** as `@place` is
            written there as "area.action@place", and every such identifier there is a card that lists that place.
            Every code a card lists in **Refuses** as `/reason` is written there as "area.action/reason", and every
            such code there, of an area of the catalog, is a card that lists it.
--tests     The folders of the tests. Every card has a test whose name holds its identifier (branch.create, or
            branch_create), and every identifier of an area of the catalog quoted there is a card.
--commands  The files that register the commands (a package.json with the default pattern). Every command there is
            listed in the **Commands** line of a card, and every command a card lists is registered.
--settings  The file that declares the settings (a package.json, a JSON schema, or any file with --setting-pattern).
            Every setting there is in the first column of a table of a settings page, and the other way round.

Names given to --ignore are left out of every check.

Usage:
    python catalog.py <docs folder> [--features features] [--index] [--fix-eol] [--ignore a.b,c.d]
                      [--glossary path] [--roadmap path] [--sources folder,folder] [--tests folder,folder]
                      [--commands file,file] [--command-pattern regex] [--settings file] [--setting-pattern regex]

The glossary is the first `*glossary*.md` of the docs folder, unless `--glossary` names another. Its table needs a
column headed `Avoid`, with the words to avoid comma separated; the first column is the term to use instead.

Exit code 0 when nothing is wrong, 1 when something is, 2 when the folder is not there.
Only the standard library is used.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

CARD = re.compile(r"^### `([a-z][a-z0-9-]*\.[a-z][a-z0-9-]*)` — (.+?)\s*$")
KIND = re.compile(r"^- \*\*Kind\*\*:\s*([A-Za-z]+)")
TABLE_NAME = re.compile(r"^\| `([^`]+)`")
FILE_SUFFIXES = {"rs", "ts", "js", "json", "jsonc", "md", "toml", "yaml", "yml", "txt", "lock", "com", "org", "io",
                 "net", "py", "sh", "ps1", "cfg", "ini", "xml", "html", "css"}
FIELD = re.compile(r"^- \*\*([A-Za-z ]+)\*\*:")
INDEX_ROW = re.compile(r"^\| \[`([^`]+)`\]\([^)]*\) \| .* \| ([^|]+) \|\s*$")
PLACE = re.compile(r"`@([a-z][a-z0-9-]*)`")
REASON = re.compile(r"`/([a-z][a-z0-9-]*)`")
SPAN = re.compile(r"`([^`]+)`")
ELEMENT = re.compile(r"[\"'`]([a-z][a-z0-9-]*\.[a-z][a-z0-9-]*)@([a-z][a-z0-9-]*)[\"'`]")
COMMAND = r'"command"\s*:\s*"([^"]+)"'
SKIPPED_FOLDERS = {"node_modules", ".git", "dist", "out", "build", "target", ".venv", "__pycache__"}
CODE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".vue", ".svelte", ".html", ".json", ".py", ".rs", ".swift",
               ".kt", ".java", ".cs", ".xaml", ".xml", ".dart", ".go", ".cpp", ".h"}
STATUSES = ("Specified", "Reviewed", "Built", "Seen", "Documented", "Differs")
TO_PLAN = {"Specified", "Reviewed", "Differs"}
NUMBERED = re.compile(r"^\d+[-_.]")
MILESTONE = re.compile(r"^## (M\d+)\b")
IDENT = r"[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*"
ITEM_CARD = re.compile(r"^\s*(?:\d+[.)]|[-*+])\s+(\*\(changed\)\*\s+)?(?:\[\s*)?`(" + IDENT + r")`")
ITEM_PLANNED = re.compile(r"^\s*(?:\d+[.)]|[-*+])\s+[*_](" + IDENT + r")[*_]")
CARD_LINK = re.compile(r"\[`(" + IDENT + r")`\]\(([^)\s]*)\)")
REQUIRED = {
    "Operation": ("Function", "Danger", "Undo"),
    "Read": ("Function",),
    "View": ("Function",),
    "Derivation": ("Function",),
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def find_cards(features: Path) -> list[dict]:
    """Every card of the catalog, in file order, with the fields it has."""
    cards: list[dict] = []
    for file in sorted(path for path in features.glob("*.md") if path.name != "README.md"):
        current = None
        for number, line in enumerate(read_text(file).splitlines(), start=1):
            match = CARD.match(line)
            if match:
                current = {"id": match.group(1), "title": match.group(2), "file": file.name, "line": number,
                           "kind": "", "fields": set(), "heading": line, "marked": False, "texts": {}}
                cards.append(current)
                field_name = ""
                continue
            if line.startswith("## ") or line.startswith("# "):
                current = None
            if current is None:
                continue
            kind = KIND.match(line)
            if kind and not current["kind"]:
                current["kind"] = kind.group(1)
            field = FIELD.match(line)
            if field:
                field_name = field.group(1).strip()
                current["fields"].add(field_name)
            elif not line.startswith("  "):
                field_name = ""
            if field_name:
                current["texts"][field_name] = current["texts"].get(field_name, "") + " " + line
            if "(differs)" in line:
                current["marked"] = True
    for card in cards:
        texts = card["texts"]
        card["places"] = set(PLACE.findall(texts.get("Entry points", "")))
        card["reasons"] = set(REASON.findall(texts.get("Refuses", "")))
        card["commands"] = set(SPAN.findall(texts.get("Commands", "").replace("**Commands**", "")))
    return cards


def find_references(documents: list[Path], prefixes: set[str]) -> dict[str, list[str]]:
    """Every identifier written in backticks whose area is an area of the catalog, with where it is."""
    if not prefixes:
        return {}
    pattern = re.compile(r"`((?:" + "|".join(re.escape(p) for p in sorted(prefixes, key=len, reverse=True))
                         + r")\.[a-z][a-z0-9-]*)`")
    found: dict[str, list[str]] = {}
    for file in documents:
        for number, line in enumerate(read_text(file).splitlines(), start=1):
            if CARD.match(line):
                continue
            for match in pattern.finditer(line):
                if match.group(1).rsplit(".", 1)[1] in FILE_SUFFIXES:
                    continue
                found.setdefault(match.group(1), []).append(f"{file.name}:{number}")
    return found


def declared_names(documents: list[Path]) -> set[str]:
    """Names that the first column of a table declares, such as settings: they are not references to cards."""
    names = set()
    for file in documents:
        for line in read_text(file).splitlines():
            match = TABLE_NAME.match(line)
            if match:
                names.add(match.group(1))
    return names


def words_to_avoid(glossary: Path) -> dict[str, str]:
    """The words the glossary says to avoid, each with the term to use instead."""
    avoid: dict[str, str] = {}
    column = -1
    for line in read_text(glossary).splitlines():
        if not line.startswith("|"):
            column = -1
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if column < 0:
            names = [cell.lower() for cell in cells]
            column = names.index("avoid") if "avoid" in names else -1
            continue
        if column >= len(cells) or set(cells[0]) <= set("-: "):
            continue
        term = cells[0].strip("`*_ ")
        for word in cells[column].split(","):
            word = word.strip("`*_ .")
            if word and word not in ("-", "—", "none"):
                avoid[word] = term
    return avoid


def plural(word: str) -> str:
    """A pattern for the word and its plural: copy and copies, branch and branches."""
    if len(word) > 2 and word.endswith("y") and word[-2] not in "aeiou":
        return re.escape(word[:-1]) + "(?:y|ies)"
    return re.escape(word) + "(?:s|es)?"


def find_avoided(documents: list[Path], avoid: dict[str, str]) -> dict[str, list[str]]:
    """Where each avoided word is used, outside code blocks, code spans and link targets."""
    patterns = {word: re.compile(r"(?<![\w-])" + plural(word) + r"(?![\w-])", re.IGNORECASE) for word in avoid}
    found: dict[str, list[str]] = {}
    for file in documents:
        fenced = False
        for number, line in enumerate(read_text(file).splitlines(), start=1):
            if line.lstrip().startswith(("```", "~~~")):
                fenced = not fenced
                continue
            if fenced:
                continue
            text = re.sub(r"`[^`]*`", "", line)
            text = re.sub(r"\]\([^)]*\)", "]", text)
            for word, pattern in patterns.items():
                if pattern.search(text):
                    found.setdefault(word, []).append(f"{file.name}:{number}")
    return found


def source_files(folders: list[Path]) -> list[Path]:
    """The files of code in the folders given, leaving out dependencies and builds."""
    files: list[Path] = []
    for folder in folders:
        if folder.is_file():
            files.append(folder)
            continue
        for path in folder.rglob("*"):
            inside = set(path.relative_to(folder).parts)
            if path.is_file() and path.suffix in CODE_SUFFIXES and not SKIPPED_FOLDERS & inside:
                files.append(path)
    return sorted(set(files))


def lines_of(files: list[Path]):
    """Each line of the files, with where it is; files that are not text are skipped."""
    for file in files:
        try:
            lines = read_text(file).splitlines()
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(lines, start=1):
            yield f"{file.as_posix()}:{number}", line


def area_pattern(prefixes: set[str], tail: str) -> re.Pattern:
    """An identifier of an area of the catalog, in quotes, followed by the tail."""
    areas = "|".join(re.escape(prefix) for prefix in sorted(prefixes, key=len, reverse=True))
    return re.compile(r"[\"'`]((?:" + areas + r")\.[a-z][a-z0-9-]*)" + tail + r"[\"'`]")


def find_quoted(files: list[Path], pattern: re.Pattern, joiner: str) -> dict[str, list[str]]:
    """Every identifier with a place or a reason, written in quotes in the files, with where it is."""
    found: dict[str, list[str]] = {}
    for where, line in lines_of(files):
        for match in pattern.finditer(line):
            found.setdefault(f"{match.group(1)}{joiner}{match.group(2)}", []).append(where)
    return found


def find_tested(files: list[Path], cards: list[dict], prefixes: set[str]) -> tuple[set[str], dict[str, list[str]]]:
    """The cards that a test names, and the identifiers of the catalog's areas the tests quote that are no card."""
    forms = {}
    for card in cards:
        snake = card["id"].replace(".", "_").replace("-", "_")
        forms[card["id"]] = re.compile(r"(?<![\w.-])" + re.escape(card["id"]) + r"(?![\w-])|(?<!\w)"
                                       + re.escape(snake) + r"(?:__|(?!\w))")
    areas = "|".join(re.escape(prefix) for prefix in sorted(prefixes, key=len, reverse=True))
    snake_areas = "|".join(re.escape(prefix.replace("-", "_")) for prefix in sorted(prefixes, key=len, reverse=True))
    titled = re.compile(r"\b(?:describe|it|test|suite|context)(?:\.\w+)?\s*\(\s*[\"'`]((?:" + areas
                        + r")\.[a-z][a-z0-9-]*)(?=[\s\"'`:])") if prefixes else None
    named = re.compile(r"\b(?:test_)?((?:" + snake_areas + r")_[a-z0-9_]+?)__") if prefixes else None
    ids = {card["id"] for card in cards}
    snakes = {card["id"].replace(".", "_").replace("-", "_") for card in cards}
    tested: set[str] = set()
    unknown: dict[str, list[str]] = {}
    for where, line in lines_of(files):
        for identifier, form in forms.items():
            if identifier not in tested and form.search(line):
                tested.add(identifier)
        if titled:
            for match in titled.finditer(line):
                if match.group(1) not in ids:
                    unknown.setdefault(match.group(1), []).append(where)
            for match in named.finditer(line):
                if match.group(1) not in snakes:
                    unknown.setdefault(match.group(1), []).append(where)
    return tested, unknown


def registered_commands(files: list[Path], pattern: str) -> dict[str, list[str]]:
    """The commands the files register, with where."""
    regex = re.compile(pattern)
    found: dict[str, list[str]] = {}
    for where, line in lines_of(files):
        for match in regex.finditer(line):
            found.setdefault(match.group(1), []).append(where)
    return found


def declared_settings(file: Path, pattern: str) -> set[str]:
    """The settings the file declares: VS Code's contributes.configuration, a JSON schema's properties, or a pattern."""
    text = read_text(file)
    if pattern:
        return set(re.findall(pattern, text))
    data = json.loads(text)
    sections = data.get("contributes", {}).get("configuration", data) if isinstance(data, dict) else {}
    if isinstance(sections, dict):
        sections = [sections]
    names: set[str] = set()
    for section in sections:
        names.update(section.get("properties", {}).keys())
    return names


def documented_settings(docs: Path) -> dict[str, str]:
    """The settings named in the first column of the tables of the settings pages whose first column is headed
    *Setting*, with where. Other tables of those pages (numbers, limits) name cards, not settings."""
    names: dict[str, str] = {}
    for file in sorted(docs.rglob("*settings*.md")):
        in_settings = False
        previous_was_table = False
        for number, line in enumerate(read_text(file).splitlines(), start=1):
            is_table = line.startswith("|")
            if is_table and not previous_was_table:
                header = line.strip().strip("|").split("|")[0].strip()
                in_settings = header.lower() == "setting"
            previous_was_table = is_table
            match = TABLE_NAME.match(line)
            if match and in_settings:
                names.setdefault(match.group(1), f"{file.name}:{number}")
    return names


def read_roadmap(roadmap: Path) -> tuple[dict[str, list[str]], dict[str, list[str]], int]:
    """The cards each milestone's Features list (or Not planned) starts an item with, the planned names in italics,
    and how many milestones there are."""
    planned: dict[str, list[str]] = {}
    italic: dict[str, list[str]] = {}
    milestones = 0
    section = ""
    subsection = ""
    fenced = False
    for number, line in enumerate(read_text(roadmap).splitlines(), start=1):
        if line.lstrip().startswith(("```", "~~~")):
            fenced = not fenced
            continue
        if fenced:
            continue
        if line.startswith("## "):
            match = MILESTONE.match(line)
            subsection = ""
            if match:
                section = match.group(1)
                milestones += 1
            elif line[3:].strip().lower().startswith("not planned"):
                section = "not planned"
            else:
                section = ""
            continue
        if line.startswith("### "):
            subsection = line[4:].strip().lower()
            continue
        counted = section == "not planned" or (section and subsection == "features")
        if not counted:
            continue
        card = ITEM_CARD.match(line)
        if card:
            planned.setdefault(card.group(2), []).append(section + (" (changed)" if card.group(1) else ""))
        name = ITEM_PLANNED.match(line)
        if name:
            italic.setdefault(name.group(1), []).append(f"{roadmap.name}:{number}")
    return planned, italic, milestones


def find_bad_links(documents: list[Path], cards: dict[str, dict], features: Path) -> dict[str, list[str]]:
    """Links to a card, [`area.action`](path#anchor), whose path or anchor is not the card's."""
    bad: dict[str, list[str]] = {}
    for file in documents:
        fenced = False
        for number, line in enumerate(read_text(file).splitlines(), start=1):
            if line.lstrip().startswith(("```", "~~~")):
                fenced = not fenced
                continue
            if fenced:
                continue
            for match in CARD_LINK.finditer(line):
                card = cards.get(match.group(1))
                target = match.group(2)
                if card is None or "://" in target:
                    continue
                path, _, fragment = target.partition("#")
                linked = (file.parent / path).resolve() if path else file.resolve()
                if linked != (features / card["file"]).resolve() or (fragment and fragment != anchor(card["heading"])):
                    relative = os.path.relpath(features / card["file"], file.parent).replace(os.sep, "/")
                    right = f"{relative}#{anchor(card['heading'])}"
                    bad.setdefault(match.group(1), []).append(f"{file.name}:{number} (to {right})")
    return bad


def report(label: str, items: dict, ignored: set[str]) -> int:
    """Prints one line per item not ignored, and returns how many."""
    count = 0
    for name, places in sorted(items.items()):
        if name in ignored:
            continue
        if isinstance(places, list):
            places = ", ".join(places[:5]) + (" ..." if len(places) > 5 else "")
        print(f"{label} {name}: {places}")
        count += 1
    return count


def anchor(heading: str) -> str:
    """The anchor GitHub gives a heading."""
    text = heading.lstrip("#").strip().lower()
    text = re.sub(r"[^a-z0-9 _-]", "", text)
    return text.replace(" ", "-")


def existing_statuses(index: Path) -> dict[str, str]:
    if not index.exists():
        return {}
    statuses = {}
    for line in read_text(index).splitlines():
        match = INDEX_ROW.match(line)
        if match and match.group(2).strip() in STATUSES:
            statuses[match.group(1)] = match.group(2).strip()
    return statuses


def card_statuses(features: Path, cards: list[dict], default_status: str) -> dict[str, str]:
    """The status of each card: the index's, or the default for a card new to it; Differs follows the card's line."""
    known = existing_statuses(features / "README.md")
    statuses = {}
    for card in cards:
        status = known.get(card["id"], default_status)
        if "Differs" in card["fields"]:
            status = "Differs"
        elif status == "Differs":
            status = "Documented"
        statuses[card["id"]] = status
    return statuses


def write_index(features: Path, cards: list[dict], statuses: dict[str, str],
                milestones: dict[str, str] | None) -> None:
    index = features / "README.md"
    files = sorted({card["file"] for card in cards})
    titles = {name: read_text(features / name).splitlines()[0].lstrip("# ").strip() for name in files}
    lines = [
        "# The catalog of features",
        "",
        f"Every feature, one card each, {len(cards)} in all. The template and the rules of the cards are in the",
        "feature contract. This index is written by `catalog.py --index`: change a status here in the commit that",
        "earns it, and run the script again after adding or renaming a card; the statuses are kept. A card with a",
        "**Differs** line is *Differs*; when the line goes, it becomes *Documented*."
        + (" The milestone is the roadmap's." if milestones is not None else ""),
        "",
        "| File | Area | Cards |",
        "| --- | --- | --- |",
    ]
    for name in files:
        count = sum(1 for card in cards if card["file"] == name)
        lines.append(f"| [{name}]({name}) | {titles[name]} | {count} |")
    for name in files:
        if milestones is None:
            lines += ["", f"## {titles[name]}", "", "| Feature | Title | Kind | Status |", "| --- | --- | --- | --- |"]
        else:
            lines += ["", f"## {titles[name]}", "", "| Feature | Title | Kind | Milestone | Status |",
                      "| --- | --- | --- | --- | --- |"]
        for card in (card for card in cards if card["file"] == name):
            link = f"[`{card['id']}`]({name}#{anchor(card['heading'])})"
            milestone = "" if milestones is None else f" {milestones.get(card['id'], '—')} |"
            lines.append(f"| {link} | {card['title']} | {card['kind'] or '?'} |{milestone} {statuses[card['id']]} |")
    index.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {index} ({len(cards)} cards)")


def fix_line_endings(folder: Path) -> None:
    for file in folder.rglob("*.md"):
        data = file.read_bytes()
        if b"\r\n" in data:
            file.write_bytes(data.replace(b"\r\n", b"\n"))
            print(f"LF: {file}")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("docs", type=Path, help="the folder of the documents")
    parser.add_argument("--features", default="features", help="the catalog's folder inside it")
    parser.add_argument("--index", action="store_true", help="write the index of the catalog")
    parser.add_argument("--status", default="Specified", help="the status of a card new to the index")
    parser.add_argument("--fix-eol", action="store_true", help="turn CRLF into LF in every Markdown file")
    parser.add_argument("--ignore", default="", help="identifiers that look like cards but are not, comma separated")
    parser.add_argument("--glossary", type=Path, help="the glossary, when it is not the docs folder's *glossary*.md")
    parser.add_argument("--roadmap", type=Path, help="the roadmap, when it is not the docs folder's *roadmap*.md")
    parser.add_argument("--sources", default="", help="the folders of the sources, comma separated: elements and "
                        "error codes")
    parser.add_argument("--tests", default="", help="the folders of the tests, comma separated")
    parser.add_argument("--commands", default="", help="the files that register the commands, comma separated")
    parser.add_argument("--command-pattern", default=COMMAND, help="a regex whose group 1 is a registered command")
    parser.add_argument("--settings", type=Path, help="the file that declares the settings")
    parser.add_argument("--setting-pattern", default="", help="a regex whose group 1 is a declared setting")
    arguments = parser.parse_args()

    docs: Path = arguments.docs.resolve()
    features = docs / arguments.features
    if not features.is_dir():
        print(f"no catalog at {features}", file=sys.stderr)
        return 2
    if arguments.fix_eol:
        fix_line_endings(docs)

    cards = find_cards(features)
    problems = 0
    seen: dict[str, dict] = {}
    for card in cards:
        if card["id"] in seen:
            first = seen[card["id"]]
            print(f"DUPLICATE {card['id']}: {first['file']}:{first['line']} and {card['file']}:{card['line']}")
            problems += 1
        seen[card["id"]] = card
        if card["kind"] not in REQUIRED:
            print(f"NO KIND {card['id']} ({card['file']}:{card['line']})")
            problems += 1
            continue
        if card["marked"] and "Differs" not in card["fields"]:
            print(f"NO DIFFERS LINE in {card['id']}, which marks a line (differs) ({card['file']}:{card['line']})")
            problems += 1
        missing = [field for field in REQUIRED[card["kind"]] if field not in card["fields"]]
        if missing:
            print(f"MISSING {', '.join(missing)} in {card['id']} ({card['file']}:{card['line']})")
            problems += 1

    prefixes = {card["id"].split(".")[0] for card in cards}
    ignored = {item.strip() for item in arguments.ignore.split(",") if item.strip()}
    documents = [path for path in docs.rglob("*.md") if path.name != "README.md" or path.parent != features]
    root = docs.parent
    documents += [path for path in root.glob("*.md") if path not in documents]
    ignored |= declared_names(documents)
    for identifier, places in sorted(find_references(documents, prefixes).items()):
        if identifier not in seen and identifier not in ignored:
            print(f"DANGLING {identifier}: {', '.join(places[:5])}{' ...' if len(places) > 5 else ''}")
            problems += 1

    glossary = arguments.glossary or next(iter(sorted(docs.glob("*glossary*.md"))), None)
    if glossary is not None and glossary.exists():
        avoid = words_to_avoid(glossary)
        checked = [path for path in documents if path.resolve() != glossary.resolve()]
        for word, places in sorted(find_avoided(checked, avoid).items()):
            print(f"AVOID \"{word}\" (the glossary says {avoid[word]}): "
                  f"{', '.join(places[:5])}{' ...' if len(places) > 5 else ''}")
            problems += 1
    elif arguments.glossary is not None:
        print(f"no glossary at {arguments.glossary}", file=sys.stderr)
        return 2

    for path in sorted(docs.rglob("*.md")):
        if NUMBERED.match(path.name):
            better = NUMBERED.sub("", path.name)
            print(f"NUMBERED {path.relative_to(docs).as_posix()}: name it {better}, and fix the links to it")
            problems += 1

    for identifier, places in sorted(find_bad_links(documents, seen, features).items()):
        print(f"BAD LINK {identifier}: {', '.join(places[:5])}{' ...' if len(places) > 5 else ''}")
        problems += 1

    statuses = card_statuses(features, cards, arguments.status)
    milestones: dict[str, str] | None = None
    roadmap = arguments.roadmap or next(iter(sorted(docs.glob("*roadmap*.md"))), None)
    if arguments.roadmap is not None and not arguments.roadmap.exists():
        print(f"no roadmap at {arguments.roadmap}", file=sys.stderr)
        return 2
    if roadmap is not None and roadmap.exists():
        planned, italic, count = read_roadmap(roadmap)
        if count:
            milestones = {identifier: ", ".join(places) for identifier, places in planned.items()}
            for card in cards:
                identifier = card["id"]
                if identifier in ignored:
                    continue
                places = planned.get(identifier, [])
                if len([place for place in places if not place.endswith("(changed)")]) > 1:
                    print(f"TWICE IN THE ROADMAP {identifier}: {', '.join(places)}")
                    problems += 1
                elif not places and statuses[identifier] in TO_PLAN:
                    print(f"UNPLANNED {identifier} ({statuses[identifier]}, {card['file']}:{card['line']}): "
                          f"no milestone's Features, nor Not planned")
                    problems += 1
            for identifier in sorted(planned):
                if identifier not in seen and identifier not in ignored:
                    print(f"PLANNED, NO CARD {identifier} ({', '.join(planned[identifier])}): write it in italics "
                          f"(*{identifier}*) until its card exists")
                    problems += 1
            for identifier, places in sorted(italic.items()):
                if identifier in seen:
                    print(f"WRITTEN {identifier}: {', '.join(places)}: its card exists, link it")
                    problems += 1

    skipped = {item.strip() for item in arguments.ignore.split(",") if item.strip()}

    def paths(value: str) -> list[Path] | None:
        listed = [Path(item.strip()) for item in value.split(",") if item.strip()]
        absent = [path for path in listed if not path.exists()]
        if absent:
            print(f"not there: {', '.join(str(path) for path in absent)}", file=sys.stderr)
            return None
        return listed

    if arguments.sources:
        folders = paths(arguments.sources)
        if folders is None:
            return 2
        files = source_files(folders)
        elements = find_quoted(files, ELEMENT, "@")
        places = {f"{card['id']}@{place}": f"{card['file']}:{card['line']}" for card in cards
                  for place in card["places"]}
        problems += report("NO ELEMENT (the card lists the place, no source carries it)",
                           {name: where for name, where in places.items() if name not in elements}, skipped)
        problems += report("UNLISTED ELEMENT (no card lists this place)",
                           {name: where for name, where in elements.items() if name not in places}, skipped)
        codes = find_quoted(files, area_pattern(prefixes, "/([a-z][a-z0-9-]*)"), "/") if prefixes else {}
        reasons = {f"{card['id']}/{reason}": f"{card['file']}:{card['line']}" for card in cards
                   for reason in card["reasons"]}
        problems += report("NO CODE (the card lists the refusal, no source raises it)",
                           {name: where for name, where in reasons.items() if name not in codes}, skipped)
        problems += report("UNLISTED CODE (no card lists this refusal)",
                           {name: where for name, where in codes.items() if name not in reasons}, skipped)
        print(f"{len(elements)} elements and {len(codes)} codes in the sources; "
              f"{len(places)} places and {len(reasons)} codes on the cards")

    if arguments.tests:
        folders = paths(arguments.tests)
        if folders is None:
            return 2
        tested, unknown = find_tested(source_files(folders), cards, prefixes)
        untested = {card["id"]: f"{card['file']}:{card['line']}" for card in cards if card["id"] not in tested}
        problems += report("NO TEST", untested, skipped)
        problems += report("TEST OF NO CARD", unknown, skipped)
        print(f"{len(tested)} of {len(cards)} cards named by a test")

    if arguments.commands:
        files = paths(arguments.commands)
        if files is None:
            return 2
        registered = registered_commands(files, arguments.command_pattern)
        listed = {command: f"{card['file']}:{card['line']}" for card in cards for command in card["commands"]}
        problems += report("UNLISTED COMMAND (on no card's Commands line)",
                           {name: where for name, where in registered.items() if name not in listed}, skipped)
        problems += report("NO COMMAND (the card lists it, nothing registers it)",
                           {name: where for name, where in listed.items() if name not in registered}, skipped)
        print(f"{len(registered)} commands registered, {len(listed)} on the cards")

    if arguments.settings:
        if not arguments.settings.exists():
            print(f"not there: {arguments.settings}", file=sys.stderr)
            return 2
        declared = declared_settings(arguments.settings, arguments.setting_pattern)
        documented = documented_settings(docs)
        problems += report("UNDOCUMENTED SETTING", {name: arguments.settings.as_posix() for name in declared
                                                     if name not in documented}, skipped)
        problems += report("NO SUCH SETTING (documented, not declared)",
                           {name: where for name, where in documented.items() if name not in declared}, skipped)
        print(f"{len(declared)} settings declared, {len(documented)} documented")

    by_kind: dict[str, int] = {}
    for card in cards:
        by_kind[card["kind"] or "?"] = by_kind.get(card["kind"] or "?", 0) + 1
    print(f"{len(cards)} cards in {len({card['file'] for card in cards})} files: "
          + ", ".join(f"{count} {kind}" for kind, count in sorted(by_kind.items())))

    if arguments.index:
        write_index(features, cards, statuses, milestones)
    print("no problems" if problems == 0 else f"{problems} problems")
    return 0 if problems == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
