// Procedural studio lighting environment used for every reflection in the film.
// A dark cyclorama with a few large soft boxes: a neutral key overhead, cool
// blue strip on the left, violet strip on the right, thin white rims behind.
import * as THREE from 'three';

function box(scene, w, h, color, intensity, pos, lookAt, soft = 0) {
  // soft > 0 gives the panel a feathered, graduated falloff (like diffusion
  // fabric) so reflections read as smooth gradients instead of hard cards.
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { c: { value: new THREE.Color(color).multiplyScalar(intensity) }, soft: { value: soft } },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform vec3 c; uniform float soft; varying vec2 vU; void main(){
        vec2 d = abs(vU - .5) * 2.;
        float f = soft > 0. ? (1. - smoothstep(1. - soft, 1., d.x)) * (1. - smoothstep(1. - soft, 1., d.y)) * mix(.55, 1., vU.y) : 1.;
        gl_FragColor = vec4(c * f, 1.);
      }`,
    })
  );
  m.position.copy(pos);
  m.lookAt(lookAt);
  scene.add(m);
  return m;
}

export function buildEnvironment(renderer) {
  const s = new THREE.Scene();
  // Charcoal room with a faint gradient so dark metals still read as metal.
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(40, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec3 vP; void main(){
        float up = vP.y*.5+.5;
        vec3 c = mix(vec3(.006,.006,.008), vec3(.07,.07,.085), smoothstep(.2,1.,up));
        // a soft warm-neutral horizon band gives chrome a readable horizon line
        c += vec3(.05,.05,.06) * exp(-pow((vP.y-.02)*9.,2.));
        gl_FragColor = vec4(c,1.);
      }`,
    })
  );
  s.add(room);
  const O = new THREE.Vector3(0, 0, 0);
  // key: large overhead soft box, slightly forward
  box(s, 26, 10, '#ffffff', 3.0, new THREE.Vector3(0, 15, 4), O, 0.5);
  // large neutral side softboxes: these make chrome read as silver
  box(s, 10, 16, '#f2f3f8', 2.2, new THREE.Vector3(-15, 3, 9), O, 0.6);
  box(s, 10, 16, '#f2f3f8', 1.7, new THREE.Vector3(15, 3, 9), O, 0.6);
  // big graduated front-top softbox behind the camera: gives faces a sheen
  box(s, 24, 10, '#eef0ff', 1.6, new THREE.Vector3(0, 7, 17), O, 0.7);
  // low front fill
  box(s, 22, 3, '#dfe3ff', 0.5, new THREE.Vector3(0, -2, 18), O, 0.5);
  // cool blue and violet accent strips (tall, thin)
  box(s, 1.2, 18, '#4f86ff', 4.0, new THREE.Vector3(-17, 2, -4), O);
  box(s, 1.2, 18, '#9a6bff', 4.0, new THREE.Vector3(17, 2, -4), O);
  // back rims: thin white strips for crisp edge highlights
  box(s, 26, 0.5, '#ffffff', 7.5, new THREE.Vector3(0, 6, -16), O);
  box(s, 0.45, 14, '#ffffff', 5.0, new THREE.Vector3(-9, 3, -15), O);
  box(s, 0.45, 14, '#ffffff', 5.0, new THREE.Vector3(9, 3, -15), O);
  // floor bounce, very dim blue
  box(s, 30, 30, '#1a2040', 0.25, new THREE.Vector3(0, -14, 0), O);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, 0.02);
  pmrem.dispose();
  return rt.texture;
}
