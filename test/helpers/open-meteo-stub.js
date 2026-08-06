import { createServer } from 'node:http';
import { once } from 'node:events';

/** A day of weather, shaped the way Open-Meteo shapes one. */
export function forecastBody({ days = 3, timezone = 'America/New_York' } = {}) {
  const dates = Array.from({ length: days }, (_, i) => `2026-08-0${6 + i}`);

  return {
    timezone,
    current: {
      time: '2026-08-06T14:00',
      temperature_2m: 63.8199997,
      apparent_temperature: 61.4,
      relative_humidity_2m: 74,
      precipitation: 0.0399999,
      weather_code: 63,
      wind_speed_10m: 12.6,
      wind_gusts_10m: 24.4,
      is_day: 1,
    },
    hourly: {
      time: ['2026-08-06T12:00', '2026-08-06T13:00', '2026-08-06T14:00', '2026-08-06T15:00',
        '2026-08-06T16:00', '2026-08-06T17:00', '2026-08-06T18:00', '2026-08-06T19:00',
        '2026-08-06T20:00', '2026-08-06T21:00'],
      temperature_2m: [60, 61, 63.81, 65, 66, 64, 62, 60, 58, 57],
      precipitation_probability: [10, 20, 60, 80, 70, 40, 20, 10, 5, 5],
      weather_code: [3, 3, 63, 65, 63, 61, 3, 2, 1, 0],
    },
    daily: {
      time: dates,
      weather_code: dates.map((_, i) => [63, 95, 0][i % 3]),
      temperature_2m_max: dates.map((_, i) => 70 + i),
      temperature_2m_min: dates.map((_, i) => 52 + i),
      precipitation_sum: dates.map(() => 0.339999),
      precipitation_probability_max: dates.map(() => 80),
      wind_speed_10m_max: dates.map(() => 18.4),
      sunrise: dates.map((date) => `${date}T06:34`),
      sunset: dates.map((date) => `${date}T20:52`),
    },
  };
}

/**
 * Open-Meteo, close enough to answer with. It records what was asked so a test
 * can check the query the proxy built, and can be told to fail or to stall.
 */
export async function startOpenMeteoStub({ place = 'Grand Rapids', fail = null, hang = false } = {}) {
  const asked = [];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    asked.push(url);

    if (hang) return;

    if (fail) {
      res.writeHead(fail, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: true, reason: 'no' }));
    }

    const body = url.pathname.includes('search')
      ? {
        results: place
          ? [{
            name: place,
            admin1: 'Michigan',
            country: 'United States',
            latitude: 42.9634,
            longitude: -85.6681,
          }]
          : [],
      }
      : forecastBody({ days: Number(url.searchParams.get('forecast_days')) || 3 });

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  return {
    asked,
    forecastUrl: `${origin}/v1/forecast`,
    geocodingUrl: `${origin}/v1/search`,
    /** The queries this stub was sent, newest last. */
    queries: () => asked.map((url) => Object.fromEntries(url.searchParams)),
    async close() {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
