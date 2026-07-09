'use client';

/**
 * Post-checkout success page. The CareerPass is created server-side by the Stripe
 * webhook (source of truth) — this page only confirms and points to the app.
 */
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function BillingSuccessPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#38A169]/10 text-[#38A169]">
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="mb-2 text-2xl font-bold text-[#2D3748]">Paiement confirmé</h1>
      <p className="mb-8 text-gray-600">
        Votre Pass est en cours d&apos;activation. Vous pouvez dès à présent générer
        vos CV. Si l&apos;accès n&apos;est pas immédiat, patientez quelques secondes.
      </p>
      <Link href="/profile">
        <Button variant="primary">Continuer</Button>
      </Link>
    </main>
  );
}
