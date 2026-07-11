'use client';

/**
 * ForgeSequence — a scroll-pinned CSS-3D cinematic (no WebGL, so it renders
 * everywhere and stays verifiable): fragments of a career (icon/letter cards) drift
 * in real 3D space, funnel into a spinning green crystal-cube, and a CV card emerges
 * turning on itself like a stele. Placement is scroll-driven; the box and CV keep a
 * continuous self-rotation (CSS keyframes on an inner wrapper). Degrades to a static
 * illustration on mobile / reduced motion.
 */
import { useEffect, useRef, useState } from 'react';
import {
  useScroll,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
  motion,
} from 'motion/react';
import {
  Briefcase,
  GraduationCap,
  Award,
  Code2,
  Star,
  FileText,
  ArrowDown,
} from 'lucide-react';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Frag =
  | { kind: 'icon'; Icon: typeof Briefcase; x: number; y: number; z: number; rot: number }
  | { kind: 'letter'; char: string; x: number; y: number; z: number; rot: number };

const ICONS = [Briefcase, GraduationCap, Award, Code2, Star];
const LETTERS = ['C', 'V', '{ }', '@', '#', '★'];

// Deterministic scatter (golden-angle) — no Math.random, so SSR and client agree.
const FRAGMENTS: Frag[] = Array.from({ length: 16 }, (_, i) => {
  const a = i * 2.3999632;
  const r = 200 + (i % 5) * 46;
  const x = Math.cos(a) * r;
  const y = Math.sin(a) * r * 0.62 + ((i % 3) - 1) * 46;
  const z = ((i % 7) - 3) * 64;
  const rot = (i * 53) % 360;
  return i % 3 === 0
    ? { kind: 'letter', char: LETTERS[i % LETTERS.length], x, y, z, rot }
    : { kind: 'icon', Icon: ICONS[i % ICONS.length], x, y, z, rot };
});

function useIsCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px), (pointer: coarse)');
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return compact;
}

function ForgeFallback() {
  const items = [
    { icon: Briefcase, label: 'Expériences' },
    { icon: GraduationCap, label: 'Formations' },
    { icon: Award, label: 'Certifications' },
    { icon: Code2, label: 'Compétences' },
  ];
  return (
    <section className="bg-[#0E1219] px-6 py-24 text-center">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          Tes fragments de carrière, fondus en un CV.
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {items.map((it) => (
            <span
              key={it.label}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80"
            >
              <it.icon className="h-4 w-4 text-action" />
              {it.label}
            </span>
          ))}
        </div>
        <ArrowDown className="mx-auto mt-8 h-6 w-6 text-action" />
        <div className="mx-auto mt-8 flex h-40 w-28 items-center justify-center rounded-xl border border-action/40 bg-white/[0.06] shadow-[0_0_60px_rgba(56,161,105,0.4)]">
          <FileText className="h-10 w-10 text-action" />
        </div>
        <p className="mt-8 text-lg text-white/60">
          L&apos;IA assemble ton parcours en un CV taillé pour l&apos;offre.
        </p>
      </div>
    </section>
  );
}

/** A CSS 3D cube (the magic crystal) that spins continuously. */
function MagicCube() {
  const faces = [
    'rotateY(0deg) translateZ(75px)',
    'rotateY(90deg) translateZ(75px)',
    'rotateY(180deg) translateZ(75px)',
    'rotateY(270deg) translateZ(75px)',
    'rotateX(90deg) translateZ(75px)',
    'rotateX(-90deg) translateZ(75px)',
  ];
  return (
    <div
      className="forge-spin-box relative h-[150px] w-[150px]"
      style={{ transformStyle: 'preserve-3d', animation: 'forge-spin-box 9s linear infinite' }}
    >
      {faces.map((t, i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-sm border border-action/60"
          style={{
            transform: t,
            background:
              'linear-gradient(135deg, rgba(56,161,105,0.22), rgba(56,161,105,0.06))',
            boxShadow: 'inset 0 0 30px rgba(104,211,145,0.35)',
            backfaceVisibility: 'visible',
          }}
        />
      ))}
    </div>
  );
}

