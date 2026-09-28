mapboxgl.accessToken = 'pk.eyJ1IjoiY2FybmV5YW0iLCJhIjoiY211azZhdnRlMDQ2czJ4b2JmaWllaGQ2NyJ9._ubQTmLlivNH7Wp3eCSckw';

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

map.on('load', async () => {

    // Load trail GeoJSON
    const response = await fetch('data/trails.geojson');
    const trailData = await response.json();

    // Add trail data source
    map.addSource('trails', {
        type: 'geojson',
        data: trailData
    });

    // Trail polygon fill
    map.addLayer({
        id: 'trail-fill',
        type: 'fill',
        source: 'trails',
        slot: 'top',
        paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.35
        }
    });

    // Trail polygon outline
    map.addLayer({
        id: 'trail-outline',
        type: 'line',
        source: 'trails',
        slot: 'top',
        paint: {
            'line-color': '#1e3a8a',
            'line-width': 1.5
        }
    });

    // -----------------------------------
    // Trail click popup
    // -----------------------------------

map.on('click', 'trail-fill', (e) => {

    const feature = e.features[0];
    const props = feature.properties;

    console.log(props);

    new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`
            <strong>${props.trail_name ?? 'Unnamed Trail'}</strong><br>
            Zone: ${props.mountain_area ?? 'N/A'}<br>
            Difficulty: ${props.difficulty ?? 'N/A'}<br>
            Acres: ${props.acres_25_26 ?? 'N/A'}<br>
            Trail ID: ${props.trail_id ?? 'N/A'}<br>
            
        `)
        .addTo(map);
});

    // Change cursor when hovering over a trail
    map.on('mouseenter', 'trail-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'trail-fill', () => {
        map.getCanvas().style.cursor = '';
    });

    // -----------------------------------
    // Fit map to trail extent
    // -----------------------------------

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

});
