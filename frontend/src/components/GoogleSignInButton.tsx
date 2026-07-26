'use client';

/**
 * Bouton « Continuer avec Google » (Google Identity Services, flux credential).
 *
 * Rendu par Google lui-même (branding conforme). Le composant charge le script
 * GIS à la demande et remet le jeton d'identité au parent — c'est le backend
 * qui le vérifie (POST /auth/google). Sans NEXT_PUBLIC_GOOGLE_CLIENT_ID
 * configuré, le bouton est simplement absent (feature flag implicite).
 */

import { useEffect, useRef } from 'react';

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: object) => void;
        };
      };
    };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function GoogleSignInButton({
  onCredential,
}: {
  onCredential: (credential: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID) return;

    const render = () => {
      if (!window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => callbackRef.current(response.credential),
      });
      containerRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        locale: 'fr',
        width: 320,
      });
    };

    if (window.google?.accounts) {
      render();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', render, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, []);

  if (!CLIENT_ID) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-text-secondary">ou</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <div ref={containerRef} className="flex justify-center" />
    </div>
  );
}
