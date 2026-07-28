/**
 * Stormy, as a controller.
 *
 * Everything visual lives under this directory; nothing in it knows where its
 * input comes from. The controller surface is deliberately audio-shaped so a
 * voice pipeline drops in without touching the geometry:
 *
 *   stormy.setState('speaking')  idle | listening | thinking | speaking
 *   stormy.setLevel(0.62)        sustained amplitude 0..1, sampled per frame
 *   stormy.pulse(0.4)            transient impulse 0..1, one per discrete event
 *   stormy.gust(0.9)             it has been talked over, and it goes inside out
 *   stormy.furl(true)            the API is broken; it packs itself away
 *
 * Nothing here is a sine wave dressed up as motion. Every visible movement is a
 * damped spring reacting to an impulse, and the canopy has a spring of its own:
 * `open` is not set, it is sprung, which is why it pops past wide when it opens
 * and shudders when a gust catches it.
 *
 * The motion, the moods and every constant in them came straight off the
 * prototype and are unchanged. All this file adds is who chooses the mood: the
 * call does. Two things it does are not conversational states — being cut off
 * blends `gust` over whatever it was doing and decays, and an API failure holds
 * `furled` until something works again. Furling means exactly that one thing,
 * which is what makes it readable from across the room.
 */

import { buildEnvironment } from './environment.js';
import { createUmbrella } from './geometry.js';
import { ENERGY_GAIN, MOODS } from './moods.js';

/** One step of a damped spring toward `to`. */
function spring(s, k, c, dt, to = 0) {
  s.v += (to - s.p) * k * dt - s.v * c * dt;
  s.p += s.v * dt;
}

/* Framing. Hand-written rather than measured off the mesh, because the mesh
   moves: the hem blows up over the crown in a gust, which is the tallest this
   character ever gets, and a box measured while it is standing there open
   would crop exactly the moment worth watching. */
const FRAME = { y: -0.11, halfW: 1.45, halfH: 2.10 };

/* How much of the frame the umbrella is allowed to fill. It is an object in
   weather, not a portrait. */
const MARGIN = 1.34;

