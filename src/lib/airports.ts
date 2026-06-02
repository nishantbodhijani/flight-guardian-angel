// Minimal IATA → coordinates lookup for major hubs we serve.
// Used to fetch Open-Meteo weather for origin/destination airports.
// Extend as needed; unknown airports simply skip weather enrichment.

export type AirportCoords = { lat: number; lon: number; city: string };

export const AIRPORTS: Record<string, AirportCoords> = {
  // India
  DEL: { lat: 28.5562, lon: 77.1, city: "Delhi" },
  BOM: { lat: 19.0896, lon: 72.8656, city: "Mumbai" },
  BLR: { lat: 13.1986, lon: 77.7066, city: "Bengaluru" },
  MAA: { lat: 12.9941, lon: 80.1709, city: "Chennai" },
  HYD: { lat: 17.2403, lon: 78.4294, city: "Hyderabad" },
  CCU: { lat: 22.6547, lon: 88.4467, city: "Kolkata" },
  PNQ: { lat: 18.5821, lon: 73.9197, city: "Pune" },
  COK: { lat: 10.152, lon: 76.4019, city: "Kochi" },
  GOI: { lat: 15.3808, lon: 73.8314, city: "Goa" },
  AMD: { lat: 23.0772, lon: 72.6347, city: "Ahmedabad" },
  // Middle East
  DXB: { lat: 25.2532, lon: 55.3657, city: "Dubai" },
  AUH: { lat: 24.433, lon: 54.6511, city: "Abu Dhabi" },
  DOH: { lat: 25.2731, lon: 51.6086, city: "Doha" },
  // Europe
  LHR: { lat: 51.47, lon: -0.4543, city: "London" },
  CDG: { lat: 49.0097, lon: 2.5479, city: "Paris" },
  FRA: { lat: 50.0379, lon: 8.5622, city: "Frankfurt" },
  AMS: { lat: 52.3105, lon: 4.7683, city: "Amsterdam" },
  // Americas
  JFK: { lat: 40.6413, lon: -73.7781, city: "New York" },
  LAX: { lat: 33.9416, lon: -118.4085, city: "Los Angeles" },
  ORD: { lat: 41.9742, lon: -87.9073, city: "Chicago" },
  DFW: { lat: 32.8998, lon: -97.0403, city: "Dallas" },
  // Asia Pacific
  SIN: { lat: 1.3644, lon: 103.9915, city: "Singapore" },
  HKG: { lat: 22.308, lon: 113.9185, city: "Hong Kong" },
  BKK: { lat: 13.69, lon: 100.7501, city: "Bangkok" },
  SYD: { lat: -33.9399, lon: 151.1753, city: "Sydney" },
};
