'use client';

/**
 * Billing page — choose a CareerPass and start Stripe Checkout.
 * Reached directly or via the 402 interceptor when generation is blocked.
 */
import { useState } from 'react';
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
  getErrorMessage,
  type PassType,
} from '@/lib/api';

interface PassOption {
  type: PassType;
  name: string;
  duration: string;
  blurb: string;
}

const PASSES: PassOption[] = [
  {
    type: 'PASS_30_DAYS',
    name: 'Pass 30 jours',
    duration: '30 jours',
    blurb: 'Génération illimitée de CV pendant 30 jours.',
  },
  {
    type: 'PASS_90_DAYS',
    name: 'Pass 90 jours',
    duration: '90 jours',
    blurb: 'Génération illimitée de CV pendant 90 jours. Idéal pour une recherche active.',
  },
];

export default function BillingPage() {
  const [loading, setLoading] = useState<PassType | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold text-primary">
        Débloquez la génération de CV
      </h1>
      <p className="mb-8 text-gray-600">
        Choisissez un Pass pour générer autant de CV optimisés que vous le souhaitez
        pendant sa durée de validité.
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
        {PASSES.map((pass) => (
          <Card key={pass.type}>
            <CardHeader>
              <CardTitle>{pass.name}</CardTitle>
              <CardDescription>Accès illimité — {pass.duration}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">{pass.blurb}</p>
            </CardContent>
            <CardFooter>
              <Button
                variant="primary"
                isLoading={loading === pass.type}
                disabled={loading !== null}
                onClick={() => handleBuy(pass.type)}
                className="w-full"
              >
                Choisir ce Pass
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </main>
  );
}
