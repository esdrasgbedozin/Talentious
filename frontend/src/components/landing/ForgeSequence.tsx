'use client';

/**
 * ForgeSequence — a scroll-pinned CSS-3D cinematic. Career fragments funnel into a
 * glass crystal that forges them, and a paper CV emerges, turning on itself.
 *
 * Perf: the whole animation is driven by MotionValues (useTransform) applied
 * straight to the DOM — NO React re-render per scroll frame. Driving a heavy scene
 * via setState-on-scroll drops frames and makes objects "pop" late; this doesn't.
 *
 * Realism: single light source (top-left), directional shading, contact + cast
 * shadows, distinct materials (matte tokens / green glass / warm paper with grain,
 * sheen, thickness), atmosphere (sparks, god rays, vignette, film grain).
 * Degrades to a static illustration on mobile / reduced motion.
 *
 * CSS-3D gotcha respected: `filter`/`opacity<1` flatten `preserve-3d`, so those
 * live on separate layers from the 3D transforms.
 */
import { useEffect, useRef, useState } from 'react';
import {
  useScroll,
  useTransform,
  useReducedMotion,
  motion,
  type MotionValue,
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
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

type Frag =
  | { kind: 'icon'; Icon: typeof Briefcase; x: number; y: number; z: number; rot: number }
  | { kind: 'letter'; char: string; x: number; y: number; z: number; rot: number };

const ICONS = [Briefcase, GraduationCap, Award, Code2, Star];
const LETTERS = ['C', 'V', '{ }', '@', '#', '★'];

const FRAGMENTS: Frag[] = Array.from({ length: 16 }, (_, i) => {
  const a = i * 2.3999632;
  const r = 210 + (i % 5) * 48;
  const x = Math.cos(a) * r;
  const y = Math.sin(a) * r * 0.62 + ((i % 3) - 1) * 46;
  const z = ((i % 7) - 3) * 66;
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

/* ----------------------------- Glass crystal box --------------------------- */
const CUBE_FACES = [
  { t: 'rotateY(0deg) translateZ(78px)', b: 0.92 },
  { t: 'rotateY(90deg) translateZ(78px)', b: 0.6 },
  { t: 'rotateY(180deg) translateZ(78px)', b: 0.42 },
  { t: 'rotateY(270deg) translateZ(78px)', b: 0.74 },
  { t: 'rotateX(90deg) translateZ(78px)', b: 1.0 },
  { t: 'rotateX(-90deg) translateZ(78px)', b: 0.28 },
];

function GlassCube() {
  return (
    <div
      className="relative h-[156px] w-[156px]"
      style={{ transformStyle: 'preserve-3d', animation: 'forge-spin-box 11s linear infinite' }}
    >
      {CUBE_FACES.map((f, i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-[3px]"
          style={{
            transform: f.t,
            background: `linear-gradient(152deg, rgba(154,240,190,${0.34 * f.b}) 0%, rgba(56,161,105,${0.16 * f.b}) 45%, rgba(20,70,45,${0.1 * f.b}) 100%)`,
            border: `1px solid rgba(154,240,190,${0.5 * f.b})`,
            boxShadow: `inset 2px 2px 6px rgba(180,255,210,${0.4 * f.b}), inset -3px -4px 10px rgba(0,20,10,0.5)`,
            backfaceVisibility: 'visible',
          }}
        />
      ))}
      <div className="absolute inset-0" style={{ transform: 'scale(0.78)', transformStyle: 'preserve-3d' }}>
        {CUBE_FACES.map((f, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-[2px]"
            style={{
              transform: f.t.replace('78px', '60px'),
              background: `rgba(20,60,40,${0.22 * f.b})`,
              border: `1px solid rgba(104,211,145,${0.25 * f.b})`,
              backfaceVisibility: 'visible',
            }}
          />
        ))}
      </div>
      <div
        className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(190,255,214,0.9), rgba(56,161,105,0.5) 45%, transparent 72%)',
          animation: 'forge-pulse 2.4s ease-in-out infinite',
          filter: 'blur(3px)',
        }}
      />
    </div>
  );
}

/* ------------------------- Cube shattering into shards --------------------- */
const SHARD_DIRS = Array.from({ length: 14 }, (_, i) => {
  const a = i * 2.3999632;
  const phi = Math.acos(2 * ((i + 0.5) / 14) - 1);
  return {
    x: Math.sin(phi) * Math.cos(a),
    y: Math.sin(phi) * Math.sin(a),
    z: Math.cos(phi),
    rot: (i * 61) % 360,
  };
});

