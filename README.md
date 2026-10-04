# Keystone Terrain Dashboard

An interactive historical terrain dashboard for Keystone Resort built with **Mapbox GL JS**, **Chart.js**, GeoJSON, and CSV data.

The dashboard combines historical trail and lift status records, resort operating dates, daily snow conditions, terrain geometry, and seasonal summary statistics into a single web map. Users can select a ski season, move through the season day by day, inspect trail and lift status, and compare the selected season with historical snowfall and reported acreage.

## Live Site

https://carneyam.github.io/keystone-terrain-dashboard/

## Project Purpose

The project was created to make long-term historical terrain data easier to explore spatially.

The underlying dataset covers ski seasons from **2006–07 through 2025–26** and includes:

- Daily trail status
- Daily lift status where historically available
- 24-hour snowfall
- Season-to-date snowfall
- Settled base
- Reported acres open
- Resort opening and closing dates
- Trail opening and closing dates
- Days open by trail
- Snowfall at trail opening
- Historical terrain geometry changes

The dashboard is designed as a historical reference and visualization tool rather than a source of current operational information.

---

## Main Features

### Interactive Terrain Map

Trails are displayed as polygons and lifts as line features.

Trail status colors:

- **Open** — green
- **Groomed** — dark green with white dot pattern
- **Closed** — red
- **Racing** — orange
- **Not Open** — gray
- **No Data / Not Operational** — light gray

Lift status is shown with dashed colored lines and a white dashed casing.

### Season and Date Navigation

The vertical dashboard allows users to:

- Select any configured season
- Move through the historical reporting period from **October 15 through April 21**
- View the selected date
- See the resort's historical opening and closing dates
- View daily snow and acreage conditions

The date rail is colored:

- Red before resort opening
- Green during the operating season
- Red after resort closing

The selected date defaults to the resort opening date when a new season is selected.

### Daily Conditions

The dashboard displays:

- 24-Hour Snow
- Season Snowfall
- Settled Base
- Acres Open

Missing historical records remain missing and are **not automatically interpreted as closed terrain**.

### Trail Popups

Trail popups include:

- Current status for the selected date
- Selected-season opening date
- Snowfall at opening
- Closing date
- Days open
- Five-year average opening date
- Five-year average snowfall at opening
- Zone
- Acres

Five-year averages use a rolling five-season window ending with the selected season.

### Historical Charts

Two synchronized historical charts appear at the bottom of the dashboard:

#### Season Snowfall

Displays season-to-date snowfall for all available seasons.

#### Reported Acreage

Displays reported open acreage for all available seasons.

Both charts include:

- All historical seasons in muted lines
- Selected season emphasized
- Historical average
- Selected-date marker
- Vertical selected-date guide
- Horizontal selected-value guide

Missing data is displayed as a gap rather than being converted to zero.

### 2D / 3D Terrain

The map uses Mapbox terrain DEM data with **1.5× terrain exaggeration**.

The dashboard includes:

- 2D view
- 3D terrain view
- Mapbox navigation controls

The current preferred initial camera is approximately:

```text
Center:  -105.951332, 39.579849
Zoom:    13.605
Pitch:   53
Bearing: 99.2
```

---

## Historical Geometry

Terrain names and boundaries have changed over time.

Trail polygons include:

```text
display_from_year
display_to_year
```

Lift alignments use the same fields.

These fields determine whether a feature should be visible for the selected historical season.

Ordinary features generally use:

```text
display_from_year = 2006
display_to_year   = 9999
```

Historical geometry is therefore controlled primarily in the GeoJSON rather than by hard-coded JavaScript exceptions.

Examples include changes involving:

- Bergman Bowl
- Erickson Bowl
- Windows
- North Bowl
- South Bowl
- Independence Bowl
- Acapulco Road
- Murphy's Mine
- Ripperoo's Forest
- Ripperoo's Glade
- Ski Daddle
- Epic Mix Racing
- Tiger Line
- Tornado Alley

---

## Historical Trail Relationships

Some modern trail polygons represent terrain that historically belonged to another named trail.

These relationships are resolved dynamically in `app.js`.

