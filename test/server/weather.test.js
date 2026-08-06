import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import {
  DEFAULT_DAYS,
  MAX_DAYS,
  conditionText,
  createWeather,
  daysAhead,
  summarize,
} from '../../src/server/weather.js';
import { forecastBody, startOpenMeteoStub } from '../helpers/open-meteo-stub.js';

async function weather(options = {}, stubOptions) {
  const stub = await startOpenMeteoStub(stubOptions);
  return {
    stub,
    weather: createWeather({
      forecastUrl: stub.forecastUrl,
      geocodingUrl: stub.geocodingUrl,
      ...options,
    }),
  };
}

describe('conditionText', () => {
  it('says what a WMO code means, and has something to say about one it does not know', () => {
    assert.equal(conditionText(0), 'clear');
    assert.equal(conditionText(95), 'thunderstorms');
    assert.match(conditionText(1234), /nobody has a word for/);
    assert.match(conditionText(undefined), /nobody has a word for/);
  });
});

describe('daysAhead', () => {
  it('stays inside what the API will give, whatever the model asked for', () => {
    assert.equal(daysAhead(1), 1);
    assert.equal(daysAhead(5), 5);
    assert.equal(daysAhead(40), MAX_DAYS);
    assert.equal(daysAhead(0), 1);
    assert.equal(daysAhead(-3), 1);
    assert.equal(daysAhead(2.6), 3);
  });

  it('falls back when there is no number in it at all', () => {
    assert.equal(daysAhead(undefined), DEFAULT_DAYS);
    assert.equal(daysAhead('tomorrow'), DEFAULT_DAYS);
    assert.equal(daysAhead(null), DEFAULT_DAYS);
  });
});

describe('summarize', () => {
  const summary = summarize(forecastBody(), { name: 'Grand Rapids, Michigan', units: 'imperial' });

  it('rounds every number to something worth reading aloud', () => {
    assert.equal(summary.now.temperature, 64);
    assert.equal(summary.now.precipitation, 0.04);
    assert.equal(summary.days[0].precipitation, 0.34);
  });

  it('turns the codes into words and the stamps into clock times', () => {
    assert.equal(summary.now.condition, 'rain');
    assert.equal(summary.now.time, '2 PM');
    assert.equal(summary.days[1].condition, 'thunderstorms');
    assert.equal(summary.days[0].sunrise, '6:34 AM');
    assert.equal(summary.days[0].sunset, '8:52 PM');
  });

  it('names the weekday, from the date the API already put in local time', () => {
    assert.equal(summary.days[0].day, 'Thursday');
    assert.equal(summary.days[1].day, 'Friday');
  });

  it('takes the hours ahead from where the place says now is, not this machine', () => {
    assert.deepEqual(summary.next_hours.map((h) => h.time),
      ['2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM']);
    assert.equal(summary.next_hours[1].chance_of_precipitation, 80);
  });

  it('says which units the numbers are in, so nothing has to be inferred', () => {
    assert.deepEqual(summary.units, { temperature: 'F', wind: 'mph', precipitation: 'inches' });
    const metric = summarize(forecastBody(), { name: 'Reykjavik', units: 'metric' });
    assert.deepEqual(metric.units, { temperature: 'C', wind: 'km/h', precipitation: 'mm' });
  });
});

