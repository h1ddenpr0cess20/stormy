export const PANELS = 8;
const PSEG = 14;
const RINGS = 16;
const AROUND = PANELS * PSEG;

export const R = 1.35;
export const TOP = 0.95;

export function createUmbrella(THREE) {
  const group = new THREE.Group();
  group.name = 'stormy_character';

  const spinner = new THREE.Group();
  spinner.name = 'spinner';
  const body = new THREE.Group();
  body.name = 'body';
  group.add(spinner);
  spinner.add(body);

  const canopyGeo = new THREE.BufferGeometry();
  {
    const verts = (AROUND + 1) * (RINGS + 1);
    canopyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));

    const colors = new Float32Array(verts * 3);
    const fab = new THREE.Color('#2c3a63');
    const seam = new THREE.Color('#121a28');
    const lift = new THREE.Color('#6f83b8');
    const tc = new THREE.Color();
    let k = 0;
    for (let i = 0; i <= AROUND; i++) {
      const pt = (i % PSEG) / PSEG;
      const seamNess = Math.pow(1 - Math.sin(pt * Math.PI), 3);
      for (let j = 0; j <= RINGS; j++) {
        const u = j / RINGS;
        tc.copy(fab).lerp(seam, seamNess * 0.9).lerp(lift, Math.sin(pt * Math.PI) * (1 - u * 0.55) * 0.5);
        colors[k++] = tc.r; colors[k++] = tc.g; colors[k++] = tc.b;
      }
    }
    canopyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const idx = [];
    const at = (i, j) => i * (RINGS + 1) + j;
    for (let i = 0; i < AROUND; i++) {
      for (let j = 0; j < RINGS; j++) {
        idx.push(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i + 1, j));
      }
    }
    canopyGeo.setIndex(idx);
  }

  const tips = [];

  let last = null;

  const shape = (open, invert, flutter, tPhase) => {
    const key = `${open.toFixed(3)}|${invert.toFixed(3)}|${flutter.toFixed(3)}|${(tPhase % 1000).toFixed(2)}`;
    if (key === last) return;
    last = key;

    const p = canopyGeo.attributes.position.array;
    let k = 0;
    for (let i = 0; i <= AROUND; i++) {
      const a = (i / AROUND) * Math.PI * 2;
      const pt = (i % PSEG) / PSEG;
      const sag = Math.sin(pt * Math.PI);
      const wave = Math.sin(tPhase * 2.4 + a * 3) * flutter;
      for (let j = 0; j <= RINGS; j++) {
        const u = j / RINGS;

        let rO = R * Math.pow(u, 0.88) * (1 - 0.07 * sag * u * u);
        let yO = TOP - 1.12 * Math.pow(u, 1.72) + 0.08 * Math.pow(u, 6);
        yO += sag * (0.1 * Math.pow(u, 2.4) - 0.018 * u);

        const yI = TOP - 0.26 * u + 1.1 * Math.pow(u, 1.9) + sag * 0.11 * Math.pow(u, 1.4);
        const rI = R * Math.pow(u, 0.8) * 0.92;

        const rC = R * 0.07 * (0.35 + u * 0.9) * (1 - 0.35 * sag);
        const yC = TOP - 1.9 * u;

        let r = rO + (rI - rO) * invert;
        let y = yO + (yI - yO) * invert;
        r = rC + (r - rC) * open;
        y = yC + (y - yC) * open;
        y += wave * u * u * 0.045;
        r += wave * u * 0.02;

        p[k++] = Math.cos(a) * r;
        p[k++] = y;
        p[k++] = Math.sin(a) * r;
      }
    }
    canopyGeo.attributes.position.needsUpdate = true;
    canopyGeo.computeVertexNormals();

    const stride = (RINGS + 1) * 3;
    for (let n = 0; n < tips.length; n++) {
      const base = n * PSEG * stride + RINGS * 3;
      tips[n].position.set(p[base], p[base + 1], p[base + 2]);
    }
  };

  shape(1, 0, 0, 0);

  const canopyMat = new THREE.MeshPhysicalMaterial({
    name: 'canopy_fabric',
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.68,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#93a6d6'),
    clearcoat: 0.25,
    clearcoatRoughness: 0.7,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.name = 'canopy';
  body.add(canopy);

  const tipMat = new THREE.MeshStandardMaterial({
    name: 'rib_tip', color: new THREE.Color('#8d96a3'), roughness: 0.45, metalness: 0.6,
  });
  for (let i = 0; i < PANELS; i++) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), tipMat);
    tip.name = 'rib_tip_' + i;
    tips.push(tip);
    body.add(tip);
  }

  const metalMat = new THREE.MeshStandardMaterial({
    name: 'metal', color: new THREE.Color('#b9c1cb'), roughness: 0.32, metalness: 0.9,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    name: 'handle_wood', color: new THREE.Color('#5d3620'), roughness: 0.48, metalness: 0.05,
  });

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.85, 20), metalMat);
  shaft.name = 'shaft';
  shaft.position.y = -0.475;
  body.add(shaft);

  const ferrule = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.24, 16), metalMat);
  ferrule.name = 'ferrule';
  ferrule.position.y = TOP + 0.13;
  body.add(ferrule);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.12, 16), metalMat);
  collar.name = 'runner_collar';
  collar.position.y = -0.34;
  body.add(collar);

  const crook = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 14, 40, Math.PI), woodMat);
  crook.name = 'handle_crook';
  crook.position.set(-0.22, -1.9, 0);
  crook.rotation.z = Math.PI;
  body.add(crook);

  return { group, spinner, body, canopy, shape };
}
