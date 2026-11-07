import json

from collect_keystone import (
    get_page,
    extract_feed,
    parse_lifts,
    parse_trails,
)


html = get_page()
feed = extract_feed(html)

live_trails = parse_trails(feed)
live_lifts = parse_lifts(feed)


with open("data/trails.geojson") as f:
    trail_geo = json.load(f)

with open("data/lifts.geojson") as f:
    lift_geo = json.load(f)


geo_trail_names = {
    feature["properties"]["trail_name"]
    for feature in trail_geo["features"]
}

geo_lift_names = {
    feature["properties"]["lift_name"]
    for feature in lift_geo["features"]
}


live_trail_names = {
    trail["name"]
    for trail in live_trails
}

live_lift_names = {
    lift["name"]
    for lift in live_lifts
}


print("\nLIVE TRAILS NOT FOUND IN GEOJSON")
print("-" * 50)

for name in sorted(live_trail_names - geo_trail_names):
    print(name)


print("\nGEOJSON TRAILS NOT FOUND IN LIVE FEED")
print("-" * 50)

for name in sorted(geo_trail_names - live_trail_names):
    print(name)


print("\nLIVE LIFTS NOT FOUND IN GEOJSON")
print("-" * 50)

for name in sorted(live_lift_names - geo_lift_names):
    print(name)


print("\nGEOJSON LIFTS NOT FOUND IN LIVE FEED")
print("-" * 50)

for name in sorted(geo_lift_names - live_lift_names):
    print(name)