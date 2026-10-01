// ==================================================
// TERRAIN DASHBOARD - MAPBOX WEB APP
// ==================================================
mapboxgl.accessToken = 'pk.eyJ1IjoiY2FybmV5YW0iLCJhIjoiY211azZhdnRlMDQ2czJ4b2JmaWllaGQ2NyJ9._ubQTmLlivNH7Wp3eCSckw';

// --------------------------------------------------
// 1. CONFIGURATION
// --------------------------------------------------

const INITIAL_SEASON = '25-26';
const INITIAL_DATE = '2025-10-25';

// Lift daily-status records begin with the 2016-17 season.
// Earlier seasons will show all lifts in dark gray.
const FIRST_LIFT_STATUS_SEASON_YEAR = 2016;

const AVAILABLE_SEASONS = [
    '25-26',
    '24-25',
    '23-24',
    '22-23',
    '21-22',
    '20-21',
    '19-20',
    '18-19',
    '17-18',
    '16-17',
    '15-16',
    '14-15',
    '13-14',
    '12-13',
    '11-12',
    '10-11',
    '09-10',
    '08-09',
    '07-08',
    '06-07',
];

const DATA_FILES = {
    trails: 'data/trails.geojson',
    lifts: 'data/lifts.geojson',
    conditions: 'data/daily_conditions.csv',
    seasons: 'data/seasons.csv'
};

const COLORS = {
    open: '#39a844',
    groomed: '#146b2e',
    closed: '#d9342b',
    racing: '#f59e0b',
    notOpen: '#9ca3af',
    noData: '#b8b8b8',
    liftNotReported: '#4b5563'
};

// --------------------------------------------------
// 2. GENERAL HELPERS
// --------------------------------------------------

function normalizeSeason(value) {
    if (!value) return '';
    return String(value).replaceAll('–', '-').replaceAll('—', '-').trim();
}

function getSeasonStartYear(season) {
    const start = Number(normalizeSeason(season).split('-')[0]);
    return 2000 + start;
}

function normalizeDate(value) {
    if (value === null || value === undefined) return '';

    const text = String(value).trim().replace(/^"|"$/g, '');
    if (!text) return '';

    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
        return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    }

    const slash = text.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})/);
    if (slash) {
        let year = slash[3];
        if (year.length === 2) year = `20${year}`;
        return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
    }

    const serial = Number(text);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
        const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        return [
            date.getUTCFullYear(),
            String(date.getUTCMonth() + 1).padStart(2, '0'),
            String(date.getUTCDate()).padStart(2, '0')
        ].join('-');
    }

    console.warn('Could not normalize date:', value);
    return '';
}

function normalizeStatus(row) {
    const value =
        row.dashboard_status ||
        row.reported_map_status ||
        row.status_map ||
        row.status ||
        row.raw_status ||
        '';

    switch (String(value).trim().toUpperCase()) {
        case 'O':
        case 'OPEN':
            return 'Open';

        case 'G':
        case 'GROOMED':
            return 'Groomed';

        case 'C':
        case 'CLOSED':
            return 'Closed';

        case 'R':
        case 'RACING':
            return 'Racing';

        case 'NOT OPEN':
            return 'Not Open';

        default:
            return value || 'No Data';
    }
}

