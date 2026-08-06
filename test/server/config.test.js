import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_VOICES, loadConfig } from '../../src/server/config.js';
import { buildTools } from '../../src/server/persona.js';

describe('loadConfig', () => {
  it('defaults to helix, and offers the whole published roster', () => {
    const config = loadConfig({});
    assert.equal(config.defaultVoice, 'helix');
    assert.deepEqual(config.voices, [...KNOWN_VOICES]);
  });

  it('puts an unpublished voice at the front of the picker rather than dropping it', () => {
    const config = loadConfig({ XAI_VOICE: 'custom-voice-abc123' });
    assert.equal(config.defaultVoice, 'custom-voice-abc123');
    assert.equal(config.voices[0], 'custom-voice-abc123');
    assert.equal(config.voices.length, KNOWN_VOICES.length + 1);
  });

  it('has both searches on unless they are turned off', () => {
    assert.equal(loadConfig({}).tools.webSearch, true);
    assert.equal(loadConfig({}).tools.xSearch, true);
    assert.equal(loadConfig({ XAI_WEB_SEARCH: 'false' }).tools.webSearch, false);
    assert.equal(loadConfig({ XAI_X_SEARCH: '0' }).tools.xSearch, false);
    assert.equal(loadConfig({ XAI_X_SEARCH: 'off' }).tools.xSearch, false);
    assert.equal(loadConfig({ XAI_WEB_SEARCH: '' }).tools.webSearch, true);
  });

  it('has the forecast on, in Fahrenheit, until it is told otherwise', () => {
    const config = loadConfig({});
    assert.equal(config.tools.weather, true);
    assert.equal(config.weather.units, 'imperial');
    assert.equal(config.weather.place, '');

    assert.equal(loadConfig({ WEATHER: 'false' }).tools.weather, false);
    assert.equal(loadConfig({ WEATHER_UNITS: 'metric' }).weather.units, 'metric');
    assert.equal(loadConfig({ WEATHER_UNITS: 'METRIC' }).weather.units, 'metric');
    assert.equal(loadConfig({ WEATHER_UNITS: 'kelvin' }).weather.units, 'imperial');
  });

  it('takes a home for the forecast, and a timeout in seconds', () => {
    assert.equal(loadConfig({ WEATHER_PLACE: ' Grand Rapids, Michigan ' }).weather.place,
      'Grand Rapids, Michigan');
    assert.equal(loadConfig({ WEATHER_TIMEOUT: '3' }).weather.timeoutMs, 3000);
    assert.equal(loadConfig({ WEATHER_TIMEOUT: 'soon' }).weather.timeoutMs, undefined);
    assert.equal(loadConfig({ WEATHER_TIMEOUT: '-2' }).weather.timeoutMs, undefined);
  });

  it('reads MCP servers from the environment', () => {
    const { tools } = loadConfig({
      XAI_MCP_SERVERS: '[{"server_label":"a","server_url":"https://a.example/mcp"}]',
    });
    assert.equal(tools.mcpServers.length, 1);
    assert.equal(tools.mcpServers[0].server_label, 'a');
  });

  it('accepts a single MCP server object as well as a list', () => {
    const { tools } = loadConfig({
      XAI_MCP_SERVERS: '{"server_label":"solo","server_url":"https://s.example/mcp"}',
    });
    assert.equal(tools.mcpServers.length, 1);
  });

  it('drops malformed MCP entries instead of refusing to boot', () => {
    const { tools } = loadConfig({
      XAI_MCP_SERVERS: '[{"server_url":"https://a.example/mcp"},{"server_label":"b","server_url":"https://b.example/mcp"}]',
    });
    assert.deepEqual(tools.mcpServers.map((s) => s.server_label), ['b']);

    assert.deepEqual(loadConfig({ XAI_MCP_SERVERS: 'not json' }).tools.mcpServers, []);
  });
});

describe('buildTools', () => {
  it('assembles what the session declares, in a stable order', () => {
    const tools = buildTools({
      webSearch: true,
      xSearch: true,
      mcpServers: [{ server_label: 'a', server_url: 'https://a.example/mcp', authorization: 'Bearer x' }],
    });

    assert.deepEqual(tools.map((t) => t.type), ['web_search', 'x_search', 'mcp']);
    assert.equal(tools[2].authorization, 'Bearer x');
  });

  it('is empty when everything is off', () => {
    assert.deepEqual(buildTools({ webSearch: false, xSearch: false, mcpServers: [] }), []);
    assert.deepEqual(buildTools({}), []);
  });
});
