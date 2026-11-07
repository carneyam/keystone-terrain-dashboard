"""
Keystone Terrain Dashboard
Daily live-season terrain and lift collector.

Development version:
- Downloads Keystone's public terrain/lift page
- Extracts the embedded FR.TerrainStatusFeed JSON
- Reads trail and lift status directly from structured data
- Prints results for validation

No CSV files are modified yet.
"""

import json
import re
import requests


URL = (
    "https://www.keystoneresort.com/"
    "the-mountain/mountain-conditions/terrain-and-lift-status.aspx"
)


LIFT_STATUS_MAP = {
    0: "Closed",
    1: "Open",
    2: "On-Hold",
    3: "Scheduled",
    4: "Unknown",
}


def get_page():
    """Download the Keystone terrain and lift status page."""

    response = requests.get(
        URL,
        timeout=30,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/156.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        },
    )

    response.raise_for_status()

    return response.text


def extract_feed(html):
    """Extract FR.TerrainStatusFeed JSON from the page."""

    pattern = (
        r"FR\.TerrainStatusFeed\s*=\s*"
        r"(\{.*?\})"
        r";\s*FR\.LiftStatusFilters"
    )

    match = re.search(pattern, html, re.DOTALL)

    if not match:
        raise RuntimeError(
            "Could not find FR.TerrainStatusFeed in Keystone page."
        )

    return json.loads(match.group(1))


def parse_lifts(feed):
    """Extract the unique resort-wide lift list."""

    lifts = []

    for lift in feed.get("Lifts", []):

        raw_status = LIFT_STATUS_MAP.get(
            lift.get("Status"),
            "Unknown",
        )

        if raw_status in {"Open", "Scheduled"}:
            normalized_status = "O"

        elif raw_status == "Closed":
            normalized_status = "C"

        else:
            # We will decide how to handle On-Hold / Unknown later.
            normalized_status = ""

        lifts.append(
            {
                "id": lift.get("Id"),
                "name": lift.get("Name"),
                "raw_status": raw_status,
                "status": normalized_status,
                "type": lift.get("Type"),
                "mountain": lift.get("Mountain"),
                "open_time": lift.get("OpenTime"),
                "close_time": lift.get("CloseTime"),
            }
        )

    return lifts


def parse_trails(feed):
    """Extract trails from all Keystone grooming areas."""

    trails = []

    for area in feed.get("GroomingAreas", []):

        area_name = area.get("Name")

        for trail in area.get("Trails", []):

            is_open = trail.get("IsOpen") is True
            is_groomed = trail.get("IsGroomed") is True

            if is_open and is_groomed:
                normalized_status = "G"

            elif is_open:
                normalized_status = "O"

            else:
                normalized_status = "C"

            trails.append(
                {
                    "id": trail.get("Id"),
                    "name": trail.get("Name"),
                    "area": area_name,
                    "is_open": is_open,
                    "is_groomed": is_groomed,
                    "status": normalized_status,
                }
            )

    return trails


def main():

    print("Downloading Keystone terrain status...")

    html = get_page()

    feed = extract_feed(html)

    lifts = parse_lifts(feed)
    trails = parse_trails(feed)

    print()
    print(f"Lifts found: {len(lifts)}")
    print("-" * 80)

    for lift in lifts:
        print(
            f"{lift['name']:<28} "
            f"{lift['raw_status']:<10} "
            f"{lift['status']:<2} "
            f"{lift['open_time']} - {lift['close_time']}"
        )

    print()
    print(f"Trails found: {len(trails)}")
    print("-" * 80)

    for trail in trails:
        print(
            f"{trail['name']:<35} "
            f"Open={trail['is_open']!s:<5} "
            f"Groomed={trail['is_groomed']!s:<5} "
            f"{trail['status']} "
            f"[{trail['area']}]"
        )


if __name__ == "__main__":
    main()