function Shard({ d, progress }: { d: (typeof SHARD_DIRS)[number]; progress: MotionValue<number> }) {
  const transform = useTransform(progress, (v) => {
    const burst = smooth(0.58, 0.82, v);
    const R = 180 * burst;
    return `translate3d(${(d.x * R).toFixed(1)}px, ${(d.y * R).toFixed(1)}px, ${(d.z * R).toFixed(1)}px) rotateX(${(d.rot + burst * 420).toFixed(1)}deg) rotateY(${d.rot}deg)`;
  });
  const opacity = useTransform(progress, (v) => Math.sin(smooth(0.58, 0.82, v) * Math.PI));
  return (
    <motion.div
      className="absolute -left-1.5 -top-2"
      style={{
        width: 12,
        height: 16,
        transform,
        opacity,
        background: 'linear-gradient(150deg, rgba(200,255,220,0.95), rgba(56,161,105,0.45))',
        boxShadow: '0 0 8px rgba(104,211,145,0.85)',
        clipPath: 'polygon(50% 0%, 100% 68%, 22% 100%)',
      }}
    />
  );
}

/* --------------------------------- Paper CV -------------------------------- */
const PAPER_W = 208;
const PAPER_H = 292;
const PAPER_D = 9;

function CVPaper({ progress }: { progress: MotionValue<number> }) {
  const transform = useTransform(progress, (v) => {
    const cvT = smooth(0.6, 0.84, v);
    return `rotateY(${((1 - cvT) * 540).toFixed(1)}deg)`; // spins out, settles facing viewer
  });
  return (
    <div
      style={{
        filter:
          'drop-shadow(0 3px 5px rgba(0,0,0,0.4)) drop-shadow(0 26px 42px rgba(0,0,0,0.5)) drop-shadow(0 0 46px rgba(56,161,105,0.4)) drop-shadow(1px 0 0 rgba(255,40,90,0.1)) drop-shadow(-1px 0 0 rgba(0,210,255,0.1))',
      }}
    >
      <div style={{ perspective: '1000px' }}>
        <motion.div
          className="relative"
          style={{ width: PAPER_W, height: PAPER_H, transformStyle: 'preserve-3d', transform }}
        >
          {/* FRONT */}
          <div
            className="forge-grain absolute inset-0 overflow-hidden rounded-[6px]"
            style={{
              transform: `translateZ(${PAPER_D / 2}px)`,
              background: 'linear-gradient(152deg, #FFFFFF 0%, #F5F8FB 42%, #E6ECF2 100%)',
              backfaceVisibility: 'hidden',
            }}
          >
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-bold tracking-tight text-primary">Ton Nom</div>
                  <div className="mt-0.5 text-[6px] font-medium text-action">Ingénieur · Paris</div>
                </div>
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#CBD5E0] to-[#A0AEC0]" />
              </div>
              <div className="mt-1 h-px w-full bg-gray-200" />
              {[0.92, 0.66, 0.8, 0.55].map((w, i) => (
                <div key={i} className="mt-2.5">
                  <div className="h-1 w-9 rounded-sm bg-action/85" />
                  <div className="mt-1 h-[3px] rounded-sm bg-gray-300" style={{ width: `${w * 100}%` }} />
                  <div className="mt-[3px] h-[3px] rounded-sm bg-gray-200" style={{ width: `${w * 78}%` }} />
                  <div className="mt-[3px] h-[3px] rounded-sm bg-gray-200" style={{ width: `${w * 88}%` }} />
                </div>
              ))}
            </div>
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.5) 46%, rgba(255,255,255,0) 60%)',
              }}
            />
          </div>
          {/* BACK */}
          <div
            className="absolute inset-0 overflow-hidden rounded-[6px]"
            style={{
              transform: `rotateY(180deg) translateZ(${PAPER_D / 2}px)`,
              background: 'linear-gradient(152deg, #EAF0F5 0%, #DCE4EC 100%)',
              backfaceVisibility: 'hidden',
            }}
          >
            <div className="p-5 opacity-30">
              <div className="h-2 w-16 rounded bg-gray-400" />
              {[0.8, 0.6, 0.7].map((w, i) => (
                <div key={i} className="mt-3 h-[3px] rounded bg-gray-400" style={{ width: `${w * 100}%` }} />
              ))}
            </div>
          </div>
          {/* EDGES */}
          <div
            className="absolute rounded-sm"
            style={{
              width: PAPER_D,
              height: PAPER_H,
              left: PAPER_W / 2 - PAPER_D / 2,
              transform: `rotateY(90deg) translateZ(${PAPER_W / 2}px)`,
              background: 'linear-gradient(#EDF2F7, #C7D0DA)',
            }}
          />
          <div
            className="absolute rounded-sm"
            style={{
              width: PAPER_D,
              height: PAPER_H,
              left: PAPER_W / 2 - PAPER_D / 2,
              transform: `rotateY(-90deg) translateZ(${PAPER_W / 2}px)`,
              background: 'linear-gradient(#D7DEE6, #B4BEC9)',
            }}
          />
          <div
            className="absolute rounded-sm"
            style={{
              width: PAPER_W,
              height: PAPER_D,
              top: PAPER_H / 2 - PAPER_D / 2,
              transform: `rotateX(90deg) translateZ(${PAPER_H / 2}px)`,
              background: 'linear-gradient(#FFFFFF, #DDE4EB)',
            }}
          />
        </motion.div>
      </div>
    </div>
  );
}

