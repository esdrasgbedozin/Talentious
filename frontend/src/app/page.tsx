'use client';

/**
 * Landing (public, no auth) — immersive narrative for Talentious.
 * Hybrid art direction: dark, WebGL-lit hero + final CTA; light, airy content
 * between. Motion is scroll-driven and reduced-motion aware; the WebGL hero
 * degrades to a static glow on mobile / reduced motion.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useReducedMotion, useInView, motion } from 'motion/react';
import {
  ArrowRight,
  ChevronDown,
  Target,
  PenLine,
  SlidersHorizontal,
  FileDown,
  Layers,
  MapPin,
  ShieldCheck,
  Lock,
  UserRound,
  ClipboardPaste,
  Sparkles,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';
import Reveal from '@/components/landing/Reveal';
import ForgeSequence from '@/components/landing/ForgeSequence';

const HeroScene = dynamic(() => import('@/components/landing/HeroScene'), {
  ssr: false,
});

/** True on coarse-pointer / small screens, where we skip the heavy WebGL scene. */
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

export default function Home() {
  const reduce = useReducedMotion();
  const compact = useIsCompact();
  const heroRef = useRef<HTMLElement>(null);
  // Only mount the hero WebGL while the hero is on screen — this releases its GL
  // context before the Forge scene claims one (a page never runs two at once).
  // The hero is the page's single WebGL scene (the Forge below is CSS-3D), so it can
  // stay mounted while in view without competing for a GL context.
  const heroInView = useInView(heroRef);
  const showWebGL = !compact && !reduce && heroInView;

  return (
    <div className="bg-white">
      <Navbar variant="landing" />

      {/* ============================== HERO (dark) ============================== */}
      <section
        ref={heroRef}
        className="relative flex min-h-screen items-center overflow-hidden bg-[#12161F]"
      >
        {/* WebGL particle field (desktop) or static glow (mobile / reduced motion) */}
        <div className="absolute inset-0" aria-hidden="true">
          {showWebGL ? (
            <HeroScene reduced={false} />
          ) : (
            <div className="absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-action/20 blur-[100px]" />
          )}
        </div>
        {/* Legibility + depth wash */}
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(120% 90% at 15% 20%, rgba(56,161,105,0.14), transparent 55%), linear-gradient(180deg, rgba(18,22,31,0.4) 0%, rgba(18,22,31,0.15) 45%, rgba(18,22,31,0.85) 100%)',
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6">
          <motion.div
            className="max-w-3xl"
            initial={reduce ? false : { opacity: 0, y: 28 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-action" />
              IA souveraine · Hébergée en France
            </span>

            <h1 className="mt-6 text-balance text-[clamp(2.6rem,6vw,5.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-white">
              De ton expérience brute à un CV{' '}
              <span className="text-action">qui te ressemble.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70 md:text-xl">
              Talentious transforme ton parcours en un CV taillé pour chaque offre —
              analysé, rédigé et optimisé par l&apos;IA. En une minute.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link href="/register">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full shadow-lg shadow-action/30 sm:w-auto"
                >
                  Créer mon CV gratuitement
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <a
                href="#how"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 px-6 py-3 text-base font-medium text-white/90 transition-colors hover:bg-white/10"
              >
                Voir comment ça marche
              </a>
            </div>

            <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-white/60">
              <li className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-action" /> Génération en 2 minutes
              </li>
              <li className="flex items-center gap-2">
                <Target className="h-4 w-4 text-action" /> Adapté à chaque offre
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-action" /> Données hébergées en France
              </li>
            </ul>
          </motion.div>
        </div>

        {/* Scroll cue */}
        <a
          href="#constat"
          aria-label="Défiler vers le bas"
          className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-white/50 transition-colors hover:text-white/80"
        >
          <ChevronDown className="h-6 w-6 animate-bounce motion-reduce:animate-none" />
        </a>
      </section>

      {/* ===================== FORGE — scroll-driven 3D sequence ================= */}
      <ForgeSequence />

      {/* ============================== CONSTAT (light) ========================== */}
      <section id="constat" className="bg-white px-6 py-28 md:py-36">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wider text-action">
              Le vrai problème
            </p>
            <h2 className="mt-4 text-balance text-4xl font-bold leading-tight tracking-tight text-primary md:text-5xl">
              Un même parcours ne parle pas à toutes les offres.
            </h2>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-text-secondary">
              Un recruteur passe quelques secondes sur ton CV. S&apos;il ne voit pas
              immédiatement ce qui compte <em>pour ce poste précis</em>, il passe au
              suivant. Adapter chaque candidature à la main prend des heures — alors on
              envoie le même CV partout, et on le paie en entretiens manqués.
            </p>
          </Reveal>

          <Reveal delay={0.1} className="mt-14">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background-light p-8">
                <p className="text-sm font-medium text-text-secondary">Sans Talentious</p>
                <p className="mt-3 text-xl font-semibold text-primary">
                  Un CV générique, envoyé partout.
                </p>
                <p className="mt-2 text-text-secondary">
                  Les compétences clés de l&apos;offre se noient dans la masse.
                </p>
              </div>
              <div className="rounded-2xl border border-action/30 bg-action/5 p-8 ring-1 ring-action/20">
                <p className="text-sm font-medium text-action">Avec Talentious</p>
                <p className="mt-3 text-xl font-semibold text-primary">
                  Un CV taillé pour chaque offre.
                </p>
                <p className="mt-2 text-text-secondary">
                  L&apos;IA met en avant ce qui fait mouche pour ce poste — en une minute.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================ HOW IT WORKS (light) ====================== */}
      <section id="how" className="scroll-mt-20 bg-background-light px-6 py-28 md:py-36">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight text-primary md:text-5xl">
              Trois étapes. Une minute. Un CV qui décroche.
            </h2>
            <p className="mt-5 text-lg text-text-secondary">
              Tu remplis ton profil une seule fois. Ensuite, chaque CV se génère à partir
              d&apos;une offre.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                n: '1',
                icon: UserRound,
                title: 'Remplis ton profil maître',
                text: "Expériences, formations, compétences, projets, certifications — une seule fois, ta source de vérité.",
              },
              {
                n: '2',
                icon: ClipboardPaste,
                title: "Colle l'offre d'emploi",
                text: "L'IA analyse le poste : compétences attendues, responsabilités, mots-clés qui comptent.",
              },
              {
                n: '3',
                icon: Sparkles,
                title: 'Reçois ton CV taillé',
                text: 'Un CV rédigé et hiérarchisé pour cette offre précise, prêt à éditer et à exporter en PDF.',
              },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 0.12}>
                <div className="relative flex h-full flex-col rounded-2xl border border-border bg-white p-8">
                  <div className="flex items-center gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-action/10 text-action">
                      <step.icon className="h-6 w-6" />
                    </span>
                    <span className="text-5xl font-bold leading-none text-border">
                      {step.n}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-primary">{step.title}</h3>
                  <p className="mt-2 text-text-secondary">{step.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== FEATURES (light) ======================== */}
      <section id="features" className="scroll-mt-20 bg-white px-6 py-28 md:py-36">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight text-primary md:text-5xl">
              Ce que l&apos;IA fait vraiment pour toi.
            </h2>
            <p className="mt-5 text-lg text-text-secondary">
              Propulsé par Google Vertex AI. Pas de mise en page magique : une vraie
              lecture de ton profil et de l&apos;offre.
            </p>
          </Reveal>

          {/* Bento — varied emphasis, not a clone grid */}
          <div className="mt-14 grid gap-5 md:grid-cols-6">
            <Reveal className="md:col-span-4" delay={0}>
              <FeatureCard
                icon={Target}
                title="Analyse de l'offre"
                text="L'IA lit la fiche de poste et identifie les compétences, responsabilités et mots-clés déterminants — puis choisit ce qu'il faut mettre en avant dans ton profil."
                large
              />
            </Reveal>
            <Reveal className="md:col-span-2" delay={0.08}>
              <FeatureCard
                icon={PenLine}
                title="Rédaction percutante"
                text="Des formulations orientées résultats, sans jargon creux."
              />
            </Reveal>
            <Reveal className="md:col-span-2" delay={0}>
              <FeatureCard
                icon={SlidersHorizontal}
                title="Mise en valeur ciblée"
                text="Les expériences pertinentes remontent ; le reste s'efface."
              />
            </Reveal>
            <Reveal className="md:col-span-2" delay={0.08}>
              <FeatureCard
                icon={FileDown}
                title="Édition & export PDF"
                text="Ajuste chaque détail dans l'éditeur, exporte un PDF propre."
              />
            </Reveal>
            <Reveal className="md:col-span-2" delay={0.16}>
              <FeatureCard
                icon={Layers}
                title="Versions illimitées"
                text="Un CV par candidature, autant que tu veux."
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================== SECURITY (dark) ========================= */}
      <section
        id="security"
        className="relative scroll-mt-20 overflow-hidden bg-[#12161F] px-6 py-28 md:py-36"
      >
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(80% 60% at 85% 20%, rgba(56,161,105,0.16), transparent 60%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-action">
              Souveraineté des données
            </p>
            <h2 className="mt-4 text-balance text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
              Ton parcours ne quitte pas la France.
            </h2>
            <p className="mt-5 text-lg text-white/70">
              Hébergement Google Cloud à Paris (europe-west9), conforme RGPD. Tes données
              restent les tiennes, à tout moment.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: MapPin,
                title: 'Hébergement français',
                text: 'Serveurs GCP en France (europe-west9). Aucune donnée ne quitte le territoire européen.',
              },
              {
                icon: ShieldCheck,
                title: 'Conforme RGPD',
                text: 'Accès, modification et suppression de tes données à tout moment.',
              },
              {
                icon: Lock,
                title: 'Chiffrement de bout en bout',
                text: 'Communications chiffrées. Tes informations personnelles restent protégées.',
              },
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 0.1}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-action/15 text-action">
                    <item.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ TESTIMONIALS (light) ===================== */}
      <section id="testimonials" className="scroll-mt-20 bg-white px-6 py-28 md:py-36">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight text-primary md:text-5xl">
              Ils ont révélé leur potentiel.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                quote:
                  "J'ai obtenu 3 entretiens en une semaine après avoir adapté mes CV avec Talentious. Le gain de temps est énorme.",
                name: 'Sophie Chen',
                role: 'Product Manager',
                initials: 'SC',
              },
              {
                quote:
                  "Fini les heures passées à reformuler mon CV pour chaque offre. En 2 minutes, le résultat est bluffant.",
                name: 'Marc Dubois',
                role: 'Développeur Full-Stack',
                initials: 'MD',
              },
              {
                quote:
                  "Interface intuitive, suggestions pertinentes, rendu vraiment pro. Exactement ce qu'il me fallait.",
                name: 'Amélie Leroux',
                role: 'Designer UX/UI',
                initials: 'AL',
              },
            ].map((t, i) => (
              <Reveal key={t.name} delay={i * 0.1}>
                <figure className="flex h-full flex-col rounded-2xl border border-border bg-background-light p-8">
                  <blockquote className="text-pretty leading-relaxed text-primary">
                    « {t.quote} »
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-action/10 text-sm font-semibold text-action">
                      {t.initials}
                    </span>
                    <span>
                      <span className="block font-semibold text-primary">{t.name}</span>
                      <span className="block text-sm text-text-secondary">{t.role}</span>
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== FINAL CTA (dark) ======================= */}
      <section className="relative overflow-hidden bg-[#12161F] px-6 py-32 md:py-40">
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(70% 80% at 50% 100%, rgba(56,161,105,0.25), transparent 65%)',
          }}
        />
        <Reveal className="relative z-10 mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
            Révèle ton véritable potentiel.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/70">
            Crée ton profil, colle une offre, et laisse l&apos;IA écrire le CV qui te
            fera passer la première étape.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/register">
              <Button
                variant="primary"
                size="lg"
                className="w-full shadow-lg shadow-action/30 sm:w-auto"
              >
                Commencer gratuitement
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login">
              <span className="inline-flex items-center justify-center rounded-lg border border-white/25 px-6 py-3 text-base font-medium text-white/90 transition-colors hover:bg-white/10">
                J&apos;ai déjà un compte
              </span>
            </Link>
          </div>
          <p className="mt-6 text-sm text-white/50">
            Aucune carte bancaire requise pour commencer.
          </p>
        </Reveal>
      </section>

      {/* ============================== FOOTER (dark) ========================== */}
      <footer className="bg-[#0E1219] px-6 py-14 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <span className="text-2xl font-bold">Talentious</span>
              <p className="mt-3 text-sm text-white/50">
                L&apos;IA qui révèle ton véritable potentiel professionnel.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Produit</h3>
              <ul className="mt-4 space-y-2 text-sm text-white/60">
                <li>
                  <Link href="/register" className="transition-colors hover:text-action">
                    Créer un compte
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="transition-colors hover:text-action">
                    Se connecter
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Navigation</h3>
              <ul className="mt-4 space-y-2 text-sm text-white/60">
                <li>
                  <a href="#how" className="transition-colors hover:text-action">
                    Comment ça marche
                  </a>
                </li>
                <li>
                  <a href="#features" className="transition-colors hover:text-action">
                    Fonctionnalités
                  </a>
                </li>
                <li>
                  <a href="#security" className="transition-colors hover:text-action">
                    Sécurité
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Légal</h3>
              <ul className="mt-4 space-y-2 text-sm text-white/60">
                <li>
                  <Link href="/legal/cgu" className="transition-colors hover:text-action">
                    CGU
                  </Link>
                </li>
                <li>
                  <Link
                    href="/legal/confidentialite"
                    className="transition-colors hover:text-action"
                  >
                    Confidentialité
                  </Link>
                </li>
                <li>
                  <Link
                    href="/legal/mentions-legales"
                    className="transition-colors hover:text-action"
                  >
                    Mentions légales
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-8 text-sm text-white/40 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Talentious. Tous droits réservés.</p>
            <p>Fièrement hébergé en France 🇫🇷 · Conforme RGPD</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  text,
  large = false,
}: {
  icon: typeof Target;
  title: string;
  text: string;
  large?: boolean;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-background-light p-8 transition-colors hover:border-action/40">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-action/10 text-action">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className={`mt-5 font-semibold text-primary ${large ? 'text-2xl' : 'text-lg'}`}>
        {title}
      </h3>
      <p className={`mt-2 text-text-secondary ${large ? 'text-lg max-w-xl' : 'text-sm'}`}>
        {text}
      </p>
    </div>
  );
}
