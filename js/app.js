mapboxgl.accessToken = 'pk.eyJ1IjoiY2FybmV5YW0iLCJhIjoiY211azZhdnRlMDQ2czJ4b2JmaWllaGQ2NyJ9._ubQTmLlivNH7Wp3eCSckw';

const INITIAL_SEASON = '24-25';
const INITIAL_DATE = '2025-01-15';

const seasonFiles = {
    '24-25': 'data/trail_status_24-25.csv',
    '23-24': 'data/trail_status_23-24.csv'
};


// --------------------------------------------------
// Create Mapbox map
// --------------------------------------------------

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


// --------------------------------------------------
// Normalize dates to YYYY-MM-DD
// --------------------------------------------------

function normalizeDate(dateString) {

    if (!dateString) return '';

    dateString = dateString.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
    }

    const parts = dateString.split('/');

    if (parts.length === 3) {

        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');

        let year = parts[2];

        if (year.length === 2) {
            year = '20' + year;
        }

        return `${year}-${month}-${day}`;
    }

    return dateString;
}


// --------------------------------------------------
// Simple CSV parser
// --------------------------------------------------

function parseCSV(text) {

    text = text.replace(/^\uFEFF/, '');

    const lines = text.trim().split(/\r?\n/);

    const headers = lines[0]
        .split(',')
        .map(header =>
            header.trim().replace(/^"|"$/g, '')
        );

    return lines.slice(1).map(line => {

        const values = line
            .split(',')
            .map(value =>
                value.trim().replace(/^"|"$/g, '')
            );

        const row = {};

        headers.forEach((header, index) => {
            row[header] = values[index] ?? '';
        });

        row.date = normalizeDate(row.date);

        return row;
    });
}


// --------------------------------------------------
// Friendly date display
// --------------------------------------------------

