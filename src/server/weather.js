/**
 * Open-Meteo, answered here rather than by the model.
 *
 * A forecast is the one thing this whole umbrella is for, and it is exactly the
 * thing a language model is worst at: it cannot know today's numbers, and a
 * search gives it somebody's prose about them. So the proxy calls a weather API
 * itself, hands back numbers, and lets Stormy do the talking.
 *
 * Open-Meteo needs no key and no account, which is why it is this one — there
 * is no credential here to leak to the page, and the free tier asks only that
 * it not be hammered. Watches and warnings are not in it; those stay a search.
 */

/** WMO 4677, as words a person would use. */
export const CONDITIONS = Object.freeze({
  0: 'clear',
  1: 'mostly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'freezing fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  56: 'freezing drizzle',
  57: 'heavy freezing drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'heavy freezing rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'light showers',
  81: 'showers',
  82: 'violent showers',
  85: 'light snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorms',
  96: 'thunderstorms with hail',
  99: 'thunderstorms with heavy hail',
});

export function conditionText(code) {
  return CONDITIONS[code] ?? 'weather nobody has a word for';
}

/**
 * What the two systems are called at each end. Fahrenheit is the default
 * because that is what the person this was built for speaks.
 */
export const UNITS = Object.freeze({
  imperial: Object.freeze({
    query: { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch' },
    spoken: { temperature: 'F', wind: 'mph', precipitation: 'inches' },
  }),
  metric: Object.freeze({
    query: { temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm' },
    spoken: { temperature: 'C', wind: 'km/h', precipitation: 'mm' },
  }),
});

export const DEFAULT_UNITS = 'imperial';

/** How far ahead it will look, and how far it does by default. */
export const MAX_DAYS = 7;
export const DEFAULT_DAYS = 3;

/** How many hours of the near future ride along — enough to answer "now what". */
const HOURS_AHEAD = 6;

/** Long enough for a slow API, short enough that the person is still waiting. */
const DEFAULT_TIMEOUT = 8000;

/** Places looked up are cached for the life of the process, up to this many. */
const PLACES = 50;

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const CURRENT_FIELDS = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
  'precipitation', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'is_day',
];
const HOURLY_FIELDS = ['temperature_2m', 'precipitation_probability', 'weather_code'];
const DAILY_FIELDS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min',
  'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max',
  'sunrise', 'sunset',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** One number, rounded to something worth saying out loud. */
function round(value, places = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** "2026-08-06T15:00" → "3 PM", without dragging in a date library. */
function clockTime(stamp) {
  const at = /T(\d{2}):(\d{2})/.exec(stamp ?? '');
  if (!at) return stamp ?? null;
  const hour = Number(at[1]);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return at[2] === '00' ? `${shown} ${suffix}` : `${shown}:${at[2]} ${suffix}`;
}

/** The weekday for a date the API already resolved to the place's own zone. */
function dayName(date) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!parts) return null;
  const at = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  return DAY_NAMES[at.getUTCDay()] ?? null;
}

function unitSystem(name) {
  return UNITS[String(name ?? '').toLowerCase()] ? String(name).toLowerCase() : null;
}

function place(hit) {
  return [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ');
}

/**
 * How many days to ask for, whatever the model put in the argument. The empty
 * cases are checked before the cast, because `Number(null)` is 0 and a missing
 * argument must not read as one.
 */
export function daysAhead(value, fallback = DEFAULT_DAYS) {
  if (value == null || value === '') return fallback;
  const days = Math.round(Number(value));
  if (!Number.isFinite(days)) return fallback;
  return Math.min(MAX_DAYS, Math.max(1, days));
}

/** A coordinate the model supplied, or null if it is not one. Same wart: a
 *  missing latitude cast to 0 would put the forecast in the Atlantic. */
function coordinate(value, limit) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > limit) return null;
  return number;
}

/**
 * The forecast, cut down to what someone would actually say out loud. Every
 * number is rounded here rather than in the persona: a model asked to round
 * 63.8199997 will sometimes read it out in full.
 */
