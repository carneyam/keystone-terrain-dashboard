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
            }
        );
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
            // LOAD STATIC DATA
            // ==================================================

            const [
                trailResponse,
                liftResponse,
                conditionsResponse
            ] = await Promise.all([

                fetch(
                    'data/trails.geojson'
                ),

                fetch(
                    'data/lifts.geojson'
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


            if (
                !liftResponse.ok
            ) {

                throw new Error(
                    `Could not load lifts.geojson: ${liftResponse.status}`
                );
            }


            const trailData =
                await trailResponse.json();


            const liftData =
                await liftResponse.json();


            console.log(
                'Trails loaded:',
                trailData.features.length
            );


            console.log(
                'Lifts loaded:',
                liftData.features.length
            );


            if (
                liftData.features.length > 0
            ) {

                console.log(
                    'Lift fields:',
                    Object.keys(
                        liftData.features[0].properties
                    )
                );
            }


            // ==================================================
            // DAILY CONDITIONS
            // ==================================================

            let conditionsData = [];


            if (
                conditionsResponse.ok
            ) {

                const conditionsText =
                    await conditionsResponse.text();


                conditionsData =
                    parseCSV(
                        conditionsText
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
            // TRAIL FILL
            // ==================================================

            map.addLayer({

                id: 'trail-fill',

                type: 'fill',

                source: 'trails',

                slot: 'top',

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

        'line-cap': 'round',
        'line-join': 'round'
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

        'line-cap': 'round',
        'line-join': 'round'
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
            // CURRENT SEASON STATE
            // ==================================================

            let trailStatusData = [];

            let liftStatusData = [];

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
                    conditionsData.find(
                        row =>

                            row.season ===
                            currentSeason

                            &&

                            row.date ===
                            selectedDate
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


            // ==================================================
            // APPLY DATE
            // ==================================================

            function applyDate(
                selectedDate
            ) {

                if (
                    !selectedDate
                ) {
                    return;
                }


                // ------------------------------------------
                // TRAIL STATUS LOOKUP
                // ------------------------------------------

                const selectedTrailRecords =
                    trailStatusData.filter(
                        row =>
                            row.date ===
                            selectedDate
                    );


                const trailLookup =
                    {};


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
                // LIFT STATUS LOOKUP
                // ------------------------------------------

                const selectedLiftRecords =
                    liftStatusData.filter(
                        row =>
                            row.date ===
                            selectedDate
                    );


                const liftLookup =
                    {};


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
                // REFRESH MAP SOURCES
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
                // UPDATE DASHBOARD
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
            // TEMPORARY RESORT OPERATING WINDOW
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
                                                normalizeStatus(
                                                    row
                                                )
                                            )
                                )

                                .map(
                                    row =>
                                        row.date
                                )

                                .filter(
                                    date =>
                                        /^\d{4}-\d{2}-\d{2}$/
                                            .test(
                                                date || ''
                                            )
                                )
                        )
                    ]
                        .sort();


                if (
                    operationalDates.length ===
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
                            operationalDates.length -
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


                const trailFile =
                    trailStatusFiles[
                        season
                    ];


                const liftFile =
                    liftStatusFiles[
                        season
                    ];


                if (
                    !trailFile
                ) {

                    throw new Error(
                        `No trail file configured for season ${season}`
                    );
                }


                if (
                    !liftFile
                ) {

                    throw new Error(
                        `No lift file configured for season ${season}`
                    );
                }


                slider.disabled =
                    true;


                seasonSelect.disabled =
                    true;


                console.log(
                    `Loading season ${season}`
                );


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


                    const newTrailStatusData =
                        parseCSV(
                            await trailStatusResponse.text()
                        );


                    const newLiftStatusData =
                        parseCSV(
                            await liftStatusResponse.text()
                        );


                    const newDateList =
                        [

                            ...new Set(

                                newTrailStatusData

                                    .map(
                                        row =>
                                            row.date
                                    )

                                    .filter(
                                        date =>
                                            /^\d{4}-\d{2}-\d{2}$/
                                                .test(
                                                    date || ''
                                                )
                                    )
                            )
                        ]
                            .sort();


                    if (
                        newDateList.length ===
                        0
                    ) {

                        throw new Error(
                            `No dates found for season ${season}`
                        );
                    }


                    // ------------------------------------------
                    // COMMIT NEW SEASON
                    // ------------------------------------------

                    trailStatusData =
                        newTrailStatusData;


                    liftStatusData =
                        newLiftStatusData;


                    dateList =
                        newDateList;


                    currentSeason =
                        season;


                    seasonSelect.value =
                        season;


                    // ------------------------------------------
                    // SLIDER
                    // ------------------------------------------

                    slider.min =
                        0;


                    slider.max =
                        dateList.length -
                        1;


                    slider.step =
                        1;


                    firstDateLabel.textContent =
                        formatDate(
                            dateList[0]
                        );


                    lastDateLabel.textContent =
                        formatDate(
                            dateList[
                                dateList.length -
                                1
                            ]
                        );


                    // ------------------------------------------
                    // TEMPORARY OPEN / CLOSE DATES
                    // ------------------------------------------

                    const operatingWindow =
                        getOperatingWindow(
                            trailStatusData
                        );


                    openDateLabel.textContent =
                        operatingWindow.openingDate

                            ?

                            `Opening: ${formatShortDate(
                                operatingWindow.openingDate
                            )}`

                            :

                            'Opening: —';


                    closeDateLabel.textContent =
                        operatingWindow.closingDate

                            ?

                            `Closing: ${formatShortDate(
                                operatingWindow.closingDate
                            )}`

                            :

                            'Closing: —';


                    // ------------------------------------------
                    // STARTING DATE
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

                    map.getCanvasContainer()
                        .style.cursor =
                        'pointer';
                }
            );


            map.on(
                'mouseleave',
                'trail-fill',
                () => {

                    map.getCanvasContainer()
                        .style.cursor =
                        '';
                }
            );


            map.on(
                'mouseenter',
                'lift-lines',
                () => {

                    map.getCanvasContainer()
                        .style.cursor =
                        'pointer';
                }
            );


            map.on(
                'mouseleave',
                'lift-lines',
                () => {

                    map.getCanvasContainer()
                        .style.cursor =
                        '';
                }
            );


            // ==================================================
            // FIT MAP TO TERRAIN
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
