/**
 * What the umbrella is doing per conversational state.
 *
 * These are the prototype's six modes, verbatim — the same numbers that were
 * behind its idle/listening/thinking/gust/talking/furled buttons, with
 * `talking` renamed to `speaking` to match the vocabulary the session speaks.
 * Nothing about the motion changed on the way into this app; what changed is
 * who presses the buttons. The call does.
 *
 *   `open`       0 furled tight, 1 wide open
 *   `invert`     blown inside out — see index.js, the flip is impulse-driven
 *                and this is only where it settles back to
 *   `twirl`      how fast it spins about its own shaft
 *   `jitter`     tremor amplitude — how badly it is holding still
 *   `lean`       fore/aft tilt; negative leans in, positive leans back
 *   `sway`       how far it rocks side to side
 *   `swaySpeed`  how fast
 *   `flutter`    ripple travelling across the fabric
 */
export const MOODS = {
  // Held open in weather nobody else thinks is weather.
  idle: { open: 1, invert: 0, twirl: 0, jitter: 0.05, lean: 0.0, sway: 0.055, swaySpeed: 0.9, flutter: 0.12 },
  // Leaning in, fabric still, waiting for you to get to the point.
  listening: { open: 1, invert: 0, twirl: 0, jitter: 0.02, lean: -0.2, sway: 0.10, swaySpeed: 1.5, flutter: 0.06 },
  // Twirling on the spot, the way somebody spins an umbrella while thinking.
  thinking: { open: 1, invert: 0, twirl: 4.2, jitter: 0.06, lean: 0.06, sway: 0.02, swaySpeed: 1.0, flutter: 0.5 },
  // Talking. The flutter comes off the audio on top of this — see index.js.
  speaking: { open: 1, invert: 0, twirl: 0, jitter: 0.14, lean: 0.05, sway: 0.045, swaySpeed: 1.4, flutter: 0.3 },

  /* --- the two nobody selects ---------------------------------------------- */

  // Reached by being talked over: caught by a gust, blown inside out, and not
  // pleased about it. Blends over whatever it was doing and decays.
  gust: { open: 1, invert: 1, twirl: 1.4, jitter: 0.75, lean: 0.22, sway: 0.09, swaySpeed: 2.6, flutter: 1.5 },
  // Reached by the API failing. Not a blend and not a decay — it holds until
  // something works again. There is nothing to shelter from if the forecast
  // can't be reached, so it packs itself away.
  furled: { open: 0, invert: 0, twirl: 0, jitter: 0.03, lean: 0.02, sway: 0.03, swaySpeed: 0.7, flutter: 0.02 },
};

/**
 * How far a full-energy voice pushes each channel past its state baseline.
 *
 * Additive, and zero when nothing is making sound — with the mic off, every
 * mood is exactly the mood above.
 */
export const ENERGY_GAIN = { jitter: 0.5, sway: 0.035, swaySpeed: 0.7, flutter: 0.55 };
