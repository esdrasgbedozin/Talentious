'use client';

/** Post-checkout cancellation page — no charge was made. */
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui';

export default function BillingCancelledPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Navbar variant="authenticated" />
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold text-primary">Paiement annulé</h1>
        <p className="mb-8 text-text-secondary">
          Aucun montant n&apos;a été prélevé. Vous pouvez réessayer quand vous le
          souhaitez.
        </p>
        <Link href="/billing">
          <Button variant="primary">Revenir aux Pass</Button>
        </Link>
      </main>
    </div>
  );
}
