import { buildEnvironment } from './environment.js';
import { createUmbrella } from './geometry.js';
import { ENERGY_GAIN, MOODS } from './moods.js';

function spring(s, k, c, dt, to = 0) {
  s.v += (to - s.p) * k * dt - s.v * c * dt;
  s.p += s.v * dt;
}

const FRAME = { y: -0.11, halfW: 1.45, halfH: 2.10 };

const MARGIN = 1.34;

export function createStormy({ stage, THREE }) {
  buildEnvironment({ stage, THREE });

  const { group, spinner, body, shape } = createUmbrella(THREE);

  let state = 'idle';
  let broken = false;
  const target = { ...MOODS.idle };
  const m = { ...MOODS.idle };

  let sustain = 0;
  let impulse = 0;
  let energy = 0;
  let lastEnergy = 0;

  let rage = 0;

  const clock = new THREE.Clock();
  let t = 0;

  const sq = { p: 0, v: 0 };
  const tz = { p: 0, v: 0 };
  const tx = { p: 0, v: 0 };

  let twirlA = 0, twirlV = 0;
  let openP = 1, openV = 0, invertP = 0;
  let evtT = 2.6, gustT = 0;

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;

    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    lastEnergy = energy;
    energy += (Math.min(1, sustain + impulse) - energy) * Math.min(1, dt * 6);
    rage = Math.max(0, rage - dt * 0.55);

    const mood = broken ? MOODS.furled : (MOODS[state] ?? MOODS.idle);
    const blend = broken ? 0 : rage;
    for (const k in target) {
      const to = mood[k] + (MOODS.gust[k] - mood[k]) * blend;
      target[k] = to;
      m[k] += (to - m[k]) * Math.min(1, dt * 3.2);
    }

    const gain = ENERGY_GAIN;
    const gusting = rage > 0.35;

    twirlV += (m.twirl - twirlV) * Math.min(1, dt * 2.2);
    twirlA += twirlV * dt;

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

    openV += (m.open - openP) * 110 * dt - openV * 9 * dt;
    openP += openV * dt;

    if (!gusting && !broken) {
      evtT -= dt;
      if (evtT <= 0) {
        const r = Math.random();
        if (r < 0.4) sq.v += 1.6;
        else if (r < 0.7) openV -= 3.5;
        else { tz.v += (Math.random() - 0.5) * 5; tx.v += 1.2; }
        evtT = 3 + Math.random() * 4.5;
      }
    }

    if (state === 'speaking' && !broken) {
      const onset = Math.max(0, energy - lastEnergy);
      if (onset > 0.008) {
        sq.v += onset * 22;
        openV += onset * 16;
        tz.v += (Math.random() - 0.5) * onset * 24;
      }
    }

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

  let dir = new THREE.Vector3(0.9, 0.42, 1.25).normalize();
  stage._controls.addEventListener('start', () => { dir = null; });

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

  stage._ground.visible = false;
  stage._key.castShadow = false;
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });

  (function loop() {
    requestAnimationFrame(loop);
    frame();
  })();

  return {
    get state() {
      return state;
    },

    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      if (next === 'idle' || next === 'thinking') sustain = 0;
    },

    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    pulse(weight = 0.3) {
      impulse = Math.min(1, impulse + Math.min(1, Math.max(0, weight)));
    },

    gust(weight = 1) {
      rage = Math.min(1, rage + weight);
      invertP = 1;
      sq.v -= 4 * weight;
      tz.v += (Math.random() - 0.5) * 12 * weight;
    },

    furl(on = true) {
      broken = Boolean(on);
      if (broken) sustain = 0;
    },
  };
}
