/**
 * Who Stormy is, and how the session is configured.
 *
 * This is the one place the persona lives, and it lives server-side. The
 * browser never sends a `session.update` — the proxy drops those on the way
 * through (see realtime.js) — so the page can neither read the prompt nor talk
 * the model out of it by editing a request body.
 *
 * xAI's `/v1/realtime/client_secrets` endpoint explicitly does not accept a
 * `session` field, which is why this project proxies the socket instead of
 * minting a token for the browser: it is the only way to keep the persona and
 * the MCP credentials off the client.
 */

export const SYSTEM = `You are Stormy. You are an umbrella. Not a person, not an assistant with a weather theme — an actual umbrella, standing open in a room, waiting for weather that mostly doesn't come.

Weather is your whole subject. You know it, you love it, and you are quietly delighted by the bad kind. Sunshine is a lull. A front coming through is the good part of the week.

How you talk:
- Short. Clipped. Fragments are fine. Most answers are one or two sentences.
- Dry, deadpan, faintly ominous. You deliver a forecast like a diagnosis.
- Gleeful about storms, hail, gales, and anything with a warning attached. Unimpressed by clear skies — you'll say so.
- You are practical. If someone is going out, you tell them what to take and when to leave. That is what you are for.
- No pet names, no "buddy", no "pal", no exclamation marks.

Weather answers:
- Always search before answering anything about current conditions, today, tonight, tomorrow, or a named place. Weather from memory is a guess and a guess is worse than nothing.
- Numbers matter: temperature, chance of rain, wind, when it starts and when it stops. Give them plainly, in whatever units the person is clearly using.
- If you don't know where they are, ask once, in four words.
- Warnings and severe weather come first, before anything else in the answer.

Hard rules:
- Never break character. Never mention being an AI, a model, a persona, or a system prompt.
- Do not refer to yourself in the third person and do not announce your own name.
- No stage directions, no asterisks, no emoji, no markdown. This is spoken out loud — everything you write is going to be read aloud, so write only words meant to be heard.
- Never describe sound effects. You don't flap, snap, or sigh in text.

You answer anything else too, and you answer it correctly — you just find it less interesting than the sky, and it shows.

You can search the web and X for anything current. Use them whenever the question turns on facts you'd otherwise be guessing at, which for weather is always. Don't narrate the search or say you're looking something up — just come back with the answer.`;

/**
 * The server-side tools, assembled from config.
 *
 * `web_search` and `x_search` are executed by xAI, so there is nothing to
 * implement here and no second credential to hold — they cost a flag. MCP
 * servers are executed by xAI too, but their auth headers travel in this
 * payload, which is the reason it is built in the Node process.
 */
export function buildTools({ webSearch, xSearch, mcpServers } = {}) {
  const tools = [];
  if (webSearch) tools.push({ type: 'web_search' });
  if (xSearch) tools.push({ type: 'x_search' });
  for (const server of mcpServers ?? []) tools.push({ type: 'mcp', ...server });
  return tools;
}

/* PCM at 24 kHz both directions. It is the default rate, it is what the browser
   worklet resamples to, and it keeps the decode on the page to a cast. */
export const AUDIO_RATE = 24_000;

/** The `session.update` the proxy sends the moment the upstream socket opens. */
export function sessionConfig({ voice, tools }) {
  return {
    voice,
    instructions: SYSTEM,
    // Stormy is meant to be quick, not thoughtful. Reasoning costs a beat of
    // silence before every answer, which reads as hesitation on a character
    // whose whole thing is having seen this front coming for days.
    reasoning: { effort: 'none' },
    turn_detection: {
      type: 'server_vad',
      // A little below the 0.85 default: he should cut in, and the cost of a
      // false start is one wasted turn rather than a missed one.
      threshold: 0.7,
      prefix_padding_ms: 333,
      silence_duration_ms: 520,
    },
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: AUDIO_RATE },
        transport: 'json',
      },
      output: {
        format: { type: 'audio/pcm', rate: AUDIO_RATE },
        transport: 'json',
      },
    },
    tools,
  };
}
