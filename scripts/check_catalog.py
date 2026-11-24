"""Runs catalog.py with the checks of the sources, the tests, the commands and the settings, for the cards that are
built.

The catalog describes every feature before its code exists. A card's elements, refusal codes, test, commands and
settings are required of the sources once the index marks it *Built* (at the end of its milestone); until then they
are left out of these checks. Everything else catalog.py checks applies to every card, built or not. A source that
carries an element or a code that no card lists is a problem, unless the **Differs** line of a card changed after it
was built names it as what the code still does.

Usage: python scripts/check_catalog.py docs
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalog  # noqa: E402

BUILT = {"Built", "Seen"}
SETTING = re.compile(r"`(datardo\.[a-zA-Z0-9.]+)`")
SETTING_ROW = re.compile(r"^\| `(datardo\.[a-zA-Z0-9.]+)` \|")
CARD_NAME = re.compile(r"`([a-z][a-z0-9-]*\.[a-z][a-z0-9-]*)`")


def readers_of_settings(docs: Path) -> dict[str, set[str]]:
    """The cards that read each setting, from the Read by column of the settings page."""
    readers: dict[str, set[str]] = {}
    for line in catalog.read_text(docs / "features" / "settings.md").splitlines():
        match = SETTING_ROW.match(line)
        if match:
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            readers[match.group(1)] = set(CARD_NAME.findall(cells[4] if len(cells) > 4 else ""))
    return readers


# A refusal of a built card that only a later card can raise, left out until that card is built: the host key of an
# SSH server is checked by connection.trust-host-key (M7).
LATER_REASONS = {"connection.connect/host-key": "connection.trust-host-key"}


def names_to_leave_out(docs: Path) -> list[str]:
    """What the cards that are not built would require of the sources."""
    features = docs / "features"
    cards = catalog.find_cards(features)
    statuses = catalog.card_statuses(features, cards, "Specified")
    built = {card["id"] for card in cards if statuses[card["id"]] in BUILT}
    names: set[str] = set()
    for card in cards:
        if card["id"] in built:
            continue
        names.add(card["id"])
        names |= {f"{card['id']}@{place}" for place in card["places"]}
        names |= {f"{card['id']}/{reason}" for reason in card["reasons"]}
        names |= set(card["commands"])
        # A card that Differs says in that line what the built code still does: the places and codes it names there
        # are the code's until the milestone that changes the card is done.
        differs = card["texts"].get("Differs", "")
        names |= {f"{card['id']}@{place}" for place in catalog.PLACE.findall(differs)}
        names |= {f"{card['id']}/{reason}" for reason in catalog.REASON.findall(differs)}
    # A place drawn by an area of which nothing is built yet (`@tree`, `@tree-menu`, `@home`) cannot carry its
    # elements: they are checked once that area is.
    built_areas = {name.split(".", 1)[0] for name in built}
    for card in cards:
        if card["id"] in built:
            names |= {f"{card['id']}@{place}" for place in card["places"]
                      if place.split("-", 1)[0] not in built_areas
                      and place.split("-", 1)[0] in {other["id"].split(".", 1)[0] for other in cards}}
    names |= {reason for reason, card in LATER_REASONS.items() if card not in built}
    for setting, readers in readers_of_settings(docs).items():
        if not readers & built:
            names.add(setting)
    return sorted(names)


def command_files(root: Path) -> list[Path]:
    """src/features/commands.ts, and the commands.ts of each area, which it gathers."""
    features = root / "src" / "features"
    return [features / "commands.ts", *sorted(features.glob("*/commands.ts"))]


def main() -> int:
    docs = Path(sys.argv[1] if len(sys.argv) > 1 else "docs")
    root = docs.resolve().parent
    left_out = names_to_leave_out(docs)
    sys.argv = [
        "catalog.py",
        str(docs),
        "--sources", str(root / "src"),
        "--tests", str(root / "test"),
        "--commands", ",".join(str(path) for path in command_files(root)),
        "--command-pattern", r"command\('([^']+)'",
        "--settings", str(root / "resources" / "settings.schema.json"),
        "--ignore", ",".join(left_out),
    ]
    return catalog.main()


if __name__ == "__main__":
    sys.exit(main())