/* -------------------------------- Fragments -------------------------------- */
function FragmentToken({ f, stagger, progress }: { f: Frag; stagger: number; progress: MotionValue<number> }) {
  const depth = (f.z + 200) / 400;
  const dofBlur = (1 - depth) * 2.2;
  const kOf = (v: number) => 1 - smooth(0.12 + stagger, 0.52 + stagger, v);

  const transform = useTransform(progress, (v) => {
    const k = kOf(v);
    return `translate3d(${(f.x * k).toFixed(1)}px, ${(f.y * k).toFixed(1)}px, ${(f.z * k).toFixed(1)}px) rotateY(${(f.rot + (1 - k) * 220).toFixed(1)}deg) scale(${Math.max(k, 0.001).toFixed(3)})`;
  });
  const opacity = useTransform(progress, (v) => kOf(v));
  const filter = useTransform(progress, (v) => {
    const k = kOf(v);
    const speedBlur = Math.sin((1 - k) * Math.PI) * 3.6;
    return `blur(${(dofBlur + speedBlur).toFixed(2)}px)`;
  });

  const isIcon = f.kind === 'icon';
  return (
    <motion.div className="absolute left-0 top-0" style={{ transform, opacity }}>
      <motion.div className="-translate-x-1/2 -translate-y-1/2" style={{ filter }}>
        <div
          className="flex items-center justify-center rounded-xl"
          style={{
            width: isIcon ? 56 : 48,
            height: isIcon ? 56 : 48,
            background: 'linear-gradient(150deg, #202C3A 0%, #131B25 60%, #0C121A 100%)',
            border: '1px solid rgba(154,240,190,0.28)',
            boxShadow:
              'inset 1.5px 1.5px 3px rgba(120,200,160,0.25), inset -2px -3px 6px rgba(0,0,0,0.6), 0 8px 16px rgba(0,0,0,0.45), 0 0 16px rgba(56,161,105,0.22)',
          }}
        >
          {isIcon ? (
            <f.Icon className="h-6 w-6 text-[#68D391]" style={{ filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.6))' }} />
          ) : (
            <span className="text-lg font-bold text-[#9AF0BE]" style={{ textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}>
              {f.char}
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ForgeSequence() {
  const reduce = useReducedMotion();
  const compact = useIsCompact();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Captions
  const o1 = useTransform(scrollYProgress, [0, 0.05, 0.24, 0.3], [0, 1, 1, 0]);
  const o2 = useTransform(scrollYProgress, [0.34, 0.4, 0.54, 0.6], [0, 1, 1, 0]);
  const o3 = useTransform(scrollYProgress, [0.66, 0.74, 1], [0, 1, 1]);
  const hintO = useTransform(scrollYProgress, [0, 0.06, 0.12], [1, 1, 0]);

  // Scene motion values (applied straight to the DOM — no React re-render)
  const cubeTransform = useTransform(scrollYProgress, (v) => {
    const boxScale = smooth(0.05, 0.24, v) * (1 - smooth(0.6, 0.74, v));
    const cubeSpin = smooth(0.28, 0.6, v) * 240;
    return `translate(-50%, -50%) rotateY(${cubeSpin.toFixed(1)}deg) scale(${Math.max(boxScale, 0.0001).toFixed(4)})`;
  });
  const cvTransform = useTransform(scrollYProgress, (v) => {
    const cvT = smooth(0.6, 0.84, v);
    const cvScale = easeOutBack(cvT);
    return `translate(-50%, -50%) translateY(${((1 - cvT) * 26).toFixed(1)}px) scale(${Math.max(cvScale, 0.001).toFixed(3)})`;
  });
  const cvOpacity = useTransform(scrollYProgress, (v) => smooth(0.6, 0.72, v));
  const contactOpacity = useTransform(scrollYProgress, (v) => {
    const box = smooth(0.05, 0.2, v) * (1 - smooth(0.62, 0.72, v));
    const cv = smooth(0.6, 0.72, v);
    return Math.max(box, cv) * 0.8;
  });
  const haloOpacity = useTransform(scrollYProgress, (v) => 0.6 + smooth(0.2, 0.55, v) * (1 - smooth(0.66, 0.8, v)) * 0.8);
  const raysOpacity = useTransform(scrollYProgress, (v) => 0.5 + smooth(0.2, 0.55, v) * (1 - smooth(0.66, 0.8, v)) * 0.5);
  const sparksOpacity = useTransform(scrollYProgress, (v) => 0.4 + smooth(0.2, 0.55, v) * (1 - smooth(0.66, 0.8, v)));

  if (compact || reduce) return <ForgeFallback />;

  return (
    <section ref={ref} className="relative h-[320vh] bg-[#0E1219]">
      <div className="forge-vignette forge-grain sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden">
        <motion.div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background: 'radial-gradient(52% 52% at 50% 47%, rgba(56,161,105,0.16), transparent 72%)',
            opacity: haloOpacity,
          }}
        />
        <motion.div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'conic-gradient(from 200deg at 38% 8%, transparent 0deg, rgba(120,220,160,0.08) 12deg, transparent 26deg, transparent 340deg, rgba(120,220,160,0.06) 352deg, transparent 360deg)',
            filter: 'blur(6px)',
            opacity: raysOpacity,
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
          aria-hidden="true"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.55), transparent), radial-gradient(60% 100% at 50% 100%, rgba(56,161,105,0.12), transparent 70%)',
          }}
        />

        {mounted && (
          <motion.div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ opacity: sparksOpacity }}>
            {Array.from({ length: 16 }).map((_, i) => {
              const left = 42 + ((i * 37) % 16);
              const delay = (i % 8) * 0.5;
              const dur = 2.6 + (i % 4) * 0.6;
              const size = 2 + (i % 3);
              return (
                <span
                  key={i}
                  className="forge-spark absolute rounded-full"
                  style={{
                    left: `${left}%`,
                    top: '58%',
                    width: size,
                    height: size,
                    background: 'radial-gradient(circle, #EAFFF2, #68D391 60%, transparent)',
                    boxShadow: '0 0 6px rgba(154,240,190,0.9)',
                    animation: `forge-spark ${dur}s ease-out ${delay}s infinite`,
                  }}
                />
              );
            })}
          </motion.div>
        )}

        {mounted && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ perspective: '1250px' }}
            aria-hidden="true"
          >
            <div className="relative" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(10deg)' }}>
              {FRAGMENTS.map((f, i) => (
                <FragmentToken key={i} f={f} stagger={(i / FRAGMENTS.length) * 0.12} progress={scrollYProgress} />
              ))}

              <motion.div
                className="absolute left-1/2 top-1/2"
                style={{ transform: cubeTransform, transformStyle: 'preserve-3d' }}
              >
                <GlassCube />
              </motion.div>

              <div className="absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d' }}>
                {SHARD_DIRS.map((d, i) => (
                  <Shard key={i} d={d} progress={scrollYProgress} />
                ))}
              </div>

              <motion.div className="absolute left-1/2 top-1/2" style={{ transform: cvTransform, opacity: cvOpacity }}>
                <CVPaper progress={scrollYProgress} />
              </motion.div>

              <motion.div
                className="absolute left-1/2 top-1/2"
                style={{
                  transform: 'translate(-50%, 150px) rotateX(78deg)',
                  width: 200,
                  height: 90,
                  borderRadius: '50%',
                  background: 'radial-gradient(closest-side, rgba(0,0,0,0.6), transparent)',
                  filter: 'blur(10px)',
                  opacity: contactOpacity,
                }}
              />
            </div>
          </div>
        )}

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
            …et en ressort un CV <span className="text-action">qui te ressemble.</span>
          </motion.h2>
        </div>

        <motion.div
          style={{ opacity: hintO }}
          className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-white/50"
        >
          <span className="text-xs uppercase tracking-widest">Défile</span>
          <ArrowDown className="h-5 w-5" />
        </motion.div>
      </div>
    </section>
  );
}