### Upper Frenchman

Uses **Frenchman** historical data:

- 2006–07 through 2017–18
- 2022–23
- 2023–24

Uses its own records in other seasons.

### The Edge

Uses **River Run** historical data before the **2016–17** season.

### Lower Prospector

Uses **Prospector** historical data before the **2023–24** season.

These relationships affect both:

- Daily map status
- Selected-season popup statistics
- Rolling five-year averages

The five-year calculation resolves the appropriate source trail separately for each season in the averaging window.

For example, a Lower Prospector five-year calculation in 2025–26 may use:

```text
25–26   Lower Prospector
24–25   Lower Prospector
23–24   Lower Prospector
22–23   Prospector
21–22   Prospector
```

---

## Terrain Areas That Follow Lift Status

Two small terrain polygons do not have independent historical trail-status reporting.

### Mid Station Carpet

The polygon follows the daily status of the **Mid Station Carpet** lift.

### Cadillac Carpet

The polygon follows the daily status of the **Cadillac Carpet** lift.

These polygons use lift status for map shading.

Trail opening and five-year trail-opening statistics are not manufactured for these areas.

---

## Lift History

Daily lift-status records are treated as historically available beginning with the **2016–17 season**.

For earlier seasons:

- Lift alignments can still be displayed if valid for that season
- Lift status is labeled **Not historically reported**
- Lift lines are shown in dark gray

Lift visibility is controlled by:

```text
display_from_year
display_to_year
```

in `lifts.geojson`.

---

## Data Files

The repository uses a combination of GeoJSON and CSV files.

Typical structure:

```text
keystone-terrain-dashboard/
├── index.html
├── README.md
├── css/
│   └── style.css
├── js/
│   └── app.js
└── data/
    ├── trails.geojson
    ├── lifts.geojson
    ├── seasons.csv
    ├── daily_conditions.csv
    ├── trail_season_summary.csv
    ├── trail_status_25-26.csv
    ├── lift_status_25-26.csv
    ├── trail_status_24-25.csv
    ├── lift_status_24-25.csv
    └── ...
```

---

## Core Data Tables

### `trails.geojson`

Trail and terrain polygons.

Important attributes include:

```text
trail_id
trail_name / current_name
mountain_area
acres_25_26
display_from_year
display_to_year
```

### `lifts.geojson`

Lift alignment line features.

Important attributes include:

```text
lift_id
lift_name / current_name
display_from_year
display_to_year
```

### `seasons.csv`

One row per ski season.

Important fields:

```text
season
calendar_start
calendar_end
resort_open_date
resort_close_date
```

### `daily_conditions.csv`

Daily resort conditions.

Important fields include:

```text
season
date
hn24
season_to_date
hs
reported_acres
```

The JavaScript also accepts alternate legacy field names for these values.

### `trail_status_YY-YY.csv`

Daily trail status records.

Typical fields:

```text
season
date
trail_id
status_raw
status_map
```

### `lift_status_YY-YY.csv`

Daily lift status records.

Typical fields:

```text
season
date
lift_id
status_raw
status_map
```

### `trail_season_summary.csv`

Season-level summary statistics by trail.

Important fields:

```text
trail_id
current_name
season
opening_date
closing_date
days_open
opening_season_to_date
```

---

## Status Normalization

Historical status values are normalized for map display.

Typical mappings:

```text
O  -> Open
G  -> Groomed
C  -> Closed
R  -> Racing
```

Missing records are treated as **No Data**, not automatically as Closed.

This distinction is intentional.

---

## Season Calendar

The dashboard uses a standardized reporting timeline from:

```text
October 15
through
April 21
```

for each season.

The resort's actual historical opening and closing dates are stored separately in `seasons.csv`.

This allows the slider timeline to remain consistent across seasons while preserving the real operating dates.

---

## Historical Average Rules

Historical statistics follow several project-specific rules.

### COVID-shortened 2019–20 season

The 2019–20 season is:

- Included in historical opening-date averages
- Excluded from historical closing-date averages
- Excluded from historical days-open averages

The abnormal mid-March closure did not materially affect opening timing but would distort closing and duration statistics.

