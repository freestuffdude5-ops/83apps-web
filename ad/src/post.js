// Post pipeline: MSAA HDR scene render → depth-of-field (half-res gather
// blur, composited by circle of confusion) → restrained bloom → neutral tone
// mapping, vignette and fine grain.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const common = /* glsl */`
  uniform sampler2D tDepth; uniform float near, far, focus, aperture, maxCoc;
  float viewDist(vec2 uv){ float d = texture2D(tDepth, uv).x; return (near*far) / ((far-near)*d - far) * -1.; }
  float coc(float z){ return clamp(aperture * abs(z - focus) / max(z, 1e-3), 0., maxCoc); }
`;

export class Post {
  constructor(renderer, W, H) {
    this.r = renderer; this.W = W; this.H = H;
    const depthTexture = new THREE.DepthTexture(W, H);
    depthTexture.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4, depthTexture, depthBuffer: true });
    this.blurRT = new THREE.WebGLRenderTarget(W / 2, H / 2, { type: THREE.HalfFloatType });
    this.compRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
    const u = {
      tColor: { value: this.sceneRT.texture }, tDepth: { value: depthTexture },
      near: { value: 0.1 }, far: { value: 100 }, focus: { value: 8 }, aperture: { value: 0 }, maxCoc: { value: 14 },
      px: { value: new THREE.Vector2(1 / W, 1 / H) },
    };
    this.u = u;
    // half-res gather blur (Gustafsson-style scatter-as-gather)
    this.blur = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tColor; uniform vec2 px; varying vec2 vUv;
        ${common}
        void main(){
          float cd = viewDist(vUv);
          float cs = coc(cd);
          vec3 col = texture2D(tColor, vUv).rgb; float tot = 1.;
          float rad = 1.2;
          for (int i = 0; i < 64; i++) {
            if (rad >= maxCoc) break;
            float ang = float(i) * 2.39996323;
            vec2 tc = vUv + vec2(cos(ang), sin(ang)) * px * rad;
            vec3 sc = texture2D(tColor, tc).rgb;
            float sd = viewDist(tc);
            float ss = coc(sd);
            if (sd > cd) ss = clamp(ss, 0., cs * 2.);
            float m = smoothstep(rad - 1.5, rad + 1.5, ss);
            col += mix(col / tot, sc, m); tot += 1.;
            rad += 1.25 / rad * 2.2;
          }
          gl_FragColor = vec4(col / tot, cs);
        }`,
    }));
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { ...u, tBlur: { value: this.blurRT.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tColor, tBlur; varying vec2 vUv;
        ${common}
        void main(){
          vec3 sharp = texture2D(tColor, vUv).rgb;
          vec4 b = texture2D(tBlur, vUv);
          float cs = coc(viewDist(vUv));
          float m = aperture > 0.001 ? smoothstep(0.6, 2.2, max(cs, b.a * 0.85)) : 0.;
          gl_FragColor = vec4(mix(sharp, b.rgb, m), 1.);
        }`,
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.22, 0.45, 1.35);
    this.gradeU = {
      tIn: { value: this.compRT.texture }, seed: { value: 0 }, vig: { value: 0.32 }, exposure: { value: 1 },
      res: { value: new THREE.Vector2(W, H) }, grain: { value: 0.018 }, fade: { value: 1 },
    };
    this.grade = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.gradeU,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tIn; uniform float seed, vig, exposure, grain, fade; uniform vec2 res; varying vec2 vUv;
        vec3 neutral(vec3 color){
          const float S = 0.76, D = 0.15;
          color *= exposure;
          float x = min(color.r, min(color.g, color.b));
          float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
          color -= off;
          float peak = max(color.r, max(color.g, color.b));
          if (peak < S) return color;
          float d = 1. - S;
          float np = 1. - d * d / (peak + d - S);
          color *= np / peak;
          float g = 1. - 1. / (D * (peak - np) + 1.);
          return mix(color, vec3(np), g);
        }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - 0.055, step(0.0031308, c)); }
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tIn, vUv).rgb;
          c = neutral(max(c, 0.));
          vec2 q = (vUv - .5) * vec2(res.x / res.y, 1.);
          float r = length(q) / length(vec2(res.x / res.y, 1.) * .5);
          c *= mix(1., 1. - vig, smoothstep(.35, 1.05, r));
          c = toSRGB(clamp(c, 0., 1.));
          // lift black to the brand background (#060608) so the DOM layer matches
          c = (vec3(6., 6., 8.) / 255. + c * (1. - vec3(6., 6., 8.) / 255.)) * fade;
          c += (h(vUv * res) - .5) * grain;
          gl_FragColor = vec4(c, 1.);
        }`,
    }));
  }

  render(scene, camera, { focus = 8, aperture = 0, maxCoc = 14, seed = 0, fade = 1, bloom = 0.32 } = {}) {
    const r = this.r, u = this.u;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    u.near.value = camera.near; u.far.value = camera.far;
    u.focus.value = focus; u.aperture.value = aperture; u.maxCoc.value = maxCoc;
    if (aperture > 0.001) {
      r.setRenderTarget(this.blurRT); this.blur.render(r);
      r.setRenderTarget(this.compRT); this.comp.render(r);
    } else {
      // no DOF: copy through the composite (m becomes 0)
      r.setRenderTarget(this.compRT); this.comp.render(r);
    }
    this.bloom.strength = bloom;
    if (bloom > 0.001) this.bloom.render(r, null, this.compRT, 0, false);
    this.gradeU.seed.value = seed; this.gradeU.fade.value = fade;
    r.setRenderTarget(null);
    this.grade.render(r);
  }
}
