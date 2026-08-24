import { useCallback, useEffect, useRef, useState } from "react";

import { radiusForRank } from "../game/geometry";
import type { Guess } from "../game/types";
import {
  Camera,
  OrbitRenderer,
  Viewport,
  ZOOM_REFERENCE,
  fitCamera,
  frameOn,
  screenToBoard,
} from "./renderer";

type Props = {
  xs: Float32Array;
  ys: Float32Array;
  wordCount: number;
  guesses: readonly Guess[];
  focus: Guess | null;
  solved: boolean;
  secretWord: string;
};

const MIN_SCALE = 30;
const MAX_SCALE = 60_000;
const ZOOM_STEP = 1.35;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function OrbitField({
  xs,
  ys,
  wordCount,
  guesses,
  focus,
  solved,
  secretWord,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef(new OrbitRenderer(import.meta.env.BASE_URL || "/"));

  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 400 });
  const targetRef = useRef<Camera | null>(null);
  const viewportRef = useRef<Viewport>({ width: 0, height: 0, dpr: 1 });
  const frameRef = useRef<number | null>(null);
  const draggingRef = useRef<{ pointerId: number; px: number; py: number } | null>(
    null,
  );
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const [zoomLabel, setZoomLabel] = useState(1);

  // The render loop is demand-driven: nothing moves unless the camera does, so
  // an idle board costs nothing.
  const requestDraw = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const canvas = canvasRef.current;
      // Must keep an alpha channel: the dust layer is written with putImageData
      // at partial alpha and composites over the CSS background gradient. On an
      // opaque canvas the alpha is discarded, every word burns to full
      // brightness and the density shading disappears.
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const target = targetRef.current;
      if (target) {
        const camera = cameraRef.current;
        // Exponential ease. Log-space on scale so zooming feels linear.
        const t = 0.22;
        const next: Camera = {
          x: camera.x + (target.x - camera.x) * t,
          y: camera.y + (target.y - camera.y) * t,
          scale: Math.exp(
            Math.log(camera.scale) +
              (Math.log(target.scale) - Math.log(camera.scale)) * t,
          ),
        };
        const settled =
          Math.abs(next.x - target.x) < 1e-4 &&
          Math.abs(next.y - target.y) < 1e-4 &&
          Math.abs(next.scale / target.scale - 1) < 0.002;
        cameraRef.current = settled ? target : next;
        if (settled) targetRef.current = null;
      }

      // Runs whenever motion is allowed, not just once a word has been played:
      // the shooting stars are background and should be there from the start.
      const animate = !prefersReducedMotion();

      rendererRef.current.render(ctx, {
        camera: cameraRef.current,
        viewport: viewportRef.current,
        xs,
        ys,
        wordCount,
        guesses,
        focus,
        solved,
        secretWord,
        timeMs: performance.now(),
        animate,
      });
      setZoomLabel(cameraRef.current.scale);

      // Keep going while the camera is easing, or while markers are hovering.
      // The dust layer is cached between frames, so a hover frame only costs a
      // blit plus a handful of drawImage calls.
      if (targetRef.current || animate) requestDraw();
    });
  }, [focus, guesses, secretWord, solved, wordCount, xs, ys]);

  const moveTo = useCallback(
    (camera: Camera, animate: boolean) => {
      if (animate && !prefersReducedMotion()) {
        targetRef.current = camera;
      } else {
        cameraRef.current = camera;
        targetRef.current = null;
      }
      requestDraw();
    },
    [requestDraw],
  );

  // Size the backing store to the element and the device pixel ratio.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));

      const first = viewportRef.current.width === 0;
      viewportRef.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (first) cameraRef.current = fitCamera(viewportRef.current);
      requestDraw();
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [guesses, focus, solved, requestDraw]);

  useEffect(() => {
    // Markers arrive over the network after the first paint; repaint when one
    // lands so the fallback dots upgrade to characters.
    rendererRef.current.markers.setReadyCallback(requestDraw);

    // A hidden tab should not run an animation loop. requestAnimationFrame is
    // already throttled when backgrounded, but this also stops the loop from
    // holding a pending frame across a long absence.
    const onVisibility = () => {
      if (!document.hidden) requestDraw();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [requestDraw]);

  // Frame the newest word. Without this the interesting part of the board is
  // usually a few hundred pixels off screen at whatever zoom you left it at.
  useEffect(() => {
    if (!focus) return;
    const viewport = viewportRef.current;
    if (viewport.width === 0) return;
    const radius = radiusForRank(focus.rank, wordCount);
    moveTo(frameOn(radius, viewport, cameraRef.current), true);
  }, [focus, moveTo, wordCount]);

  const zoomAbout = useCallback(
    (px: number, py: number, factor: number) => {
      const camera = cameraRef.current;
      const viewport = viewportRef.current;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camera.scale * factor));
      if (scale === camera.scale) return;

      // Keep the board point under the cursor pinned while the scale changes.
      const anchor = screenToBoard(px, py, camera, viewport);
      const next: Camera = {
        scale,
        x: anchor.x - (px - viewport.width / 2) / scale,
        y: anchor.y + (py - viewport.height / 2) / scale,
      };
      moveTo(next, false);
    },
    [moveTo],
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const factor = Math.pow(ZOOM_STEP, -event.deltaY / 120);
      zoomAbout(
        event.clientX - rect.left,
        event.clientY - rect.top,
        Math.min(4, Math.max(0.25, factor)),
      );
    },
    [zoomAbout],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (pointersRef.current.size === 1) {
        draggingRef.current = {
          pointerId: event.pointerId,
          px: event.clientX,
          py: event.clientY,
        };
      } else if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        pinchRef.current = {
          distance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
          scale: cameraRef.current.scale,
        };
        draggingRef.current = null;
      }
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      const pinch = pinchRef.current;
      if (pinch && pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (distance > 0 && pinch.distance > 0) {
          const rect = event.currentTarget.getBoundingClientRect();
          const factor =
            (pinch.scale * (distance / pinch.distance)) / cameraRef.current.scale;
          zoomAbout(
            (a!.x + b!.x) / 2 - rect.left,
            (a!.y + b!.y) / 2 - rect.top,
            factor,
          );
        }
        return;
      }

      const drag = draggingRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const camera = cameraRef.current;
      const dx = (event.clientX - drag.px) / camera.scale;
      const dy = (event.clientY - drag.py) / camera.scale;
      drag.px = event.clientX;
      drag.py = event.clientY;
      moveTo({ ...camera, x: camera.x - dx, y: camera.y + dy }, false);
    },
    [moveTo, zoomAbout],
  );

  const endPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (draggingRef.current?.pointerId === event.pointerId) {
      draggingRef.current = null;
    }
  }, []);

  const recentre = useCallback(() => {
    const best = [...guesses].sort((a, b) => a.rank - b.rank)[0];
    const viewport = viewportRef.current;
    if (best) {
      moveTo(
        frameOn(radiusForRank(best.rank, wordCount), viewport, cameraRef.current),
        true,
      );
    } else {
      moveTo(fitCamera(viewport), true);
    }
  }, [guesses, moveTo, wordCount]);

  // Keyboard access to the board, so zoom and pan are not mouse-only.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      const viewport = viewportRef.current;
      const camera = cameraRef.current;
      const nudge = 60 / camera.scale;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => moveTo({ ...camera, x: camera.x - nudge }, false),
        ArrowRight: () => moveTo({ ...camera, x: camera.x + nudge }, false),
        ArrowUp: () => moveTo({ ...camera, y: camera.y + nudge }, false),
        ArrowDown: () => moveTo({ ...camera, y: camera.y - nudge }, false),
        "+": () => zoomAbout(viewport.width / 2, viewport.height / 2, ZOOM_STEP),
        "=": () => zoomAbout(viewport.width / 2, viewport.height / 2, ZOOM_STEP),
        "-": () => zoomAbout(viewport.width / 2, viewport.height / 2, 1 / ZOOM_STEP),
        "0": recentre,
      };
      const action = keys[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    },
    [moveTo, recentre, zoomAbout],
  );

  return (
    <div className="orbit" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="orbit-canvas"
        tabIndex={0}
        role="img"
        aria-label={
          solved
            ? `Board solved. The secret word ${secretWord} is at the centre.`
            : `Word map. ${guesses.length} words played. The secret word is at the centre. Use arrow keys to pan, plus and minus to zoom, zero to recentre.`
        }
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onKeyDown={onKeyDown}
      />
      <div className="orbit-controls">
        <button type="button" onClick={recentre} title="Recentre (0)">
          Recentre
        </button>
        <button
          type="button"
          onClick={() =>
            zoomAbout(
              viewportRef.current.width / 2,
              viewportRef.current.height / 2,
              ZOOM_STEP,
            )
          }
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() =>
            zoomAbout(
              viewportRef.current.width / 2,
              viewportRef.current.height / 2,
              1 / ZOOM_STEP,
            )
          }
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          &minus;
        </button>
        <span className="orbit-zoom" aria-hidden="true">
          {(zoomLabel / ZOOM_REFERENCE).toFixed(1)}&times;
        </span>
      </div>
    </div>
  );
}
