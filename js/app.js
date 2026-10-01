mapboxgl.accessToken = 'pk.eyJ1IjoiY2FybmV5YW0iLCJhIjoiY211azZhdnRlMDQ2czJ4b2JmaWllaGQ2NyJ9._ubQTmLlivNH7Wp3eCSckw';

// ==================================================
// CONFIGURATION
// ==================================================

const INITIAL_SEASON = '24-25';
const INITIAL_DATE = '2025-01-15';

const trailStatusFiles = {
    '24-25': 'data/trail_status_24-25.csv',
    '23-24': 'data/trail_status_23-24.csv'
};

const liftStatusFiles = {
    '24-25': 'data/lift_status_24-25.csv',
    '23-24': 'data/lift_status_23-24.csv'
};


// ==================================================
// CREATE MAP
// ==================================================

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/standard-satellite',
    center: [-105.95, 39.60],
    zoom: 12
});

map.addControl(
    new mapboxgl.NavigationControl(),
    'top-right'
);


// ==================================================
// NORMALIZE VALUES
// ==================================================

function normalizeSeason(value) {

    if (!value) {
        return '';
    }

    return String(value)
        .replaceAll('–', '-')
        .replaceAll('—', '-')
        .trim();
}


function normalizeDate(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return '';
    }

    const dateString =
        String(value)
            .trim()
            .replace(/^"|"$/g, '');

    if (!dateString) {
        return '';
    }


    // YYYY-MM-DD
    const isoMatch =
        dateString.match(
            /^(\d{4})-(\d{1,2})-(\d{1,2})/
        );

    if (isoMatch) {

        const year =
            isoMatch[1];

        const month =
            isoMatch[2].padStart(2, '0');

        const day =
            isoMatch[3].padStart(2, '0');

        return `${year}-${month}-${day}`;
    }


    // M/D/YY or M/D/YYYY
    const slashMatch =
        dateString.match(
            /^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})/
        );

    if (slashMatch) {

        const month =
            slashMatch[1].padStart(2, '0');

        const day =
            slashMatch[2].padStart(2, '0');

        let year =
            slashMatch[3];

        if (year.length === 2) {
            year = '20' + year;
        }

        return `${year}-${month}-${day}`;
    }


    // Excel serial date
    const serial =
        Number(dateString);

    if (
        Number.isFinite(serial) &&
        serial > 20000 &&
        serial < 80000
    ) {

        const excelEpoch =
            Date.UTC(1899, 11, 30);

        const date =
            new Date(
                excelEpoch +
                serial * 86400000
            );

        return [
            date.getUTCFullYear(),
            String(
                date.getUTCMonth() + 1
            ).padStart(2, '0'),
            String(
                date.getUTCDate()
            ).padStart(2, '0')
        ].join('-');
    }


    console.warn(
        'Could not normalize date:',
        value
    );

    return '';
}


// ==================================================
// NORMALIZE STATUS
// ==================================================

function normalizeStatus(row) {

    const value =
        row.dashboard_status
        ||
        row.reported_map_status
        ||
        row.status_map
        ||
        row.status
        ||
        row.raw_status
        ||
        '';

    const status =
        String(value)
            .trim()
            .toUpperCase();


    if (
        status === 'O' ||
        status === 'OPEN'
    ) {
        return 'Open';
    }


    if (
        status === 'G' ||
        status === 'GROOMED'
    ) {
        return 'Groomed';
    }


    if (
        status === 'C' ||
        status === 'CLOSED'
    ) {
        return 'Closed';
    }


    if (
        status === 'R' ||
        status === 'RACING'
    ) {
        return 'Racing';
    }


    if (
        status === 'NOT OPEN'
    ) {
        return 'Not Open';
    }


    return value || 'No Data';
}


// ==================================================
// CSV PARSING
// ==================================================

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


    for (
        let i = 0;
        i < line.length;
        i++
    ) {

        const character =
            line[i];


        if (character === '"') {

            if (
                insideQuotes &&
                line[i + 1] === '"'
            ) {

                current += '"';
                i++;

            } else {

                insideQuotes =
                    !insideQuotes;
            }

        } else if (
            character === ',' &&
            !insideQuotes
        ) {

            values.push(
                current.trim()
            );

            current = '';

        } else {

            current += character;
        }
    }


    values.push(
        current.trim()
    );

    return values;
}


