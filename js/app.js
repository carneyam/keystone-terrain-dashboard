mapboxgl.accessToken = 'pk.eyJ1IjoiY2FybmV5YW0iLCJhIjoiY211azZhdnRlMDQ2czJ4b2JmaWllaGQ2NyJ9._ubQTmLlivNH7Wp3eCSckw';

// ==================================================
// CONFIGURATION
// ==================================================

const INITIAL_SEASON = '24-25';

const INITIAL_DATE = '2025-01-15';


const seasonFiles = {

    '24-25':
        'data/trail_status_24-25.csv',

    '23-24':
        'data/trail_status_23-24.csv'
};


// ==================================================
// CREATE MAP
// ==================================================

const map =
    new mapboxgl.Map({

        container:
            'map',

        style:
            'mapbox://styles/mapbox/standard',

        center:
            [-105.95, 39.60],

        zoom:
            12
    });


map.addControl(

    new mapboxgl.NavigationControl(),

    'top-right'
);


// ==================================================
// NORMALIZE SEASON VALUES
// ==================================================

function normalizeSeason(
    season
) {

    if (!season) {
        return '';
    }


    return season

        .replaceAll(
            '–',
            '-'
        )

        .replaceAll(
            '—',
            '-'
        )

        .trim();
}


// ==================================================
// NORMALIZE DATES
// ==================================================

function normalizeDate(value) {

    if (value === null || value === undefined) {
        return '';
    }

    let dateString =
        String(value)
            .trim()
            .replace(/^"|"$/g, '');

    if (!dateString) {
        return '';
    }


    // ------------------------------------------
    // ISO date: YYYY-MM-DD
    // ------------------------------------------

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


    // ------------------------------------------
    // Excel-style dates:
    // M/D/YY
    // M/D/YYYY
    // M/D/ 24
    // ------------------------------------------

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


    // ------------------------------------------
    // Excel serial date
    // ------------------------------------------

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
// CSV PARSER
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

            current +=
                character;
        }
    }


    values.push(
        current.trim()
    );


    return values;
}


function parseCSV(text) {

    text =
        text.replace(
            /^\uFEFF/,
            ''
        );


    const lines =
        text
            .split(/\r?\n/)
            .filter(
                line =>
                    line.trim() !== ''
            );


    const headers =
        parseCSVLine(
            lines[0]
        ).map(
            normalizeHeader
        );


    return lines
        .slice(1)
        .map(line => {

            const values =
                parseCSVLine(line);


            const row = {};


            headers.forEach(
                (header, index) => {

                    row[header] =
                        values[index]
                        ?? '';
                }
            );


            if (row.date) {

                row.date =
                    normalizeDate(
                        row.date
                    );
            }


            if (row.season) {

                row.season =
                    normalizeSeason(
                        row.season
                    );
            }


            return row;
        });
}

// ==================================================
// DATE FORMATTING
// ==================================================

function formatDate(
    dateString
) {

    const date =
        new Date(
            dateString +
            'T12:00:00'
        );


    return date
        .toLocaleDateString(

            'en-US',

            {
                month:
                    'long',

                day:
                    'numeric',

                year:
                    'numeric'
            }
        );
}


function formatShortDate(
    dateString
) {

    const date =
        new Date(
            dateString +
            'T12:00:00'
        );


    return date
        .toLocaleDateString(

            'en-US',

            {
                month:
                    'short',

                day:
                    'numeric',

                year:
                    'numeric'
            }
        );
}


// ==================================================
// CONDITION VALUE HELPERS
// ==================================================

