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
