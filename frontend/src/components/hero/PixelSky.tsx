import React, { useRef, useEffect } from 'react';
import { fbm } from './noise';

export interface PixelSkyPalette {
  sky: string;
  skyLight: string;
  white: string;
}

export interface PixelSkyProps {
  cell?: number;
  palette?: PixelSkyPalette;
  speed?: number;
  holeRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  dissolveOnScroll?: boolean;
}

const DEFAULT_PALETTE: PixelSkyPalette = {
  sky: '#00A8FF',
  skyLight: '#7BCBFF',
  white: '#FFFFFF',
};

/**
 * Creates a 4x4 canvas pattern representing a crisp 2px checkerboard dither
 * between colorA and colorB.
 */
function createCheckerboardPattern(
  colorA: string,
  colorB: string
): HTMLCanvasElement {
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = 4;
  patternCanvas.height = 4;
  const pctx = patternCanvas.getContext('2d');
  if (pctx) {
    pctx.imageSmoothingEnabled = false;
    // 2x2 blocks:
    // (0,0) to (2,2) is colorA
    pctx.fillStyle = colorA;
    pctx.fillRect(0, 0, 2, 2);
    pctx.fillRect(2, 2, 2, 2);
    // other blocks are colorB
    pctx.fillStyle = colorB;
    pctx.fillRect(2, 0, 2, 2);
    pctx.fillRect(0, 2, 2, 2);
  }
  return patternCanvas;
}

