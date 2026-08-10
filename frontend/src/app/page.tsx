/**
 * Route racine (serveur) : porte les métadonnées SEO (dont le canonical
 * auto-référent) que la landing — Client Component — ne peut pas exporter.
 * Le rendu visuel vit dans HomeClient.
 */
import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function Page() {
  return <HomeClient />;
}
