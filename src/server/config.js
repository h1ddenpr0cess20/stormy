import { readFileSync } from 'node:fs';

import { DEFAULT_UNITS, UNITS } from './weather.js';

export const KNOWN_VOICES = Object.freeze([
  'helix', 'rex', 'sal', 'atlas', 'zagan', 'orion', 'perseus',
  'leo', 'zenith', 'rigel', 'castor', 'ursa', 'naksh', 'kepler',
  'ara', 'eve', 'carina', 'luna', 'iris', 'celeste', 'lumen',
  'lux', 'cosmo', 'sirius', 'altair', 'helios',
]);

export const KNOWN_MODELS = Object.freeze(['grok-voice-latest', 'grok-voice-think-fast-1.0']);

function flag(value, fallback) {
  if (value == null || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(value);
}

function loadMcpServers(env) {
  const raw = env.XAI_MCP_SERVERS || readMcpFile(env.XAI_MCP_FILE || 'mcp.json');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((s) => {
      const ok = s && typeof s.server_url === 'string' && typeof s.server_label === 'string';
      if (!ok) console.warn('mcp: dropping an entry without server_url + server_label');
      return ok;
    });
  } catch (err) {
    console.warn(`mcp: could not parse the server list — ${err.message}`);
    return [];
  }
}

function readMcpFile(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * The forecast tool's own settings. Open-Meteo takes no key, so there is
 * nothing secret here — only which units to ask it for, and where to look when
 * the person doesn't say. The two URLs are here so a test can point them at a
 * stub, the same way `XAI_REALTIME_URL` does for the socket.
 */
function loadWeather(env) {
  const units = String(env.WEATHER_UNITS ?? '').toLowerCase();
  const seconds = Number(env.WEATHER_TIMEOUT);

  return {
    units: UNITS[units] ? units : DEFAULT_UNITS,
    place: (env.WEATHER_PLACE ?? '').trim(),
    forecastUrl: env.OPEN_METEO_URL || undefined,
    geocodingUrl: env.OPEN_METEO_GEOCODING_URL || undefined,
    timeoutMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
  };
}

export function loadConfig(env = process.env) {
  const defaultVoice = env.XAI_VOICE || KNOWN_VOICES[0];
  const defaultModel = env.XAI_MODEL || KNOWN_MODELS[0];

  return {
    port: Number(env.PORT) || 5173,
    apiKey: env.XAI_API_KEY,
    realtimeUrl: env.XAI_REALTIME_URL || 'wss://api.x.ai/v1/realtime',
    defaultModel,
    defaultVoice,
    voices: KNOWN_VOICES.includes(defaultVoice)
      ? [...KNOWN_VOICES]
      : [defaultVoice, ...KNOWN_VOICES],
    models: KNOWN_MODELS.includes(defaultModel)
      ? [...KNOWN_MODELS]
      : [defaultModel, ...KNOWN_MODELS],
    tools: {
      webSearch: flag(env.XAI_WEB_SEARCH, true),
      xSearch: flag(env.XAI_X_SEARCH, true),
      memory: flag(env.MEMORY, true),
      weather: flag(env.WEATHER, true),
      mcpServers: loadMcpServers(env),
    },
    weather: loadWeather(env),
  };
}
