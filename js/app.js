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
    seasons: 'data/seasons.csv',
    trailSeasonSummary: 'data/trail_season_summary.csv'
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
        if (row.opening_date) row.opening_date = normalizeDate(row.opening_date);
        if (row.closing_date) row.closing_date = normalizeDate(row.closing_date);

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

        // --------------------------------------------------
        // 3D TERRAIN
        // --------------------------------------------------
        
        map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14
        });
        
        map.setTerrain({
            source: 'mapbox-dem',
            exaggeration: 1.5
        });

        const view2DButton = document.getElementById('view-2d');
        const view3DButton = document.getElementById('view-3d');

        function setViewMode(mode, duration = 700) {
            if (mode === '3d') {
                map.easeTo({
                    pitch: 60,
                    duration
                });

                if (view3DButton) view3DButton.classList.add('active');
                if (view2DButton) view2DButton.classList.remove('active');
            } else {
                map.easeTo({
                    pitch: 0,
                    duration: 700
                });

                if (view2DButton) view2DButton.classList.add('active');
                if (view3DButton) view3DButton.classList.remove('active');
            }
        }

        if (view2DButton) {
            view2DButton.addEventListener('click', () => setViewMode('2d'));
        }

        if (view3DButton) {
            view3DButton.addEventListener('click', () => setViewMode('3d'));
        }

const [
            trailResponse,
            liftResponse,
            conditionsResponse,
            seasonsResponse,
            trailSummaryResponse
        ] = await Promise.all([
            fetch(DATA_FILES.trails),
            fetch(DATA_FILES.lifts),
            fetch(DATA_FILES.conditions),
            fetch(DATA_FILES.seasons),
            fetch(DATA_FILES.trailSeasonSummary)
        ]);

        if (!trailResponse.ok) throw new Error(`Could not load ${DATA_FILES.trails}: ${trailResponse.status}`);
        if (!liftResponse.ok) throw new Error(`Could not load ${DATA_FILES.lifts}: ${liftResponse.status}`);
        if (!seasonsResponse.ok) throw new Error(`Could not load ${DATA_FILES.seasons}: ${seasonsResponse.status}`);
        if (!trailSummaryResponse.ok) throw new Error(`Could not load ${DATA_FILES.trailSeasonSummary}: ${trailSummaryResponse.status}`);

        const trailData = await trailResponse.json();
        const liftData = await liftResponse.json();
        const seasonsData = parseCSV(await seasonsResponse.text());
        const trailSeasonSummaryData = parseCSV(await trailSummaryResponse.text());
        const conditionsData = conditionsResponse.ok
            ? parseCSV(await conditionsResponse.text())
            : [];

        const trailSeasonSummaryLookup = new Map(
            trailSeasonSummaryData.map(row => [
                `${row.trail_id}|${row.season}`,
                row
            ])
        );

        // Rolling five-season popup averages use the selected season plus the
        // four immediately preceding seasons in AVAILABLE_SEASONS.
        // Blank values are ignored within that five-season window.
        function getFiveSeasonWindow(season) {
            const startIndex = AVAILABLE_SEASONS.indexOf(season);
            if (startIndex < 0) return [];
            return AVAILABLE_SEASONS.slice(startIndex, startIndex + 5);
        }

        function openingDateToSeasonOffset(dateString, season) {
            if (!dateString || !season) return null;

            const parts = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!parts) return null;

            const openingDate = Date.UTC(
                Number(parts[1]),
                Number(parts[2]) - 1,
                Number(parts[3])
            );

            const startYear = getSeasonStartYear(season);
            const seasonStart = Date.UTC(startYear, 9, 15);

            return Math.round((openingDate - seasonStart) / 86400000);
        }

        function formatAverageOpeningDate(seasonOffset, referenceSeason) {
            if (!Number.isFinite(seasonOffset)) return '—';

            const startYear = getSeasonStartYear(referenceSeason);
            const date = new Date(
                Date.UTC(startYear, 9, 15) +
                Math.round(seasonOffset) * 86400000
            );

            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC'
            });
        }

        // --------------------------------------------------
// HISTORICAL TRAIL ALIASES
// --------------------------------------------------

const frenchmanFeature = trailData.features.find(feature => {
    const p = feature.properties;

    const name = String(
        p.trail_name ??
        p.current_name ??
        ''
    ).trim().toUpperCase();

    return name === 'FRENCHMAN';
});