function parseCSV(text) {

    const lines =
        text
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/)
            .filter(
                line =>
                    line.trim() !== ''
            );


    if (
        lines.length === 0
    ) {
        return [];
    }


    const headers =
        parseCSVLine(
            lines[0]
        ).map(
            normalizeHeader
        );


    return lines
        .slice(1)
        .map(
            line => {

                const values =
                    parseCSVLine(
                        line
                    );


                const row = {};


                headers.forEach(
                    (
                        header,
                        index
                    ) => {

                        row[header] =
                            values[index]
                            ?? '';
                    }
                );


                if (row.season) {
                    row.season =
                        normalizeSeason(
                            row.season
                        );
                }


                if (row.date) {
                    row.date =
                        normalizeDate(
                            row.date
                        );
                }


                if (row.calendar_start) {
                    row.calendar_start =
                        normalizeDate(
                            row.calendar_start
                        );
                }


                if (row.calendar_end) {
                    row.calendar_end =
                        normalizeDate(
                            row.calendar_end
                        );
                }


                if (row.resort_open_date) {
                    row.resort_open_date =
                        normalizeDate(
                            row.resort_open_date
                        );
                }


                if (row.resort_close_date) {
                    row.resort_close_date =
                        normalizeDate(
                            row.resort_close_date
                        );
                }


                return row;
            }
        );
}


// ==================================================
// CREATE FULL DATE RANGE
// ==================================================

function buildDateRange(
    startDate,
    endDate
) {

    if (
        !startDate ||
        !endDate
    ) {
        return [];
    }


    const dates = [];


    let current =
        new Date(
            `${startDate}T12:00:00Z`
        );


    const end =
        new Date(
            `${endDate}T12:00:00Z`
        );


    while (
        current <= end
    ) {

        dates.push(
            [
                current.getUTCFullYear(),
                String(
                    current.getUTCMonth() + 1
                ).padStart(2, '0'),
                String(
                    current.getUTCDate()
                ).padStart(2, '0')
            ].join('-')
        );


        current.setUTCDate(
            current.getUTCDate() + 1
        );
    }


    return dates;
}


// ==================================================
// DATE DISPLAY
// ==================================================

function formatDate(dateString) {

    if (
        !/^\d{4}-\d{2}-\d{2}$/
            .test(
                dateString || ''
            )
    ) {
        return '—';
    }


    const date =
        new Date(
            `${dateString}T12:00:00`
        );


    return date.toLocaleDateString(
        'en-US',
        {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }
    );
}


function formatShortDate(dateString) {

    if (
        !/^\d{4}-\d{2}-\d{2}$/
            .test(
                dateString || ''
            )
    ) {
        return '—';
    }


    const date =
        new Date(
            `${dateString}T12:00:00`
        );


    return date.toLocaleDateString(
        'en-US',
        {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }
    );
}


// ==================================================
// DAILY CONDITIONS HELPERS
// ==================================================

function getFirstValue(
    row,
    keys
) {

    if (!row) {
        return '';
    }


    for (
        const key of keys
    ) {

        if (
            Object.prototype
                .hasOwnProperty
                .call(
                    row,
                    key
                )
            &&
            row[key] !== ''
        ) {
            return row[key];
        }
    }


    return '';
}


function formatSnowValue(value) {

    if (
        value === '' ||
        value === null ||
        value === undefined
    ) {
        return '—';
    }


    const number =
        Number(
            String(value)
                .replace(/,/g, '')
        );


    if (
        !Number.isFinite(
            number
        )
    ) {
        return value;
    }


    return (
        number.toLocaleString(
            'en-US',
            {
                maximumFractionDigits: 1
            }
        )
        +
        '"'
    );
}


function formatAcres(value) {

    if (
        value === '' ||
        value === null ||
        value === undefined
    ) {
        return '—';
    }


    const number =
        Number(
            String(value)
                .replace(/,/g, '')
        );


    if (
        !Number.isFinite(
            number
        )
    ) {
        return value;
    }


    return number.toLocaleString(
        'en-US',
        {
            maximumFractionDigits: 0
        }
    );
}


// ==================================================
// MAP LOAD
// ==================================================

