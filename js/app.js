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

map.on('load', () => {

    // Add the trail polygons as a GeoJSON source
    map.addSource('trails', {
        type: 'geojson',
        data: 'data/trails.geojson'
    });

    // Polygon fill
    map.addLayer({
        id: 'trail-fill',
        type: 'fill',
        source: 'trails',
        paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.35
        }
    });

    // Polygon outlines
    map.addLayer({
        id: 'trail-outline',
        type: 'line',
        source: 'trails',
        paint: {
            'line-color': '#1e3a8a',
            'line-width': 1.5
        }
    });

});
