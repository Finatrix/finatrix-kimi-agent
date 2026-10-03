// The film finish shared by the WebGL scenes: lens fringing toward the edges,
// vignette, per-frame grain and a fade, so every rendered shot has one texture.

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** The film finish: lens fringing toward the edges, vignette, per-frame grain, fade to black. */
export function filmFinish(width, height, { vignette = 0.38, grain = 0.035 } = {}) {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, frame: { value: 0 }, fade: { value: 0 },
      res: { value: new THREE.Vector2(width, height) }, vignette: { value: vignette }, grain: { value: grain },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float frame, fade, vignette, grain; uniform vec2 res; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 d = vUv - 0.5;
        float ca = 0.006 * dot(d, d);
        vec3 col = vec3(texture2D(tDiffuse, vUv - d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + d * ca).b);
        float vig = smoothstep(0.98, 0.28, length(d * vec2(1.0, 0.86)));
        col *= mix(1.0 - vignette, 1.0, vig);
        col += (hash(floor(vUv * res) + mod(frame, 97.0) * 13.1) - 0.5) * grain;
        gl_FragColor = vec4(col * (1.0 - fade), 1.0);
      }`,
  });
}
