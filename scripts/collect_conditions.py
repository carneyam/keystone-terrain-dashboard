import argparse
import csv
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
CONDITIONS_FILE = DATA_DIR / "daily_conditions.csv"

SEASON = "26-27"
TIMEZONE = ZoneInfo("America/Denver")

KEYSTONE_URL = (
    "https://www.keystoneresort.com/"
    "the-mountain/mountain-conditions/snow-and-weather-report.aspx"
)

ONTHESNOW_URL = (
    "https://www.onthesnow.com/"
    "colorado/keystone/skireport"
)


def normalize_text(text):
    """Collapse whitespace so labels split across lines are easy to parse."""
    return re.sub(r"\s+", " ", text).strip()


def extract_number(pattern, text, label):
    match = re.search(pattern, text, re.IGNORECASE)

    if not match:
        raise RuntimeError(f"Could not find {label}.")

    return float(match.group(1))


def clean_number(value):
    """Return whole-number floats as ints."""
    if float(value).is_integer():
        return int(value)

    return value


def parse_keystone_report(text):
    text = normalize_text(text)

    hn24 = extract_number(
        r"(\d+(?:\.\d+)?)\s*in\s*24\s*HOUR\s*SNOWFALL",
        text,
        "Keystone 24-hour snowfall",
    )

    seven_day = extract_number(
        r"(\d+(?:\.\d+)?)\s*in\s*7\s*DAY\s*SNOWFALL",
        text,
        "Keystone 7-day snowfall",
    )

    base_depth = extract_number(
        r"(\d+(?:\.\d+)?)\s*in\s*BASE\s*DEPTH",
        text,
        "Keystone base depth",
    )

    season_total = extract_number(
        r"(\d+(?:\.\d+)?)\s*in\s*CURRENT\s*SEASON",
        text,
        "Keystone season snowfall",
    )

    updated_match = re.search(
        r"Updated\s+"
        r"([A-Za-z]+\s+\d{1,2},\s+\d{4})"
        r"\s+at\s+"
        r"(\d{1,2}:\d{2}\s+[AP]M)"
        r"\s+([A-Z]{2,4})",
        text,
        re.IGNORECASE,
    )

    if not updated_match:
        raise RuntimeError(
            "Could not find Keystone snow-report update timestamp."
        )

    report_date = datetime.strptime(
        updated_match.group(1),
        "%B %d, %Y",
    ).date()

    report_time = updated_match.group(2)
    report_timezone = updated_match.group(3)

    return {
        "hn24": clean_number(hn24),
        "seven_day": clean_number(seven_day),
        "hs": clean_number(base_depth),
        "season_to_date": clean_number(season_total),
        "report_date": report_date,
        "report_time": report_time,
        "report_timezone": report_timezone,
    }


def infer_month_day_date(month_text, day_text, snapshot_date):
    """
    OnTheSnow reports month/day without a year.

    Assume the current year unless that would place the report
    implausibly in the future, such as Dec 31 when today is Jan 1.
    """

    parsed = datetime.strptime(
        f"{month_text} {day_text} {snapshot_date.year}",
        "%b %d %Y",
    ).date()

    if parsed > snapshot_date + timedelta(days=1):
        parsed = parsed.replace(year=parsed.year - 1)

    return parsed


def parse_onthesnow_report(text, snapshot_date):
    text = normalize_text(text)

    updated_match = re.search(
        r"Snow Report Last Updated:\s*"
        r"([A-Za-z]{3})\s+(\d{1,2})",
        text,
        re.IGNORECASE,
    )

    if not updated_match:
        raise RuntimeError(
            "Could not find OnTheSnow report date."
        )

    report_date = infer_month_day_date(
        updated_match.group(1).title(),
        updated_match.group(2),
        snapshot_date,
    )

    acres_match = re.search(
        r"ACRES\s+OPEN\s+([\d,]+)",
        text,
        re.IGNORECASE,
    )

    if not acres_match:
        raise RuntimeError(
            "Could not find OnTheSnow acres open."
        )

    reported_acres = int(
        acres_match.group(1).replace(",", "")
    )

    lifts_match = re.search(
        r"LIFTS\s+OPEN\s+"
        r"(\d+)\s*/\s*(\d+)",
        text,
        re.IGNORECASE,
    )

    lifts_open = None
    lifts_total = None

    if lifts_match:
        lifts_open = int(lifts_match.group(1))
        lifts_total = int(lifts_match.group(2))

    percent_match = re.search(
        r"PERCENT\s+OPEN\s+"
        r"(\d+(?:\.\d+)?)\s*%",
        text,
        re.IGNORECASE,
    )

    percent_open = None

    if percent_match:
        percent_open = clean_number(
            float(percent_match.group(1))
        )

    base_match = re.search(
        r"is\s+a\s+(\d+(?:\.\d+)?)"
        r'["”]\s*base\s+depth',
        text,
        re.IGNORECASE,
    )

    base_depth = None

    if base_match:
        base_depth = clean_number(
            float(base_match.group(1))
        )

    return {
        "reported_acres": reported_acres,
        "report_date": report_date,
        "lifts_open": lifts_open,
        "lifts_total": lifts_total,
        "percent_open": percent_open,
        "base_depth": base_depth,
    }


