'use client';

import { useEffect, useRef, useState } from 'react';
import { Toggle } from '@/components/ui/toggle';

type Settings = { scanlines: boolean; bloom: boolean; tracking: boolean; paused: boolean };
type Cluster = { x: number; y: number; z: number; radius: number; phase: number; ring: boolean };
const initial: Settings = { scanlines: true, bloom: true, tracking: true, paused: false };

// A deterministic volumetric point field, projected from model space every frame.
function makeClusters(): Cluster[] {
  let seed = 47;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: 76 }, (_, i) => {
    const azimuth = random() * Math.PI * 2;
    const elevation = Math.acos(2 * random() - 1);
    const radius = .45 + random() * .65;
    return { x: Math.sin(elevation) * Math.cos(azimuth) * radius, y: Math.cos(elevation) * radius, z: Math.sin(elevation) * Math.sin(azimuth) * radius, radius: .015 + random() * .055, phase: random() * 6.28, ring: i % 4 === 0 };
  });
}

export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState(initial);
  const config = useRef(settings);
  const reset = useRef(() => {});
  useEffect(() => { config.current = settings; }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const surface = document.createElement('canvas');
    const sctx = surface.getContext('2d')!;
    const clusters = makeClusters();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => { if (reduced.matches) { config.current = { ...config.current, paused: true }; setSettings(s => ({ ...s, paused: true })); } };
    const motionFrame = requestAnimationFrame(syncMotion);
    reduced.addEventListener('change', syncMotion);
    let width = 1, height = 1, cols = 1, rows = 1, dpr = 1;
    let energy = new Float32Array(1), pixels = sctx.createImageData(1, 1);
    let angle = .3, tilt = -.12, targetAngle = .3, targetTilt = -.12, time = 0;
    let pointerX = -9999, pointerY = -9999, drag = false, lastX = 0, lastY = 0;
    let raf = 0, last = 0, visible = true, dirty = true;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect(); width = bounds.width; height = bounds.height;
      dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      cols = Math.max(1, Math.round(width / 4)); rows = Math.max(1, Math.round(height / 4));
      surface.width = cols; surface.height = rows; energy = new Float32Array(cols * rows); pixels = sctx.createImageData(cols, rows); dirty = true;
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; dirty = true; }); intersection.observe(canvas);
    const project = (x: number, y: number, z: number) => {
      const rx = x * Math.cos(angle) + z * Math.sin(angle);
      const rz = z * Math.cos(angle) - x * Math.sin(angle);
      const ry = y * Math.cos(tilt) - rz * Math.sin(tilt);
      const depth = y * Math.sin(tilt) + rz * Math.cos(tilt);
      const perspective = 2.8 / (2.8 + depth);
      const scale = Math.max(height * .49, Math.min(width * .4, height * .85));
      let px = width / 2 + rx * scale * perspective, py = height / 2 + ry * scale * perspective;
      const dx = px - pointerX, dy = py - pointerY, distance = Math.hypot(dx, dy);
      if (distance < 150 && distance > 0) { const force = (1 - distance / 150) ** 2 * 22; px += dx / distance * force; py += dy / distance * force; }
      return { x: px, y: py, depth, scale: perspective * scale };
    };
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 32 || !visible || document.hidden) return;
      const dt = Math.min((now - last) / 1000, .05); last = now;
      const options = config.current;
      if (!options.paused) { time += dt; if (!drag) targetAngle += dt * .14; dirty = true; }
      if (Math.abs(targetAngle - angle) > .0001 || Math.abs(targetTilt - tilt) > .0001) dirty = true;
      if (!dirty && options.paused) return;
      dirty = false;
      angle += (targetAngle - angle) * .12; tilt += (targetTilt - tilt) * .12;
      energy.fill(0);
      const tracked: { x: number; y: number; size: number }[] = [];
      clusters.forEach((cluster, index) => {
        const center = project(cluster.x, cluster.y, cluster.z);
        const pulse = .8 + Math.sin(time * .65 + cluster.phase) * .2;
        if (index % 10 === 0 && center.x > 20 && center.x < width - 60 && center.y > 25 && center.y < height - 55) tracked.push({ x: center.x, y: center.y, size: Math.max(12, cluster.radius * center.scale * 3) });
        for (let k = 0; k < 12; k++) {
          const phase = k / 12 * Math.PI * 2 + cluster.phase;
          const radius = cluster.radius * (cluster.ring ? 1.8 : .65);
          const point = project(cluster.x + Math.cos(phase) * radius, cluster.y + Math.sin(phase) * radius, cluster.z + Math.sin(phase * 2 + time * .2) * radius * .6);
          const cx = point.x / width * cols, cy = point.y / height * rows;
          const sigma = Math.max(.7, cluster.radius * point.scale / 12);
          const reach = Math.ceil(sigma * 2.7);
          const brightness = (.22 + .7 * (1 - (point.depth + 1.2) / 2.4)) * pulse;
          for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(rows - 1, cy + reach); y++) {
            for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(cols - 1, cx + reach); x++) {
              const dist = ((x - cx) ** 2 + (y - cy) ** 2) / (sigma * sigma);
              energy[y * cols + x] += Math.exp(-dist * .65) * brightness;
            }
          }
        }
      });
      for (let i = 0; i < energy.length; i++) {
        const e = Math.max(0, Math.min(1, energy[i] * .46));
        const p = i * 4;
        pixels.data[p] = 51 + e * 204; pixels.data[p + 1] = Math.pow(e, 2.3) * 238; pixels.data[p + 2] = 54 + e * 184; pixels.data[p + 3] = 255;
      }
      sctx.putImageData(pixels, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#330036'; ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = !options.scanlines;
      ctx.drawImage(surface, 0, 0, width, height);
      if (options.bloom) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .27; ctx.filter = 'blur(13px)'; ctx.drawImage(surface, 0, 0, width, height); ctx.restore(); }
      if (options.scanlines) {
        ctx.fillStyle = 'rgba(48,0,51,.88)';
        for (let x = 0; x < width; x += 8) ctx.fillRect(x, 0, 5, height);
        // Dim vertical persistence echoes make the bright columns trail like the reference.
        ctx.save(); ctx.globalAlpha = .12; ctx.globalCompositeOperation = 'screen';
        for (let offset = -18; offset <= 18; offset += 12) ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, offset, width, height);
        ctx.restore();
      }
      if (options.tracking) {
        ctx.strokeStyle = 'rgba(244,207,0,.8)'; ctx.lineWidth = .7;
        ctx.beginPath(); tracked.forEach((point, i) => { if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); }); ctx.stroke();
        tracked.forEach(({ x, y, size }) => {
          const left = Math.round(x - size / 2), top = Math.round(y - size / 2);
          ctx.strokeRect(left, top, size, size);
          ctx.fillStyle = '#e8bd00'; ctx.fillRect(left, top - 14, 61, 14);
          ctx.font = '10px monospace'; ctx.fillStyle = '#fffce7'; ctx.fillText(`${Math.round(x)}, ${Math.round(y)}`, left + 3, top - 4);
          ctx.fillStyle = '#ffdb00'; [[left,top],[left+size,top],[left,top+size],[left+size,top+size]].forEach(([a,b]) => ctx.fillRect(a-1,b-1,3,3));
        });
      }
    };
    reset.current = () => { targetAngle = .3; targetTilt = -.12; time = 0; dirty = true; };
    const move = (event: PointerEvent) => { const r = canvas.getBoundingClientRect(); pointerX = event.clientX - r.left; pointerY = event.clientY - r.top; if (drag) { targetAngle += (event.clientX - lastX) * .007; targetTilt = Math.max(-1.2, Math.min(1.2, targetTilt + (event.clientY - lastY) * .007)); } lastX = event.clientX; lastY = event.clientY; dirty = true; };
    const down = (event: PointerEvent) => { drag = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId); };
    const up = () => { drag = false; };
    const leave = () => { pointerX = -9999; pointerY = -9999; dirty = true; };
    const key = (event: KeyboardEvent) => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); targetAngle += event.key === 'ArrowLeft' ? -.15 : event.key === 'ArrowRight' ? .15 : 0; targetTilt = Math.max(-1.2, Math.min(1.2, targetTilt + (event.key === 'ArrowUp' ? -.15 : event.key === 'ArrowDown' ? .15 : 0))); dirty = true; } };
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', leave); canvas.addEventListener('keydown', key);
    // Changes to paused filters still produce a fresh frame.
    const refresh = setInterval(() => { dirty = true; }, 180);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(motionFrame); reduced.removeEventListener('change', syncMotion); cancelAnimationFrame(raf); clearInterval(refresh); observer.disconnect(); intersection.disconnect(); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('keydown', key); };
  }, []);

  return <div className="hero-media particle-field"><canvas ref={canvasRef} tabIndex={0} aria-label="Interactive 3D particle field. Drag or use arrow keys to rotate; move your pointer to displace particles."/><div className="field-toolbar"><span className="field-hint">Drag to rotate</span><div className="field-controls">{(['scanlines','bloom','tracking'] as const).map(key => <Toggle key={key} pressed={settings[key]} onPressedChange={value => setSettings(s => ({ ...s, [key]: value }))} className="field-toggle">{key[0].toUpperCase()+key.slice(1)}</Toggle>)}<Toggle pressed={settings.paused} onPressedChange={value => setSettings(s => ({ ...s, paused: value }))} className="field-toggle" aria-label={settings.paused ? 'Resume animation' : 'Pause animation'}>{settings.paused ? 'Play' : 'Pause'}</Toggle><button className="field-reset" onClick={() => { reset.current(); setSettings({ ...initial, paused: reducedMotion() }); }}>Reset</button></div></div></div>;
}
function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
