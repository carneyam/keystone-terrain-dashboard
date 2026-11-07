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

import csv
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

TRAILS_GEOJSON = "data/trails.geojson"
LIFTS_GEOJSON = "data/lifts.geojson"
CROSSWALK_CSV = "data/live_name_crosswalk.csv"

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

def load_crosswalk():
    """Load explicit live-name to dashboard-name mappings."""

    crosswalk = {
        "trail": {},
        "lift": {},
    }

    with open(CROSSWALK_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            source_type = row["source_type"].strip()
            source_name = row["source_name"].strip()
            dashboard_name = row["dashboard_name"].strip()

            crosswalk[source_type][source_name] = dashboard_name

    return crosswalk


def load_trail_ids():
    """Return dashboard trail name -> trail_id."""

    with open(TRAILS_GEOJSON, encoding="utf-8") as f:
        data = json.load(f)

    return {
        feature["properties"]["trail_name"]:
        feature["properties"]["trail_id"]
        for feature in data["features"]
    }


def load_lift_ids():
    """Return dashboard lift name -> lift_id."""

    with open(LIFTS_GEOJSON, encoding="utf-8") as f:
        data = json.load(f)

    return {
        feature["properties"]["lift_name"]:
        feature["properties"]["lift_id"]
        for feature in data["features"]
    }


def resolve_trail_ids(trails, crosswalk, trail_ids):
    """Attach dashboard name and trail_id to live trail records."""

    resolved = []
    unmatched = []

    for trail in trails:
        source_name = trail["name"]

        dashboard_name = crosswalk["trail"].get(
            source_name,
            source_name,
        )

        trail_id = trail_ids.get(dashboard_name)

        if trail_id is None:
            unmatched.append(source_name)
            continue

        record = trail.copy()
        record["dashboard_name"] = dashboard_name
        record["trail_id"] = trail_id

        resolved.append(record)

    return resolved, unmatched


def resolve_lift_ids(lifts, crosswalk, lift_ids):
    """Attach dashboard name and lift_id to live lift records."""

    resolved = []
    unmatched = []

    for lift in lifts:
        source_name = lift["name"]

        dashboard_name = crosswalk["lift"].get(
            source_name,
            source_name,
        )

        lift_id = lift_ids.get(dashboard_name)

        if lift_id is None:
            unmatched.append(source_name)
            continue

        record = lift.copy()
        record["dashboard_name"] = dashboard_name
        record["lift_id"] = lift_id

        resolved.append(record)

    return resolved, unmatched

def main():

    print("Downloading Keystone terrain status...")

    html = get_page()
    feed = extract_feed(html)

    lifts = parse_lifts(feed)
    trails = parse_trails(feed)

    crosswalk = load_crosswalk()
    trail_ids = load_trail_ids()
    lift_ids = load_lift_ids()

    resolved_trails, unmatched_trails = resolve_trail_ids(
        trails,
        crosswalk,
        trail_ids,
    )

    resolved_lifts, unmatched_lifts = resolve_lift_ids(
        lifts,
        crosswalk,
        lift_ids,
    )

    print()
    print(f"Live trails found:     {len(trails)}")
    print(f"Resolved trail IDs:    {len(resolved_trails)}")
    print(f"Unmatched live trails: {len(unmatched_trails)}")

    for name in unmatched_trails:
        print(f"  TRAIL UNMATCHED: {name}")

    print()
    print(f"Live lifts found:      {len(lifts)}")
    print(f"Resolved lift IDs:     {len(resolved_lifts)}")
    print(f"Unmatched live lifts:  {len(unmatched_lifts)}")

    for name in unmatched_lifts:
        print(f"  LIFT UNMATCHED: {name}")

    print()
    print("OPEN / SCHEDULED LIFTS")
    print("-" * 70)

    for lift in resolved_lifts:
        if lift["status"] == "O":
            print(
                lift["lift_id"],
                "|",
                lift["dashboard_name"],
                "|",
                lift["raw_status"],
            )

    print()
    print("OPEN TRAILS")
    print("-" * 70)

    for trail in resolved_trails:
        if trail["status"] in {"O", "G"}:
            print(
                trail["trail_id"],
                "|",
                trail["dashboard_name"],
                "|",
                trail["status"],
            )
if __name__ == "__main__":
    main()