/** The emerging CV, turning on itself like a stele (front + back faces). */
function CVStele() {
  const lines = [0.9, 0.6, 0.75, 0.5];
  const face = (
    <div className="absolute inset-0 overflow-hidden rounded-lg bg-[#F7FAFC] p-4 shadow-lg">
      <div className="text-[10px] font-bold text-primary">Ton Nom</div>
      <div className="mt-1 h-1 w-12 rounded bg-action" />
      {lines.map((w, i) => (
        <div key={i} className="mt-3">
          <div className="h-1.5 w-10 rounded bg-action/80" />
          <div className="mt-1.5 h-1 rounded bg-gray-300" style={{ width: `${w * 100}%` }} />
          <div className="mt-1 h-1 rounded bg-gray-200" style={{ width: `${w * 80}%` }} />
        </div>
      ))}
    </div>
  );
  return (
    <div
      className="forge-spin-y relative h-[280px] w-[200px]"
      style={{
        transformStyle: 'preserve-3d',
        animation: 'forge-spin-y 8s linear infinite',
        filter: 'drop-shadow(0 0 40px rgba(56,161,105,0.55))',
      }}
    >
      <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
        {face}
      </div>
      <div
        className="absolute inset-0"
        style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
      >
        <div className="absolute inset-0 rounded-lg border border-action/40 bg-[#E8EEF3]" />
      </div>
    </div>
  );
}

export default function ForgeSequence() {
  const reduce = useReducedMotion();
  const compact = useIsCompact();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', setP);
  // The 3D stage is scroll-driven and client-only; rendering it after mount avoids
  // an SSR/client hydration mismatch on the computed inline transforms.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Captions
  const o1 = useTransform(scrollYProgress, [0, 0.05, 0.24, 0.3], [0, 1, 1, 0]);
  const o2 = useTransform(scrollYProgress, [0.34, 0.4, 0.54, 0.6], [0, 1, 1, 0]);
  const o3 = useTransform(scrollYProgress, [0.66, 0.74, 1], [0, 1, 1]);
  const hintO = useTransform(scrollYProgress, [0, 0.06, 0.12], [1, 1, 0]);

  if (compact || reduce) return <ForgeFallback />;

  const pull = smooth(0.12, 0.55, p); // fragments funnel in
  const boxScale = smooth(0.05, 0.24, p) * (1 - smooth(0.6, 0.74, p));
  const boxOpacity = smooth(0.05, 0.2, p) * (1 - smooth(0.62, 0.72, p));
  const cvScale = smooth(0.6, 0.82, p);
  const cvOpacity = smooth(0.6, 0.72, p);

  return (
    <section ref={ref} className="relative h-[320vh] bg-[#0E1219]">
      <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(55% 55% at 50% 48%, rgba(56,161,105,0.18), transparent 72%)',
          }}
        />

        {/* 3D stage (client-only) */}
        {mounted && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ perspective: '1300px' }}
          aria-hidden="true"
        >
          <div
            className="relative"
            style={{ transformStyle: 'preserve-3d', transform: 'rotateX(8deg)' }}
          >
            {/* Fragments */}
            {FRAGMENTS.map((f, i) => {
              const k = 1 - pull;
              const style: React.CSSProperties = {
                transform: `translate3d(${f.x * k}px, ${f.y * k}px, ${f.z * k}px) rotateY(${f.rot + pull * 220}deg) scale(${Math.max(k, 0.001)})`,
                opacity: k,
              };
              return (
                <div key={i} className="absolute left-0 top-0" style={style}>
                  <div className="-translate-x-1/2 -translate-y-1/2">
                    {f.kind === 'icon' ? (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-action/40 bg-[#141C27] text-action shadow-[0_0_20px_rgba(56,161,105,0.25)]">
                        <f.Icon className="h-6 w-6" />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-action/30 bg-[#141C27] text-lg font-bold text-[#68D391] shadow-[0_0_20px_rgba(56,161,105,0.25)]">
                        {f.char}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Magic cube */}
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) scale(${Math.max(boxScale, 0.001)})`,
                opacity: boxOpacity,
              }}
            >
              <MagicCube />
            </div>

            {/* CV stele */}
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) translateY(${(1 - cvScale) * 30}px) scale(${Math.max(cvScale, 0.001)})`,
                opacity: cvOpacity,
              }}
            >
              <CVStele />
            </div>
          </div>
        </div>
        )}

        {/* Captions */}
        <div className="pointer-events-none relative z-10 mx-auto max-w-3xl px-6 text-center">
          <motion.h2
            style={{ opacity: o1 }}
            className="text-balance text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl"
          >
            Tes expériences, tes projets,
            <br className="hidden sm:block" /> tes compétences.
          </motion.h2>
          <motion.p
            style={{ opacity: o2 }}
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-3xl font-semibold text-white/90 md:text-5xl"
          >
            L&apos;IA les fond dans la forge…
          </motion.p>
          <motion.h2
            style={{ opacity: o3 }}
            className="absolute inset-x-0 top-[130%] text-balance text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl"
          >
            …et en ressort un CV{' '}
            <span className="text-action">qui te ressemble.</span>
          </motion.h2>
        </div>

        <motion.div
          style={{ opacity: hintO }}
          className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-white/50"
        >
          <span className="text-xs uppercase tracking-widest">Défile</span>
          <ArrowDown className="h-5 w-5 animate-bounce" />
        </motion.div>
      </div>
    </section>
  );
}
