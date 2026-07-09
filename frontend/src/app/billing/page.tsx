'use client';

/**
 * Billing page — choose a CareerPass and start Stripe Checkout.
 * Reached directly or via the 402 interceptor when generation is blocked.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import Navbar from '@/components/Navbar';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui';
import {
  createCheckoutSession,
  getBillingCatalog,
  formatPrice,
  getErrorMessage,
  type PassType,
} from '@/lib/api';

interface PassCopy {
  name: string;
  blurb: string;
  highlight?: boolean;
}

const PASS_COPY: Record<PassType, PassCopy> = {
  PASS_30_DAYS: {
    name: 'Pass 30 jours',
    blurb: 'Génération illimitée de CV pendant 30 jours.',
  },
  PASS_90_DAYS: {
    name: 'Pass 90 jours',
    blurb: 'Génération illimitée pendant 90 jours. Idéal pour une recherche active.',
    highlight: true,
  },
};

export default function BillingPage() {
  const [loading, setLoading] = useState<PassType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ['billing-catalog'],
    queryFn: getBillingCatalog,
  });

  const handleBuy = async (passType: PassType) => {
    setError(null);
    setLoading(passType);
    try {
      const { checkout_url } = await createCheckoutSession(passType);
      window.location.href = checkout_url;
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(null);
    }
  };

  const passes = catalog?.passes ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Navbar variant="authenticated" />

      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-2xl font-bold text-primary">
          Débloquez la génération de CV
        </h1>
        <p className="mb-8 text-text-secondary">
          Choisissez un Pass pour générer autant de CV optimisés que vous le
          souhaitez pendant sa durée de validité.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {catalogLoading
            ? [0, 1].map((i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-xl border border-border bg-white"
                />
              ))
            : passes.map((pass) => {
                const copy = PASS_COPY[pass.pass_type];
                const price = formatPrice(pass.amount_cents, pass.currency);
                return (
                  <Card
                    key={pass.pass_type}
                    className={copy.highlight ? 'border-action ring-1 ring-action' : undefined}
                  >
                    <CardHeader>
                      <CardTitle>{copy.name}</CardTitle>
                      <CardDescription>
                        Accès illimité — {pass.duration_days} jours
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="flex items-baseline gap-1">
                        {price ? (
                          <>
                            <span className="text-3xl font-bold text-primary">
                              {price}
                            </span>
                            <span className="text-sm text-text-secondary">
                              / {pass.duration_days} jours
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-medium text-text-secondary">
                            Prix confirmé au paiement sécurisé
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-text-secondary">{copy.blurb}</p>
                    </CardContent>
                    <CardFooter>
                      <Button
                        variant={copy.highlight ? 'primary' : 'outline'}
                        isLoading={loading === pass.pass_type}
                        disabled={loading !== null}
                        onClick={() => handleBuy(pass.pass_type)}
                        className="w-full"
                      >
                        Choisir ce Pass
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-text-secondary">
          <ShieldCheck className="h-4 w-4 text-action" aria-hidden="true" />
          Paiement sécurisé par Stripe. Aucune donnée bancaire ne transite par nos
          serveurs.
        </p>
      </main>
    </div>
  );
}
