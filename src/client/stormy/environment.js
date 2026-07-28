/**
 * Overcast studio environment: wet-day light.
 *
 * A 64×32 canvas gradient — bright flat sky, a hard horizon, wet dark ground —
 * with one blown-out patch where the sun is trying and failing. Run through
 * PMREM so roughness blur stays physically sane.
 *
 * It matters more than it looks: the canopy's sheen is a rim effect that needs
 * something bright behind the silhouette to catch, and the shaft and ferrule
 * are near-mirror metal with nothing else in the scene to reflect. A nicety in
 * the sense that a failure here must not take the page down.
 */

export function buildEnvironment({ stage, THREE }) {
  try {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#eef4fb');     // flat overcast sky
    g.addColorStop(0.5, '#8f9aa8');
    g.addColorStop(0.56, '#2a2f36');  // horizon, into wet ground
    g.addColorStop(1, '#12151a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 32);

    // The one bright patch: an overcast sky still has a sun behind it, and
    // without it the metal has no highlight to sweep as the umbrella twirls.
    ctx.fillStyle = 'rgba(245,250,255,0.9)';
    ctx.beginPath(); ctx.ellipse(22, 6, 13, 5, 0, 0, Math.PI * 2); ctx.fill();

    const tex = new THREE.Texture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(stage._renderer);
    stage._scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
  } catch {
    /* environment is a nicety, not a requirement */
  }
}
