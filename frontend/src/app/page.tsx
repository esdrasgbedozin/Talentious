import Link from "next/link";
import Button from "@/components/ui/Button";
import Navbar from "@/components/Navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* NAVBAR */}
      <Navbar variant="landing" />

      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background-light via-white to-green-50 pt-32 pb-32 px-4">
        {/* Decorative gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-action/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center space-y-8">
            {/* Trust badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full border border-border shadow-sm">
              <span className="text-2xl">🇫🇷</span>
              <span className="text-sm font-medium text-primary">100% Français • Conforme RGPD</span>
            </div>

            {/* Main title */}
            <div className="space-y-6">
              <h1 className="text-6xl md:text-7xl font-bold text-primary leading-tight">
                Talentious
              </h1>
              <p className="text-3xl md:text-4xl font-semibold bg-gradient-to-r from-action to-green-600 bg-clip-text text-transparent">
                Révélez votre véritable potentiel
              </p>
            </div>

            {/* Subtitle */}
            <p className="text-xl md:text-2xl text-text-secondary max-w-3xl mx-auto leading-relaxed">
              L&apos;intelligence artificielle qui transforme votre expérience en un CV irrésistible, 
              parfaitement adapté à chaque opportunité.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Link href="/register">
                <Button variant="primary" size="lg" className="shadow-lg shadow-action/20 hover:shadow-xl hover:shadow-action/30 transition-all">
                  Créer mon CV gratuitement
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg">
                  Se connecter
                </Button>
              </Link>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap justify-center gap-8 pt-8 text-sm text-text-secondary">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-action" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Génération en 2 minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-action" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>IA de pointe (Vertex AI)</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-action" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Données sécurisées en France</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM / SOLUTION SECTION */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-primary mb-6">
              La recherche d&apos;emploi mérite mieux qu&apos;un CV basique
            </h2>
            <p className="text-xl text-text-secondary max-w-3xl mx-auto">
              Chaque offre est unique. Votre CV devrait l&apos;être aussi. 
              Talentious analyse, enrichit et optimise votre profil pour chaque opportunité.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-4 group">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-action to-green-600 rounded-2xl flex items-center justify-center transform group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-primary">Gain de temps radical</h3>
              <p className="text-text-secondary">
                Plus besoin de passer des heures à adapter manuellement votre CV. 
                L&apos;IA fait le travail en 2 minutes chrono.
              </p>
            </div>

            <div className="text-center space-y-4 group">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-primary to-gray-700 rounded-2xl flex items-center justify-center transform group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-primary">Optimisation intelligente</h3>
              <p className="text-text-secondary">
                L&apos;IA analyse l&apos;offre d&apos;emploi et met en avant les compétences 
                et expériences les plus pertinentes pour ce poste précis.
              </p>
            </div>

            <div className="text-center space-y-4 group">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-green-500 to-action rounded-2xl flex items-center justify-center transform group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-primary">Résultats professionnels</h3>
              <p className="text-text-secondary">
                Templates élégants et modernes qui impressionnent les recruteurs. 
                Votre expertise mise en valeur comme jamais.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="py-24 px-4 bg-gradient-to-b from-background-light to-white scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-primary mb-6">
              Une technologie de pointe à votre service
            </h2>
            <p className="text-xl text-text-secondary max-w-3xl mx-auto">
              Propulsé par Google Vertex AI, Talentious combine puissance et simplicité.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Feature 1 */}
            <div className="bg-white p-8 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-action/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-action/20 transition-colors">
                  <span className="text-2xl">📄</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-primary">Import automatique</h3>
                  <p className="text-text-secondary">
                    Importez votre CV PDF existant ou vos données LinkedIn. Notre IA extrait 
                    et structure toutes les informations en quelques secondes.
                  </p>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-8 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-action/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-action/20 transition-colors">
                  <span className="text-2xl">🤖</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-primary">Enrichissement IA</h3>
                  <p className="text-text-secondary">
                    Vertex AI analyse votre profil et suggère des améliorations : 
                    formulations percutantes, compétences valorisées, résultats quantifiés.
                  </p>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-8 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-action/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-action/20 transition-colors">
                  <span className="text-2xl">🎯</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-primary">Optimisation ciblée</h3>
                  <p className="text-text-secondary">
                    Collez une offre d&apos;emploi : l&apos;IA adapte automatiquement votre CV 
                    pour maximiser la correspondance avec les attentes du recruteur.
                  </p>
                </div>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-white p-8 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-action/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-action/20 transition-colors">
                  <span className="text-2xl">📊</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-primary">Analyse de compatibilité</h3>
                  <p className="text-text-secondary">
                    Score de match en temps réel, suggestions de compétences manquantes, 
                    points forts mis en avant pour ce poste spécifique.
                  </p>
                </div>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="bg-white p-8 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-action/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-action/20 transition-colors">
                  <span className="text-2xl">✨</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-primary">Templates professionnels</h3>
                  <p className="text-text-secondary">
                    Bibliothèque de designs modernes et ATS-friendly. Export PDF haute qualité 
                    prêt à envoyer aux recruteurs.
                  </p>
                </div>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="bg-white p-8 rounded-2xl border border-border shadow-sm hover:shadow-lg transition-all group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-action/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-action/20 transition-colors">
                  <span className="text-2xl">🔄</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-primary">Versions illimitées</h3>
                  <p className="text-text-secondary">
                    Créez autant de variantes de CV que vous le souhaitez. 
                    Une version par candidature pour maximiser vos chances.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 px-4 bg-white scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-primary mb-6">
              Comment ça marche ?
            </h2>
            <p className="text-xl text-text-secondary">
              4 étapes simples pour un CV qui fait la différence
            </p>
          </div>

          <div className="space-y-12">
            {/* Step 1 */}
            <div className="flex flex-col md:flex-row items-center gap-8 group">
              <div className="w-16 h-16 bg-gradient-to-br from-action to-green-600 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold text-white shadow-lg">
                1
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-2xl font-semibold text-primary mb-2">Importez votre profil</h3>
                <p className="text-text-secondary text-lg">
                  Téléchargez votre CV PDF, importez depuis LinkedIn, ou remplissez manuellement. 
                  Talentious s&apos;adapte à votre méthode préférée.
                </p>
              </div>
            </div>

            <div className="h-12 w-0.5 bg-gradient-to-b from-action to-primary mx-8 hidden md:block"></div>

            {/* Step 2 */}
            <div className="flex flex-col md:flex-row items-center gap-8 group">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-gray-700 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold text-white shadow-lg">
                2
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-2xl font-semibold text-primary mb-2">L&apos;IA analyse et enrichit</h3>
                <p className="text-text-secondary text-lg">
                  Notre intelligence artificielle examine votre profil, identifie vos points forts 
                  et suggère des améliorations pour maximiser l&apos;impact.
                </p>
              </div>
            </div>

            <div className="h-12 w-0.5 bg-gradient-to-b from-primary to-action mx-8 hidden md:block"></div>

            {/* Step 3 */}
            <div className="flex flex-col md:flex-row items-center gap-8 group">
              <div className="w-16 h-16 bg-gradient-to-br from-action to-green-600 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold text-white shadow-lg">
                3
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-2xl font-semibold text-primary mb-2">Personnalisez par offre</h3>
                <p className="text-text-secondary text-lg">
                  Collez l&apos;annonce qui vous intéresse. L&apos;IA adapte instantanément votre CV 
                  pour matcher parfaitement avec les attentes du recruteur.
                </p>
              </div>
            </div>

            <div className="h-12 w-0.5 bg-gradient-to-b from-action to-green-600 mx-8 hidden md:block"></div>

            {/* Step 4 */}
            <div className="flex flex-col md:flex-row items-center gap-8 group">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-gray-700 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold text-white shadow-lg">
                4
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-2xl font-semibold text-primary mb-2">Téléchargez et postulez</h3>
                <p className="text-text-secondary text-lg">
                  Choisissez votre template préféré, exportez en PDF professionnel, 
                  et envoyez votre candidature avec confiance. Vous êtes prêt à briller !
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECURITY & TRUST */}
      <section id="security" className="py-24 px-4 bg-gradient-to-b from-background-light to-white scroll-mt-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-primary mb-6">
              Vos données sont précieuses
            </h2>
            <p className="text-xl text-text-secondary">
              Sécurité et confidentialité au cœur de notre architecture
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-2xl border border-border">
              <div className="text-4xl mb-4">🇫🇷</div>
              <h3 className="text-lg font-semibold text-primary mb-2">Hébergement français</h3>
              <p className="text-sm text-text-secondary">
                Serveurs GCP en France (europe-west9). Vos données ne quittent jamais le territoire européen.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-border">
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-lg font-semibold text-primary mb-2">Conformité RGPD</h3>
              <p className="text-sm text-text-secondary">
                Respect total de vos droits : accès, modification, suppression de vos données à tout moment.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-border">
              <div className="text-4xl mb-4">🛡️</div>
              <h3 className="text-lg font-semibold text-primary mb-2">Chiffrement SSL</h3>
              <p className="text-sm text-text-secondary">
                Toutes les communications sont cryptées. Vos informations personnelles sont protégées.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="py-24 px-4 bg-white scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-primary mb-6">
              Ils ont révélé leur potentiel
            </h2>
            <p className="text-xl text-text-secondary">
              Découvrez comment Talentious a transformé leur recherche d&apos;emploi
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-gradient-to-br from-background-light to-white p-8 rounded-2xl border border-border">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-action to-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  SC
                </div>
                <div>
                  <div className="font-semibold text-primary">Sophie Chen</div>
                  <div className="text-sm text-text-secondary">Product Manager</div>
                </div>
              </div>
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-text-secondary italic">
                &ldquo;J&apos;ai obtenu 3 entretiens en une semaine après avoir utilisé Talentious. 
                L&apos;IA a su mettre en valeur mes compétences de manière percutante.&rdquo;
              </p>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-gradient-to-br from-background-light to-white p-8 rounded-2xl border border-border">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-gray-700 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  MD
                </div>
                <div>
                  <div className="font-semibold text-primary">Marc Dubois</div>
                  <div className="text-sm text-text-secondary">Développeur Full-Stack</div>
                </div>
              </div>
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-text-secondary italic">
                &ldquo;Fini les heures passées à reformuler mon CV pour chaque offre. 
                Talentious fait le job en 2 minutes, et le résultat est bluffant.&rdquo;
              </p>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-gradient-to-br from-background-light to-white p-8 rounded-2xl border border-border">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-action rounded-full flex items-center justify-center text-white font-bold text-lg">
                  AL
                </div>
                <div>
                  <div className="font-semibold text-primary">Amélie Leroux</div>
                  <div className="text-sm text-text-secondary">Designer UX/UI</div>
                </div>
              </div>
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-text-secondary italic">
                &ldquo;Interface intuitive, suggestions pertinentes, et le rendu est ultra-pro. 
                Exactement ce qu&apos;il me fallait pour me démarquer.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 px-4 bg-gradient-to-br from-primary via-gray-800 to-primary relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 bg-action rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-green-400 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Prêt à révéler votre véritable potentiel ?
          </h2>
          <p className="text-xl text-gray-200 mb-10 max-w-2xl mx-auto">
            Rejoignez les professionnels qui ont choisi Talentious pour transformer leur recherche d&apos;emploi.
          </p>
          
          <Link href="/register">
            <Button 
              variant="primary" 
              size="lg" 
              className="bg-white text-primary hover:bg-gray-100 shadow-2xl hover:shadow-3xl transition-all text-lg px-10 py-4"
            >
              Commencer gratuitement
            </Button>
          </Link>
          
          <p className="text-gray-300 text-sm mt-6">
            Aucune carte bancaire requise • Essai gratuit
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-primary text-white py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-2xl font-bold mb-4">Talentious</h3>
              <p className="text-gray-300 text-sm">
                L&apos;IA qui révèle votre véritable potentiel professionnel.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><Link href="/register" className="hover:text-action transition-colors">Créer un compte</Link></li>
                <li><Link href="/login" className="hover:text-action transition-colors">Se connecter</Link></li>
                <li><span className="opacity-50">Tarifs (à venir)</span></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Entreprise</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><span className="opacity-50">À propos (à venir)</span></li>
                <li><span className="opacity-50">Blog (à venir)</span></li>
                <li><span className="opacity-50">Carrières (à venir)</span></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><span className="opacity-50">CGU (à venir)</span></li>
                <li><span className="opacity-50">Confidentialité (à venir)</span></li>
                <li><span className="opacity-50">Mentions légales (à venir)</span></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-8 text-center text-sm text-gray-400">
            <p>© 2025 Talentious. Tous droits réservés.</p>
            <p className="mt-2 flex items-center justify-center gap-2">
              <span className="text-lg">🇫🇷</span>
              Fièrement hébergé en France • Conforme RGPD
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