describe('the forecast tool', () => {
  it('looks a place up, then asks for its weather in Fahrenheit', async () => {
    const { stub, weather: sky } = await weather();
    after(() => stub.close());

    const out = await sky.run('forecast', { place: 'Grand Rapids' });

    assert.equal(out.ok, true);
    assert.equal(out.place, 'Grand Rapids, Michigan, United States');
    assert.equal(out.now.temperature, 64);

    const [lookup, forecast] = stub.queries();
    assert.equal(lookup.name, 'Grand Rapids');
    assert.equal(forecast.latitude, '42.9634');
    assert.equal(forecast.temperature_unit, 'fahrenheit');
    assert.equal(forecast.wind_speed_unit, 'mph');
    assert.equal(forecast.precipitation_unit, 'inch');
    assert.equal(forecast.timezone, 'auto');
    assert.equal(forecast.forecast_days, String(DEFAULT_DAYS));
  });

  it('switches systems when the person is plainly using the other one', async () => {
    const { stub, weather: sky } = await weather();
    after(() => stub.close());

    const out = await sky.run('forecast', { place: 'Reykjavik', units: 'metric' });

    assert.deepEqual(out.units, { temperature: 'C', wind: 'km/h', precipitation: 'mm' });
    assert.equal(stub.queries().at(-1).temperature_unit, 'celsius');
  });

  it('takes the units the server was started with when the model says nothing', async () => {
    const { stub, weather: sky } = await weather({ units: 'metric' });
    after(() => stub.close());

    await sky.run('forecast', { place: 'Reykjavik' });
    assert.equal(stub.queries().at(-1).temperature_unit, 'celsius');
  });

  it('looks where it stands when no place is named', async () => {
    const { stub, weather: sky } = await weather({ place: 'Grand Rapids, Michigan' });
    after(() => stub.close());

    const out = await sky.run('forecast', {});

    assert.equal(out.ok, true);
    assert.equal(stub.queries()[0].name, 'Grand Rapids, Michigan');
  });

  it('says to ask when it stands nowhere and nobody named a place', async () => {
    const { stub, weather: sky } = await weather();
    after(() => stub.close());

    const out = await sky.run('forecast', {});

    assert.equal(out.ok, false);
    assert.match(out.error, /ask them where they are/);
    assert.deepEqual(stub.queries(), [], 'nothing was asked of the API');
  });

  it('takes coordinates without a lookup, and refuses ones off the earth', async () => {
    const { stub, weather: sky } = await weather();
    after(() => stub.close());

    const out = await sky.run('forecast', { latitude: 42.9634, longitude: -85.6681 });
    assert.equal(out.ok, true);
    assert.equal(out.place, '42.96, -85.67');
    assert.equal(stub.queries().length, 1, 'the geocoder was never asked');

    const bad = await sky.run('forecast', { latitude: 999, longitude: -85.6681 });
    assert.equal(bad.ok, false, 'and with no place to fall back on, it asks');
  });

  it('remembers a place it has already found', async () => {
    const { stub, weather: sky } = await weather();
    after(() => stub.close());

    await sky.run('forecast', { place: 'Grand Rapids' });
    await sky.run('forecast', { place: 'grand rapids ' });

    const lookups = stub.queries().filter((query) => 'name' in query);
    assert.equal(lookups.length, 1, 'the second one came out of the cache');
  });

  it('says so, in a sentence, when there is no such place', async () => {
    const { stub, weather: sky } = await weather({}, { place: null });
    after(() => stub.close());

    const out = await sky.run('forecast', { place: 'Nrth Pole' });

    assert.equal(out.ok, false);
    assert.match(out.error, /nowhere called "Nrth Pole"/);
  });

  it('comes back with words rather than throwing when the API is down', async () => {
    const { stub, weather: sky } = await weather({}, { fail: 500 });
    after(() => stub.close());

    const out = await sky.run('forecast', { place: 'Grand Rapids' });

    assert.equal(out.ok, false);
    assert.match(out.error, /the weather service failed/);
  });

  it('gives up rather than leaving the model waiting on a stalled request', async () => {
    const { stub, weather: sky } = await weather({ timeoutMs: 120 }, { hang: true });
    after(() => stub.close());

    const out = await sky.run('forecast', { place: 'Grand Rapids' });

    assert.equal(out.ok, false);
    assert.match(out.error, /did not answer in time/);
  });

  it('answers nothing but the forecast', async () => {
    const { stub, weather: sky } = await weather();
    after(() => stub.close());

    assert.equal(sky.handles('forecast'), true);
    assert.equal(sky.handles('remember'), false);
    assert.deepEqual(await sky.run('remember', {}), { ok: false, error: 'no tool called remember' });
  });
});