function formatDate(dateString) {

    const date = new Date(
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


// --------------------------------------------------
// Map load
// --------------------------------------------------

map.on('load', async () => {

    try {

        // ------------------------------------------
        // Load static trail geometry once
        // ------------------------------------------

        const trailResponse =
            await fetch('data/trails.geojson');

        if (!trailResponse.ok) {
            throw new Error(
                `Could not load trails.geojson: ${trailResponse.status}`
            );
        }

        const trailData =
            await trailResponse.json();


        // Start every polygon with no status
        trailData.features.forEach(feature => {
            feature.properties.dashboard_status = 'No Data';
        });


        // ------------------------------------------
        // Dashboard controls
        // ------------------------------------------

        const seasonSelect =
            document.getElementById('season-select');

        const slider =
            document.getElementById('date-slider');

        const dateLabel =
            document.getElementById('date-label');

        const firstDateLabel =
            document.getElementById('first-date-label');

        const lastDateLabel =
            document.getElementById('last-date-label');


        // ------------------------------------------
        // Add trail source
        // ------------------------------------------

        map.addSource('trails', {
            type: 'geojson',
            data: trailData
        });


        // ------------------------------------------
        // Trail fill
        // ------------------------------------------

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

                    // No Data / unexpected
                    '#b8b8b8'
                ],

                'fill-opacity': 0.55
            }
        });


        // ------------------------------------------
        // Trail outlines
        // ------------------------------------------

        map.addLayer({
            id: 'trail-outline',
            type: 'line',
            source: 'trails',
            slot: 'top',

            paint: {
                'line-color': '#333333',
                'line-width': 1
            }
        });


        // ------------------------------------------
        // Variables that change by season
        // ------------------------------------------

        let statusData = [];
        let dateList = [];
        let currentSeason = INITIAL_SEASON;


        // ------------------------------------------
        // Apply selected date
        // ------------------------------------------

        function applyDate(selectedDate) {

            const selectedDateRecords =
                statusData.filter(
                    row => row.date === selectedDate
                );


            const statusLookup = {};

            selectedDateRecords.forEach(row => {

                statusLookup[row.trail_id] =
                    row.dashboard_status;

            });


            trailData.features.forEach(feature => {

                const trailID =
                    feature.properties.trail_id;

                feature.properties.dashboard_status =
                    statusLookup[trailID] ?? 'No Data';

            });


            map.getSource('trails')
                .setData(trailData);


            dateLabel.textContent =
                formatDate(selectedDate);


            // QA counts
            const statusCounts = {};

            selectedDateRecords.forEach(row => {

                const status =
                    row.dashboard_status || 'Blank';

                statusCounts[status] =
                    (statusCounts[status] || 0) + 1;

            });


            console.log(
                `Records found for ${selectedDate}:`,
                selectedDateRecords.length
            );

            console.log(
                'Status counts:',
                statusCounts
            );
        }


        // ------------------------------------------
        // Load an entire season
        // ------------------------------------------

        async function loadSeason(
            season,
            preferredDate = null
        ) {
            currentSeason = season;
            seasonSelect.value = season;
            
            const file =
                seasonFiles[season];

            if (!file) {
                throw new Error(
                    `No file configured for season ${season}`
                );
            }


            console.log(
                `Loading season ${season} from ${file}`
            );


            const statusResponse =
                await fetch(file);

            if (!statusResponse.ok) {
                throw new Error(
                    `Could not load ${file}: ${statusResponse.status}`
                );
            }


            const csvText =
                await statusResponse.text();

            statusData =
                parseCSV(csvText);


            // Build unique date list
            dateList = [
                ...new Set(
                    statusData
                        .map(row => row.date)
                        .filter(date => date !== '')
                )
            ].sort();


            if (dateList.length === 0) {
                throw new Error(
                    `No dates found for season ${season}`
                );
            }


            // Configure slider for this season
            slider.min = 0;
            slider.max = dateList.length - 1;
            slider.step = 1;


            firstDateLabel.textContent =
                formatDate(dateList[0]);

            lastDateLabel.textContent =
                formatDate(
                    dateList[dateList.length - 1]
                );


            // Try preferred date first
            let selectedIndex = -1;

            if (preferredDate) {
                selectedIndex =
                    dateList.indexOf(preferredDate);
            }


            // Otherwise use approximately Jan 15
            // of the ending year of the season
            if (selectedIndex === -1) {

                const endingYear =
                    2000 +
                    Number(
                        season.split('-')[1]
                    );

                const januaryDate =
                    `${endingYear}-01-15`;

                selectedIndex =
                    dateList.indexOf(januaryDate);
            }


            // If Jan 15 isn't present, start at first date
            if (selectedIndex === -1) {
                selectedIndex = 0;
            }


            slider.value =
                selectedIndex;


            applyDate(
                dateList[selectedIndex]
            );


            console.log(
                `Season ${season} loaded with ${dateList.length} dates`
            );
        }


        // ------------------------------------------
        // Date slider interaction
        // ------------------------------------------

        slider.addEventListener(
            'input',
            () => {

                const selectedIndex =
                    Number(slider.value);

                const selectedDate =
                    dateList[selectedIndex];

                applyDate(selectedDate);

                console.log(
                    `Slider: ${currentSeason} | ${selectedDate}`
                );
            }
        );


        // ------------------------------------------
        // Season dropdown interaction
        // ------------------------------------------

        seasonSelect.addEventListener(
            'change',
            async () => {

                try {

                    const selectedSeason =
                        seasonSelect.value;

                    await loadSeason(
                        selectedSeason
                    );

                } catch (error) {

                    console.error(
                        'Season change error:',
                        error
                    );
                }
            }
        );


        // ------------------------------------------
        // Trail popup
        // ------------------------------------------

        map.on(
            'click',
            'trail-fill',
            (e) => {

                const feature =
                    e.features[0];

                const props =
                    feature.properties;

                new mapboxgl.Popup()
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <strong>${props.trail_name ?? 'Unnamed Trail'}</strong><br>
                        Difficulty: ${props.difficulty ?? 'N/A'}<br>
                        Zone: ${props.mountain_area ?? 'N/A'}<br>
                        Acres: ${props.acres_25_26 ?? 'N/A'}<br>
                        Status: ${props.dashboard_status ?? 'No Data'}<br>
                        Trail ID: ${props.trail_id ?? 'N/A'}
                    `)
                    .addTo(map);
            }
        );


        // ------------------------------------------
        // Pointer cursor
        // ------------------------------------------

        map.on(
            'mouseenter',
            'trail-fill',
            () => {

                map.getCanvasContainer()
                    .style.cursor = 'pointer';
            }
        );

        map.on(
            'mouseleave',
            'trail-fill',
            () => {

                map.getCanvasContainer()
                    .style.cursor = '';
            }
        );


        // ------------------------------------------
        // Fit map to Keystone terrain
        // ------------------------------------------

        const bounds =
            new mapboxgl.LngLatBounds();


        function extendBounds(coords) {

            if (
                typeof coords[0] === 'number'
            ) {

                bounds.extend(coords);

            } else {

                coords.forEach(
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


        // ------------------------------------------
        // Load initial season
        // ------------------------------------------

        seasonSelect.value =
            INITIAL_SEASON;

        await loadSeason(
            INITIAL_SEASON,
            INITIAL_DATE
        );


    } catch (error) {

        console.error(
            'Terrain Dashboard error:',
            error
        );

    }

});