export function summarize(data, { name, units }) {
  const spoken = UNITS[units].spoken;
  const current = data.current ?? {};
  const daily = data.daily ?? {};
  const hourly = data.hourly ?? {};

  const days = (daily.time ?? []).map((date, i) => ({
    date,
    day: dayName(date),
    condition: conditionText(daily.weather_code?.[i]),
    high: round(daily.temperature_2m_max?.[i]),
    low: round(daily.temperature_2m_min?.[i]),
    chance_of_precipitation: round(daily.precipitation_probability_max?.[i]),
    precipitation: round(daily.precipitation_sum?.[i], 2),
    wind_max: round(daily.wind_speed_10m_max?.[i]),
    sunrise: clockTime(daily.sunrise?.[i]),
    sunset: clockTime(daily.sunset?.[i]),
  }));

  /**
   * The hours still to come, from where the API says "now" is. Its `current`
   * block carries that time in the place's own zone, so the hours are picked
   * against it rather than against this server's clock.
   */
  const from = (hourly.time ?? []).findIndex((stamp) => stamp >= (current.time ?? ''));
  const start = from === -1 ? 0 : from;
  const next_hours = (hourly.time ?? [])
    .slice(start, start + HOURS_AHEAD)
    .map((stamp, i) => ({
      time: clockTime(stamp),
      condition: conditionText(hourly.weather_code?.[start + i]),
      temperature: round(hourly.temperature_2m?.[start + i]),
      chance_of_precipitation: round(hourly.precipitation_probability?.[start + i]),
    }));

  return {
    ok: true,
    place: name,
    timezone: data.timezone ?? null,
    units: spoken,
    now: {
      time: clockTime(current.time),
      condition: conditionText(current.weather_code),
      temperature: round(current.temperature_2m),
      feels_like: round(current.apparent_temperature),
      humidity: round(current.relative_humidity_2m),
      precipitation: round(current.precipitation, 2),
      wind: round(current.wind_speed_10m),
      gusts: round(current.wind_gusts_10m),
      daylight: current.is_day === 1 || current.is_day === true,
    },
    next_hours,
    days,
  };
}

/**
 * The forecast tool, answered in the proxy. `run` never throws and never
 * rejects: a tool call the model is waiting on has to come back with something,
 * and a sentence about what went wrong is worth more to it than a stack trace
 * it will never see.
 */
export function createWeather({
  units = DEFAULT_UNITS,
  place: home = '',
  forecastUrl = FORECAST_URL,
  geocodingUrl = GEOCODING_URL,
  timeoutMs = DEFAULT_TIMEOUT,
  fetch: doFetch = (...args) => globalThis.fetch(...args),
} = {}) {
  const defaultUnits = unitSystem(units) ?? DEFAULT_UNITS;
  const known = new Map();

  async function getJSON(url) {
    const res = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`open-meteo returned ${res.status}`);
    return res.json();
  }

  /** A place name → a point on the earth, remembered so a repeat costs nothing. */
  async function locate(name) {
    const key = name.trim().toLowerCase();
    if (known.has(key)) return known.get(key);

    const url = new URL(geocodingUrl);
    url.searchParams.set('name', name.trim());
    url.searchParams.set('count', '1');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const body = await getJSON(url);
    const hit = body?.results?.[0];
    if (!hit) return null;

    const found = { name: place(hit), latitude: hit.latitude, longitude: hit.longitude };
    if (known.size >= PLACES) known.delete(known.keys().next().value);
    known.set(key, found);
    return found;
  }

  async function forecast(args = {}) {
    const asked = typeof args.place === 'string' && args.place.trim() ? args.place.trim() : home;
    const latitude = coordinate(args.latitude, 90);
    const longitude = coordinate(args.longitude, 180);
    const system = unitSystem(args.units) ?? defaultUnits;
    const days = daysAhead(args.days);

    let where = latitude !== null && longitude !== null
      ? { name: `${round(latitude, 2)}, ${round(longitude, 2)}`, latitude, longitude }
      : null;

    if (!where) {
      if (!asked) {
        return { ok: false, error: 'no place to look at — ask them where they are' };
      }
      where = await locate(asked);
      if (!where) return { ok: false, error: `nowhere called "${asked}" on the map` };
    }

    const url = new URL(forecastUrl);
    url.searchParams.set('latitude', String(where.latitude));
    url.searchParams.set('longitude', String(where.longitude));
    url.searchParams.set('current', CURRENT_FIELDS.join(','));
    url.searchParams.set('hourly', HOURLY_FIELDS.join(','));
    url.searchParams.set('daily', DAILY_FIELDS.join(','));
    url.searchParams.set('forecast_days', String(days));
    url.searchParams.set('timezone', 'auto');
    for (const [key, value] of Object.entries(UNITS[system].query)) {
      url.searchParams.set(key, value);
    }

    return summarize(await getJSON(url), { name: where.name, units: system });
  }

  return {
    /** Where it looks when nobody says — empty unless the environment set one. */
    get home() {
      return home;
    },

    handles(name) {
      return name === 'forecast';
    },

    async run(name, args) {
      if (name !== 'forecast') return { ok: false, error: `no tool called ${name}` };
      try {
        return await forecast(args ?? {});
      } catch (err) {
        const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        return {
          ok: false,
          error: timedOut
            ? 'the weather service did not answer in time'
            : `the weather service failed — ${err?.message ?? String(err)}`,
        };
      }
    },
  };
}
