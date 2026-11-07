"""
Keystone Terrain Dashboard
Daily live-season terrain and lift collector.

Initial development version:
- Downloads Keystone's public lift/terrain status page
- Extracts lift names, raw statuses, and operating hours
- Extracts trail names, raw statuses, and grooming status
- Prints results for validation

No CSV files are modified yet.
"""

import requests
from bs4 import BeautifulSoup


URL = (
    "https://www.keystoneresort.com/"
    "the-mountain/mountain-conditions/terrain-and-lift-status.aspx"
)


def get_page():
    """Download the Keystone terrain and lift status page."""

    response = requests.get(
        URL,
        timeout=30,
        headers={
            "User-Agent": (
                "Mozilla/5.0 Keystone Terrain Dashboard "
                "historical-status-collector"
            )
        },
    )

    response.raise_for_status()

    return response.text


def parse_lifts(soup):
    """Extract lift name, raw status, and operating hours."""

    lifts = []

    rows = soup.select("div.liftStatus__lifts__row")

    for row in rows:

        name_element = row.select_one(
            ".liftStatus__lifts__row__title:not(.liftStatus__lifts__row__time)"
        )

        if not name_element:
            continue

        name = name_element.get_text(strip=True)

        time_element = row.select_one(
            ".liftStatus__lifts__row__time"
        )

        hours = (
            time_element.get_text(" ", strip=True)
            if time_element
            else ""
        )

        raw_status = "Unknown"

        status_icon = row.select_one(
            "[class*='icon-status-']"
        )

        if status_icon:

            classes = status_icon.get("class", [])

            if "icon-status-scheduled" in classes:
                raw_status = "Scheduled"

            elif "icon-status-open" in classes:
                raw_status = "Open"

            elif "icon-status-closed" in classes:
                raw_status = "Closed"

        normalized_status = (
            "O"
            if raw_status in {"Open", "Scheduled"}
            else "C"
            if raw_status == "Closed"
            else ""
        )

        lifts.append(
            {
                "name": name,
                "raw_status": raw_status,
                "status": normalized_status,
                "hours": hours,
            }
        )

    return lifts


def parse_trails(soup):
    """Extract trail name, raw status, and grooming status."""

    trails = []

    rows = soup.select("div.trailStatus__trails__row")

    for row in rows:

        name_element = row.select_one(
            ".trailStatus__trails__row--name"
        )

        if not name_element:
            continue

        name = name_element.get_text(strip=True)

        raw_status = "Unknown"

        status_icon = row.select_one(
            "[class*='icon-status-']"
        )

        if status_icon:

            classes = status_icon.get("class", [])

            if "icon-status-open" in classes:
                raw_status = "Open"

            elif "icon-status-closed" in classes:
                raw_status = "Closed"

        groomed = bool(
            row.select_one(".icon-status-snowcat")
        )

        if raw_status == "Open" and groomed:
            normalized_status = "G"

        elif raw_status == "Open":
            normalized_status = "O"

        elif raw_status == "Closed":
            normalized_status = "C"

        else:
            normalized_status = ""

        trails.append(
            {
                "name": name,
                "raw_status": raw_status,
                "groomed": groomed,
                "status": normalized_status,
            }
        )

    return trails


def main():

    print("Downloading Keystone terrain status...")

    html = get_page()

    soup = BeautifulSoup(html, "html.parser")

    lifts = parse_lifts(soup)
    trails = parse_trails(soup)

    print()
    print(f"Lifts found: {len(lifts)}")
    print("-" * 70)

    for lift in lifts:
        print(
            f"{lift['name']:<30} "
            f"{lift['raw_status']:<12} "
            f"{lift['status']:<2} "
            f"{lift['hours']}"
        )

    print()
    print(f"Trails found: {len(trails)}")
    print("-" * 70)

    for trail in trails:
        print(
            f"{trail['name']:<35} "
            f"{trail['raw_status']:<10} "
            f"Groomed={trail['groomed']!s:<5} "
            f"{trail['status']}"
        )


if __name__ == "__main__":
    main()
