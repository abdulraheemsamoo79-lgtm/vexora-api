// VEXORA API - Weather
// GET /api/weather?city=<city name>
// Returns current weather + today's min/max for any city in the world.
// Backend: Open-Meteo (free public weather service, no API key needed)

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

const WMO = {
  0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain',
  65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow',
  73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Light rain showers',
  81: 'Rain showers', 82: 'Violent rain showers', 85: 'Snow showers',
  86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail'
};

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const city = (searchParams.get('city') || searchParams.get('q') || '').trim();
    if (!city) {
      return sendJson(res, 200, { status: false, message: 'Missing ?city= parameter' });
    }

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const gr = await fetch(geoUrl, { signal: AbortSignal.timeout(15000) });
    const geo = await gr.json();
    if (!geo || !Array.isArray(geo.results) || !geo.results.length) {
      return sendJson(res, 200, { status: false, message: 'City not found: ' + city });
    }
    const place = geo.results[0];

    const fcUrl = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${place.latitude}&longitude=${place.longitude}`
      + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
      + '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset'
      + '&timezone=auto&forecast_days=1';
    const fr = await fetch(fcUrl, { signal: AbortSignal.timeout(15000) });
    const fc = await fr.json();
    if (!fc || !fc.current) {
      return sendJson(res, 200, { status: false, message: 'Weather data not available right now' });
    }

    const c = fc.current;
    const d = fc.daily || {};
    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        city: place.name,
        country: place.country || '',
        temperature: c.temperature_2m,
        feels_like: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        wind_speed: c.wind_speed_10m,
        condition: WMO[c.weather_code] || 'Unknown',
        weather_code: c.weather_code,
        temp_max: Array.isArray(d.temperature_2m_max) ? d.temperature_2m_max[0] : null,
        temp_min: Array.isArray(d.temperature_2m_min) ? d.temperature_2m_min[0] : null,
        sunrise: Array.isArray(d.sunrise) ? d.sunrise[0] : null,
        sunset: Array.isArray(d.sunset) ? d.sunset[0] : null,
        timezone: fc.timezone || place.timezone || ''
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
