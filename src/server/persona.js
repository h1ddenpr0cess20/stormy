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

/** How many memories ride along in the prompt, and how long each may be. */
export const MEMORY_LIMIT = 50;
export const MEMORY_LENGTH = 600;

/** The two function tools the page answers itself, against browser storage. */
export const MEMORY_TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'remember',
    description: 'Store one short detail about the person you are talking to so it survives to the next call. Use it when they ask you to remember something, or plainly want you to. A few words to a sentence. Do not narrate it and do not overuse it.',
    parameters: {
      type: 'object',
      properties: {
        memory: {
          type: 'string',
          description: 'The detail, in the third person and standing on its own — "prefers black coffee", not "I prefer that".',
        },
      },
      required: ['memory'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'forget',
    description: 'Drop stored memories matching a keyword. Use it when they ask you to forget something.',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'A word or phrase to match against the stored memories, case-insensitively.',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
]);

export function buildTools({ webSearch, xSearch, memory, mcpServers } = {}) {
  const tools = [];
  if (webSearch) tools.push({ type: 'web_search' });
  if (xSearch) tools.push({ type: 'x_search' });
  if (memory) tools.push(...MEMORY_TOOLS);
  for (const server of mcpServers ?? []) tools.push({ type: 'mcp', ...server });
  return tools;
}

/**
 * The memory addendum to the system prompt. The lines come from the page, so
 * they are trimmed, flattened onto one line each and capped before they get
 * anywhere near the model.
 */
export function memoryBlock(memories) {
  const lines = (Array.isArray(memories) ? memories : [])
    .filter((line) => typeof line === 'string')
    .map((line) => line.replace(/\s+/g, ' ').trim().slice(0, MEMORY_LENGTH))
    .filter(Boolean)
    .slice(-MEMORY_LIMIT);

  if (!lines.length) return '';

  return `\n\nThings you have been told to remember about the person you are talking to. Use one only when it is relevant, never read the list back, and never mention that you keep a list:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

/**
 * What the turns ahead of a resumed call are. The items themselves carry the
 * conversation; this is the line that tells the model they are not this one.
 */
export function resumedBlock(resumed) {
  if (!resumed) return '';

  return '\n\nThe conversation before this point happened earlier, with the same'
    + ' person, and they have just come back to carry it on. Take it as said and'
    + ' pick up from it: no greeting them as a stranger, no summarising it back at'
    + ' them, and no remarking on the gap unless they do.';
}

export const AUDIO_RATE = 24_000;

export function sessionConfig({ voice, tools, memories, resumed }) {
  return {
    voice,
    instructions: SYSTEM + memoryBlock(memories) + resumedBlock(resumed),
    reasoning: { effort: 'none' },
    turn_detection: {
      type: 'server_vad',
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
