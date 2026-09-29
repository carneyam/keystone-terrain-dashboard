mapboxgl.accessToken = 'pk.eyJ1IjoiY2FybmV5YW0iLCJhIjoiY211azZhdnRlMDQ2czJ4b2JmaWllaGQ2NyJ9._ubQTmLlivNH7Wp3eCSckw';

// ==================================================
// CONFIGURATION
// ==================================================

const INITIAL_SEASON = '24-25';
const INITIAL_DATE = '2025-01-15';

const seasonFiles = {
    '24-25': 'data/trail_status_24-25.csv',
    '23-24': 'data/trail_status_23-24.csv'
};


// ==================================================
// CREATE MAP
// ==================================================

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/standard',
    center: [-105.95, 39.60],
    zoom: 12
});

map.addControl(
    new mapboxgl.NavigationControl(),
    'top-right'
);


// ==================================================
// NORMALIZE SEASON VALUES
// ==================================================

function normalizeSeason(season) {

    if (!season) {
        return '';
    }

    return season
        .replaceAll('–', '-')
        .replaceAll('—', '-')
        .trim();
}


// ==================================================
// NORMALIZE DATES TO YYYY-MM-DD
// ==================================================

function normalizeDate(dateString) {

    if (!dateString) {
        return '';
    }

    dateString = dateString.trim();


    // Already formatted YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {

        return dateString;
    }


    // Excel-style M/D/YY or M/D/YYYY
    const parts =
        dateString.split('/');


    if (parts.length === 3) {

        const month =
            parts[0].padStart(2, '0');

        const day =
            parts[1].padStart(2, '0');

        let year =
            parts[2];


        if (year.length === 2) {

            year =
                '20' + year;
        }


        return `${year}-${month}-${day}`;
    }


    return dateString;
}


// ==================================================
// CSV PARSER
// ==================================================

function parseCSV(text) {

    // Remove possible Excel BOM
    text =
        text.replace(/^\uFEFF/, '');


    const lines =
        text
            .trim()
            .split(/\r?\n/);


    const headers =
        lines[0]
            .split(',')
            .map(header =>
                header
                    .trim()
                    .replace(/^"|"$/g, '')
            );


    return lines
        .slice(1)
        .map(line => {

            const values =
                line
                    .split(',')
                    .map(value =>
                        value
                            .trim()
                            .replace(/^"|"$/g, '')
                    );


            const row = {};


            headers.forEach(
                (header, index) => {

                    row[header] =
                        values[index] ?? '';
                }
            );


            row.date =
                normalizeDate(
                    row.date
                );


            return row;
        });
}


// ==================================================
// DATE FORMATTING
// ==================================================

