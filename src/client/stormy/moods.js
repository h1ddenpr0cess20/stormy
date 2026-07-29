export const MOODS = {
  idle: { open: 1, invert: 0, twirl: 0, jitter: 0.05, lean: 0.0, sway: 0.055, swaySpeed: 0.9, flutter: 0.12 },
  listening: { open: 1, invert: 0, twirl: 0, jitter: 0.02, lean: -0.2, sway: 0.10, swaySpeed: 1.5, flutter: 0.06 },
  thinking: { open: 1, invert: 0, twirl: 4.2, jitter: 0.06, lean: 0.06, sway: 0.02, swaySpeed: 1.0, flutter: 0.5 },
  speaking: { open: 1, invert: 0, twirl: 0, jitter: 0.14, lean: 0.05, sway: 0.045, swaySpeed: 1.4, flutter: 0.3 },

  gust: { open: 1, invert: 1, twirl: 1.4, jitter: 0.75, lean: 0.22, sway: 0.09, swaySpeed: 2.6, flutter: 1.5 },
  furled: { open: 0, invert: 0, twirl: 0, jitter: 0.03, lean: 0.02, sway: 0.03, swaySpeed: 0.7, flutter: 0.02 },
};

export const ENERGY_GAIN = { jitter: 0.5, sway: 0.035, swaySpeed: 0.7, flutter: 0.55 };
