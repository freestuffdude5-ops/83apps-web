// Physically based materials: polished chrome with travelling light pulses,
// blue/violet glass for the infinity band, frosted glass for UI panels and
// the device bodies.
import * as THREE from 'three';

/** Chrome for ribbons. uniforms.pulses: up to 4 vec4(s, halfWidth, intensity, 0). */
export function makeChrome({ color = '#e9e9f0', roughness = 0.1, pulseColor = '#9fb6ff' } = {}) {
  const uniforms = {
    uPulses: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uPulseColor: { value: new THREE.Color(pulseColor) },
    uSheen: { value: 0 },
  };
  const m = new THREE.MeshPhysicalMaterial({
    color, metalness: 1, roughness, clearcoat: 0.8, clearcoatRoughness: 0.06, envMapIntensity: 1.25,
  });
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 ribU; varying vec2 vRib;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRib = ribU;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRib; uniform vec4 uPulses[4]; uniform vec3 uPulseColor; uniform float uSheen;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float pl = 0.;
        for (int i = 0; i < 4; i++) { vec4 P = uPulses[i]; float d = (vRib.x - P.x) / max(P.y, 1e-4); pl += P.z * exp(-d*d); }
        totalEmissiveRadiance += uPulseColor * pl;`);
  };
  m.customProgramCacheKey = () => 'chrome-pulse';
  return m;
}

export function setPulses(mat, list) {
  const P = mat.userData.uniforms.uPulses.value;
  for (let i = 0; i < 4; i++) {
    const p = list[i];
    if (p) P[i].set(p[0], p[1], p[2], 0); else P[i].set(0, 1, 0, 0);
  }
}

/** Blue→violet translucent glass for the infinity sculpture band. */
export function makeInfinityGlass() {
  const uniforms = { uPhase: { value: 0 }, uGlow: { value: 1 } };
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: 0.06, transmission: 1, thickness: 0.35, ior: 1.42,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.1, specularIntensity: 1,
    attenuationColor: new THREE.Color('#7d7bff'), attenuationDistance: 2.2, transparent: false,
    dispersion: 0.0,
  });
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 ribU; varying vec2 vRib;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRib = ribU;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRib; uniform float uPhase; uniform float uGlow;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // hue drifts from cool blue (left lobe) to violet (right lobe)
        float h = 0.5 + 0.5 * cos(6.2831853 * (vRib.x - 0.25));
        vec3 blue = vec3(0.30, 0.62, 1.00), violet = vec3(0.62, 0.40, 1.00);
        vec3 tint = mix(blue, violet, smoothstep(0.1, 0.9, h));
        diffuseColor.rgb *= tint;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float h2 = 0.5 + 0.5 * cos(6.2831853 * (vRib.x - 0.25));
        vec3 inner = mix(vec3(0.10, 0.30, 0.95), vec3(0.42, 0.18, 0.95), smoothstep(0.1, 0.9, h2));
        float fl = 0.6 + 0.4 * sin(6.2831853 * (vRib.x * 3. - uPhase));
        float fr = pow(1. - abs(dot(normalize(normal), normalize(vViewPosition))), 2.);
        totalEmissiveRadiance += inner * (0.1 + 0.55 * fr) * uGlow * fl;`);
  };
  m.customProgramCacheKey = () => 'inf-glass';
  return m;
}

/** Frosted glass slab used behind every UI panel. */
export function makeFrost({ tint = '#d9dcff', roughness = 0.32 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness, transmission: 1, thickness: 0.18, ior: 1.46,
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.9,
    attenuationColor: new THREE.Color('#1a1a2a'), attenuationDistance: 0.7,
  });
}

export const deviceMaterials = () => ({
  // anodised graphite for display bodies
  body: new THREE.MeshPhysicalMaterial({ color: '#2a2b31', metalness: 1, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 1.0 }),
  // polished titanium edge for the phone
  frame: new THREE.MeshPhysicalMaterial({ color: '#c9cad2', metalness: 1, roughness: 0.18, envMapIntensity: 1.15 }),
  // black glass front
  black: new THREE.MeshPhysicalMaterial({ color: '#020203', metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.8 }),
});
