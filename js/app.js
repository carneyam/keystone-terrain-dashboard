mapboxgl.accessToken = 'pk.eyJ1IjoiY2FybmV5YW0iLCJhIjoiY211azZhdnRlMDQ2czJ4b2JmaWllaGQ2NyJ9._ubQTmLlivNH7Wp3eCSckw';

// First historical date we will test
const TEST_DATE = '2025-01-15';

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
// Convert CSV dates to YYYY-MM-DD
// Works with either:
// 2025-01-15
// or
// 1/15/25
// --------------------------------------------------

function normalizeDate(dateString) {

    if (!dateString) return '';

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
    }

    // Excel-style M/D/YY or M/D/YYYY
    const parts = dateString.split('/');

    if (parts.length === 3) {

        let month = parts[0].padStart(2, '0');
        let day = parts[1].padStart(2, '0');
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

    // Remove possible Excel BOM character
    text = text.replace(/^\uFEFF/, '');

    const lines = text.trim().split(/\r?\n/);

    const headers = lines[0]
        .split(',')
        .map(header => header.trim().replace(/^"|"$/g, ''));

    return lines.slice(1).map(line => {

        const values = line
            .split(',')
            .map(value => value.trim().replace(/^"|"$/g, ''));

        const row = {};

        headers.forEach((header, index) => {
            row[header] = values[index] ?? '';
        });

        row.date = normalizeDate(row.date);

        return row;
    });
}


// --------------------------------------------------
// Load map data
// --------------------------------------------------

map.on('load', async () => {

    // Load both files
    const [trailResponse, statusResponse] = await Promise.all([
        fetch('data/trails.geojson'),
        fetch('data/trail_status_24-25.csv')
    ]);

    const trailData = await trailResponse.json();
    const csvText = await statusResponse.text();

    const statusData = parseCSV(csvText);


    // --------------------------------------------------
    // Find records for the test date
    // --------------------------------------------------

    const selectedDateRecords = statusData.filter(
        row => row.date === TEST_DATE
    );


    // Create lookup:
    // T001 -> Open
    // T002 -> Groomed
    // etc.
    const statusLookup = {};

    selectedDateRecords.forEach(row => {
        statusLookup[row.trail_id] = row.dashboard_status;
    });


    // --------------------------------------------------
    // Add status to each GeoJSON polygon
    // --------------------------------------------------

    trailData.features.forEach(feature => {

        const trailID = feature.properties.trail_id;

        feature.properties.dashboard_status =
            statusLookup[trailID] ?? 'No Data';
    });


    // --------------------------------------------------
    // Add trail source
    // --------------------------------------------------

    map.addSource('trails', {
        type: 'geojson',
        data: trailData
    });


    // --------------------------------------------------
    // Trail polygon fill
    // --------------------------------------------------

    map.addLayer({
        id: 'trail-fill',
        type: 'fill',
        source: 'trails',
        slot: 'top',

        paint: {

            'fill-color': [
                'match',
                ['get', 'dashboard_status'],

                'Open', '#39a844',

                'Groomed', '#146b2e',

                'Closed', '#d9342b',

                'Racing', '#f59e0b',

                'Not Open', '#9ca3af',

                // No Data / unexpected value
                '#b8b8b8'
            ],

            'fill-opacity': 0.55
        }
    });


    // --------------------------------------------------
    // Trail outlines
    // --------------------------------------------------

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


    // --------------------------------------------------
    // Trail popup
    // --------------------------------------------------

    map.on('click', 'trail-fill', (e) => {

        const feature = e.features[0];
        const props = feature.properties;

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
    });

        const statusCounts = {};

            selectedDateRecords.forEach(row => {
                const status = row.dashboard_status || 'Blank';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

        console.log('Status counts:', statusCounts);
    
    // --------------------------------------------------
    // Cursor
    // --------------------------------------------------

    map.on('mouseenter', 'trail-fill', () => {
        map.getCanvasContainer().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'trail-fill', () => {
        map.getCanvasContainer().style.cursor = '';
    });


    // --------------------------------------------------
    // Fit map to trail system
    // --------------------------------------------------

    const bounds = new mapboxgl.LngLatBounds();

    function extendBounds(coords) {

        if (typeof coords[0] === 'number') {
            bounds.extend(coords);
        } else {
            coords.forEach(extendBounds);
        }
    }

    trailData.features.forEach(feature => {
        extendBounds(feature.geometry.coordinates);
    });

    map.fitBounds(bounds, {
        padding: 40,
        duration: 0
    });


    // --------------------------------------------------
    // Diagnostic information
    // --------------------------------------------------

    console.log(
        `Records found for ${TEST_DATE}:`,
        selectedDateRecords.length
    );

    console.log('Status lookup:', statusLookup);

});