const frenchmanTrailId =
    frenchmanFeature?.properties?.trail_id ?? null;


function upperFrenchmanUsesFrenchmanData(season) {
    const startYear = getSeasonStartYear(season);

    return (
        season === '22-23' ||
        season === '23-24' ||
        startYear <= 2017
    );
}


        function resolveTrailIdForSeason(properties, season) {
            const name = String(
                properties.trail_name ??
                properties.current_name ??
                ''
            ).trim().toUpperCase();
        
            if (
                name === 'UPPER FRENCHMAN' &&
                upperFrenchmanUsesFrenchmanData(season) &&
                frenchmanTrailId
            ) {
                return frenchmanTrailId;
            }
        
            return properties.trail_id;
        }
        
        function getTrailFiveYearAverages(trailProperties, season) {
            const windowSeasons = getFiveSeasonWindow(season);

            const openingOffsets = [];
            const openingSnowValues = [];

            for (const windowSeason of windowSeasons) {
                const historicalTrailId = resolveTrailIdForSeason(
                    trailProperties,
                    windowSeason
                );

const row = trailSeasonSummaryLookup.get(
    `${historicalTrailId}|${windowSeason}`
);

                if (!row) continue;

                const openingOffset = openingDateToSeasonOffset(
                    row.opening_date,
                    windowSeason
                );

                if (Number.isFinite(openingOffset)) {
                    openingOffsets.push(openingOffset);
                }

                const rawOpeningSnow = row.opening_season_to_date;

                if (
                    rawOpeningSnow !== '' &&
                    rawOpeningSnow !== null &&
                    rawOpeningSnow !== undefined
                ) {
                    const numericSnow = Number(
                        String(rawOpeningSnow).replace(/,/g, '')
                    );

                    if (Number.isFinite(numericSnow)) {
                        openingSnowValues.push(numericSnow);
                    }
                }
            }

            const averageOpeningOffset = openingOffsets.length
                ? openingOffsets.reduce((sum, value) => sum + value, 0) /
                  openingOffsets.length
                : null;

            const averageOpeningSnow = openingSnowValues.length
                ? openingSnowValues.reduce((sum, value) => sum + value, 0) /
                  openingSnowValues.length
                : null;

            return {
                openingDate: formatAverageOpeningDate(
                    averageOpeningOffset,
                    season
                ),
                openingSeasonSnow: Number.isFinite(averageOpeningSnow)
                    ? formatSnowValue(averageOpeningSnow)
                    : '—'
            };
        }

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
        console.log('Trail season summaries loaded:', trailSeasonSummaryData.length);

        // --------------------------------------------------
        // 6. DASHBOARD ELEMENTS
        // --------------------------------------------------

        // Visible vertical dashboard / date rail elements.
        const railSeasonSelect = document.getElementById('rail-season-select');
        const railOpenDateValue = document.getElementById('rail-open-date-value');
        const railCloseDateValue = document.getElementById('rail-close-date-value');
        const railHn24Value = document.getElementById('rail-hn24-value');
        const railSeasonSnowValue = document.getElementById('rail-season-snow-value');
        const railHsValue = document.getElementById('rail-hs-value');
        const railAcresOpenValue = document.getElementById('rail-acres-open-value');
        const railSliderDate = document.getElementById('rail-slider-date');
        const dateRail = document.getElementById('date-rail');
        const dateRailTrack = document.querySelector('.date-rail-track');
        const dateRailHandle = document.getElementById('date-rail-handle');
        const snowfallChartCanvas = document.getElementById('snowfall-chart');
        const acresChartCanvas = document.getElementById('acres-chart');

        // Keep the visible chart heading aligned with the metric name used in the data.
        if (acresChartCanvas) {
            const acresCardTitle = acresChartCanvas
                .closest('.history-chart-card')
                ?.querySelector('.history-chart-title');
            if (acresCardTitle) acresCardTitle.textContent = 'Reported Acreage';
        }

        function populateSeasonSelect(select) {
            if (!select) return;
            select.innerHTML = '';

            AVAILABLE_SEASONS.forEach(season => {
                const option = document.createElement('option');
                option.value = season;
                option.textContent = season.replace('-', '–');
                select.appendChild(option);
            });
        }

        populateSeasonSelect(railSeasonSelect);

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

        // --------------------------------------------------
        // 8A. HISTORICAL SEASON SNOWFALL CHART
        // --------------------------------------------------

        let snowfallChart = null;

        // A leap-year template gives every season the same Oct 15-Apr 21
        // month/day axis, including Feb 29. Non-leap seasons simply have a
        // null value on Feb 29 rather than shifting every March/April point.
        const chartMonthDayKeys = buildReportingDateRange('23-24')
            .map(date => date.slice(5));

        const chartMonthDayLabels = chartMonthDayKeys.map(monthDay => {
            const [month, day] = monthDay.split('-').map(Number);
            const templateDate = new Date(2024, month - 1, day);
            return templateDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        });

        const snowfallBySeasonAndMonthDay = new Map();

        for (const season of AVAILABLE_SEASONS) {
            snowfallBySeasonAndMonthDay.set(season, new Map());
        }

        for (const row of conditionsData) {
            if (!row.season || !row.date) continue;
            if (!snowfallBySeasonAndMonthDay.has(row.season)) continue;

            const rawValue = getFirstValue(row, [
                'hn_season_to_date',
                'season_snowfall',
                'season_to_date',
                'season_snow',
                'hn_season'
            ]);

            if (rawValue === '' || rawValue === null || rawValue === undefined) continue;

            const numericValue = Number(String(rawValue).replace(/,/g, ''));
            if (!Number.isFinite(numericValue)) continue;

            snowfallBySeasonAndMonthDay
                .get(row.season)
                .set(row.date.slice(5), numericValue);
        }

        function snowfallSeriesForSeason(season) {
            const lookup = snowfallBySeasonAndMonthDay.get(season) || new Map();
            return chartMonthDayKeys.map(monthDay =>
                lookup.has(monthDay) ? lookup.get(monthDay) : null
            );
        }

        function historicalAverageSnowfallSeries() {
            return chartMonthDayKeys.map(monthDay => {
                const values = AVAILABLE_SEASONS
                    .map(season => {
                        const lookup = snowfallBySeasonAndMonthDay.get(season);
                        return lookup && lookup.has(monthDay)
                            ? lookup.get(monthDay)
                            : null;
                    })
                    .filter(value => Number.isFinite(value));

                if (!values.length) return null;

                return values.reduce((sum, value) => sum + value, 0) / values.length;
            });
        }

        function chartTickLabel(index) {
            const monthDay = chartMonthDayKeys[index];

            const labels = {
                '10-15': 'Oct 15',
                '11-01': 'Nov',
                '12-01': 'Dec',
                '01-01': 'Jan',
                '02-01': 'Feb',
                '03-01': 'Mar',
                '04-01': 'Apr',
                '04-21': 'Apr 21'
            };

            return labels[monthDay] || '';
        }

        const selectedDateGuidePlugin = {
            id: 'selectedDateGuide',
            afterDatasetsDraw(chart) {
                const index = chart.$selectedDateIndex;
                if (!Number.isInteger(index) || index < 0) return;

                const { ctx, chartArea, scales } = chart;
                const x = scales.x.getPixelForValue(index);

                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([4, 3]);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(31, 41, 55, 0.45)';

                // Vertical guide: selected date.
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);

                // Horizontal guide: selected season value on that date.
                const selectedValue = chart.$selectedDateValue;
                if (Number.isFinite(selectedValue)) {
                    const y = scales.y.getPixelForValue(selectedValue);
                    ctx.moveTo(chartArea.left, y);
                    ctx.lineTo(chartArea.right, y);
                }

                ctx.stroke();
                ctx.restore();
            }
        };

        function renderSnowfallChart() {
            if (!snowfallChartCanvas || typeof Chart === 'undefined') return;

            if (snowfallChart) {
                snowfallChart.destroy();
                snowfallChart = null;
            }

            const historicalDatasets = AVAILABLE_SEASONS
                .filter(season => season !== currentSeason)
                .map(season => ({
                    label: season.replace('-', '–'),
                    data: snowfallSeriesForSeason(season),
                    borderColor: 'rgba(75, 85, 99, 0.20)',
                    borderWidth: 1,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    tension: 0.15,
                    spanGaps: false,
                    isHistorical: true
                }));

            const averageDataset = {
                label: 'Historical Average',
                data: historicalAverageSnowfallSeries(),
                borderColor: 'rgba(17, 24, 39, 0.85)',
                borderWidth: 1.5,
                borderDash: [5, 4],
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.15,
                spanGaps: false,
                isAverage: true
            };

            const selectedDataset = {
                label: `${currentSeason.replace('-', '–')} Selected Season`,
                data: snowfallSeriesForSeason(currentSeason),
                borderColor: '#2563eb',
                borderWidth: 2.5,
                pointRadius: 0,
                pointHoverRadius: 3,
                tension: 0.15,
                spanGaps: false,
                isSelected: true
            };

            const selectedDateMarkerDataset = {
                label: 'Selected Date',
                data: new Array(chartMonthDayKeys.length).fill(null),
                showLine: false,
                pointRadius: 5,
                pointHoverRadius: 6,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#111827',
                pointBorderWidth: 2,
                isMarker: true
            };

            snowfallChart = new Chart(snowfallChartCanvas, {
                type: 'line',
                data: {
                    labels: chartMonthDayLabels,
                    datasets: [
                        ...historicalDatasets,
                        averageDataset,
                        selectedDataset,
                        selectedDateMarkerDataset
                    ]
                },
                plugins: [selectedDateGuidePlugin],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    normalized: true,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    layout: {
                        padding: {
                            top: 2,
                            right: 4,
                            bottom: 0,
                            left: 0
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'end',
                            labels: {
                                boxWidth: 16,
                                boxHeight: 2,
                                padding: 8,
                                font: {
                                    size: 8
                                },
                                filter(item, chartData) {
                                    const dataset = chartData.datasets[item.datasetIndex];
                                    return Boolean(dataset.isSelected || dataset.isAverage);
                                }
                            }
                        },
                        tooltip: {
                            filter(context) {
                                const dataset = context.dataset;
                                return Boolean(dataset.isSelected || dataset.isAverage);
                            },
                            callbacks: {
                                title(items) {
                                    if (!items.length) return '';
                                    return chartMonthDayLabels[items[0].dataIndex];
                                },
                                label(context) {
                                    if (context.parsed.y === null) return '';
                                    const value = context.parsed.y.toLocaleString('en-US', {
                                        maximumFractionDigits: 1
                                    });
                                    return `${context.dataset.label}: ${value}\"`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                autoSkip: false,
                                maxRotation: 0,
                                minRotation: 0,
                                font: {
                                    size: 8
                                },
                                callback(value, index) {
                                    return chartTickLabel(index);
                                }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.08)'
                            },
                            ticks: {
                                font: {
                                    size: 8
                                },
                                callback(value) {
                                    return `${value}\"`;
                                }
                            },
                            title: {
                                display: true,
                                text: 'Season snowfall',
                                font: {
                                    size: 8,
                                    weight: '600'
                                }
                            }
                        }
                    }
                }
            });
        }

        function updateSnowfallChartSelectedDate(selectedDate) {
            if (!snowfallChart || !selectedDate) return;

            const selectedMonthDay = selectedDate.slice(5);
            const selectedIndex = chartMonthDayKeys.indexOf(selectedMonthDay);
            snowfallChart.$selectedDateIndex = selectedIndex;
            snowfallChart.$selectedDateValue = null;

            const markerDataset = snowfallChart.data.datasets.find(dataset => dataset.isMarker);
            const selectedDataset = snowfallChart.data.datasets.find(dataset => dataset.isSelected);

            if (markerDataset) {
                markerDataset.data = new Array(chartMonthDayKeys.length).fill(null);

                if (selectedIndex >= 0 && selectedDataset) {
                    const value = selectedDataset.data[selectedIndex];
                    if (Number.isFinite(value)) {
                        markerDataset.data[selectedIndex] = value;
                        snowfallChart.$selectedDateValue = value;
                    }
                }
            }

            snowfallChart.update('none');
        }

        // --------------------------------------------------
        // 8B. HISTORICAL REPORTED ACREAGE CHART
        // --------------------------------------------------

        let acresChart = null;
        const acreageBySeasonAndMonthDay = new Map();

        for (const season of AVAILABLE_SEASONS) {
            acreageBySeasonAndMonthDay.set(season, new Map());
        }

        for (const row of conditionsData) {
            if (!row.season || !row.date) continue;
            if (!acreageBySeasonAndMonthDay.has(row.season)) continue;

            const rawValue = getFirstValue(row, [
                'reported_acres',
                'acres_open',
                'acres'
            ]);

            if (rawValue === '' || rawValue === null || rawValue === undefined) continue;

            const numericValue = Number(String(rawValue).replace(/,/g, ''));
            if (!Number.isFinite(numericValue)) continue;

            acreageBySeasonAndMonthDay
                .get(row.season)
                .set(row.date.slice(5), numericValue);
        }

        function acreageSeriesForSeason(season) {
            const lookup = acreageBySeasonAndMonthDay.get(season) || new Map();
            return chartMonthDayKeys.map(monthDay =>
                lookup.has(monthDay) ? lookup.get(monthDay) : null
            );
        }

        function historicalAverageAcreageSeries() {
            return chartMonthDayKeys.map(monthDay => {
                const values = AVAILABLE_SEASONS
                    .map(season => {
                        const lookup = acreageBySeasonAndMonthDay.get(season);
                        return lookup && lookup.has(monthDay)
                            ? lookup.get(monthDay)
                            : null;
                    })
                    .filter(value => Number.isFinite(value));

                if (!values.length) return null;

                return values.reduce((sum, value) => sum + value, 0) / values.length;
            });
        }

        function renderAcreageChart() {
            if (!acresChartCanvas || typeof Chart === 'undefined') return;

            if (acresChart) {
                acresChart.destroy();
                acresChart = null;
            }

            const historicalDatasets = AVAILABLE_SEASONS
                .filter(season => season !== currentSeason)
                .map(season => ({
                    label: season.replace('-', '–'),
                    data: acreageSeriesForSeason(season),
                    borderColor: 'rgba(75, 85, 99, 0.20)',
                    borderWidth: 1,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    tension: 0.15,
                    spanGaps: false,
                    isHistorical: true
                }));

            const averageDataset = {
                label: 'Historical Average',
                data: historicalAverageAcreageSeries(),
                borderColor: 'rgba(17, 24, 39, 0.85)',
                borderWidth: 1.5,
                borderDash: [5, 4],
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.15,
                spanGaps: false,
                isAverage: true
            };

            const selectedDataset = {
                label: `${currentSeason.replace('-', '–')} Selected Season`,
                data: acreageSeriesForSeason(currentSeason),
                borderColor: '#2563eb',
                borderWidth: 2.5,
                pointRadius: 0,
                pointHoverRadius: 3,
                tension: 0.15,
                spanGaps: false,
                isSelected: true
            };

            const selectedDateMarkerDataset = {
                label: 'Selected Date',
                data: new Array(chartMonthDayKeys.length).fill(null),
                showLine: false,
                pointRadius: 5,
                pointHoverRadius: 6,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#111827',
                pointBorderWidth: 2,
                isMarker: true
            };

            acresChart = new Chart(acresChartCanvas, {
                type: 'line',
                data: {
                    labels: chartMonthDayLabels,
                    datasets: [
                        ...historicalDatasets,
                        averageDataset,
                        selectedDataset,
                        selectedDateMarkerDataset
                    ]
                },
                plugins: [selectedDateGuidePlugin],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    normalized: true,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    layout: {
                        padding: {
                            top: 2,
                            right: 4,
                            bottom: 0,
                            left: 0
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'end',
                            labels: {
                                boxWidth: 16,
                                boxHeight: 2,
                                padding: 8,
                                font: {
                                    size: 8
                                },
                                filter(item, chartData) {
                                    const dataset = chartData.datasets[item.datasetIndex];
                                    return Boolean(dataset.isSelected || dataset.isAverage);
                                }
                            }
                        },
                        tooltip: {
                            filter(context) {
                                const dataset = context.dataset;
                                return Boolean(dataset.isSelected || dataset.isAverage);
                            },
                            callbacks: {
                                title(items) {
                                    if (!items.length) return '';
                                    return chartMonthDayLabels[items[0].dataIndex];
                                },
                                label(context) {
                                    if (context.parsed.y === null) return '';
                                    const value = context.parsed.y.toLocaleString('en-US', {
                                        maximumFractionDigits: 0
                                    });
                                    return `${context.dataset.label}: ${value} acres`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                autoSkip: false,
                                maxRotation: 0,
                                minRotation: 0,
                                font: {
                                    size: 8
                                },
                                callback(value, index) {
                                    return chartTickLabel(index);
                                }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.08)'
                            },
                            ticks: {
                                font: {
                                    size: 8
                                },
                                callback(value) {
                                    return Number(value).toLocaleString('en-US', {
                                        maximumFractionDigits: 0
                                    });
                                }
                            },
                            title: {
                                display: true,
                                text: 'Reported acreage',
                                font: {
                                    size: 8,
                                    weight: '600'
                                }
                            }
                        }
                    }
                }
            });
        }

        function updateAcreageChartSelectedDate(selectedDate) {
            if (!acresChart || !selectedDate) return;

            const selectedMonthDay = selectedDate.slice(5);
            const selectedIndex = chartMonthDayKeys.indexOf(selectedMonthDay);
            acresChart.$selectedDateIndex = selectedIndex;
            acresChart.$selectedDateValue = null;

            const markerDataset = acresChart.data.datasets.find(dataset => dataset.isMarker);
            const selectedDataset = acresChart.data.datasets.find(dataset => dataset.isSelected);

            if (markerDataset) {
                markerDataset.data = new Array(chartMonthDayKeys.length).fill(null);

                if (selectedIndex >= 0 && selectedDataset) {
                    const value = selectedDataset.data[selectedIndex];
                    if (Number.isFinite(value)) {
                        markerDataset.data[selectedIndex] = value;
                        acresChart.$selectedDateValue = value;
                    }
                }
            }

            acresChart.update('none');
        }

        function railPercentForIndex(index) {
            if (dateList.length <= 1) return 0;
            return (index / (dateList.length - 1)) * 100;
        }

        function railIndexForDate(date) {
            return dateList.indexOf(date);
        }

        function positionRailHandle(selectedDate) {
            if (!dateRailHandle) return;

            const index = railIndexForDate(selectedDate);
            if (index < 0) return;

            dateRailHandle.style.top = `${railPercentForIndex(index)}%`;
        }

        function positionMonthTick(selector, date) {
            const tick = document.querySelector(selector);
            if (!tick) return;

            const index = railIndexForDate(date);
            if (index < 0) {
                tick.style.display = 'none';
                return;
            }

            tick.style.display = '';
            tick.style.top = `${railPercentForIndex(index)}%`;
        }

        function getClampedRailIndex(date, useFirstOnOrAfter = true) {
            if (!dateList.length || !date) return -1;

            if (useFirstOnOrAfter) {
                const index = dateList.findIndex(item => item >= date);
                return index === -1 ? dateList.length - 1 : index;
            }

            for (let i = dateList.length - 1; i >= 0; i--) {
                if (dateList[i] <= date) return i;
            }

            return 0;
        }

        function ensureRailBoundaryLabel(id, text) {
            if (!dateRail) return null;

            let label = document.getElementById(id);
            if (!label) {
                label = document.createElement('div');
                label.id = id;
                label.textContent = text;
                label.style.position = 'absolute';
                label.style.left = '70px';
                label.style.transform = 'translateY(-50%)';
                label.style.fontSize = '6px';
                label.style.fontWeight = '700';
                label.style.lineHeight = '1';
                label.style.whiteSpace = 'nowrap';
                label.style.color = '#444';
                label.style.pointerEvents = 'none';
                dateRail.appendChild(label);
            }

            return label;
        }

        function configureVerticalRail(seasonInfo) {
            if (!dateList.length || !dateRail) return;

            const startYear = getSeasonStartYear(currentSeason);

            positionMonthTick('.tick-nov', `${startYear}-11-01`);
            positionMonthTick('.tick-dec', `${startYear}-12-01`);
            positionMonthTick('.tick-jan', `${startYear + 1}-01-01`);
            positionMonthTick('.tick-feb', `${startYear + 1}-02-01`);
            positionMonthTick('.tick-mar', `${startYear + 1}-03-01`);
            positionMonthTick('.tick-apr', `${startYear + 1}-04-01`);

            const openIndex = getClampedRailIndex(seasonInfo.resort_open_date, true);
            const closeIndex = getClampedRailIndex(seasonInfo.resort_close_date, false);

            if (dateRailTrack && openIndex >= 0 && closeIndex >= 0) {
                const openPercent = railPercentForIndex(openIndex);
                const closePercent = railPercentForIndex(closeIndex);

                dateRailTrack.style.background = `
                    linear-gradient(
                        to bottom,
                        ${COLORS.closed} 0%,
                        ${COLORS.closed} ${openPercent}%,
                        ${COLORS.open} ${openPercent}%,
                        ${COLORS.open} ${closePercent}%,
                        ${COLORS.closed} ${closePercent}%,
                        ${COLORS.closed} 100%
                    )
                `;

                const openMarker = ensureRailBoundaryLabel('rail-open-marker', 'Open');
                const closeMarker = ensureRailBoundaryLabel('rail-close-marker', 'Close');

                if (openMarker) {
                    openMarker.style.display = '';
                    openMarker.style.top = `${openPercent}%`;
                    openMarker.title = seasonInfo.resort_open_date
                        ? `Resort opening: ${formatDate(seasonInfo.resort_open_date)}`
                        : 'Resort opening';
                }

                if (closeMarker) {
                    closeMarker.style.display = '';
                    closeMarker.style.top = `${closePercent}%`;
                    closeMarker.title = seasonInfo.resort_close_date
                        ? `Resort closing: ${formatDate(seasonInfo.resort_close_date)}`
                        : 'Resort closing';
                }
            } else if (dateRailTrack) {
                dateRailTrack.style.background = COLORS.noData;
            }
        }

        function applyRailPointer(clientY) {
            if (!dateRail || !dateList.length) return;

            const bounds = dateRail.getBoundingClientRect();
            const rawPercent = (clientY - bounds.top) / bounds.height;
            const clampedPercent = Math.max(0, Math.min(1, rawPercent));
            const index = Math.round(clampedPercent * (dateList.length - 1));

            applyDate(dateList[index]);
        }

        if (dateRail) {
            dateRail.style.cursor = 'pointer';
            dateRail.style.touchAction = 'none';

            dateRail.addEventListener('pointerdown', event => {
                dateRail.setPointerCapture(event.pointerId);
                applyRailPointer(event.clientY);
            });

            dateRail.addEventListener('pointermove', event => {
                if (!dateRail.hasPointerCapture(event.pointerId)) return;
                applyRailPointer(event.clientY);
            });

            dateRail.addEventListener('pointerup', event => {
                if (dateRail.hasPointerCapture(event.pointerId)) {
                    dateRail.releasePointerCapture(event.pointerId);
                }
            });

            dateRail.addEventListener('pointercancel', event => {
                if (dateRail.hasPointerCapture(event.pointerId)) {
                    dateRail.releasePointerCapture(event.pointerId);
                }
            });
        }

        function updateConditions(selectedDate) {
            const row = conditionsByKey.get(`${currentSeason}|${selectedDate}`);

            if (!row) {
                if (railHn24Value) railHn24Value.textContent = '—';
                if (railSeasonSnowValue) railSeasonSnowValue.textContent = '—';
                if (railHsValue) railHsValue.textContent = '—';
                if (railAcresOpenValue) railAcresOpenValue.textContent = '—';
                return;
            }

            const hn24 = formatSnowValue(
                getFirstValue(row, ['hn24', 'hn_24', '24_hour_snow', '24hr_snow'])
            );

            const seasonSnow = formatSnowValue(
                getFirstValue(row, [
                    'hn_season_to_date',
                    'season_snowfall',
                    'season_to_date',
                    'season_snow',
                    'hn_season'
                ])
            );

            const settledBase = formatSnowValue(
                getFirstValue(row, ['hs', 'settled_base', 'base', 'base_depth'])
            );

            const acresOpen = formatAcres(
                getFirstValue(row, ['acres_open', 'reported_acres', 'acres'])
            );

            if (railHn24Value) railHn24Value.textContent = hn24;
            if (railSeasonSnowValue) railSeasonSnowValue.textContent = seasonSnow;
            if (railHsValue) railHsValue.textContent = settledBase;
            if (railAcresOpenValue) railAcresOpenValue.textContent = acresOpen;
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
                const id = resolveTrailIdForSeason(
                    feature.properties,
                    currentSeason
                );
            
                feature.properties.dashboard_status =
                    trailLookup.get(id) ?? 'No Data';
            });

            liftData.features.forEach(feature => {
                const id = feature.properties.lift_id;
                feature.properties.dashboard_status = hasLiftStatus
                    ? (liftLookup.get(id) ?? 'No Data')
                    : 'Not Reported';
            });

            map.getSource('trails').setData(trailData);
            map.getSource('lifts').setData(liftData);

            if (railSliderDate) railSliderDate.textContent = formatDate(selectedDate);

            positionRailHandle(selectedDate);
            updateConditions(selectedDate);
            updateSnowfallChartSelectedDate(selectedDate);
            updateAcreageChartSelectedDate(selectedDate);

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

            if (railSeasonSelect) railSeasonSelect.disabled = true;

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
                if (railSeasonSelect) railSeasonSelect.value = season;

                // Hide historical/new polygons that do not belong to this season.
                // applyDate() below refreshes the source after this property is changed.
                updateTrailSeasonVisibility(trailData, season);

                // Date rail always covers Oct 15-Apr 21.
                dateList = buildReportingDateRange(season);
                configureVerticalRail(seasonInfo);


                if (railOpenDateValue) {
                    railOpenDateValue.textContent = seasonInfo.resort_open_date
                        ? formatDate(seasonInfo.resort_open_date, true)
                        : '—';
                }

                if (railCloseDateValue) {
                    railCloseDateValue.textContent = seasonInfo.resort_close_date
                        ? formatDate(seasonInfo.resort_close_date, true)
                        : '—';
                }

                renderSnowfallChart();
                renderAcreageChart();

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

                applyDate(dateList[selectedIndex]);

                console.log(
                    `Season ${season} loaded | ` +
                    `Slider: ${dateList[0]} to ${dateList[dateList.length - 1]} | ` +
                    `Resort: ${seasonInfo.resort_open_date || '—'} to ${seasonInfo.resort_close_date || '—'} | ` +
                    `Lift status: ${hasLiftStatus ? 'historical daily records' : 'not historically reported'}`
                );
            } finally {
                if (railSeasonSelect) railSeasonSelect.disabled = false;
            }
        }

        // --------------------------------------------------
        // 9. CONTROLS + POPUPS
        // --------------------------------------------------

        if (railSeasonSelect) {
            railSeasonSelect.addEventListener('change', async event => {
                const previousSeason = currentSeason;

                try {
                    await loadSeason(event.target.value);
                } catch (error) {
                    console.error('Season change error:', error);
                    railSeasonSelect.value = previousSeason;
                }
            });
        }

        map.on('click', 'trail-fill', event => {
            const p = event.features[0].properties;

            const status = p.dashboard_status === 'No Data'
                ? 'No Data / Not Operational'
                : p.dashboard_status;

            const effectiveTrailId = resolveTrailIdForSeason(
                p,
                currentSeason
            );
            
            const summaryKey =
                `${effectiveTrailId}|${currentSeason}`;
            
            const summary =
                trailSeasonSummaryLookup.get(summaryKey);

            const openingDate = summary
                ? formatDate(summary.opening_date, true)
                : '—';

            const closingDate = summary
                ? formatDate(summary.closing_date, true)
                : '—';

            const daysOpen = summary && summary.days_open !== ''
                ? summary.days_open
                : '0';

            const openingSeasonSnow = summary
                ? formatSnowValue(summary.opening_season_to_date)
                : '—';

            const fiveYearAverages = getTrailFiveYearAverages(
                p,
                currentSeason
            );

            const seasonLabel = currentSeason.replace('-', '–');

            new mapboxgl.Popup()
                .setLngLat(event.lngLat)
                .setHTML(`
                    <div style="min-width: 180px;">
                        <strong style="font-size: 15px;">
                            ${p.trail_name ?? p.current_name ?? 'Unnamed Trail'}
                        </strong>

                        <div style="margin-top: 6px;">
                            <strong>Status:</strong> ${status}
                        </div>

                        <div style="margin-top: 7px; padding-top: 6px; border-top: 1px solid #ddd;">
                            <strong>${seasonLabel} Season</strong><br>
                            Opened: ${openingDate}<br>
                            Season Snow at Opening: ${openingSeasonSnow}<br>
                            Closed: ${closingDate}<br>
                            Days Open: ${daysOpen}
                        </div>

                        <div style="margin-top: 7px; padding-top: 6px; border-top: 1px solid #ddd;">
                            <strong>5-Year Average</strong><br>
                            Opening Date: ${fiveYearAverages.openingDate}<br>
                            Season Snow at Opening: ${fiveYearAverages.openingSeasonSnow}
                        </div>

                        <div style="margin-top: 7px; padding-top: 6px; border-top: 1px solid #ddd;">
                            Zone: ${p.mountain_area ?? '—'}<br>
                            Acres: ${p.acres_25_26 ?? '—'}
                        </div>
                    </div>
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
        
        map.jumpTo({
            center: [-105.951332, 39.579849],
            zoom: 13.605,
            pitch: 53,
            bearing: 99.2
        });

        if (railSeasonSelect) railSeasonSelect.value = INITIAL_SEASON;
        await loadSeason(INITIAL_SEASON, INITIAL_DATE);

        // Start in the 3D terrain view by default.
        setViewMode('3d', 0);

    } catch (error) {
        console.error('Terrain Dashboard error:', error);

    }
});
