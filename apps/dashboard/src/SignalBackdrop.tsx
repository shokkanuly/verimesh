import { useEffect, useRef } from 'react';

type SignalBackdropProps = { variant?: 'hero' | 'workspace'; paused?: boolean };
const tones = ['47, 47, 255', '19, 200, 173', '255, 111, 97'];

export function SignalBackdrop({ variant = 'hero', paused = false }: SignalBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const surface = canvas.parentElement!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let lastPaint = 0;
    let elapsed = 0;
    let pointerX = 0;
    let pointerY = 0;
    let offsetX = 0;
    let offsetY = 0;

    const draw = () => {
      if (!width || !height) return;
      context.clearRect(0, 0, width, height);
      const hero = variant === 'hero';
      const compact = width < 641;
      const time = reduced.matches ? 0 : elapsed / 1000;
      const strength = hero ? 1 : 0.38;
      const zone = Math.min(height, hero ? 850 : 650);
      const spacing = compact ? 64 : 88;

      context.save();
      context.translate(offsetX, offsetY);
      // Registration marks and routed verdict packets share the same geometric grid.
      context.lineWidth = 0.7;
      context.strokeStyle = `rgba(87, 115, 113, ${0.08 * strength})`;
      for (let x = 24; x < width; x += spacing) {
        for (let y = 32; y < zone; y += spacing) {
          if (hero && x > width * 0.27 && x < width * 0.73 && y < 370) continue;
          context.beginPath();
          context.moveTo(x - 3, y); context.lineTo(x + 3, y);
          context.moveTo(x, y - 3); context.lineTo(x, y + 3);
          context.stroke();
        }
      }

      const fold = (x: number, y: number, size: number, tone: string, phase: number) => {
        context.save();
        context.translate(x + Math.sin(time * 0.18 + phase) * 9, y + Math.cos(time * 0.22 + phase) * 12);
        context.rotate(phase * 0.12 + Math.sin(time * 0.12 + phase) * 0.06);
        for (let layer = 0; layer < 9; layer++) {
          const inset = layer * size * 0.041;
          const shift = Math.sin(time * 0.25 + layer * 0.22 + phase) * size * 0.045;
          context.beginPath();
          context.moveTo(-size * 0.72 + inset, -size * 0.28 + shift);
          context.lineTo(size * 0.16, -size * 0.66 + inset);
          context.lineTo(size * 0.78 - inset, -size * 0.06 + shift);
          context.lineTo(size * 0.08, size * 0.69 - inset);
          context.lineTo(-size * 0.72 + inset, -size * 0.28 + shift);
          context.strokeStyle = `rgba(${tone}, ${(0.31 - layer * 0.019) * strength})`;
          context.lineWidth = layer === 0 ? 1.3 : 0.8;
          context.stroke();
          if (layer === 0) {
            context.fillStyle = `rgba(${tone}, ${0.042 * strength})`;
            context.fill();
            context.beginPath();
            context.moveTo(size * 0.16, -size * 0.66);
            context.lineTo(size * 0.08, size * 0.69);
            context.lineTo(-size * 0.72, -size * 0.28 + shift);
            context.closePath();
            context.fillStyle = `rgba(${tone}, ${0.055 * strength})`;
            context.fill();
          }
        }
        context.restore();
      };

      const size = compact ? 130 : Math.min(250, width * 0.18);
      fold(width * (compact ? -0.07 : 0.095), compact ? 155 : 168, size, tones[0], 1);
      fold(width * (compact ? 1.05 : 0.91), compact ? 330 : 280, size * 1.17, tones[1], 3);
      if (!compact) fold(width * 0.15, Math.min(zone - 110, 665), size * 0.64, tones[2], 5);

      const pathCount = compact ? 3 : 6;
      for (let i = 0; i < pathCount; i++) {
        const right = i % 2 === 1;
        const direction = right ? -1 : 1;
        const startX = right ? width + 20 : -20;
        const startY = 68 + i * (compact ? 118 : 108);
        const length = compact ? width * 0.26 : width * 0.24;
        const endX = startX + direction * length;
        const bendY = startY + (i % 3 - 1) * 46;
        const tone = tones[i % tones.length];
        context.strokeStyle = `rgba(${tone}, ${0.22 * strength})`;
        context.lineWidth = 0.8;
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX - direction * 44, startY);
        context.lineTo(endX, bendY);
        context.lineTo(endX + direction * 36, bendY);
        context.stroke();
        const progress = (time * 0.055 + i * 0.19) % 1;
        const packetX = startX + direction * (length - 44) * progress;
        context.fillStyle = `rgba(${tone}, ${0.65 * strength})`;
        context.fillRect(packetX - 2, startY - 2, 4, 4);
        context.strokeStyle = `rgba(${tone}, ${0.45 * strength})`;
        context.strokeRect(endX + direction * 36 - 3, bendY - 3, 6, 6);
      }

      if (hero && !compact) {
        for (let i = 0; i < 7; i++) {
          const x = i % 2 ? width - 46 : 40;
          const y = 108 + i * 91;
          context.fillStyle = `rgba(78, 104, 99, ${0.22 * strength})`;
          context.font = '9px monospace';
          context.fillText((i + 1).toString().padStart(2, '0'), x, y);
        }
      }
      context.restore();
    };

    const tick = (now: number) => {
      frame = 0;
      if (document.hidden || !visible || reduced.matches || paused) return;
      if (now - lastPaint >= 1000 / 30) {
        elapsed += Math.min(now - lastPaint, 50);
        lastPaint = now;
        offsetX += (pointerX - offsetX) * 0.07;
        offsetY += (pointerY - offsetY) * 0.07;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    const synchronize = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reduced.matches) { offsetX = 0; offsetY = 0; }
      draw();
      if (!document.hidden && visible && !reduced.matches && !paused) {
        lastPaint = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const resize = () => {
      width = surface.clientWidth;
      height = surface.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      synchronize();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || reduced.matches) return;
      pointerX = (event.clientX / window.innerWidth - 0.5) * 16;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 12;
    };
    const leave = () => { pointerX = 0; pointerY = 0; };
    const resizeObserver = new ResizeObserver(resize);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; synchronize(); });
    resizeObserver.observe(surface);
    observer.observe(surface);
    reduced.addEventListener('change', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect(); observer.disconnect();
      reduced.removeEventListener('change', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [variant, paused]);

  return <div className={`signal-backdrop signal-backdrop-${variant}`} aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
