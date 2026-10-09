/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { css } from '@emotion/css';
import React, { FC, useEffect, useRef, useState } from 'react';

// Full-page WebGL backdrop in the "studio glass" style: a silver-lavender photo-studio backdrop
// with a pool of floor light and falling light streaks, and the system mascot — a pixel space
// invader rendered as a centered translucent glass sculpture (yellow -> pink -> magenta, fused
// pillow blocks with bevel highlights). Rendered with a single fragment shader on a fullscreen
// triangle; deliberately dependency-free and WebGL1-only so the login page works everywhere,
// with a static CSS gradient as the no-WebGL fallback.
const VERT_SRC = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG_SRC = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uJolt;
// invader cell size in screen-height units, pushed from JS so the sculpture scales with the
// smaller viewport dimension and never collides with the DOM content on unusual aspect ratios
uniform float uCS;

const vec3 YELLOW  = vec3(0.94, 0.95, 0.48);
const vec3 ORANGE  = vec3(0.98, 0.68, 0.50);
const vec3 PINK    = vec3(0.96, 0.38, 0.78);
const vec3 VIOLET  = vec3(0.68, 0.24, 0.94);

const float HALF_B = 0.55;   // block half-extent, in cells (overlaps neighbours so the body is solid)
const float CORNER_R = 0.30; // block corner radius, in cells

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// classic space-invader crab, 11x8 grid, rows packed as bitmasks (GLSL ES 1.0 has no arrays/bitops)
// rows 2-3 share eye gaps at cols 3/7 so each eye reads as a 1x2-cell rounded hole
float rowData(float r) {
  if (r < 0.5) return 260.0;
  if (r < 1.5) return 136.0;
  if (r < 2.5) return 372.0;
  if (r < 3.5) return 886.0;
  if (r < 4.5) return 2047.0;
  if (r < 5.5) return 1533.0;
  if (r < 6.5) return 1285.0;
  return 216.0;
}

bool filled(float i, float j) {
  if (i < 0.0 || i > 10.0 || j < 0.0 || j > 7.0) return false;
  float bit = mod(floor(rowData(j) / pow(2.0, 10.0 - i)), 2.0);
  return bit > 0.5;
}

vec2 cellCenter(float i, float j) {
  return vec2((i - 5.0) * uCS, (3.5 - j) * uCS);
}

// block center with a per-block jelly jiggle: every block wobbles on its own phase, and the
// amplitude surges when the pointer sweeps across (uJolt decays in JS)
vec2 blockCenter(float i, float j, float t) {
  vec2 c = cellCenter(i, j);
  float amp = uCS * (0.05 + 0.03 * sin(t * 0.6)) * (1.0 + uJolt * 3.0);
  c += vec2(sin(t * 1.9 + i * 1.3 + j * 0.7), cos(t * 1.6 + j * 1.7 + i * 0.5)) * amp;
  return c;
}