function getFirstValue(
    row,
    keys
) {

    if (!row) {
        return '';
    }


    for (
        const key
        of keys
    ) {

        if (

            Object
                .prototype
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


function formatSnowValue(
    value
) {

    if (
        value === ''
        ||
        value === null
        ||
        value === undefined
    ) {

        return '—';
    }


    const number =
        Number(
            value
        );


    if (
        Number.isFinite(
            number
        )
    ) {

        return (
            number
                .toLocaleString(
                    'en-US',
                    {
                        maximumFractionDigits:
                            1
                    }
                )
            +
            '"'
        );
    }


    return value;
}


function formatAcres(
    value
) {

    if (
        value === ''
        ||
        value === null
        ||
        value === undefined
    ) {

        return '—';
    }


    const number =
        Number(
            value
        );


    if (
        Number.isFinite(
            number
        )
    ) {

        return number
            .toLocaleString(
                'en-US',
                {
                    maximumFractionDigits:
                        0
                }
            );
    }


    return value;
}


// ==================================================
// MAP LOAD
// ==================================================

map.on(
    'load',
    async () => {

        try {

            // ==================================================
            // LOAD STATIC DATA
            // ==================================================

            const [
                trailResponse,
                conditionsResponse
            ] =

                await Promise.all([

                    fetch(
                        'data/trails.geojson'
                    ),

                    fetch(
                        'data/daily_conditions.csv'
                    )
                ]);


            if (
                !trailResponse.ok
            ) {

                throw new Error(
                    `Could not load trails.geojson: ${trailResponse.status}`
                );
            }


            const trailData =
                await trailResponse
                    .json();


            let conditionsData = [];


            if (
                conditionsResponse.ok
            ) {

                const conditionsText =
                    await conditionsResponse
                        .text();


                conditionsData =
                    parseCSV(
                        conditionsText
                    );


                console.log(
                    'Daily conditions loaded:',
                    conditionsData.length
                );


                if (
                    conditionsData.length > 0
                ) {

                    console.log(
                        'Daily condition fields:',
                        Object.keys(
                            conditionsData[0]
                        )
                    );
                }
            }

            else {

                console.warn(
                    `Could not load daily_conditions.csv: ${conditionsResponse.status}`
                );
            }


            trailData
                .features
                .forEach(
                    feature => {

                        feature
                            .properties
                            .dashboard_status =
                            'No Data';
                    }
                );


            // ==================================================
            // DASHBOARD ELEMENTS
            // ==================================================

            const seasonSelect =
                document
                    .getElementById(
                        'season-select'
                    );


            const slider =
                document
                    .getElementById(
                        'date-slider'
                    );


            const dateLabel =
                document
                    .getElementById(
                        'date-label'
                    );


            const firstDateLabel =
                document
                    .getElementById(
                        'first-date-label'
                    );


            const lastDateLabel =
                document
                    .getElementById(
                        'last-date-label'
                    );


            const openDateLabel =
                document
                    .getElementById(
                        'open-date-label'
                    );


            const closeDateLabel =
                document
                    .getElementById(
                        'close-date-label'
                    );


            const hn24Value =
                document
                    .getElementById(
                        'hn24-value'
                    );


            const seasonSnowValue =
                document
                    .getElementById(
                        'season-snow-value'
                    );


            const hsValue =
                document
                    .getElementById(
                        'hs-value'
                    );


            const acresOpenValue =
                document
                    .getElementById(
                        'acres-open-value'
                    );


            // ==================================================
            // MAP SOURCE
            // ==================================================

            map.addSource(

                'trails',

                {
                    type:
                        'geojson',

                    data:
                        trailData
                }
            );


            // ==================================================
            // TRAIL FILL
            // ==================================================

            map.addLayer({

                id:
                    'trail-fill',

                type:
                    'fill',

                source:
                    'trails',

                slot:
                    'top',

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
            // TRAIL OUTLINES
            // ==================================================

            map.addLayer({

                id:
                    'trail-outline',

                type:
                    'line',

                source:
                    'trails',

                slot:
                    'top',

                paint: {

                    'line-color':
                        '#333333',

                    'line-width':
                        1
                }
            });


            // ==================================================
            // CURRENT SEASON STATE
            // ==================================================

            let statusData = [];

            let dateList = [];

            let currentSeason =
                INITIAL_SEASON;


            // ==================================================
            // UPDATE DAILY CONDITIONS
            // ==================================================

            function updateConditions(
                selectedDate
            ) {

                const conditionRow =
                    conditionsData
                        .find(
                            row =>

                                normalizeSeason(
                                    row.season
                                )
                                ===
                                currentSeason

                                &&

                                row.date
                                ===
                                selectedDate
                        );


                if (
                    !conditionRow
                ) {

                    hn24Value
                        .textContent =
                        '—';

                    seasonSnowValue
                        .textContent =
                        '—';

                    hsValue
                        .textContent =
                        '—';

                    acresOpenValue
                        .textContent =
                        '—';

                    return;
                }


                const hn24 =
                    getFirstValue(

                        conditionRow,

                        [
                            'hn24',
                            'HN24'
                        ]
                    );


                const seasonSnow =
                    getFirstValue(

                        conditionRow,

                        [
                            'hn_season_to_date',
                            'season_to_date',
                            'hn_season',
                            'HN_Season'
                        ]
                    );


                const hs =
                    getFirstValue(

                        conditionRow,

                        [
                            'hs',
                            'HS'
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


                hn24Value
                    .textContent =
                    formatSnowValue(
                        hn24
                    );


                seasonSnowValue
                    .textContent =
                    formatSnowValue(
                        seasonSnow
                    );


                hsValue
                    .textContent =
                    formatSnowValue(
                        hs
                    );


                acresOpenValue
                    .textContent =
                    formatAcres(
                        acresOpen
                    );
            }


            // ==================================================
            // APPLY SELECTED DATE
            // ==================================================

           function applyDate(selectedDate) {

    if (!selectedDate) {
        return;
    }


    // ------------------------------------------
    // Find trail records for selected date
    // ------------------------------------------

    const selectedDateRecords =
        statusData.filter(
            row =>
                row.date === selectedDate
        );


    // ------------------------------------------
    // Create trail ID -> status lookup
    // ------------------------------------------

    const statusLookup = {};


    selectedDateRecords.forEach(
        row => {

            statusLookup[
                row.trail_id
            ] =
                row.dashboard_status;
        }
    );


    // ------------------------------------------
    // Apply status to GeoJSON polygons
    // ------------------------------------------

    trailData.features.forEach(
        feature => {

            const trailID =
                feature.properties.trail_id;


            feature.properties.dashboard_status =
                statusLookup[trailID]
                ?? 'No Data';
        }
    );


    // Refresh Mapbox source
    map
        .getSource('trails')
        .setData(trailData);


    // ------------------------------------------
    // Update selected date label
    // ------------------------------------------

    dateLabel.textContent =
        formatDate(selectedDate);


    // ------------------------------------------
    // Update daily conditions
    // ------------------------------------------

    updateConditions(
        selectedDate
    );


    // ------------------------------------------
    // QA status counts
    // ------------------------------------------

    const statusCounts = {};


    selectedDateRecords.forEach(
        row => {

            const status =
                row.dashboard_status
                || 'Blank';


            statusCounts[status] =
                (
                    statusCounts[status]
                    || 0
                )
                + 1;
        }
    );


    console.log(
        `Season ${currentSeason} | Date ${selectedDate}`
    );


    console.log(
        `Records found: ${selectedDateRecords.length}`
    );


    console.log(
        'Status counts:',
        statusCounts
    );
}


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


    console.log(
        'Conditions lookup:',
        currentSeason,
        selectedDate,
        conditionRow
    );


    if (
        !conditionRow
    ) {

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

                console.log(
                    `Season ${currentSeason} | Date ${selectedDate}`
                );


                console.log(
                    `Records found: ${selectedDateRecords.length}`
                );


                console.log(
                    'Status counts:',
                    statusCounts
                );
            }


            // ==================================================
            // TEMPORARY OPERATING WINDOW
            // ==================================================

            function getOperatingWindow(
                seasonStatusData
            ) {

                const operationalStatuses =
                    new Set([

                        'Open',

                        'Groomed',

                        'Closed',

                        'Racing'
                    ]);


                const operationalDates =
                    [

                        ...new Set(

                            seasonStatusData

                                .filter(
                                    row =>
                                        operationalStatuses
                                            .has(
                                                row.dashboard_status
                                            )
                                )

                                .map(
                                    row =>
                                        row.date
                                )

                                .filter(date => 
                                     /^\d{4}-\d{2}-\d{2}$/.test(date)
                                )
                        )
                    ]
                        .sort();


                if (
                    operationalDates.length
                    ===
                    0
                ) {

                    return {

                        openingDate:
                            null,

                        closingDate:
                            null
                    };
                }


                return {

                    openingDate:
                        operationalDates[0],

                    closingDate:
                        operationalDates[
                            operationalDates.length
                            -
                            1
                        ]
                };
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


                const file =
                    seasonFiles[
                        season
                    ];


                if (
                    !file
                ) {

                    throw new Error(
                        `No file configured for season ${season}`
                    );
                }


                slider
                    .disabled =
                    true;


                seasonSelect
                    .disabled =
                    true;


                console.log(
                    `Loading season ${season} from ${file}`
                );


                try {

                    const response =
                        await fetch(
                            file
                        );


                    if (
                        !response.ok
                    ) {

                        throw new Error(
                            `Could not load ${file}: ${response.status}`
                        );
                    }


                    const csvText =
                        await response
                            .text();


                    const newStatusData =
                        parseCSV(
                            csvText
                        );


                    const newDateList =
                        [

                            ...new Set(

                                newStatusData

                                    .map(
                                        row =>
                                            row.date
                                    )

                                    .filter(
                                        date =>
                                            date =>
                                             /^\d{4}-\d{2}-\d{2}$/.test(date)
                                    )
                            )
                        ]
                            .sort();


                    if (
                        newDateList.length
                        ===
                        0
                    ) {

                        throw new Error(
                            `No dates found for season ${season}`
                        );
                    }


                    // ------------------------------------------
                    // COMMIT NEW SEASON STATE
                    // ------------------------------------------

                    statusData =
                        newStatusData;


                    dateList =
                        newDateList;


                    currentSeason =
                        season;


                    seasonSelect
                        .value =
                        season;


                    // ------------------------------------------
                    // SLIDER RANGE
                    // ------------------------------------------

                    slider
                        .min =
                        0;


                    slider
                        .max =
                        dateList.length
                        -
                        1;


                    slider
                        .step =
                        1;


                    firstDateLabel
                        .textContent =
                        formatDate(
                            dateList[0]
                        );


                    lastDateLabel
                        .textContent =
                        formatDate(
                            dateList[
                                dateList.length
                                -
                                1
                            ]
                        );


                    // ------------------------------------------
                    // TEMPORARY OPEN / CLOSE DATES
                    // ------------------------------------------

                    const operatingWindow =
                        getOperatingWindow(
                            statusData
                        );


                    if (
                        operatingWindow
                            .openingDate
                    ) {

                        openDateLabel
                            .textContent =

                            `Opening: ${formatShortDate(
                                operatingWindow
                                    .openingDate
                            )}`;
                    }

                    else {

                        openDateLabel
                            .textContent =
                            'Opening: —';
                    }


                    if (
                        operatingWindow
                            .closingDate
                    ) {

                        closeDateLabel
                            .textContent =

                            `Closing: ${formatShortDate(
                                operatingWindow
                                    .closingDate
                            )}`;
                    }

                    else {

                        closeDateLabel
                            .textContent =
                            'Closing: —';
                    }


                    // ------------------------------------------
                    // INITIAL DATE FOR SEASON
                    // ------------------------------------------

                    let selectedIndex =
                        -1;


                    if (
                        preferredDate
                    ) {

                        selectedIndex =
                            dateList
                                .indexOf(
                                    preferredDate
                                );
                    }


                    if (
                        selectedIndex
                        ===
                        -1
                    ) {

                        const endingYear =
                            2000
                            +
                            Number(

                                season
                                    .split(
                                        '-'
                                    )[1]
                            );


                        const januaryDate =
                            `${endingYear}-01-15`;


                        selectedIndex =
                            dateList
                                .indexOf(
                                    januaryDate
                                );
                    }


                    if (
                        selectedIndex
                        ===
                        -1
                    ) {

                        selectedIndex =
                            0;
                    }


                    slider
                        .value =
                        selectedIndex;


                    applyDate(

                        dateList[
                            selectedIndex
                        ]
                    );


                    console.log(
                        `Season ${season} loaded successfully`
                    );
                }

                finally {

                    slider
                        .disabled =
                        false;


                    seasonSelect
                        .disabled =
                        false;
                }
            }


            // ==================================================
            // DATE SLIDER
            // ==================================================

            slider
                .addEventListener(

                    'input',

                    () => {

                        const selectedIndex =
                            Number(
                                slider.value
                            );


                        const selectedDate =
                            dateList[
                                selectedIndex
                            ];


                        applyDate(
                            selectedDate
                        );
                    }
                );


            // ==================================================
            // SEASON DROPDOWN
            // ==================================================

            seasonSelect
                .addEventListener(

                    'change',

                    async event => {

                        const previousSeason =
                            currentSeason;


                        try {

                            const selectedSeason =
                                normalizeSeason(

                                    event
                                        .target
                                        .value
                                );


                            await loadSeason(
                                selectedSeason
                            );
                        }

                        catch (
                            error
                        ) {

                            console.error(
                                'Season change error:',
                                error
                            );


                            seasonSelect
                                .value =
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

                    const feature =
                        event
                            .features[0];


                    const props =
                        feature
                            .properties;


                    const displayStatus =

                        props
                            .dashboard_status
                        ===
                        'No Data'

                            ?

                            'No Data / Not Operational'

                            :

                            props
                                .dashboard_status;


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
                            ${displayStatus ?? 'No Data / Not Operational'}

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
            // POINTER CURSOR
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


            // ==================================================
            // FIT MAP TO TERRAIN
            // ==================================================

            const bounds =
                new mapboxgl
                    .LngLatBounds();


            function extendBounds(
                coordinates
            ) {

                if (

                    typeof coordinates[0]
                    ===
                    'number'

                ) {

                    bounds
                        .extend(
                            coordinates
                        );
                }

                else {

                    coordinates
                        .forEach(
                            extendBounds
                        );
                }
            }


            trailData
                .features
                .forEach(
                    feature => {

                        extendBounds(

                            feature
                                .geometry
                                .coordinates
                        );
                    }
                );


            map.fitBounds(

                bounds,

                {
                    padding:
                        40,

                    duration:
                        0
                }
            );


            // ==================================================
            // INITIAL SEASON
            // ==================================================

            seasonSelect
                .value =
                INITIAL_SEASON;


            await loadSeason(

                INITIAL_SEASON,

                INITIAL_DATE
            );
        }

        catch (
            error
        ) {

            console.error(
                'Terrain Dashboard error:',
                error
            );
        }
    }
);