export function createStormy({ stage, THREE }) {
  buildEnvironment({ stage, THREE });

  const { group, spinner, body, shape } = createUmbrella(THREE);

  let state = 'idle';
  let broken = false;
  const target = { ...MOODS.idle };
  const m = { ...MOODS.idle };

  /* `energy` is what the fabric reads. `sustain` is where it settles (the live
     audio level); `impulse` decays on top of it (discrete events). */
  let sustain = 0;
  let impulse = 0;
  let energy = 0;
  let lastEnergy = 0;

  /* 0..1, decaying. Blends the whole mood toward `gust`, so being cut off is
     weather it comes out of rather than a mode it is switched into. */
  let rage = 0;

  const clock = new THREE.Clock();
  let t = 0;

  /* Springs: squash along the shaft, side sway, fore/aft lean. */
  const sq = { p: 0, v: 0 };
  const tz = { p: 0, v: 0 };
  const tx = { p: 0, v: 0 };

  let twirlA = 0, twirlV = 0;
  let openP = 1, openV = 0, invertP = 0;
  let evtT = 2.6, gustT = 0;

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;

    /* --- energy ----------------------------------------------------------- */
    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    lastEnergy = energy;
    energy += (Math.min(1, sustain + impulse) - energy) * Math.min(1, dt * 6);
    rage = Math.max(0, rage - dt * 0.55);

    /* --- mood --------------------------------------------------------------
       A broken API takes the mood over outright; a gust only colours it. Both
       are eased into, so nothing ever snaps between moods. */
    const mood = broken ? MOODS.furled : (MOODS[state] ?? MOODS.idle);
    const blend = broken ? 0 : rage;
    for (const k in target) {
      const to = mood[k] + (MOODS.gust[k] - mood[k]) * blend;
      target[k] = to;
      m[k] += (to - m[k]) * Math.min(1, dt * 3.2);
    }

    const gain = ENERGY_GAIN;
    const gusting = rage > 0.35;

    /* --- twirl: spins up and coasts down ----------------------------------- */
    twirlV += (m.twirl - twirlV) * Math.min(1, dt * 2.2);
    twirlA += twirlV * dt;

    /* --- gusts: snap inside out, then flop back with a shudder -------------- */
    if (gusting) {
      gustT -= dt;
      if (gustT <= 0) {
        invertP = 1;
        sq.v -= 4;
        tz.v += (Math.random() - 0.5) * 12;
        gustT = 1.6 + Math.random() * 1.4;
      }
    }
    invertP = Math.max(0, invertP - dt * (gusting ? 0.7 : 3.2));

    /* --- open/close, sprung so the canopy pops and overshoots --------------- */
    openV += (m.open - openP) * 110 * dt - openV * 9 * dt;
    openP += openV * dt;

    /* --- idle: a shrug, a half-furl, a shake of the water off --------------- */
    if (!gusting && !broken) {
      evtT -= dt;
      if (evtT <= 0) {
        const r = Math.random();
        if (r < 0.4) sq.v += 1.6;
        else if (r < 0.7) openV -= 3.5;                                    // half-collapse and pop
        else { tz.v += (Math.random() - 0.5) * 5; tx.v += 1.2; }           // shakes itself off
        evtT = 3 + Math.random() * 4.5;
      }
    }

    /* --- speaking: one shove per syllable, taken from the audio -------------
       The prototype guessed at syllables on a timer. This reads them off the
       waveform instead: a rising edge in the envelope is an onset, and its
       steepness is how hard the canopy gets shoved. Consonants land harder than
       vowels, which is what makes it look like it is forming words. */
    if (state === 'speaking' && !broken) {
      const onset = Math.max(0, energy - lastEnergy);
      if (onset > 0.008) {
        sq.v += onset * 22;
        openV += onset * 16;
        tz.v += (Math.random() - 0.5) * onset * 24;
      }
    }

    /* --- integrate ---------------------------------------------------------- */
    spring(sq, 150, 10, dt);
    const sway = m.sway + energy * gain.sway;
    const swaySpeed = m.swaySpeed + energy * gain.swaySpeed;
    const swayAmt = Math.sin(t * swaySpeed * 1.8) * sway;
    spring(tz, 62, 6, dt, swayAmt);
    spring(tx, 62, 6, dt, m.lean * 0.22 + Math.sin(t * swaySpeed * 1.1) * sway * 0.5);

    const tremor = (m.jitter + energy * gain.jitter) * 0.015;
    const bob = Math.sin(t * 1.2) * 0.022;

    shape(
      Math.max(0, Math.min(1.15, openP)),
      Math.min(1, invertP),
      (m.flutter + energy * gain.flutter) * (0.6 + Math.abs(twirlV) * 0.12),
      t);

    group.position.set(
      (Math.random() - 0.5) * tremor,
      bob + Math.abs(swayAmt) * 0.25 + sq.p * 0.03,
      (Math.random() - 0.5) * tremor);
    group.rotation.set(
      tx.p + (Math.random() - 0.5) * tremor,
      0,
      tz.p + (Math.random() - 0.5) * tremor * 1.3);

    spinner.rotation.y = twirlA;
    const s = sq.p * 0.06;
    body.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
  };

  stage.setObject(group);

  /* --- framing --------------------------------------------------------------
     setObject() frames an object once, against the camera's *vertical* field of
     view. A phone held upright is much narrower than it is tall, so that
     framing crops a wide canopy at the sides. Fit whichever axis is tighter
     instead, and re-run it whenever the viewport changes, so a rotation or the
     keyboard opening reframes rather than clips. Orbiting is preserved: the
     user's own view direction is kept the moment they drag. */
  let dir = new THREE.Vector3(0.9, 0.42, 1.25).normalize();
  stage._controls.addEventListener('start', () => { dir = null; });

  // Centred on the middle of everything it can do, not on where it happens to
  // be standing — see FRAME.
  stage._controls.target.set(0, FRAME.y, 0);

  const reframe = () => {
    const camera = stage._camera;
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    const aspect = w / h;

    const dist = (Math.max(FRAME.halfH, FRAME.halfW / aspect)
      / Math.tan((camera.fov * Math.PI) / 360)) * MARGIN;

    const focus = stage._controls.target;
    const view = dir ? dir.clone() : camera.position.clone().sub(focus).normalize();
    if (view.lengthSq() === 0) view.set(0.9, 0.42, 1.25).normalize();
    camera.position.copy(focus).addScaledVector(view, dist);
    camera.near = Math.max(dist / 100, 0.01);
    camera.far = dist * 100;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    stage._controls.update();
  };

  reframe();
  new ResizeObserver(reframe).observe(stage);

  /* setObject() turns shadows on for everything it traverses. There is no
     ground here — the umbrella hangs in the void — so nothing has anything to
     cast onto, and the shadow pass is wasted work. */
  stage._ground.visible = false;
  stage._key.castShadow = false;
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });

  /* Its own rAF loop rather than an onBeforeRender hook: the hook belongs to a
     mesh, and a mesh that is hidden — or skipped by a render pass — stops
     ticking, which would freeze the character rather than pause it. */
  (function loop() {
    requestAnimationFrame(loop);
    frame();
  })();

  return {
    get state() {
      return state;
    },

    /** idle | listening | thinking | speaking. Unknown names are ignored —
     *  hasOwn, not a truth test: `MOODS.constructor` is truthy and NaNs every
     *  channel it touches. */
    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      if (next === 'idle' || next === 'thinking') sustain = 0;
    },

    /** Sustained amplitude, 0..1. Call per frame. */
    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    /** Transient impulse, 0..1. Call once per discrete event. */
    pulse(weight = 0.3) {
      impulse = Math.min(1, impulse + Math.min(1, Math.max(0, weight)));
    },

    /** Talk over it and the wind takes it. Decays back on its own. */
    gust(weight = 1) {
      rage = Math.min(1, rage + weight);
      // It goes over on the frame you cut in, not a beat later.
      invertP = 1;
      sq.v -= 4 * weight;
      tz.v += (Math.random() - 0.5) * 12 * weight;
    },

    /** The API is unreachable, or it is back. Held either way: this is the one
     *  thing on screen that says the call is broken rather than quiet. */
    furl(on = true) {
      broken = Boolean(on);
      if (broken) sustain = 0;
    },
  };
}
