"""
Keystone Terrain Dashboard
Live-season terrain and lift collector.

Current behavior:
- Downloads Keystone's public terrain/lift status page
- Extracts the embedded FR.TerrainStatusFeed JSON
- Resolves live names to dashboard T### / L### IDs
- Validates unmatched names and unsupported statuses
- Dry-run by default
- With --write, upserts today's snapshot into the 26-27 CSVs

Scheduled lifts are treated as Open for the operating day,
while preserving raw_status = Scheduled.
"""

import argparse
import csv
import json
import re
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from playwright.sync_api import sync_playwright

# --------------------------------------------------
# PATHS / SETTINGS
# --------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

TRAILS_GEOJSON = DATA_DIR / "trails.geojson"
LIFTS_GEOJSON = DATA_DIR / "lifts.geojson"
CROSSWALK_CSV = DATA_DIR / "live_name_crosswalk.csv"

TRAIL_STATUS_CSV = DATA_DIR / "trail_status_26-27.csv"
LIFT_STATUS_CSV = DATA_DIR / "lift_status_26-27.csv"

SEASON = "26-27"
SEASON_START = date(2026, 10, 1)

TIMEZONE = ZoneInfo("America/Denver")

URL = (
    "https://www.keystoneresort.com/"
    "the-mountain/mountain-conditions/terrain-and-lift-status.aspx"
)


# Lower Windows is present in Keystone's current feed,
# but does not yet have a current dashboard polygon/ID.
ALLOWED_UNMATCHED_TRAILS = {
    "Lower Windows",
}

ALLOWED_UNMATCHED_LIFTS = set()


LIFT_STATUS_MAP = {
    0: "Closed",
    1: "Open",
    2: "On-Hold",
    3: "Scheduled",
    4: "Unknown",
}


# --------------------------------------------------
# DOWNLOAD / EXTRACT
# --------------------------------------------------

def get_page():
    """
    Download Keystone's terrain/lift page.

    Try a normal HTTP request first.
    If Keystone returns a page without TerrainStatusFeed,
    fall back to Chromium/Playwright.
    """

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

    html = response.text

    if "FR.TerrainStatusFeed" in html:
        print("Keystone feed retrieved with requests.")
        return html

    print(
        "TerrainStatusFeed not present in requests response. "
        "Falling back to Chromium..."
    )

    with sync_playwright() as p:

        browser = p.chromium.launch(headless=True)

        page = browser.new_page()

        page.goto(
            URL,
            wait_until="networkidle",
            timeout=60000,
        )

        html = page.content()

        browser.close()

    if "FR.TerrainStatusFeed" not in html:
        raise RuntimeError(
            "Could not retrieve FR.TerrainStatusFeed "
            "with requests or Chromium."
        )

    print("Keystone feed retrieved with Chromium.")

    return html


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

    feed = json.loads(match.group(1))

    if not feed.get("IsSuccessful"):
        raise RuntimeError(
            "Keystone TerrainStatusFeed reported IsSuccessful = false."
        )

    return feed


# --------------------------------------------------
# PARSE LIVE FEED
# --------------------------------------------------

def parse_lifts(feed):
    """Extract Keystone's resort-wide lift list."""

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


# --------------------------------------------------
# NAME / ID RESOLUTION
# --------------------------------------------------

def load_crosswalk():
    """Load live-name to dashboard-name mappings."""

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
    """Attach dashboard names and trail IDs."""

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
    """Attach dashboard names and lift IDs."""

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


# --------------------------------------------------
# VALIDATION
# --------------------------------------------------

def validate_snapshot(
    trails,
    lifts,
    resolved_trails,
    resolved_lifts,
    unmatched_trails,
    unmatched_lifts,
):
    """Fail before writing if the snapshot looks unsafe."""

    if len(trails) < 100:
        raise RuntimeError(
            f"Only {len(trails)} trails were returned. "
            "Expected more than 100. Refusing to write."
        )

    if len(lifts) < 15:
        raise RuntimeError(
            f"Only {len(lifts)} lifts were returned. "
            "Expected at least 15. Refusing to write."
        )

    unexpected_trails = (
        set(unmatched_trails) - ALLOWED_UNMATCHED_TRAILS
    )

    unexpected_lifts = (
        set(unmatched_lifts) - ALLOWED_UNMATCHED_LIFTS
    )

    if unexpected_trails:
        raise RuntimeError(
            "Unexpected unmatched trails: "
            + ", ".join(sorted(unexpected_trails))
        )

    if unexpected_lifts:
        raise RuntimeError(
            "Unexpected unmatched lifts: "
            + ", ".join(sorted(unexpected_lifts))
        )

    unsupported_lift_statuses = [
        lift
        for lift in resolved_lifts
        if lift["status"] == ""
    ]

    if unsupported_lift_statuses:

        details = ", ".join(
            f"{lift['name']}={lift['raw_status']}"
            for lift in unsupported_lift_statuses
        )

        raise RuntimeError(
            "Unsupported lift status encountered: "
            + details
            + ". Refusing to write until the status rule is defined."
        )


