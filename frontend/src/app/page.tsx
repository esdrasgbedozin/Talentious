import Link from "next/link";
import Button from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background-light to-white flex items-center justify-center px-4">
      <main className="max-w-4xl mx-auto text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold text-primary">
            Talentious
          </h1>
          <p className="text-2xl text-text-secondary">
            Générez des CVs ultra-professionnels avec l&apos;IA
          </p>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          <p className="text-lg text-text-secondary">
            Plateforme SaaS qui utilise l&apos;intelligence artificielle pour créer des CVs 
            enrichis et parfaitement adaptés aux offres d&apos;emploi.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/design-system">
              <Button variant="primary" size="lg">
                Voir le Design System
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="lg">
                Créer un compte
              </Button>
            </Link>
          </div>

          <div className="pt-8 border-t border-border mt-12">
            <p className="text-sm text-text-secondary">
              🚧 Application en développement - Phase 2.1 complétée
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          <div className="p-6 bg-white rounded-lg border border-border">
            <div className="text-4xl mb-3">🤖</div>
            <h3 className="font-semibold text-primary mb-2">IA Avancée</h3>
            <p className="text-sm text-text-secondary">
              Vertex AI analyse et enrichit votre profil pour maximiser vos chances
            </p>
          </div>
          
          <div className="p-6 bg-white rounded-lg border border-border">
            <div className="text-4xl mb-3">⚡</div>
            <h3 className="font-semibold text-primary mb-2">Rapide & Simple</h3>
            <p className="text-sm text-text-secondary">
              Import PDF, génération en quelques clics, export professionnel
            </p>
          </div>
          
          <div className="p-6 bg-white rounded-lg border border-border">
            <div className="text-4xl mb-3">🔒</div>
            <h3 className="font-semibold text-primary mb-2">100% Européen</h3>
            <p className="text-sm text-text-secondary">
              Données hébergées en France (GCP europe-west9), conforme RGPD
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

