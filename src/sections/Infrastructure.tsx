import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_image_texture;
uniform sampler2D u_dissolve_texture;
uniform float u_scroll_progr;
uniform float u_time;
uniform vec2 u_mouse;
uniform vec2 u_resolution;
varying vec2 v_uv;

vec2 texCoordWrapper(vec2 uv) {
  vec2 wrapped = fract(uv);
  return 2.0 * abs(wrapped - 0.5);
}

float getLuminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float getDitherValue(vec2 uv) {
  int x = int(mod(uv.x * 160.0, 4.0));
  int y = int(mod(uv.y * 160.0, 4.0));
  int index = x + y * 4;
  float dither[16];
  dither[0] = 1.0; dither[1] = 9.0; dither[2] = 3.0; dither[3] = 11.0;
  dither[4] = 13.0; dither[5] = 5.0; dither[6] = 15.0; dither[7] = 7.0;
  dither[8] = 4.0; dither[9] = 12.0; dither[10] = 2.0; dither[11] = 10.0;
  dither[12] = 16.0; dither[13] = 8.0; dither[14] = 14.0; dither[15] = 6.0;
  return dither[index] / 16.0;
}

void main() {
  float scale = 0.0006 + 0.0004 * (1.0 - u_scroll_progr);
  vec2 uv = v_uv * scale + 0.5 * (1.0 - scale);

  vec4 dissolve_texture = texture2D(u_dissolve_texture, uv);
  float dithered_dissolve = smoothstep(-0.4, 1.001, (dissolve_texture.g * getDitherValue(v_uv) * 3.0));
  float dither_progress = dithered_dissolve + (u_scroll_progr * 4.0 - 1.0);

  vec2 image_uv = texCoordWrapper(v_uv * 0.95 + 0.025);
  vec4 input_texture = texture2D(u_image_texture, image_uv);

  vec3 graded_texture = input_texture.rgb * vec3(1.0, 0.85, 0.55);
  graded_texture = mix(graded_texture, vec3(1.0), vec3(getLuminance(input_texture.rgb)));

  vec2 mouse_influence = u_mouse * 0.005;
  float time = u_time * 0.1;
  vec3 noise = fract(sin(dot(v_uv + mouse_influence, vec2(12.9898, 78.233) + time)) * 43758.5453) * 2.0 - 1.0;

  float dissolve = clamp(1.0 - 6.0 * dither_progress, 0.0, 1.0);
  dissolve += noise.r * 0.15;
  dissolve = clamp(dissolve, 0.0, 1.0);

  vec3 color = mix(graded_texture * 0.5, graded_texture, dissolve);
  gl_FragColor = vec4(color, 1.0);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function loadTexture(gl: WebGLRenderingContext, url: string): Promise<WebGLTexture | null> {
  return new Promise((resolve) => {
    const texture = gl.createTexture();
    if (!texture) { resolve(null); return; }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      resolve(texture);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export default function Infrastructure() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollProgressRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return;

    const gl = canvas.getContext('webgl', { premultipliedAlpha: false });
    if (!gl) return;

    let running = true;
    let animFrameId: number;

    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = createProgram(gl, vs, fs);
    if (!program) return;

    gl.useProgram(program);

    // Fullscreen quad
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uImageTexture = gl.getUniformLocation(program, 'u_image_texture');
    const uDissolveTexture = gl.getUniformLocation(program, 'u_dissolve_texture');
    const uScrollProgr = gl.getUniformLocation(program, 'u_scroll_progr');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const uResolution = gl.getUniformLocation(program, 'u_resolution');

    gl.activeTexture(gl.TEXTURE0);
    gl.activeTexture(gl.TEXTURE1);

    Promise.all([
      loadTexture(gl, '/images/image_infra_base.jpg'),
      loadTexture(gl, '/images/image_infra_dissolve.jpg'),
    ]).then(([imageTex, dissolveTex]) => {
      if (!imageTex || !dissolveTex || !running) return;

      gl.useProgram(program);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imageTex);
      gl.uniform1i(uImageTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, dissolveTex);
      gl.uniform1i(uDissolveTexture, 1);

      const startTime = performance.now();

      function render() {
        if (!running || !gl || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio, 2);
        const w = rect.width * dpr;
        const h = rect.height * dpr;

        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        gl.viewport(0, 0, w, h);

        gl.uniform1f(uScrollProgr, scrollProgressRef.current);
        gl.uniform1f(uTime, (performance.now() - startTime) * 0.001);
        gl.uniform2f(uMouse, mouseRef.current.x, mouseRef.current.y);
        gl.uniform2f(uResolution, rect.width, rect.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        animFrameId = requestAnimationFrame(render);
      }

      animFrameId = requestAnimationFrame(render);
    });

    // ScrollTrigger
    const st = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      pin: true,
      pinSpacing: true,
      onUpdate: (self) => {
        scrollProgressRef.current = self.progress;
      },
    });

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current.x = (e.clientX - rect.left) / rect.width;
      mouseRef.current.y = 1.0 - (e.clientY - rect.top) / rect.height;
    }

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameId);
      st.kill();
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <section
      id="infrastructure"
      ref={sectionRef}
      className="relative w-full bg-[#0A0A0A]"
      style={{ height: '200vh' }}
    >
      <div className="sticky top-0 w-full h-screen">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: 'block' }}
        />
        {/* Overlay title */}
        <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center pointer-events-none">
          <h2 className="text-[48px] md:text-[64px] font-medium text-[#FFFFFF] tracking-[-0.02em] text-center mix-blend-difference">
            ALGORITHMIC
            <br />
            INFRASTRUCTURE
          </h2>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8A8A8A]">
            [SCROLL TO DECRYPT]
          </p>
        </div>
      </div>
    </section>
  );
}