export const PixelSky: React.FC<PixelSkyProps> = ({
  cell,
  palette = DEFAULT_PALETTE,
  speed = 0.00004,
  holeRef,
  className = '',
  dissolveOnScroll = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const prefersReducedMotion = mediaQuery.matches;

    // Create dither patterns
    const ditherWhiteLight = ctx.createPattern(
      createCheckerboardPattern(palette.white, palette.skyLight),
      'repeat'
    );
    const ditherLightSky = ctx.createPattern(
      createCheckerboardPattern(palette.skyLight, palette.sky),
      'repeat'
    );

    let animationFrameId: number;
    let lastTime = performance.now();
    let isVisible = true;
    let scrollY = window.scrollY;

    // Handle scroll for dissolving cloud
    const handleScroll = () => {
      scrollY = window.scrollY;
    };
    if (dissolveOnScroll) {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Pause when offscreen
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    observer.observe(canvas);

    // Pause when tab is hidden
    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Resize handler
    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let actualCell = cell || 24;

    const handleResize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);

      // Cell size: ~width / 58 (around 24px on 1440px desktop, ~14px on mobile)
      actualCell = cell || Math.max(13, Math.round(width / 58));

      // Handle high-dpi devicePixelRatio while keeping low-res pixel styling
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = false;

      cols = Math.ceil(width / actualCell);
      rows = Math.ceil(height / actualCell);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Time progression
    let t = 0;

    const render = (now: number) => {
      if (!isVisible && !prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Throttle to ~30 FPS for optimal performance and battery efficiency
      const delta = now - lastTime;
      if (delta < 32 && !prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      lastTime = now;

      if (!prefersReducedMotion) {
        t += delta * speed;
      }

      // Target bounding box for cloud hole
      let cx = width / 2;
      let cy = height * 0.46;
      let hw = width * 0.32;
      let hh = height * 0.28;
      let radius = Math.min(hw, hh) * 0.45;

      if (holeRef?.current) {
        const hRect = holeRef.current.getBoundingClientRect();
        const cRect = canvas.getBoundingClientRect();
        cx = hRect.left - cRect.left + hRect.width / 2;
        cy = hRect.top - cRect.top + hRect.height / 2;
        hw = hRect.width / 2 + 48; // padding around text
        hh = hRect.height / 2 + 36;
        radius = Math.min(hw, hh) * 0.4;
      }

      // Scroll expansion: expanding white mask as user scrolls
      const scrollMask = dissolveOnScroll ? Math.max(0, scrollY * 1.5) : 0;
      const effectiveHw = hw + scrollMask;
      const effectiveHh = hh + scrollMask * 0.8;

      // Group draw operations by band to minimize context state switching
      const bands: [number, number][][] = [[], [], [], [], []];

      // Per-cell field calculation
      for (let r = 0; r < rows; r++) {
        const y = r * actualCell + actualCell / 2;
        for (let c = 0; c < cols; c++) {
          const x = c * actualCell + actualCell / 2;

          // 1. Rounded rectangle signed distance field
          const dx = Math.abs(x - cx) - (effectiveHw - radius);
          const dy = Math.abs(y - cy) - (effectiveHh - radius);
          const distOuter = Math.sqrt(
            Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2
          );
          const distInner = Math.min(Math.max(dx, dy), 0);
          const sdfDist = distOuter + distInner - radius;

          // 2. Add ragged noise to perimeter for organic cloud edges
          const edgeNoise =
            (fbm(c * 0.1, r * 0.1, t * 0.6, 3) - 0.5) * 140;
          const raggedDist = sdfDist - edgeNoise;

          let band = 0;

          if (raggedDist <= 0) {
            // Inside the white cloud cutout
            band = 0;
          } else {
            // Transition zone outside cutout
            const transitionWidth = 140;
            const blend = Math.min(1, Math.max(0, raggedDist / transitionWidth));

            // Background FBM noise (denser at top/middle)
            const bgNoise = fbm(c * 0.05, r * 0.05, t, 4);
            const verticalBias = Math.sin((r / rows) * Math.PI) * 0.15;
            const F = blend * (0.2 + 0.8 * (bgNoise + verticalBias));

            if (F < 0.16) {
              band = 0; // Pure white
            } else if (F < 0.36) {
              band = 1; // Dither White <-> Sky-Light
            } else if (F < 0.58) {
              band = 2; // Solid Sky-Light
            } else if (F < 0.78) {
              band = 3; // Dither Sky-Light <-> Sky
            } else {
              band = 4; // Solid Sky
            }
          }

          bands[band].push([c * actualCell, r * actualCell]);
        }
      }

      // Draw Band 0: Solid White
      ctx.fillStyle = palette.white;
      for (let i = 0; i < bands[0].length; i++) {
        const [bx, by] = bands[0][i];
        ctx.fillRect(bx, by, actualCell, actualCell);
      }

      // Draw Band 1: Dither (White <-> Sky-Light)
      if (ditherWhiteLight) {
        ctx.fillStyle = ditherWhiteLight;
        for (let i = 0; i < bands[1].length; i++) {
          const [bx, by] = bands[1][i];
          ctx.fillRect(bx, by, actualCell, actualCell);
        }
      }

      // Draw Band 2: Solid Sky-Light
      ctx.fillStyle = palette.skyLight;
      for (let i = 0; i < bands[2].length; i++) {
        const [bx, by] = bands[2][i];
        ctx.fillRect(bx, by, actualCell, actualCell);
      }

      // Draw Band 3: Dither (Sky-Light <-> Sky)
      if (ditherLightSky) {
        ctx.fillStyle = ditherLightSky;
        for (let i = 0; i < bands[3].length; i++) {
          const [bx, by] = bands[3][i];
          ctx.fillRect(bx, by, actualCell, actualCell);
        }
      }

      // Draw Band 4: Solid Sky
      ctx.fillStyle = palette.sky;
      for (let i = 0; i < bands[4].length; i++) {
        const [bx, by] = bands[4][i];
        ctx.fillRect(bx, by, actualCell, actualCell);
      }

      // If prefers-reduced-motion is enabled, one frame is enough
      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      if (dissolveOnScroll) {
        window.removeEventListener('scroll', handleScroll);
      }
    };
  }, [cell, palette, speed, holeRef, dissolveOnScroll]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden bg-[#7BCBFF] ${className}`}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};