### Five-Year Averages

Five-year averages use the selected season and the previous four seasons where records are available.

Historical trail aliases are resolved independently for every season in the five-year window.

---

## Source Data Workflow

Historical terrain data was assembled from several sources.

Broadly:

- 2006–2014: archived Auto Weather data
- 2014–2024: historical Daily Sendout PDFs processed through OCR and Python workflows
- 2024–present: STAR reporting system

Historical trail names were normalized to stable trail IDs so daily records can be joined reliably to GIS features.

---

## GIS Workflow

Terrain geometry was developed and maintained in QGIS.

Primary GIS data includes:

- Trail polygons
- Historical terrain polygons
- Lift alignments
- Stable trail IDs
- Stable lift IDs
- Historical display-year ranges

The web application uses exported GeoJSON rather than directly reading the QGIS GeoPackage.

---

## Technology

The dashboard is intentionally lightweight and does not require a backend server.

Main technologies:

- HTML
- CSS
- JavaScript
- Mapbox GL JS
- Chart.js
- GeoJSON
- CSV
- GitHub Pages

---

## Running Locally

Because the application loads CSV and GeoJSON files with `fetch()`, opening `index.html` directly from the filesystem may not work correctly.

Use a local web server instead.

For example, with Python:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

---

## Deployment

The site is hosted with GitHub Pages.

Normal update workflow:

1. Update source data, JavaScript, CSS, or HTML.
2. Commit changes to `main`.
3. Push to GitHub.
4. Wait for the GitHub Pages deployment to complete.
5. Confirm the latest deployment has a green success indicator.
6. Hard-refresh the browser if necessary.

When changing JavaScript, the project currently uses a query-string version to reduce browser caching issues:

```html
<script src="js/app.js?v=12"></script>
```

Increment the number when deploying a new `app.js` version.

---

## Version Archiving

Stable checkpoints should be preserved using GitHub Releases and tags.

Example:

```text
v0.1.0
```

Suggested process:

1. Confirm the live GitHub Pages deployment is working.
2. Open the repository's **Releases** page.
3. Choose **Draft a new release**.
4. Create a new tag such as `v0.1.0`.
5. Target the current `main` branch commit.
6. Add release notes.
7. Publish the release.

This preserves a permanent reference to a known-good version while development continues on `main`.

---

## Quality Assurance

Before creating a release, recommended checks include:

- Verify several recent and early seasons
- Confirm historical geometry transitions
- Confirm lift visibility changes
- Confirm pre-2016–17 lift behavior
- Test Upper Frenchman historical alias seasons
- Test The Edge before 2016–17
- Test Lower Prospector before 2023–24
- Test Mid Station Carpet lift-following behavior
- Test Cadillac Carpet lift-following behavior
- Verify selected-season popup statistics
- Compare several five-year averages against the source workbook
- Confirm snowfall and acreage chart synchronization
- Confirm missing data remains No Data rather than Closed
- Check 2D and 3D views
- Check page-load framing

---

## Current Limitations

The dashboard is a historical visualization project and has several intentional limitations:

- It is not a real-time operations dashboard.
- Historical source data may contain reporting gaps.
- Missing daily records are not interpreted as closures.
- Lift daily-status data before 2016–17 is not considered historically available.
- Historical geometry is dependent on the accuracy of manually maintained display-year attributes.
- Small historical trail-name changes may require additional alias rules as the dataset is refined.
- Mobile/responsive layout optimization is still limited compared with the desktop experience.

---

## Future Improvements

Potential future work includes:

- Additional historical terrain-name relationships
- More detailed lift season summaries
- Improved mobile layout
- Refined initial map framing
- Additional chart statistics such as quartiles or historical envelopes
- Search or trail-selection tools
- Exportable historical summaries
- Further documentation of source-data provenance
- Additional QA tooling for unmatched or historically inconsistent features

---

## Disclaimer

This dashboard is an independent historical data and GIS project.

It is intended for historical analysis, visualization, education, and internal reference. It should not be used as a source of current terrain availability, avalanche conditions, operational status, or safety information.

For current resort information, use official operational sources.