function formatDate(dateString, short = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) return '—';

    const date = new Date(`${dateString}T12:00:00`);
    return date.toLocaleDateString('en-US', {
        month: short ? 'short' : 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

// Reporting slider is intentionally fixed at Oct 15-Apr 21.
// Resort opening/closing labels still come from seasons.csv.
function buildReportingDateRange(season) {
    const startYear = getSeasonStartYear(season);
    const start = new Date(Date.UTC(startYear, 9, 15));
    const end = new Date(Date.UTC(startYear + 1, 3, 21));
    const dates = [];

    for (let current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
        dates.push([
            current.getUTCFullYear(),
            String(current.getUTCMonth() + 1).padStart(2, '0'),
            String(current.getUTCDate()).padStart(2, '0')
        ].join('-'));
    }

    return dates;
}

function updateSliderOperatingColors(seasonInfo, dateList, slider) {
    if (!dateList.length) return;

    const firstDate = dateList[0];
    const lastDate = dateList[dateList.length - 1];

    const openDate = seasonInfo.resort_open_date;
    const closeDate = seasonInfo.resort_close_date;

    if (!openDate || !closeDate) {
        slider.style.background = '#b8b8b8';
        return;
    }

    // Clamp opening/closing dates to the visible slider range.
    let openIndex = dateList.findIndex(date => date >= openDate);

    let closeIndex = -1;
    for (let i = dateList.length - 1; i >= 0; i--) {
        if (dateList[i] <= closeDate) {
            closeIndex = i;
            break;
        }
    }

    if (openDate <= firstDate) openIndex = 0;
    if (closeDate >= lastDate) closeIndex = dateList.length - 1;

    if (openIndex === -1) openIndex = 0;
    if (closeIndex === -1) closeIndex = dateList.length - 1;

    const maxIndex = dateList.length - 1;

    const openPercent =
        (openIndex / maxIndex) * 100;

    const closePercent =
        (closeIndex / maxIndex) * 100;

    slider.style.background = `
        linear-gradient(
            to right,
            #d9342b 0%,
            #d9342b ${openPercent}%,
            #39a844 ${openPercent}%,
            #39a844 ${closePercent}%,
            #d9342b ${closePercent}%,
            #d9342b 100%
        )
    `;
}
// --------------------------------------------------
// 3. CSV HELPERS
// --------------------------------------------------

function normalizeHeader(header) {
    return header
        .trim()
        .replace(/^"|"$/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (insideQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current.trim());
    return values;
}

function parseCSV(text) {
    const lines = text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter(line => line.trim() !== '');

    if (!lines.length) return [];

    const headers = parseCSVLine(lines[0]).map(normalizeHeader);

    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const row = {};

        headers.forEach((header, index) => {
            row[header] = values[index] ?? '';
        });

        if (row.season) row.season = normalizeSeason(row.season);
        if (row.date) row.date = normalizeDate(row.date);
        if (row.calendar_start) row.calendar_start = normalizeDate(row.calendar_start);
        if (row.calendar_end) row.calendar_end = normalizeDate(row.calendar_end);
        if (row.resort_open_date) row.resort_open_date = normalizeDate(row.resort_open_date);
        if (row.resort_close_date) row.resort_close_date = normalizeDate(row.resort_close_date);

        return row;
    });
}

function getFirstValue(row, keys) {
    if (!row) return '';

    for (const key of keys) {
        if (
            Object.prototype.hasOwnProperty.call(row, key) &&
            row[key] !== '' &&
            row[key] !== null &&
            row[key] !== undefined
        ) {
            return row[key];
        }
    }

    return '';
}

function formatSnowValue(value) {
    if (value === '' || value === null || value === undefined) return '—';

    const number = Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(number)) return value;

    return `${number.toLocaleString('en-US', { maximumFractionDigits: 1 })}"`;
}

function formatAcres(value) {
    if (value === '' || value === null || value === undefined) return '—';

    const number = Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(number)) return value;

    return number.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// --------------------------------------------------
// 4. MAP
// --------------------------------------------------

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/standard-satellite',
    center: [-105.95, 39.60],
    zoom: 12
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

// Historical polygons have a valid season range.
// We calculate a simple true/false property in JavaScript, then Mapbox
// filters on that boolean. This avoids numeric type issues in Mapbox filters.
function updateTrailSeasonVisibility(trailData, season) {
    const year = getSeasonStartYear(season);

    trailData.features.forEach(feature => {
        const p = feature.properties;
        const fromYear = Number(p.display_from_year ?? 2006);
        const toYear = Number(p.display_to_year ?? 9999);

        p.season_visible = year >= fromYear && year <= toYear;
    });
}