float roundedBox(vec2 p, float b, float r) {
  vec2 d = abs(p) - vec2(b);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// silhouette: edge-to-edge rounded blocks min-fused into one solid body
float invaderSDF(vec2 p, float t) {
  float d = 1e5;
  for (int j = 0; j < 8; j++) {
    for (int i = 0; i < 11; i++) {
      if (filled(float(i), float(j))) {
        d = min(d, roundedBox(p - blockCenter(float(i), float(j), t), uCS * HALF_B, uCS * CORNER_R));
      }
    }
  }
  return d;
}

// centered sculpture: squash & stretch breathing, pointer parallax.
// bounding ring in screen units: half-diagonal of the 11x8 grid is ~6.8*uCS, plus margin
float scene(vec2 p, float t, out vec2 c) {
  c = vec2(0.0, 0.20) + uMouse * 0.035 + vec2(0.0, 0.008 * sin(t * 0.3));
  float sq = 0.018 * sin(t * 0.9) * (1.0 + uJolt * 2.0);
  vec2 s = vec2(1.0 + sq, 1.0 - sq);
  vec2 q = (p - c) / s;
  float bound = length(q) - 8.3 * uCS;
  if (bound > uCS * 2.0) return bound;
  return invaderSDF(q, t) * ((s.x + s.y) * 0.5);
}

float sceneSimple(vec2 p, float t) {
  vec2 c;
  return scene(p, t, c);
}

vec3 backdrop(vec2 uv, float t) {
  float h = clamp(uv.y + 0.5, 0.0, 1.0);
  vec3 cTop = vec3(0.575, 0.585, 0.655);
  vec3 cMid = vec3(0.755, 0.765, 0.815);
  vec3 cLow = vec3(0.905, 0.915, 0.945);
  vec3 col = mix(cMid, cTop, smoothstep(0.30, 1.0, h));
  col = mix(col, cLow, smoothstep(0.35, -0.05, h));

  vec2 q = (uv - vec2(0.0, -0.52)) * vec2(0.55, 1.35);
  float pool = exp(-dot(q, q) * 2.4);
  col += vec3(0.30, 0.30, 0.34) * pool;

  float st = 0.0;
  st += exp(-pow((uv.x - (sin(t * 0.05) * 0.05 - 0.24)) * 8.0, 2.0));
  st += exp(-pow((uv.x - (sin(t * 0.04 + 2.0) * 0.06 + 0.18)) * 11.0, 2.0)) * 0.7;
  st += exp(-pow((uv.x - (sin(t * 0.03 + 4.0) * 0.10 + 0.02)) * 14.0, 2.0)) * 0.5;
  col += st * 0.045 * smoothstep(-0.15, 0.65, uv.y);

  vec2 v = uv * vec2(0.52, 0.72);
  col *= 1.0 - dot(v, v) * 0.55;
  return col;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 uv = (gl_FragCoord.xy / uRes - 0.5) * vec2(aspect, 1.0);
  float t = uTime;

  vec3 col = backdrop(uv, t);

  vec2 ic;
  float d = scene(uv, t, ic);
  float sq = 0.018 * sin(t * 0.9) * (1.0 + uJolt * 2.0);
  vec2 scl = vec2(1.0 + sq, 1.0 - sq);

  // sculpture-local coords (block grid space)
  vec2 lp = (uv - ic) / scl;

  // richer four-stop ramp (yellow -> orange -> pink -> violet) mapped top to bottom, with a
  // smooth large-scale hue drift so colours keep shifting inside the glass
  float g = clamp(0.55 - (lp.y / (4.0 * uCS)) * 0.66 + (lp.x / (5.5 * uCS)) * 0.12, 0.0, 1.0);
  g = clamp(g + 0.06 * sin(lp.x * 7.0 + lp.y * 5.0 + t * 0.4) + 0.02 * sin(lp.y * 13.0 - t * 0.7), 0.0, 1.0);
  vec3 ramp;
  if (g < 0.34) {
    ramp = mix(YELLOW, ORANGE, g / 0.34);
  } else if (g < 0.67) {
    ramp = mix(ORANGE, PINK, (g - 0.34) / 0.33);
  } else {
    ramp = mix(PINK, VIOLET, (g - 0.67) / 0.33);
  }

  // soft colored ambience hugging the sculpture
  float glowD = length(lp) - 5.8 * uCS;
  col += ramp * pow(smoothstep(4.5 * uCS, 0.0, glowD), 2.4) * 0.05;

  // pointer spotlight drifting over the studio wall
  vec2 mUV = uMouse * vec2(aspect, 1.0) * 0.5;
  col += vec3(0.16, 0.16, 0.19) * exp(-dot(uv - mUV, uv - mUV) * 5.0);

  // faint contact shadow below
  float ds = sceneSimple(uv + vec2(0.0, uCS * 3.0), t);
  col *= 1.0 - smoothstep(uCS * 2.0, -uCS * 0.5, ds) * 0.12;

  if (d < uCS * 0.4) {
    // Blended dome normals: every nearby block contributes its own gradient with smoothly
    // decaying, renormalized weights, so shading stays continuous across block seams
    // (a nearest-block-only normal flips direction mid-seam and shows as color steps).
    float iC = floor(lp.x / uCS + 0.5);
    float jC = floor(3.5 - lp.y / uCS + 0.5);
    float blendW = uCS * 0.45;
    float e = uCS * 0.05;
    vec2 gradAcc = vec2(0.0);
    float wSum = 0.0;
    float minD = 1e5;
    for (int dj = -1; dj <= 1; dj++) {
      for (int di = -1; di <= 1; di++) {
        float i = iC + float(di);
        float j = jC + float(dj);
        if (!filled(i, j)) continue;
        vec2 c = blockCenter(i, j, t);
        float dd = roundedBox(lp - c, uCS * HALF_B, uCS * CORNER_R);
        minD = min(minD, dd);
        float w = clamp(1.0 - dd / blendW, 0.0, 1.0);
        if (w <= 0.0) continue;
        w *= w;
        float bC = roundedBox(lp - c, uCS * HALF_B, uCS * CORNER_R);
        float bX = roundedBox(lp + vec2(e, 0.0) - c, uCS * HALF_B, uCS * CORNER_R);
        float bY = roundedBox(lp + vec2(0.0, e) - c, uCS * HALF_B, uCS * CORNER_R);
        gradAcc += vec2(bX - bC, bY - bC) * w;
        wSum += w;
      }
    }
    vec3 n = wSum > 0.0
      ? normalize(vec3(gradAcc / (wSum * e), 0.18))
      : vec3(0.0, 0.0, 1.0);

    // key light slowly orbits and follows the pointer, so highlights keep flowing
    vec3 lightDir = normalize(vec3(-0.42 + 0.18 * sin(t * 0.21) + uMouse.x * 0.30,
                                   0.62 + 0.10 * sin(t * 0.17 + 1.3) + uMouse.y * 0.30,
                                   0.66));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfDir = normalize(lightDir + viewDir);
    float diff = clamp(dot(n, lightDir), 0.0, 1.0);
    float spec = pow(clamp(dot(n, halfDir), 0.0, 1.0), 24.0);
    vec3 rimDir = normalize(vec3(0.55, -0.25, 0.75));
    float spec2 = pow(clamp(dot(n, normalize(rimDir + viewDir)), 0.0, 1.0), 40.0);
    float fresnel = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.2);

    // diagonal sheen sweeping across the glass every ~11s
    float ph = dot(normalize(vec2(0.8, -0.6)), lp) / (5.5 * uCS);
    float sweepPos = mix(-1.4, 1.4, fract(t * 0.09));
    float sheen = exp(-pow((ph - sweepPos) * 3.2, 2.0));

    // saturated glass body, gently lit from above; seams between blocks darken
    // like fused glass creases (minD is the true distance to the nearest edge)
    float crease = smoothstep(uCS * 0.23, 0.0, minD);
    vec3 body = ramp * (0.76 + 0.20 * diff) * (1.0 - crease * 0.18);
    vec3 glass = body;
    glass += vec3(1.0) * spec * 0.55;
    glass += vec3(1.0) * spec2 * 0.15;
    glass += mix(ramp, vec3(1.0), 0.4) * fresnel * 0.24;
    glass += vec3(1.0) * sheen * 0.16;

    float px = 1.5 / uRes.y;
    float aa = smoothstep(px, -px, d);
    col = mix(col, glass, aa * 0.97);
  }

  col += (hash21(gl_FragCoord.xy + fract(t) * 61.7) - 0.5) * 0.022;

  gl_FragColor = vec4(col, 1.0);
}
`;

const containerClass = css`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
`;

const canvasClass = css`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
`;

// Static stand-in sharing the artwork palette, shown before the first frame and whenever
// WebGL is unavailable.
const fallbackClass = css`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: radial-gradient(120% 55% at 50% 108%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0) 55%),
    radial-gradient(80% 60% at 18% 85%, rgba(238, 215, 245, 0.55) 0%, rgba(238, 215, 245, 0) 60%),
    radial-gradient(70% 55% at 85% 20%, rgba(246, 242, 170, 0.35) 0%, rgba(246, 242, 170, 0) 55%),
    linear-gradient(to bottom, #96979f 0%, #b9bac2 40%, #e3e4ea 78%, #f2f3f7 100%);
`;

function createRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
  if (!gl) {
    return null;
  }

  const compileShader = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) {
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[plugin-auth] studio glass shader compile failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, VERT_SRC);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vertexShader || !fragmentShader) {
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[plugin-auth] studio glass shader link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  // one fullscreen triangle
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, 'uRes');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const uMouse = gl.getUniformLocation(program, 'uMouse');
  const uJolt = gl.getUniformLocation(program, 'uJolt');
  const uCS = gl.getUniformLocation(program, 'uCS');

  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const resize = () => {
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const target = { x: 0, y: 0 };
  const smooth = { x: 0, y: 0 };
  let jolt = 0;
  let lastPointer: { x: number; y: number } | null = null;
  const onPointerMove = (e: PointerEvent) => {
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = -((e.clientY / window.innerHeight) * 2 - 1);
    // fast sweeps "poke" the jelly: pointer speed feeds the wobble amplitude, decaying each frame
    if (lastPointer) {
      const dist = Math.hypot(e.clientX - lastPointer.x, e.clientY - lastPointer.y);
      jolt = Math.min(1, jolt + (dist / Math.hypot(window.innerWidth, window.innerHeight)) * 4);
    }
    lastPointer = { x: e.clientX, y: e.clientY };
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startTime = performance.now();
  let raf = 0;
  const frame = () => {
    resize();
    smooth.x += (target.x - smooth.x) * 0.04;
    smooth.y += (target.y - smooth.y) * 0.04;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (performance.now() - startTime) / 1000);
    gl.uniform2f(uMouse, smooth.x, smooth.y);
    gl.uniform1f(uJolt, jolt);
    jolt *= 0.94;
    // cell size adapts to BOTH viewport dimensions: the sculpture stays ~46% of the width and
    // ~42% of the height at most, so it cannot collide with the DOM content on any aspect ratio
    gl.uniform1f(uCS, Math.min(window.innerWidth * 0.042, window.innerHeight * 0.0525) / window.innerHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reducedMotion) {
      raf = requestAnimationFrame(frame);
    }
  };

  window.addEventListener('resize', resize);
  if (!reducedMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
  }
  frame();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

export const StudioGlassBackground: FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const dispose = createRenderer(canvas);
    if (!dispose) {
      setWebglUnavailable(true);
      return undefined;
    }
    return dispose;
  }, []);

  return (
    <div aria-hidden className={containerClass}>
      <div className={fallbackClass} />
      <canvas ref={canvasRef} className={canvasClass} style={webglUnavailable ? { display: 'none' } : undefined} />
    </div>
  );
};
