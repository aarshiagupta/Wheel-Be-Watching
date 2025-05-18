import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1IjoiYWFyc2hpYWd1cHRhIiwiYSI6ImNtYXJkeXNtazA5Znkya3BxZWoxczg0b2gifQ.6CfyoCUAxepDwhZ9p4tDGA';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
  }

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
  }

function computeStationTraffic(stations, trips) {
    // Compute departures
    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id,
    );
    // Compute arrivals
    const arrivals = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.end_station_id,
    );
  
    return stations.map((station) => {
        const id = station.short_name;
        station.departures = departures.get(id) ?? 0;
        station.arrivals = arrivals.get(id) ?? 0;
        station.totalTraffic = station.departures + station.arrivals;
        return station;
      });
    } 
    // Update each station..
    // return stations.map((station) => {
    //   let id = station.short_name;
    //   station.arrivals = arrivals.get(id) ?? 0;
      // what you updated in step 4.2
//       return station;
//     });
//   }

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

function filterTripsbyTime(trips, timeFilter) {
    return timeFilter === -1
      ? trips // If no filter is applied (-1), return all trips
      : trips.filter((trip) => {
          // Convert trip start and end times to minutes since midnight
          const startedMinutes = minutesSinceMidnight(trip.started_at);
          const endedMinutes = minutesSinceMidnight(trip.ended_at);
  
          // Include trips that started or ended within 60 minutes of the selected time
          return (
            Math.abs(startedMinutes - timeFilter) <= 60 ||
            Math.abs(endedMinutes - timeFilter) <= 60
          );
        });
}

map.on('load', async () => {
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });
    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
          'line-color': '#32D400',
          'line-width': 5,
          'line-opacity': 0.6,
        },
      });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
     });
    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
          'line-color': '#FF8C00',
          'line-width': 5,
          'line-opacity': 0.6,
        },
      });

      let stations = [];
      let trips = [];
      // Initialize stations array
    //   let jsonData;
    try {
        const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
        const tripURL = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

        const jsonData = await d3.json(jsonurl);
        trips = await d3.csv(tripURL, trip => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        return trip;
        });

        stations = computeStationTraffic(jsonData.data.stations, trips); // ✅ trips is defined now

        // const jsonData = await d3.json(jsonurl);
        // // stations = jsonData.data.stations;
        // const stations = computeStationTraffic(jsonData.data.stations, trips);

        // let trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', 
        //     (trip) => {
        //     trip.started_at = new Date(trip.started_at);
        //     trip.ended_at = new Date(trip.ended_at);
        //     return trip;
        // }
        // );

        const departures = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.start_station_id,
          );
        const arrivals = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.end_station_id,
          );

        stations = stations.map((station) => {
            const id = station.short_name;
            station.arrivals = arrivals.get(id) ?? 0;
            station.departures = departures.get(id) ?? 0;
            station.totalTraffic = station.arrivals + station.departures;
            return station;
        });

        const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);

        let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

        // const svg = d3.select('#map').select('svg');
        const svg = d3.select('#map')
  .append('svg')
  .attr('width', '100%')
  .attr('height', '100%')
  .style('position', 'absolute')
  .style('top', 0)
  .style('left', 0)
  .style('pointer-events', 'none'); // Let mouse pass through


        const circles = svg
        .selectAll('circle')
        .data(stations, (d) => d.short_name)
        .enter()
        .append('circle')
        .attr('r', d => radiusScale(d.totalTraffic))
        // .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .style('pointer-events', 'auto')
        .style('--departure-ratio', (d) =>
        stationFlow(d.departures / d.totalTraffic)
        )
        .each(function (d) {
            d3.select(this)
              .append('title')
              .text(
                `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
              );
          });

        function updatePositions() {
        circles
            .attr('cx', (d) => getCoords(d).cx)
            .attr('cy', (d) => getCoords(d).cy);
        }

        updatePositions();
        map.on('move', updatePositions);
        map.on('zoom', updatePositions);
        map.on('resize', updatePositions);
        map.on('moveend', updatePositions);

        const timeSlider = document.getElementById('time-slider');
        const selectedTime = document.getElementById('selected-time');
        const anyTimeLabel = document.getElementById('any-time');

        function updateTimeDisplay() {
            let timeFilter = Number(timeSlider.value); // Get slider value
          
            if (timeFilter === -1) {
              selectedTime.textContent = ''; // Clear time display
              anyTimeLabel.style.display = 'block'; // Show "(any time)"
            } else {
              selectedTime.textContent = formatTime(timeFilter); // Display formatted time
              anyTimeLabel.style.display = 'none'; // Hide "(any time)"
            }
          
            // Call updateScatterPlot to reflect the changes on the map
            updateScatterPlot(timeFilter);
          }

        function updateScatterPlot(timeFilter) {

            const filteredTrips = filterTripsbyTime(trips, timeFilter);
            const filteredStations = computeStationTraffic(stations, filteredTrips);

            timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
        
            circles
              .data(filteredStations, (d) => d.short_name) 
              .join('circle') // Ensure the data is bound correctly
              .attr('r', (d) => radiusScale(d.totalTraffic))
              .style('--departure-ratio', (d) =>
                stationFlow(d.departures / d.totalTraffic),
              ); // Update circle sizes
          }

        timeSlider.addEventListener('input', updateTimeDisplay);
        updateTimeDisplay();

      } catch (error) {
        console.error('Error loading JSON:', error); // Handle errors
  }
});