const visibleTrailFilter = [
    '==',
    ['get', 'season_visible'],
    true
];

const groomedVisibleTrailFilter = [
    'all',
    ['==', ['get', 'season_visible'], true],
    ['==', ['get', 'dashboard_status'], 'Groomed']
];

// --------------------------------------------------
// 5. LOAD APP
// --------------------------------------------------

map.on('load', async () => {
    try {
        const [trailResponse, liftResponse, conditionsResponse, seasonsResponse] =
            await Promise.all([
                fetch(DATA_FILES.trails),
                fetch(DATA_FILES.lifts),
                fetch(DATA_FILES.conditions),
                fetch(DATA_FILES.seasons)
            ]);

        if (!trailResponse.ok) throw new Error(`Could not load ${DATA_FILES.trails}: ${trailResponse.status}`);
        if (!liftResponse.ok) throw new Error(`Could not load ${DATA_FILES.lifts}: ${liftResponse.status}`);
        if (!seasonsResponse.ok) throw new Error(`Could not load ${DATA_FILES.seasons}: ${seasonsResponse.status}`);

        const trailData = await trailResponse.json();
        const liftData = await liftResponse.json();
        const seasonsData = parseCSV(await seasonsResponse.text());
        const conditionsData = conditionsResponse.ok
            ? parseCSV(await conditionsResponse.text())
            : [];

        if (!conditionsResponse.ok) {
            console.warn(`Could not load ${DATA_FILES.conditions}: ${conditionsResponse.status}`);
        }

        // Normalize geometry attributes once.
        trailData.features.forEach(feature => {
            const p = feature.properties;
            p.dashboard_status = 'No Data';
            p.display_from_year = Number(p.display_from_year ?? 2006);
            p.display_to_year = Number(p.display_to_year ?? 9999);
        });

        // Set which trail polygons belong to the initial season before
        // the GeoJSON source is added to the map.
        updateTrailSeasonVisibility(trailData, INITIAL_SEASON);

        liftData.features.forEach(feature => {
            feature.properties.dashboard_status = 'No Data';
        });

        const conditionsByKey = new Map(
            conditionsData.map(row => [`${row.season}|${row.date}`, row])
        );

        console.log('Trails loaded:', trailData.features.length);
        console.log('Lifts loaded:', liftData.features.length);
        console.log('Seasons loaded:', seasonsData.length);
        console.log('Daily conditions loaded:', conditionsData.length);

        // --------------------------------------------------
        // 6. DASHBOARD ELEMENTS
        // --------------------------------------------------

        const seasonSelect = document.getElementById('season-select');
        const slider = document.getElementById('date-slider');
        const dateLabel = document.getElementById('date-label');
        const firstDateLabel = document.getElementById('first-date-label');
        const lastDateLabel = document.getElementById('last-date-label');
        const openDateLabel = document.getElementById('open-date-label');
        const closeDateLabel = document.getElementById('close-date-label');
        const hn24Value = document.getElementById('hn24-value');
        const seasonSnowValue = document.getElementById('season-snow-value');
        const hsValue = document.getElementById('hs-value');
        const acresOpenValue = document.getElementById('acres-open-value');

        // Keep the dropdown limited to seasons whose status files are uploaded.
        seasonSelect.innerHTML = '';
        AVAILABLE_SEASONS.forEach(season => {
            const option = document.createElement('option');
            option.value = season;
            option.textContent = season.replace('-', '–');
            seasonSelect.appendChild(option);
        });

        // --------------------------------------------------
        // 7. MAP SOURCES + LAYERS
        // --------------------------------------------------

        map.addSource('trails', { type: 'geojson', data: trailData });
        map.addSource('lifts', { type: 'geojson', data: liftData });

        // Small, subtle white-dot pattern for groomed terrain.
        const patternSize = 8;
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = patternSize;
        patternCanvas.height = patternSize;

        const patternContext = patternCanvas.getContext('2d');
        patternContext.clearRect(0, 0, patternSize, patternSize);
        patternContext.fillStyle = 'rgba(255,255,255,0.55)';
        patternContext.beginPath();
        patternContext.arc(2, 2, 0.7, 0, Math.PI * 2);
        patternContext.fill();

        map.addImage(
            'groomed-dots',
            patternContext.getImageData(0, 0, patternSize, patternSize)
        );

        map.addLayer({
            id: 'trail-fill',
            type: 'fill',
            source: 'trails',
            slot: 'top',
            filter: visibleTrailFilter,
            paint: {
                'fill-color': [
                    'match',
                    ['get', 'dashboard_status'],
                    'Open', COLORS.open,
                    'Groomed', COLORS.groomed,
                    'Closed', COLORS.closed,
                    'Racing', COLORS.racing,
                    'Not Open', COLORS.notOpen,
                    COLORS.noData
                ],
                'fill-opacity': 0.55
            }
        });

        map.addLayer({
            id: 'trail-groomed-pattern',
            type: 'fill',
            source: 'trails',
            slot: 'top',
            filter: groomedVisibleTrailFilter,
            paint: {
                'fill-pattern': 'groomed-dots',
                'fill-opacity': 0.55
            }
        });

        map.addLayer({
            id: 'trail-outline',
            type: 'line',
            source: 'trails',
            slot: 'top',
            filter: visibleTrailFilter,
            paint: {
                'line-color': '#333333',
                'line-width': 1
            }
        });

        // White dashed casing under the status-colored lift line.
        map.addLayer({
            id: 'lift-casing',
            type: 'line',
            source: 'lifts',
            slot: 'top',
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': '#ffffff',
                'line-width': 4,
                'line-dasharray': [2, 1.5],
                'line-opacity': 0.95
            }
        });

        map.addLayer({
            id: 'lift-lines',
            type: 'line',
            source: 'lifts',
            slot: 'top',
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': [
                    'match',
                    ['get', 'dashboard_status'],
                    'Open', COLORS.open,
                    'Closed', COLORS.closed,
                    'Not Open', COLORS.notOpen,
                    'Not Reported', COLORS.liftNotReported,
                    COLORS.noData
                ],
                'line-width': 3,
                'line-dasharray': [2, 1.5],
                'line-opacity': 1
            }
        });

        // --------------------------------------------------
        // 8. CURRENT SEASON STATE
        // --------------------------------------------------

        let trailStatusData = [];
        let liftStatusData = [];
        let dateList = [];
        let currentSeason = INITIAL_SEASON;

        function updateConditions(selectedDate) {
            const row = conditionsByKey.get(`${currentSeason}|${selectedDate}`);

            if (!row) {
                hn24Value.textContent = '—';
                seasonSnowValue.textContent = '—';
                hsValue.textContent = '—';
                acresOpenValue.textContent = '—';
                return;
            }

            hn24Value.textContent = formatSnowValue(
                getFirstValue(row, ['hn24', 'hn_24', '24_hour_snow', '24hr_snow'])
            );

            seasonSnowValue.textContent = formatSnowValue(
                getFirstValue(row, [
                    'hn_season_to_date',
                    'season_snowfall',
                    'season_to_date',
                    'season_snow',
                    'hn_season'
                ])
            );

            hsValue.textContent = formatSnowValue(
                getFirstValue(row, ['hs', 'settled_base', 'base', 'base_depth'])
            );

            acresOpenValue.textContent = formatAcres(
                getFirstValue(row, ['acres_open', 'reported_acres', 'acres'])
            );
        }

        // Missing daily records remain No Data. A missing record does NOT
        // automatically mean the trail or lift was closed.
        function applyDate(selectedDate) {
            if (!selectedDate) return;

            const trailLookup = new Map();
            const liftLookup = new Map();
            const hasLiftStatus =
                getSeasonStartYear(currentSeason) >= FIRST_LIFT_STATUS_SEASON_YEAR;

            for (const row of trailStatusData) {
                if (row.date === selectedDate) {
                    trailLookup.set(row.trail_id, normalizeStatus(row));
                }
            }

            if (hasLiftStatus) {
                for (const row of liftStatusData) {
                    if (row.date === selectedDate) {
                        liftLookup.set(row.lift_id, normalizeStatus(row));
                    }
                }
            }

            trailData.features.forEach(feature => {
                const id = feature.properties.trail_id;
                feature.properties.dashboard_status = trailLookup.get(id) ?? 'No Data';
            });

            liftData.features.forEach(feature => {
                const id = feature.properties.lift_id;
                feature.properties.dashboard_status = hasLiftStatus
                    ? (liftLookup.get(id) ?? 'No Data')
                    : 'Not Reported';
            });

            map.getSource('trails').setData(trailData);
            map.getSource('lifts').setData(liftData);

            dateLabel.textContent = formatDate(selectedDate);
            updateConditions(selectedDate);

            console.log(
                `Season ${currentSeason} | ${selectedDate} | ` +
                `Trail records: ${trailLookup.size} | Lift records: ${liftLookup.size}`
            );
        }

        async function loadSeason(requestedSeason, preferredDate = null) {
            const season = normalizeSeason(requestedSeason);

            const hasLiftStatus =
                getSeasonStartYear(season) >= FIRST_LIFT_STATUS_SEASON_YEAR;

            if (!AVAILABLE_SEASONS.includes(season)) {
                throw new Error(`Season ${season} is not yet configured.`);
            }

            const seasonInfo = seasonsData.find(row => row.season === season);
            if (!seasonInfo) {
                throw new Error(`No seasons.csv record found for season ${season}.`);
            }

            const trailFile = `data/trail_status_${season}.csv`;
            const liftFile = `data/lift_status_${season}.csv`;

            slider.disabled = true;
            seasonSelect.disabled = true;

            try {
                const trailResponse = await fetch(trailFile);

                if (!trailResponse.ok) {
                    throw new Error(`Could not load ${trailFile}: ${trailResponse.status}`);
                }

                trailStatusData = parseCSV(await trailResponse.text());

                if (hasLiftStatus) {
                    const liftResponse = await fetch(liftFile);

                    if (!liftResponse.ok) {
                        throw new Error(`Could not load ${liftFile}: ${liftResponse.status}`);
                    }

                    liftStatusData = parseCSV(await liftResponse.text());
                } else {
                    // Lift status was not historically reported before 2016-17.
                    // Keep all lift alignments visible and style them as Not Reported.
                    liftStatusData = [];
                }

                currentSeason = season;
                seasonSelect.value = season;

                // Hide historical/new polygons that do not belong to this season.
                // applyDate() below refreshes the source after this property is changed.
                updateTrailSeasonVisibility(trailData, season);

                // Slider always covers Oct 15-Apr 21.
                dateList = buildReportingDateRange(season);
                slider.min = 0;
                slider.max = dateList.length - 1;
                slider.step = 1;

                updateSliderOperatingColors(
                    seasonInfo,
                    dateList,
                    slider
                );
                
                firstDateLabel.textContent = formatDate(dateList[0]);
                lastDateLabel.textContent = formatDate(dateList[dateList.length - 1]);


                
                // Resort dates remain authoritative from seasons.csv.
                openDateLabel.textContent = seasonInfo.resort_open_date
                    ? `Opening: ${formatDate(seasonInfo.resort_open_date, true)}`
                    : 'Opening: —';

                closeDateLabel.textContent = seasonInfo.resort_close_date
                    ? `Closing: ${formatDate(seasonInfo.resort_close_date, true)}`
                    : 'Closing: —';

            // Use a specifically requested date when supplied.
            // Otherwise, default the slider to the resort opening date.
                let selectedIndex = preferredDate
                    ? dateList.indexOf(preferredDate)
                    : -1;
                
                if (selectedIndex === -1 && seasonInfo.resort_open_date) {
                    selectedIndex = dateList.indexOf(
                        seasonInfo.resort_open_date
                    );
                }
                
                // Fallback to the first slider date (Oct 15)
                // if the opening date is missing or outside the reporting window.
                if (selectedIndex === -1) {
                    selectedIndex = 0;
                }

                slider.value = selectedIndex;
                applyDate(dateList[selectedIndex]);

                console.log(
                    `Season ${season} loaded | ` +
                    `Slider: ${dateList[0]} to ${dateList[dateList.length - 1]} | ` +
                    `Resort: ${seasonInfo.resort_open_date || '—'} to ${seasonInfo.resort_close_date || '—'} | ` +
                    `Lift status: ${hasLiftStatus ? 'historical daily records' : 'not historically reported'}`
                );
            } finally {
                slider.disabled = false;
                seasonSelect.disabled = false;
            }
        }

        // --------------------------------------------------
        // 9. CONTROLS + POPUPS
        // --------------------------------------------------

        slider.addEventListener('input', () => {
            applyDate(dateList[Number(slider.value)]);
        });

        seasonSelect.addEventListener('change', async event => {
            const previousSeason = currentSeason;

            try {
                await loadSeason(event.target.value);
            } catch (error) {
                console.error('Season change error:', error);
                seasonSelect.value = previousSeason;
            }
        });

        map.on('click', 'trail-fill', event => {
            const p = event.features[0].properties;
            const status = p.dashboard_status === 'No Data'
                ? 'No Data / Not Operational'
                : p.dashboard_status;

            new mapboxgl.Popup()
                .setLngLat(event.lngLat)
                .setHTML(`
                    <strong>${p.trail_name ?? 'Unnamed Trail'}</strong><br>
                    Difficulty: ${p.difficulty ?? 'N/A'}<br>
                    Zone: ${p.mountain_area ?? 'N/A'}<br>
                    Acres: ${p.acres_25_26 ?? 'N/A'}<br>
                    Status: ${status}<br>
                    Trail ID: ${p.trail_id ?? 'N/A'}
                `)
                .addTo(map);
        });

        map.on('click', 'lift-lines', event => {
            const p = event.features[0].properties;
            const name = p.lift_name ?? p.current_name ?? 'Unnamed Lift';

            let status = p.dashboard_status;
            if (status === 'No Data') status = 'No Data / Not Operational';
            if (status === 'Not Reported') status = 'Not historically reported';

            new mapboxgl.Popup()
                .setLngLat(event.lngLat)
                .setHTML(`
                    <strong>${name}</strong><br>
                    Status: ${status}<br>
                    Lift ID: ${p.lift_id ?? 'N/A'}
                `)
                .addTo(map);
        });

        for (const layer of ['trail-fill', 'lift-lines']) {
            map.on('mouseenter', layer, () => {
                map.getCanvasContainer().style.cursor = 'pointer';
            });

            map.on('mouseleave', layer, () => {
                map.getCanvasContainer().style.cursor = '';
            });
        }

        // --------------------------------------------------
        // 10. INITIAL MAP VIEW
        // --------------------------------------------------

        const bounds = new mapboxgl.LngLatBounds();

        function extendBounds(coordinates) {
            if (typeof coordinates[0] === 'number') {
                bounds.extend(coordinates);
            } else {
                coordinates.forEach(extendBounds);
            }
        }

        trailData.features.forEach(feature => {
            extendBounds(feature.geometry.coordinates);
        });

        map.fitBounds(bounds, {
            padding: 40,
            duration: 0
        });

        seasonSelect.value = INITIAL_SEASON;
        await loadSeason(INITIAL_SEASON, INITIAL_DATE);

    } catch (error) {
        console.error('Terrain Dashboard error:', error);

        const slider = document.getElementById('date-slider');
        const seasonSelect = document.getElementById('season-select');
        if (slider) slider.disabled = false;
        if (seasonSelect) seasonSelect.disabled = false;
    }
});