function formatDate(dateString) {

    const date =
        new Date(
            dateString + 'T12:00:00'
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

    const date =
        new Date(
            dateString + 'T12:00:00'
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
// MAP LOAD
// ==================================================

map.on('load', async () => {

    try {

        // ==================================================
        // LOAD STATIC TRAIL GEOMETRY
        // ==================================================

        const trailResponse =
            await fetch(
                'data/trails.geojson'
            );


        if (!trailResponse.ok) {

            throw new Error(
                `Could not load trails.geojson: ${trailResponse.status}`
            );
        }


        const trailData =
            await trailResponse.json();


        // Start all polygons with no daily status
        trailData.features.forEach(
            feature => {

                feature.properties.dashboard_status =
                    'No Data';
            }
        );


        // ==================================================
        // DASHBOARD CONTROLS
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


        // ==================================================
        // ADD TRAIL SOURCE
        // ==================================================

        map.addSource(
            'trails',
            {
                type: 'geojson',
                data: trailData
            }
        );


        // ==================================================
        // TRAIL POLYGON FILL
        // ==================================================

        map.addLayer({
            id: 'trail-fill',
            type: 'fill',
            source: 'trails',
            slot: 'top',

            paint: {

                'fill-color': [

                    'match',

                    ['get', 'dashboard_status'],

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

                    // No Data / unexpected status
                    '#b8b8b8'
                ],

                'fill-opacity': 0.55
            }
        });


        // ==================================================
        // TRAIL OUTLINES
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
        // CURRENT SEASON STATE
        // ==================================================

        let statusData = [];

        let dateList = [];

        let currentSeason =
            INITIAL_SEASON;


        // ==================================================
        // APPLY SELECTED DATE
        // ==================================================

        function applyDate(
            selectedDate
        ) {

            if (!selectedDate) {

                return;
            }


            const selectedDateRecords =
                statusData.filter(
                    row =>
                        row.date ===
                        selectedDate
                );


            // Create:
            // T001 -> Groomed
            // T002 -> Open
            // etc.

            const statusLookup = {};


            selectedDateRecords.forEach(
                row => {

                    statusLookup[
                        row.trail_id
                    ] =
                        row.dashboard_status;
                }
            );


            // Apply status to each polygon

            trailData.features.forEach(
                feature => {

                    const trailID =
                        feature
                            .properties
                            .trail_id;


                    feature
                        .properties
                        .dashboard_status =

                        statusLookup[
                            trailID
                        ] ?? 'No Data';
                }
            );


            // Refresh Mapbox source

            map
                .getSource('trails')
                .setData(trailData);


            // Update visible selected date

            dateLabel.textContent =
                formatDate(
                    selectedDate
                );


            // QA counts

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
                        ) + 1;
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


        // ==================================================
        // DETERMINE RESORT OPERATING WINDOW
        // ==================================================

        function getOperatingWindow(
            seasonStatusData
        ) {

            /*
             A day counts as operational if at least
             one historical trail record is:

             Open
             Groomed
             Closed
             Racing

             Pre/post-season "Not Open" dates are ignored.
            */

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
                            .filter(row =>

                                operationalStatuses
                                    .has(
                                        row.dashboard_status
                                    )
                            )

                            .map(row =>
                                row.date
                            )

                            .filter(Boolean)
                    )
                ]
                    .sort();


            if (
                operationalDates.length === 0
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
                        operationalDates.length - 1
                    ]
            };
        }


        // ==================================================
        // LOAD A SEASON
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


            if (!file) {

                throw new Error(
                    `No file configured for season ${season}`
                );
            }


            /*
             Temporarily disable the controls while
             the new CSV is loading. This prevents a
             slider event from firing against the
             previous season's date list.
            */

            slider.disabled =
                true;

            seasonSelect.disabled =
                true;


            console.log(
                `Loading season ${season} from ${file}`
            );


            try {

                // ------------------------------------------
                // FETCH CSV
                // ------------------------------------------

                const response =
                    await fetch(
                        file
                    );


                if (!response.ok) {

                    throw new Error(
                        `Could not load ${file}: ${response.status}`
                    );
                }


                const csvText =
                    await response.text();


                // ------------------------------------------
                // BUILD NEW SEASON DATA
                // ------------------------------------------

                const newStatusData =
                    parseCSV(
                        csvText
                    );


                const newDateList =
                    [
                        ...new Set(

                            newStatusData
                                .map(row =>
                                    row.date
                                )

                                .filter(date =>
                                    date !== ''
                                )
                        )
                    ]
                        .sort();


                if (
                    newDateList.length === 0
                ) {

                    throw new Error(
                        `No dates found for season ${season}`
                    );
                }


                /*
                 Only now do we replace the active
                 season data. This prevents the app
                 from getting into a mixed-season state.
                */

                statusData =
                    newStatusData;


                dateList =
                    newDateList;


                currentSeason =
                    season;


                seasonSelect.value =
                    season;


                // ------------------------------------------
                // UPDATE SLIDER RANGE
                // ------------------------------------------

                slider.min =
                    0;


                slider.max =
                    dateList.length - 1;


                slider.step =
                    1;


                // ------------------------------------------
                // UPDATE FULL CALENDAR DATES BELOW SLIDER
                // ------------------------------------------

                firstDateLabel.textContent =
                    formatDate(
                        dateList[0]
                    );


                lastDateLabel.textContent =
                    formatDate(
                        dateList[
                            dateList.length - 1
                        ]
                    );


                // ------------------------------------------
                // UPDATE OPEN / CLOSE DATES ABOVE SLIDER
                // ------------------------------------------

                const operatingWindow =
                    getOperatingWindow(
                        statusData
                    );


                if (
                    operatingWindow
                        .openingDate
                ) {

                    openDateLabel.textContent =
                        `Opening: ${formatShortDate(
                            operatingWindow
                                .openingDate
                        )}`;
                }

                else {

                    openDateLabel.textContent =
                        'Opening: —';
                }


                if (
                    operatingWindow
                        .closingDate
                ) {

                    closeDateLabel.textContent =
                        `Closing: ${formatShortDate(
                            operatingWindow
                                .closingDate
                        )}`;
                }

                else {

                    closeDateLabel.textContent =
                        'Closing: —';
                }


                // ------------------------------------------
                // DETERMINE INITIAL DATE FOR NEW SEASON
                // ------------------------------------------

                let selectedIndex =
                    -1;


                /*
                 On first page load, try the configured
                 January 15, 2025 date.
                */

                if (preferredDate) {

                    selectedIndex =
                        dateList.indexOf(
                            preferredDate
                        );
                }


                /*
                 When changing seasons, default to
                 January 15 of that season's ending year.
                */

                if (
                    selectedIndex === -1
                ) {

                    const endingYear =
                        2000 +
                        Number(

                            season
                                .split('-')[1]
                        );


                    const januaryDate =
                        `${endingYear}-01-15`;


                    selectedIndex =
                        dateList.indexOf(
                            januaryDate
                        );
                }


                /*
                 If January 15 does not exist,
                 start on the first available date.
                */

                if (
                    selectedIndex === -1
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
                    `Season ${season} loaded successfully`
                );


                console.log(
                    `Available dates: ${dateList.length}`
                );
            }

            finally {

                slider.disabled =
                    false;


                seasonSelect.disabled =
                    false;
            }
        }


        // ==================================================
        // DATE SLIDER EVENT
        // ==================================================

        slider.addEventListener(
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
        // SEASON DROPDOWN EVENT
        // ==================================================

        seasonSelect.addEventListener(
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

                catch (error) {

                    console.error(
                        'Season change error:',
                        error
                    );


                    /*
                     If loading the requested season
                     fails, return the dropdown to the
                     season whose data is still active.
                    */

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

                const feature =
                    event.features[0];


                const props =
                    feature.properties;


                const displayStatus =

                    props.dashboard_status ===
                    'No Data'

                        ? 'No Data / Not Operational'

                        : props.dashboard_status;


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

                    .addTo(map);
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
        // FIT MAP TO TERRAIN POLYGONS
        // ==================================================

        const bounds =
            new mapboxgl
                .LngLatBounds();


        function extendBounds(
            coordinates
        ) {

            if (
                typeof coordinates[0]
                === 'number'
            ) {

                bounds.extend(
                    coordinates
                );
            }

            else {

                coordinates.forEach(
                    extendBounds
                );
            }
        }


        trailData.features.forEach(
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
                padding: 40,
                duration: 0
            }
        );


        // ==================================================
        // LOAD INITIAL SEASON
        // ==================================================

        seasonSelect.value =
            INITIAL_SEASON;


        await loadSeason(
            INITIAL_SEASON,
            INITIAL_DATE
        );
    }

    catch (error) {

        console.error(
            'Terrain Dashboard error:',
            error
        );
    }
});
