'use client';

import { useEffect, useRef, useState } from 'react';
import cfg from '@/lib/effects/light-rails-preset.json';

// Original shader: Light Rails by Dinesh, https://light-stroke-rail.vercel.app/.
// The user's v13 preset is passed directly to its original uniform interface.
export default function LightRails() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const controller = new AbortController();
    let dispose = () => {};
    const start = async () => {
      const response = await fetch('/effects/light-rails.frag', { signal: controller.signal });
      if (!response.ok) throw new Error('Could not load Light Rails shader');
      const source = await response.text();
      if (controller.signal.aborted) return;
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
      if (!gl) throw new Error('WebGL unavailable');
      const shaders: WebGLShader[] = [];
      const compile = (type: number, text: string) => {
        const shader = gl.createShader(type)!;
        shaders.push(shader);
        gl.shaderSource(shader, text); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
        return shader;
      };
      const program = gl.createProgram()!;
      let buffer: WebGLBuffer | null = null, texture: WebGLTexture | null = null;
      const release = () => { shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteTexture(texture); };
      dispose = release;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, source));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
      // WebGL useProgram is not a React hook.
      // oxlint-disable-next-line react/react-compiler
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const locations = new Map<string, WebGLUniformLocation | null>();
      const uniform = (name: string) => { if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name)); return locations.get(name)!; };
      const floats: Record<string, number> = { uLines: cfg.lines, uEdge: cfg.edge, uBase: cfg.base, uSpan: cfg.span, uFlare: cfg.flare, uWarpA: cfg.warpA, uWarpB: cfg.warpB, uRibDepth: cfg.ribDepth, uRibSoft: cfg.ribSoft, uP1: cfg.p1, uP2: cfg.p2, uP3: cfg.p3, uRunV: cfg.runv, uJitter: cfg.jitter, uHold: cfg.hold, uHollow: cfg.hollow, uDwell: cfg.dwell, uLife: cfg.life, uDelay: cfg.delay, uVLag: cfg.vlag, uPre: cfg.pre, uTail: cfg.tail, uRise: cfg.rise, uFall: cfg.fall, uGain: cfg.gain, uBloom: cfg.bloom, uBlow: cfg.blow, uBlur: cfg.blur, uAngle: cfg.angle * Math.PI / 180, uGrain: cfg.grain, uGlyphR: 1.2, uFade: 1 };
      Object.entries(floats).forEach(([name, value]) => gl.uniform1f(uniform(name), value));
      gl.uniform1i(uniform('uShape'), cfg.shape); gl.uniform1i(uniform('uFlow'), cfg.flow); gl.uniform1i(uniform('uNStops'), cfg.stops.length);
      gl.uniform2fv(uniform('uSeam'), [cfg.seamDepth, cfg.seamWidth]);
      gl.uniform4fv(uniform('uCross'), cfg.cross); gl.uniform3fv(uniform('uNotch'), cfg.notch); gl.uniform4fv(uniform('uEase'), cfg.ease);
      const rgb = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
      gl.uniform3fv(uniform('uBg'), rgb(cfg.bg));
      for (let i = 0; i < 6; i++) gl.uniform3fv(uniform(`uStops[${i}]`), rgb(cfg.stops[Math.min(i, cfg.stops.length - 1)]));
      // Complete the shader's unused glyph sampler with the original neutral texel.
      texture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 0, 0, 255])); gl.uniform1i(uniform('uGlyph'), 0);
      let visible = true, frame = 0, last = performance.now(), time = 3.17, dirty = true;
      const motion = matchMedia('(prefers-reduced-motion: reduce)');
      const motionChanged = () => { pausedRef.current = motion.matches; setPaused(motion.matches); dirty = true; };
      motionChanged(); motion.addEventListener('change', motionChanged);
      const resize = () => {
        const bounds = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 1.5);
        canvas.width = Math.max(1, Math.round(bounds.width * dpr)); canvas.height = Math.max(1, Math.round(bounds.height * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(uniform('uRes'), canvas.width, canvas.height);
        cfg.path.forEach((point, i) => gl.uniform2f(uniform(`uC${i}`), (point[0] - .5) * canvas.width / canvas.height, point[1])); dirty = true;
      };
      const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
      const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; dirty = true; }); visibility.observe(canvas);
      const draw = (now: number) => {
        frame = requestAnimationFrame(draw);
        const delta = Math.min((now - last) / 1000, .05); last = now;
        if (!visible || document.hidden) return;
        if (!pausedRef.current) { time += delta; dirty = true; }
        if (!dirty) return;
        gl.uniform1f(uniform('uTime'), time / cfg.period); gl.uniform1f(uniform('uSway'), motion.matches ? 0 : cfg.sway);
        gl.drawArrays(gl.TRIANGLES, 0, 3); dirty = false;
      };
      const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setUnavailable(true); };
      canvas.addEventListener('webglcontextlost', lost);
      frame = requestAnimationFrame(draw);
      dispose = () => { cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect(); motion.removeEventListener('change', motionChanged); canvas.removeEventListener('webglcontextlost', lost); release(); };
    };
    start().catch(error => { if (!controller.signal.aborted) { console.error('Light Rails:', error); dispose(); setUnavailable(true); } });
    return () => { controller.abort(); dispose(); };
  }, []);

  return <div className="hero-media light-rails"><canvas ref={canvasRef} aria-label="Animated multicolour Light Rails on a black background"/>{unavailable ? <p className="rails-unavailable">This browser could not display the light effect.</p> : <button className="rails-pause" aria-label={paused ? 'Play light effect' : 'Pause light effect'} onClick={() => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); }}>{paused ? 'Play' : 'Pause'}</button>}</div>;
}
