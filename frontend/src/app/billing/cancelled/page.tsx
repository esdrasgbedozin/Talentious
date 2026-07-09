'use client';

/** Post-checkout cancellation page — no charge was made. */
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function BillingCancelledPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold text-[#2D3748]">Paiement annulé</h1>
      <p className="mb-8 text-gray-600">
        Aucun montant n&apos;a été prélevé. Vous pouvez réessayer quand vous le souhaitez.
      </p>
      <Link href="/billing">
        <Button variant="primary">Revenir aux Pass</Button>
      </Link>
    </main>
  );
}