def validate_keystone(data, snapshot_date):
    if data["report_date"] != snapshot_date:
        raise RuntimeError(
            "Keystone snow report is stale. "
            f"Snapshot date: {snapshot_date}; "
            f"report date: {data['report_date']}."
        )

    if not 0 <= data["hn24"] <= 60:
        raise RuntimeError("Keystone HN24 is outside expected range.")

    if not 0 <= data["hs"] <= 200:
        raise RuntimeError("Keystone base depth is outside expected range.")

    if not 0 <= data["season_to_date"] <= 800:
        raise RuntimeError(
            "Keystone season snowfall is outside expected range."
        )


def fetch_sources():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        keystone_page = browser.new_page()

        print("Loading Keystone snow report...")

        keystone_page.goto(
            KEYSTONE_URL,
            wait_until="domcontentloaded",
            timeout=60000,
        )

        keystone_page.wait_for_timeout(5000)

        keystone_text = keystone_page.locator(
            "body"
        ).inner_text()

        ots_page = browser.new_page()

        print("Loading OnTheSnow report...")

        ots_page.goto(
            ONTHESNOW_URL,
            wait_until="domcontentloaded",
            timeout=60000,
        )

        ots_page.wait_for_timeout(5000)

        ots_text = ots_page.locator(
            "body"
        ).inner_text()

        browser.close()

    return keystone_text, ots_text


def upsert_conditions(row):
    fieldnames = [
        "season",
        "date",
        "hn24",
        "season_to_date",
        "hs",
        "reported_acres",
    ]

    rows = []

    if CONDITIONS_FILE.exists():
        with CONDITIONS_FILE.open(
            "r",
            newline="",
            encoding="utf-8-sig",
        ) as file:
            reader = csv.DictReader(file)
            rows = list(reader)

    rows = [
        existing
        for existing in rows
        if not (
            existing.get("season") == row["season"]
            and existing.get("date") == row["date"]
        )
    ]

    rows.append(row)

    temp_file = CONDITIONS_FILE.with_suffix(".tmp")

    with temp_file.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=fieldnames,
        )

        writer.writeheader()
        writer.writerows(rows)

    temp_file.replace(CONDITIONS_FILE)


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--write",
        action="store_true",
        help="Write today's conditions to daily_conditions.csv",
    )

    args = parser.parse_args()

    snapshot_date = datetime.now(
        TIMEZONE
    ).date()

    print()
    print("Collecting Keystone daily conditions...")
    print(f"Snapshot date: {snapshot_date}")
    print(f"Season: {SEASON}")
    print()

    keystone_text, ots_text = fetch_sources()

    keystone = parse_keystone_report(
        keystone_text
    )

    onthesnow = parse_onthesnow_report(
        ots_text,
        snapshot_date,
    )

    validate_keystone(
        keystone,
        snapshot_date,
    )

    print()
    print("KEYSTONE")
    print("-" * 60)

    print(
        f"Report updated:    "
        f"{keystone['report_date']} "
        f"{keystone['report_time']} "
        f"{keystone['report_timezone']}"
    )

    print(
        f"24-hour snow:     "
        f"{keystone['hn24']} in"
    )

    print(
        f"7-day snow QA:    "
        f"{keystone['seven_day']} in"
    )

    print(
        f"Base depth:       "
        f"{keystone['hs']} in"
    )

    print(
        f"Season snowfall:  "
        f"{keystone['season_to_date']} in"
    )

    print()
    print("ONTHESNOW")
    print("-" * 60)

    print(
        f"Report date:      "
        f"{onthesnow['report_date']}"
    )

    print(
        f"Reported acres:   "
        f"{onthesnow['reported_acres']}"
    )

    if onthesnow["lifts_open"] is not None:
        print(
            f"Lifts open QA:    "
            f"{onthesnow['lifts_open']} / "
            f"{onthesnow['lifts_total']}"
        )

    if onthesnow["percent_open"] is not None:
        print(
            f"Percent open QA:  "
            f"{onthesnow['percent_open']}%"
        )

    if onthesnow["base_depth"] is not None:
        print(
            f"Base depth QA:    "
            f"{onthesnow['base_depth']} in"
        )

    # Only use OnTheSnow acreage if its report is current.
    if onthesnow["report_date"] == snapshot_date:
        reported_acres = onthesnow[
            "reported_acres"
        ]

        acres_status = "CURRENT"

    else:
        reported_acres = ""
        acres_status = "STALE — NOT WRITTEN"

    print()
    print(
        f"OnTheSnow acreage status: {acres_status}"
    )

    row = {
        "season": SEASON,
        "date": snapshot_date.isoformat(),
        "hn24": keystone["hn24"],
        "season_to_date": keystone[
            "season_to_date"
        ],
        "hs": keystone["hs"],
        "reported_acres": reported_acres,
    }

    print()
    print("DAILY CONDITIONS ROW")
    print("-" * 60)

    print(
        ",".join(
            str(row[field])
            for field in [
                "season",
                "date",
                "hn24",
                "season_to_date",
                "hs",
                "reported_acres",
            ]
        )
    )

    if not args.write:
        print()
        print(
            "DRY RUN ONLY — daily_conditions.csv "
            "was not changed."
        )

        print()
        print(
            "To write this snapshot, run:"
        )

        print(
            "python3 scripts/collect_conditions.py --write"
        )

        return

    upsert_conditions(row)

    print()
    print("Conditions snapshot written successfully:")
    print(f"  {CONDITIONS_FILE}")


if __name__ == "__main__":
    main()