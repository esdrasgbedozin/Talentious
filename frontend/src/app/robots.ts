import type { MetadataRoute } from 'next';

const SITE_URL = 'https://talentious.app';

/**
 * /robots.txt généré par Next (API Metadata).
 * Autorise les pages publiques, bloque les espaces authentifiés/privés et les
 * pages utilitaires sans valeur de recherche, et pointe vers le sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/profile',
        '/cvs',
        '/cv/', // routes CV privées par identifiant (édition, impression/PDF)
        '/account',
        '/admin',
        '/billing',
        '/onboarding',
        '/verify-email',
        '/confirm-email-change',
        '/forgot-password',
        '/reset-password',
        '/design-system', // page interne de développement
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