map.on(
    'load',
    async () => {

        try {

            // ==================================================
// SEASON-AWARE TRAIL GEOMETRY
// ==================================================

function getSeasonStartYear(season) {

    const normalizedSeason =
        normalizeSeason(season);

    const startYear =
        Number(
            normalizedSeason
                .split('-')[0]
        );

    return 2000 + startYear;
}


function isTrailVisibleForSeason(
    feature,
    season
) {

    const seasonYear =
        getSeasonStartYear(
            season
        );


    const fromYear =
        Number(
            feature.properties.display_from_year
            ?? 2006
        );


    const toYear =
        Number(
            feature.properties.display_to_year
            ?? 9999
        );


    return (
        seasonYear >= fromYear
        &&
        seasonYear <= toYear
    );
}


function applyTrailSeasonVisibility(
    trailData,
    season
) {

    trailData.features.forEach(
        feature => {

            feature.properties.season_visible =
                isTrailVisibleForSeason(
                    feature,
                    season
                );
        }
    );
}
            
            // ==================================================
            // LOAD STATIC DATA
            // ==================================================

            const [
                trailResponse,
                liftResponse,
                conditionsResponse,
                seasonsResponse
            ] = await Promise.all([

                fetch(
                    'data/trails.geojson'
                ),

                fetch(
                    'data/lifts.geojson'
                ),

                fetch(
                    'data/daily_conditions.csv'
                ),

                fetch(
                    'data/seasons.csv'
                )

            ]);


            if (!trailResponse.ok) {

                throw new Error(
                    `Could not load trails.geojson: ${trailResponse.status}`
                );
            }


            if (!liftResponse.ok) {

                throw new Error(
                    `Could not load lifts.geojson: ${liftResponse.status}`
                );
            }


            if (!seasonsResponse.ok) {

                throw new Error(
                    `Could not load seasons.csv: ${seasonsResponse.status}`
                );
            }


            const trailData =
                await trailResponse.json();


            const liftData =
                await liftResponse.json();


            const seasonsData =
                parseCSV(
                    await seasonsResponse.text()
                );


            console.log(
                'Trails loaded:',
                trailData.features.length
            );


            console.log(
                'Lifts loaded:',
                liftData.features.length
            );


            console.log(
                'Seasons loaded:',
                seasonsData.length
            );


            // ==================================================
            // DAILY CONDITIONS
            // ==================================================

            let conditionsData = [];


            if (
                conditionsResponse.ok
            ) {

                conditionsData =
                    parseCSV(
                        await conditionsResponse.text()
                    );


                console.log(
                    'Daily conditions loaded:',
                    conditionsData.length
                );

            } else {

                console.warn(
                    `Could not load daily_conditions.csv: ${conditionsResponse.status}`
                );
            }


            // ==================================================
            // INITIAL STATUS VALUES
            // ==================================================

        trailData.features.forEach(
    feature => {

        feature.properties.dashboard_status =
            'No Data';


        feature.properties.season_visible =
            isTrailVisibleForSeason(
                feature,
                INITIAL_SEASON
            );
    }
);


            liftData.features.forEach(
                feature => {

                    feature.properties.dashboard_status =
                        'No Data';
                }
            );


            // ==================================================
            // DASHBOARD ELEMENTS
            // ==================================================

            const seasonSelect =
                document.getElementById(
                    'season-select'
                );


            const slider =
                document.getElementById(
                    'date-slider'
                );


            const dateLabel =
                document.getElementById(
                    'date-label'
                );


            const firstDateLabel =
                document.getElementById(
                    'first-date-label'
                );


            const lastDateLabel =
                document.getElementById(
                    'last-date-label'
                );


            const openDateLabel =
                document.getElementById(
                    'open-date-label'
                );


            const closeDateLabel =
                document.getElementById(
                    'close-date-label'
                );


            const hn24Value =
                document.getElementById(
                    'hn24-value'
                );


            const seasonSnowValue =
                document.getElementById(
                    'season-snow-value'
                );


            const hsValue =
                document.getElementById(
                    'hs-value'
                );


            const acresOpenValue =
                document.getElementById(
                    'acres-open-value'
                );


            // ==================================================
            // MAP SOURCES
            // ==================================================

            map.addSource(
                'trails',
                {
                    type: 'geojson',
                    data: trailData
                }
            );


            map.addSource(
                'lifts',
                {
                    type: 'geojson',
                    data: liftData
                }
            );

// ==================================================
// GROOMED DOT PATTERN
// ==================================================

const groomedPatternSize =
    8;


const groomedCanvas =
    document.createElement(
        'canvas'
    );


groomedCanvas.width =
    groomedPatternSize;

groomedCanvas.height =
    groomedPatternSize;


const groomedContext =
    groomedCanvas.getContext(
        '2d'
    );


groomedContext.clearRect(
    0,
    0,
    groomedPatternSize,
    groomedPatternSize
);


groomedContext.fillStyle =
    'rgba(255, 255, 255, 0.55)';


groomedContext.beginPath();


groomedContext.arc(
    2,
    2,
    0.7,
    0,
    Math.PI * 2
);


groomedContext.fill();


map.addImage(
    'groomed-dots',
    groomedContext.getImageData(
        0,
        0,
        groomedPatternSize,
        groomedPatternSize
    )
);
            
            // ==================================================
            // TRAIL FILL
            // ==================================================

            map.addLayer({

                id: 'trail-fill',

                type: 'fill',

                source: 'trails',

                slot: 'top',

                    filter: [
                        '==',
                        ['get', 'season_visible'],
                        true
                    ],

                paint: {

                    'fill-color': [

                        'match',

                        [
                            'get',
                            'dashboard_status'
                        ],

                        'Open',
                        '#39a844',

                        'Groomed',
                        '#146b2e',

                        'Closed',
                        '#d9342b',

                        'Racing',
                        '#f59e0b',

                        'Not Open',
                        '#9ca3af',

                        '#b8b8b8'
                    ],

                    'fill-opacity':
                        0.55
                }
            });

// ==================================================
// GROOMED DOT OVERLAY
// ==================================================

map.addLayer({

    id: 'trail-groomed-pattern',

    type: 'fill',

    source: 'trails',

    slot: 'top',

    filter: [

        'all',

        [
            '==',
            ['get', 'season_visible'],
            true
        ],

        [
            '==',
            ['get', 'dashboard_status'],
            'Groomed'
        ]
    ],

    paint: {

        'fill-pattern':
            'groomed-dots',

        'fill-opacity':
            0.55
    }
});
            // ==================================================
            // TRAIL OUTLINE
            // ==================================================

            map.addLayer({

                id: 'trail-outline',

                type: 'line',

                source: 'trails',

                slot: 'top',

                paint: {

                    'line-color':
                        '#333333',

                    'line-width':
                        1
                }
            });


            // ==================================================
            // LIFT WHITE CASING
            // ==================================================

            map.addLayer({

                id: 'lift-casing',

                type: 'line',

                source: 'lifts',

                slot: 'top',

                layout: {

                    'line-cap':
                        'round',

                    'line-join':
                        'round'
                },

                paint: {

                    'line-color':
                        '#ffffff',

                    'line-width':
                        4,

                    'line-dasharray':
                        [2, 1.5],

                    'line-opacity':
                        0.95
                }
            });


            // ==================================================
            // LIFT STATUS LINE
            // ==================================================

            map.addLayer({

                id: 'lift-lines',

                type: 'line',

                source: 'lifts',

                slot: 'top',

                layout: {

                    'line-cap':
                        'round',

                    'line-join':
                        'round'
                },

                paint: {

                    'line-color': [

                        'match',

                        [
                            'get',
                            'dashboard_status'
                        ],

                        'Open',
                        '#39a844',

                        'Closed',
                        '#d9342b',

                        'Not Open',
                        '#9ca3af',

                        '#b8b8b8'
                    ],

                    'line-width':
                        3,

                    'line-dasharray':
                        [2, 1.5],

                    'line-opacity':
                        1
                }
            });


            // ==================================================
            // CURRENT STATE
            // ==================================================

            let trailStatusData = [];

            let liftStatusData = [];

            let dateList = [];

            let currentSeason =
                INITIAL_SEASON;


            // ==================================================
            // DAILY CONDITIONS
            // ==================================================

            function updateConditions(
                selectedDate
            ) {

                const conditionRow =
                    conditionsData.find(
                        row =>

                            row.season ===
                            currentSeason

                            &&

                            row.date ===
                            selectedDate
                    );


                if (!conditionRow) {

                    hn24Value.textContent =
                        '—';

                    seasonSnowValue.textContent =
                        '—';

                    hsValue.textContent =
                        '—';

                    acresOpenValue.textContent =
                        '—';

                    return;
                }


                const hn24 =
                    getFirstValue(
                        conditionRow,
                        [
                            'hn24',
                            'hn_24',
                            '24_hour_snow',
                            '24hr_snow'
                        ]
                    );


                const seasonSnow =
                    getFirstValue(
                        conditionRow,
                        [
                            'hn_season_to_date',
                            'season_snowfall',
                            'season_to_date',
                            'season_snow',
                            'hn_season'
                        ]
                    );


                const hs =
                    getFirstValue(
                        conditionRow,
                        [
                            'hs',
                            'settled_base',
                            'base',
                            'base_depth'
                        ]
                    );


                const acresOpen =
                    getFirstValue(
                        conditionRow,
                        [
                            'acres_open',
                            'reported_acres',
                            'acres'
                        ]
                    );


                hn24Value.textContent =
                    formatSnowValue(
                        hn24
                    );


                seasonSnowValue.textContent =
                    formatSnowValue(
                        seasonSnow
                    );


                hsValue.textContent =
                    formatSnowValue(
                        hs
                    );


                acresOpenValue.textContent =
                    formatAcres(
                        acresOpen
                    );
            }


            // ==================================================
            // APPLY SELECTED DATE
            // ==================================================

            function applyDate(
                selectedDate
            ) {

                if (!selectedDate) {
                    return;
                }


                // ------------------------------------------
                // TRAILS
                // ------------------------------------------

                const selectedTrailRecords =
                    trailStatusData.filter(
                        row =>
                            row.date ===
                            selectedDate
                    );


                const trailLookup = {};


                selectedTrailRecords.forEach(
                    row => {

                        trailLookup[
                            row.trail_id
                        ] =
                            normalizeStatus(
                                row
                            );
                    }
                );


                trailData.features.forEach(
                    feature => {

                        const trailID =
                            feature
                                .properties
                                .trail_id;


                        feature
                            .properties
                            .dashboard_status =

                            trailLookup[
                                trailID
                            ]
                            ??
                            'No Data';
                    }
                );


                // ------------------------------------------
                // LIFTS
                // ------------------------------------------

                const selectedLiftRecords =
                    liftStatusData.filter(
                        row =>
                            row.date ===
                            selectedDate
                    );


                const liftLookup = {};


                selectedLiftRecords.forEach(
                    row => {

                        liftLookup[
                            row.lift_id
                        ] =
                            normalizeStatus(
                                row
                            );
                    }
                );


                liftData.features.forEach(
                    feature => {

                        const liftID =
                            feature
                                .properties
                                .lift_id;


                        feature
                            .properties
                            .dashboard_status =

                            liftLookup[
                                liftID
                            ]
                            ??
                            'No Data';
                    }
                );


                // ------------------------------------------
                // REFRESH MAP
                // ------------------------------------------

                map
                    .getSource(
                        'trails'
                    )
                    .setData(
                        trailData
                    );


                map
                    .getSource(
                        'lifts'
                    )
                    .setData(
                        liftData
                    );


                // ------------------------------------------
                // DASHBOARD
                // ------------------------------------------

                dateLabel.textContent =
                    formatDate(
                        selectedDate
                    );


                updateConditions(
                    selectedDate
                );


                console.log(
                    `Season ${currentSeason} | Date ${selectedDate}`
                );


                console.log(
                    `Trail records: ${selectedTrailRecords.length}`
                );


                console.log(
                    `Lift records: ${selectedLiftRecords.length}`
                );
            }


            // ==================================================
            // LOAD SEASON
            // ==================================================

            async function loadSeason(
                requestedSeason,
                preferredDate = null
            ) {

                const season =
                    normalizeSeason(
                        requestedSeason
                    );


                const trailFile =
                    trailStatusFiles[
                        season
                    ];


                const liftFile =
                    liftStatusFiles[
                        season
                    ];


                const seasonInfo =
                    seasonsData.find(
                        row =>
                            row.season ===
                            season
                    );


                if (!trailFile) {

                    throw new Error(
                        `No trail file configured for season ${season}`
                    );
                }


                if (!liftFile) {

                    throw new Error(
                        `No lift file configured for season ${season}`
                    );
                }


                if (!seasonInfo) {

                    throw new Error(
                        `No seasons.csv record found for season ${season}`
                    );
                }


                if (
                    !seasonInfo.calendar_start ||
                    !seasonInfo.calendar_end
                ) {

                    throw new Error(
                        `Season ${season} is missing calendar_start or calendar_end`
                    );
                }


                slider.disabled =
                    true;


                seasonSelect.disabled =
                    true;


                try {

                    const [
                        trailStatusResponse,
                        liftStatusResponse
                    ] = await Promise.all([

                        fetch(
                            trailFile
                        ),

                        fetch(
                            liftFile
                        )

                    ]);


                    if (
                        !trailStatusResponse.ok
                    ) {

                        throw new Error(
                            `Could not load ${trailFile}: ${trailStatusResponse.status}`
                        );
                    }


                    if (
                        !liftStatusResponse.ok
                    ) {

                        throw new Error(
                            `Could not load ${liftFile}: ${liftStatusResponse.status}`
                        );
                    }


                    trailStatusData =
                        parseCSV(
                            await trailStatusResponse.text()
                        );


                    liftStatusData =
                        parseCSV(
                            await liftStatusResponse.text()
                        );


                    currentSeason =
                        season;


                    seasonSelect.value =
                        season;

                    applyTrailSeasonVisibility(
                        trailData,
                        season
                    );


                    // ------------------------------------------
                    // AUTHORITATIVE SEASON CALENDAR
                    // ------------------------------------------

                    dateList =
                        buildDateRange(
                            seasonInfo.calendar_start,
                            seasonInfo.calendar_end
                        );


                    if (
                        dateList.length ===
                        0
                    ) {

                        throw new Error(
                            `Could not build date range for season ${season}`
                        );
                    }


                    // ------------------------------------------
                    // SLIDER RANGE
                    // ------------------------------------------

                    slider.min =
                        0;


                    slider.max =
                        dateList.length - 1;


                    slider.step =
                        1;


                    firstDateLabel.textContent =
                        formatDate(
                            seasonInfo.calendar_start
                        );


                    lastDateLabel.textContent =
                        formatDate(
                            seasonInfo.calendar_end
                        );


                    // ------------------------------------------
                    // AUTHORITATIVE RESORT DATES
                    // ------------------------------------------

                    openDateLabel.textContent =
                        seasonInfo.resort_open_date

                            ?

                            `Opening: ${formatShortDate(
                                seasonInfo.resort_open_date
                            )}`

                            :

                            'Opening: —';


                    closeDateLabel.textContent =
                        seasonInfo.resort_close_date

                            ?

                            `Closing: ${formatShortDate(
                                seasonInfo.resort_close_date
                            )}`

                            :

                            'Closing: —';


                    // ------------------------------------------
                    // SELECT STARTING DATE
                    // ------------------------------------------

                    let selectedIndex =
                        preferredDate

                            ?

                            dateList.indexOf(
                                preferredDate
                            )

                            :

                            -1;


                    if (
                        selectedIndex ===
                        -1
                    ) {

                        const endingYear =
                            2000
                            +
                            Number(
                                season
                                    .split('-')[1]
                            );


                        selectedIndex =
                            dateList.indexOf(
                                `${endingYear}-01-15`
                            );
                    }


                    if (
                        selectedIndex ===
                        -1
                    ) {

                        selectedIndex =
                            0;
                    }


                    slider.value =
                        selectedIndex;


                    applyDate(
                        dateList[
                            selectedIndex
                        ]
                    );


                    console.log(
                        `Season ${season} loaded`
                    );


                    console.log(
                        `Calendar: ${seasonInfo.calendar_start} through ${seasonInfo.calendar_end}`
                    );


                    console.log(
                        `Resort operating dates: ${seasonInfo.resort_open_date} through ${seasonInfo.resort_close_date}`
                    );


                    console.log(
                        `Trail status rows: ${trailStatusData.length}`
                    );


                    console.log(
                        `Lift status rows: ${liftStatusData.length}`
                    );

                } finally {

                    slider.disabled =
                        false;


                    seasonSelect.disabled =
                        false;
                }
            }


            // ==================================================
            // DATE SLIDER
            // ==================================================

            slider.addEventListener(
                'input',
                () => {

                    const selectedIndex =
                        Number(
                            slider.value
                        );


                    applyDate(
                        dateList[
                            selectedIndex
                        ]
                    );
                }
            );


            // ==================================================
            // SEASON DROPDOWN
            // ==================================================

            seasonSelect.addEventListener(
                'change',
                async event => {

                    const previousSeason =
                        currentSeason;


                    try {

                        await loadSeason(
                            normalizeSeason(
                                event.target.value
                            )
                        );

                    } catch (
                        error
                    ) {

                        console.error(
                            'Season change error:',
                            error
                        );


                        seasonSelect.value =
                            previousSeason;
                    }
                }
            );


            // ==================================================
            // TRAIL POPUP
            // ==================================================

            map.on(
                'click',
                'trail-fill',
                event => {

                    const props =
                        event.features[0]
                            .properties;


                    const displayStatus =

                        props.dashboard_status ===
                        'No Data'

                            ?

                            'No Data / Not Operational'

                            :

                            props.dashboard_status;


                    new mapboxgl.Popup()

                        .setLngLat(
                            event.lngLat
                        )

                        .setHTML(`

                            <strong>
                                ${props.trail_name ?? 'Unnamed Trail'}
                            </strong>

                            <br>

                            Difficulty:
                            ${props.difficulty ?? 'N/A'}

                            <br>

                            Zone:
                            ${props.mountain_area ?? 'N/A'}

                            <br>

                            Acres:
                            ${props.acres_25_26 ?? 'N/A'}

                            <br>

                            Status:
                            ${displayStatus}

                            <br>

                            Trail ID:
                            ${props.trail_id ?? 'N/A'}
                        `)

                        .addTo(
                            map
                        );
                }
            );


            // ==================================================
            // LIFT POPUP
            // ==================================================

            map.on(
                'click',
                'lift-lines',
                event => {

                    const props =
                        event.features[0]
                            .properties;


                    const liftName =
                        props.lift_name
                        ??
                        props.current_name
                        ??
                        'Unnamed Lift';


                    const displayStatus =

                        props.dashboard_status ===
                        'No Data'

                            ?

                            'No Data / Not Operational'

                            :

                            props.dashboard_status;


                    new mapboxgl.Popup()

                        .setLngLat(
                            event.lngLat
                        )

                        .setHTML(`

                            <strong>
                                ${liftName}
                            </strong>

                            <br>

                            Status:
                            ${displayStatus}

                            <br>

                            Lift ID:
                            ${props.lift_id ?? 'N/A'}
                        `)

                        .addTo(
                            map
                        );
                }
            );


            // ==================================================
            // POINTER CURSORS
            // ==================================================

            map.on(
                'mouseenter',
                'trail-fill',
                () => {

                    map
                        .getCanvasContainer()
                        .style
                        .cursor =
                        'pointer';
                }
            );


            map.on(
                'mouseleave',
                'trail-fill',
                () => {

                    map
                        .getCanvasContainer()
                        .style
                        .cursor =
                        '';
                }
            );


            map.on(
                'mouseenter',
                'lift-lines',
                () => {

                    map
                        .getCanvasContainer()
                        .style
                        .cursor =
                        'pointer';
                }
            );


            map.on(
                'mouseleave',
                'lift-lines',
                () => {

                    map
                        .getCanvasContainer()
                        .style
                        .cursor =
                        '';
                }
            );


            // ==================================================
            // FIT MAP TO TRAILS
            // ==================================================

            const bounds =
                new mapboxgl.LngLatBounds();


            function extendBounds(
                coordinates
            ) {

                if (
                    typeof coordinates[0] ===
                    'number'
                ) {

                    bounds.extend(
                        coordinates
                    );

                } else {

                    coordinates.forEach(
                        extendBounds
                    );
                }
            }


            trailData.features.forEach(
                feature => {

                    extendBounds(
                        feature.geometry.coordinates
                    );
                }
            );


            map.fitBounds(
                bounds,
                {
                    padding: 40,
                    duration: 0
                }
            );


            // ==================================================
            // INITIAL SEASON
            // ==================================================

            seasonSelect.value =
                INITIAL_SEASON;


            await loadSeason(
                INITIAL_SEASON,
                INITIAL_DATE
            );

        } catch (
            error
        ) {

            console.error(
                'Terrain Dashboard error:',
                error
            );
        }
    }
);
