'use client';

/**
 * HeroScene — WebGL particle field that coalesces from a scattered cloud into the
 * silhouette of a CV (document header + text lines), lit as green "generation
 * energy". Slow float + drift + pointer parallax. Client-only (no SSR); the parent
 * renders a static fallback on mobile / reduced-motion.
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const ACTION = new THREE.Color('#38A169');
const ACTION_LIGHT = new THREE.Color('#68D391');

/** Soft radial sprite so each particle reads as a glowing dot, not a hard square. */
function useSpriteTexture() {
  return useMemo(() => {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, []);
}

/** Build the target positions that spell out a CV document, plus an ambient field. */
function useCVGeometry(count: number) {
  return useMemo(() => {
    const targets: number[] = [];
    const colors: number[] = [];
    const seeds: number[] = [];

    const W = 3.0; // document width
    const H = 4.1; // document height (A4-ish)
    const x0 = -W / 2;
    const y0 = H / 2;

    const pushPoint = (x: number, y: number, z: number, c: THREE.Color) => {
      targets.push(x, y, z);
      colors.push(c.r, c.g, c.b);
      seeds.push(Math.random());
    };

    // Header block (top): a denser filled band = the name/title area.
    const headerRows = 3;
    for (let r = 0; r < headerRows; r++) {
      const y = y0 - 0.35 - r * 0.16;
      const len = r === 0 ? W * 0.62 : W * 0.4;
      const n = Math.floor(len * 42);
      for (let i = 0; i < n; i++) {
        const x = x0 + 0.3 + (i / n) * len;
        pushPoint(x, y, (Math.random() - 0.5) * 0.06, ACTION_LIGHT);
      }
    }

    // Body text lines: rows of particles of varying length (paragraphs).
    const lineYStart = y0 - 1.15;
    const lines = 13;
    for (let l = 0; l < lines; l++) {
      const y = lineYStart - l * 0.24;
      if (y < -H / 2 + 0.3) break;
      // Occasional short "section heading" line, else full paragraph line.
      const isHeading = l % 4 === 0;
      const len = isHeading ? W * 0.34 : W * (0.72 + Math.random() * 0.16);
      const n = Math.floor(len * 34);
      const col = isHeading ? ACTION : ACTION.clone().lerp(new THREE.Color('#CBD5E0'), 0.35);
      for (let i = 0; i < n; i++) {
        const x = x0 + 0.3 + (i / n) * len;
        pushPoint(x, y, (Math.random() - 0.5) * 0.05, col);
      }
    }

    // Document outline (subtle frame) so the silhouette reads as a page.
    const perim = 260;
    for (let i = 0; i < perim; i++) {
      const t = i / perim;
      let x: number, y: number;
      if (t < 0.25) { x = x0 + (t / 0.25) * W; y = y0; }
      else if (t < 0.5) { x = x0 + W; y = y0 - ((t - 0.25) / 0.25) * H; }
      else if (t < 0.75) { x = x0 + W - ((t - 0.5) / 0.25) * W; y = y0 - H; }
      else { x = x0; y = y0 - H + ((t - 0.75) / 0.25) * H; }
      pushPoint(x, y, (Math.random() - 0.5) * 0.04, ACTION.clone().lerp(new THREE.Color('#2D3748'), 0.2));
    }

    // Ambient energy field: sparse particles floating around the document.
    const documentCount = targets.length / 3;
    const ambient = Math.max(0, count - documentCount);
    for (let i = 0; i < ambient; i++) {
      const r = 3.2 + Math.random() * 4.5;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 9;
      pushPoint(
        Math.cos(theta) * r,
        y,
        Math.sin(theta) * r - 1.5,
        ACTION.clone().lerp(new THREE.Color('#68D391'), Math.random()),
      );
    }

    const n = targets.length / 3;
    // Scattered start positions (explode outward from a sphere).
    const scatter: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = 6 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      scatter.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi) - 2,
      );
    }

    return {
      count: n,
      targets: new Float32Array(targets),
      scatter: new Float32Array(scatter),
      colors: new Float32Array(colors),
      seeds: new Float32Array(seeds),
    };
  }, [count]);
}

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}

function Particles({ reduced }: { reduced: boolean }) {
  const geo = useCVGeometry(4200);
  const sprite = useSpriteTexture();
  const pointsRef = useRef<THREE.Points>(null);
  const groupRef = useRef<THREE.Group>(null);
  const positions = useMemo(() => new Float32Array(geo.targets), [geo]);
  const start = useRef<number | null>(null);
  const { pointer } = useThree();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (start.current === null) start.current = t;
    const elapsed = t - start.current;
    // Assembly: scatter -> CV over ~2.4s (instant when reduced motion).
    const p = reduced ? 1 : easeOutCubic(Math.min(elapsed / 2.4, 1));

    const pos = positions;
    const { targets, scatter, seeds, count } = geo;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const tx = targets[i3], ty = targets[i3 + 1], tz = targets[i3 + 2];
      const sx = scatter[i3], sy = scatter[i3 + 1], sz = scatter[i3 + 2];
      const float = reduced ? 0 : Math.sin(t * 0.7 + seeds[i] * 6.283) * 0.045;
      pos[i3] = sx + (tx - sx) * p;
      pos[i3 + 1] = sy + (ty - sy) * p + float * p;
      pos[i3 + 2] = sz + (tz - sz) * p + (reduced ? 0 : Math.cos(t * 0.5 + seeds[i] * 6.283) * 0.05 * p);
    }
    const attr = pointsRef.current?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (attr) {
      attr.needsUpdate = true;
    }

    if (groupRef.current) {
      const targetRotY = reduced ? 0 : Math.sin(t * 0.12) * 0.16 + pointer.x * 0.25;
      const targetRotX = reduced ? 0 : -pointer.y * 0.12;
      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * 0.04;
      groupRef.current.rotation.x += (targetRotX - groupRef.current.rotation.x) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[geo.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.055}
          map={sprite}
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

export default function HeroScene({ reduced = false }: { reduced?: boolean }) {
  // Guard against WebGL failures — fall back silently (parent shows a gradient).
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    try {
      const c = document.createElement('canvas');
      if (!c.getContext('webgl2') && !c.getContext('webgl')) setFailed(true);
    } catch {
      setFailed(true);
    }
  }, []);
  if (failed) return null;

  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
    >
      <Particles reduced={reduced} />
    </Canvas>
  );
}
