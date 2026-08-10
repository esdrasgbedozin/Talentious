import type { MetadataRoute } from 'next';

const SITE_URL = 'https://talentious.app';

/**
 * /sitemap.xml généré par Next (API Metadata).
 * Ne liste que les pages PUBLIQUES et indexables (pas les espaces authentifiés).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: Array<{ path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '', priority: 1.0, freq: 'weekly' },
    { path: '/register', priority: 0.8, freq: 'monthly' },
    { path: '/login', priority: 0.5, freq: 'monthly' },
    { path: '/legal/mentions-legales', priority: 0.3, freq: 'yearly' },
    { path: '/legal/confidentialite', priority: 0.3, freq: 'yearly' },
    { path: '/legal/cgu', priority: 0.3, freq: 'yearly' },
  ];

  return entries.map(({ path, priority, freq }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: freq,
    priority,
  }));
}