# --------------------------------------------------
# DATE / CSV HELPERS
# --------------------------------------------------

def season_day_for(snapshot_date):
    """October 1 = season_day 1."""

    return (snapshot_date - SEASON_START).days + 1


def upsert_csv(path, fieldnames, new_rows, snapshot_date):
    """
    Replace any existing records for snapshot_date,
    then append the new snapshot.
    """

    date_string = snapshot_date.isoformat()

    existing_rows = []

    if path.exists():

        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            existing_rows = [
                row
                for row in reader
                if row.get("date") != date_string
            ]

    combined_rows = existing_rows + new_rows

    temp_path = path.with_suffix(path.suffix + ".tmp")

    with open(
        temp_path,
        "w",
        newline="",
        encoding="utf-8",
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=fieldnames,
            lineterminator="\n",
        )

        writer.writeheader()
        writer.writerows(combined_rows)

    temp_path.replace(path)


# --------------------------------------------------
# BUILD DAILY ROWS
# --------------------------------------------------

def build_trail_rows(resolved_trails, snapshot_date):

    season_day = season_day_for(snapshot_date)

    dashboard_map = {
        "G": "Groomed",
        "O": "Open",
        "C": "Closed",
    }

    rows = []

    for trail in sorted(
        resolved_trails,
        key=lambda x: x["trail_id"],
    ):

        rows.append(
            {
                "trail_id": trail["trail_id"],
                "season": SEASON,
                "date": snapshot_date.isoformat(),
                "season_day": season_day,
                "dashboard_status":
                    dashboard_map[trail["status"]],
            }
        )

    return rows


def build_lift_rows(resolved_lifts, snapshot_date):

    season_day = season_day_for(snapshot_date)

    dashboard_map = {
        "O": "Open",
        "C": "Closed",
    }

    rows = []

    for lift in sorted(
        resolved_lifts,
        key=lambda x: x["lift_id"],
    ):

        rows.append(
            {
                "lift_id": lift["lift_id"],
                "season": SEASON,
                "date": snapshot_date.isoformat(),
                "season_day": season_day,
                "raw_status": lift["raw_status"],
                "dashboard_status":
                    dashboard_map[lift["status"]],
            }
        )

    return rows


# --------------------------------------------------
# MAIN
# --------------------------------------------------

def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--write",
        action="store_true",
        help="Write/update the 26-27 CSV files.",
    )

    args = parser.parse_args()

    snapshot_date = datetime.now(TIMEZONE).date()

    print("Downloading Keystone terrain status...")
    print(f"Snapshot date: {snapshot_date}")
    print(f"Season: {SEASON}")
    print()

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

    validate_snapshot(
        trails,
        lifts,
        resolved_trails,
        resolved_lifts,
        unmatched_trails,
        unmatched_lifts,
    )

    trail_rows = build_trail_rows(
        resolved_trails,
        snapshot_date,
    )

    lift_rows = build_lift_rows(
        resolved_lifts,
        snapshot_date,
    )

    print(f"Live trails found:     {len(trails)}")
    print(f"Resolved trail IDs:    {len(resolved_trails)}")
    print(f"Unmatched live trails: {len(unmatched_trails)}")

    for name in unmatched_trails:
        print(f"  ALLOWED UNMATCHED TRAIL: {name}")

    print()

    print(f"Live lifts found:      {len(lifts)}")
    print(f"Resolved lift IDs:     {len(resolved_lifts)}")
    print(f"Unmatched live lifts:  {len(unmatched_lifts)}")

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

    print()

    if not args.write:
        print("DRY RUN ONLY — no CSV files were changed.")
        print()
        print("To write this snapshot, run:")
        print("python3 scripts/collect_keystone.py --write")
        return

    upsert_csv(
        TRAIL_STATUS_CSV,
        [
            "trail_id",
            "season",
            "date",
            "season_day",
            "dashboard_status",
        ],
        trail_rows,
        snapshot_date,
    )

    upsert_csv(
        LIFT_STATUS_CSV,
        [
            "lift_id",
            "season",
            "date",
            "season_day",
            "raw_status",
            "dashboard_status",
        ],
        lift_rows,
        snapshot_date,
    )

    print("Snapshot written successfully:")
    print(f"  {TRAIL_STATUS_CSV}")
    print(f"  {LIFT_STATUS_CSV}")
    print()
    print(f"Trail rows written: {len(trail_rows)}")
    print(f"Lift rows written:  {len(lift_rows)}")


if __name__ == "__main__":
    main()