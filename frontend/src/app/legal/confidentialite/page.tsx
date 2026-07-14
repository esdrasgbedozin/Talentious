import type { Metadata } from 'next';
import { LegalHeader, Section, Field } from '@/components/legal/prose';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Talentious',
  description: 'Comment Talentious traite et protège vos données personnelles (RGPD).',
};

export default function ConfidentialitePage() {
  return (
    <article>
      <LegalHeader title="Politique de confidentialité" updated="11 juillet 2026" />

      <Section title="Responsable du traitement">
        <p>
          Le responsable du traitement de vos données est Esdras Gbedozin (éditeur du
          service, voir les{' '}
          <a href="/legal/mentions-legales" className="font-medium text-action hover:underline">
            mentions légales
          </a>
          ).
        </p>
        <Field label="Contact">egbedozin@gmail.com</Field>
        <p>Aucun délégué à la protection des données (DPO) n&apos;a été désigné.</p>
      </Section>

      <Section title="Données que nous collectons">
        <p>Nous collectons uniquement les données nécessaires au fonctionnement du service :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-text-primary">Compte</span> : votre adresse
            email et votre mot de passe (stocké sous forme hachée, jamais en clair).
          </li>
          <li>
            <span className="font-medium text-text-primary">Profil professionnel</span> :
            les informations que vous saisissez (identité, coordonnées, expériences,
            formations, compétences, projets, certifications, langues).
          </li>
          <li>
            <span className="font-medium text-text-primary">CV générés</span> : le contenu
            structuré et les documents produits à partir de votre profil.
          </li>
          <li>
            <span className="font-medium text-text-primary">Données techniques</span> :
            journaux de connexion (adresse IP, horodatage) à des fins de sécurité et de bon
            fonctionnement.
          </li>
        </ul>
      </Section>

      <Section title="Finalités et bases légales">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Fournir le service (compte, profil, génération de CV) —{' '}
            <span className="font-medium text-text-primary">exécution du contrat</span> (nos CGU).
          </li>
          <li>
            Assurer la sécurité et prévenir les abus (journaux techniques) —{' '}
            <span className="font-medium text-text-primary">intérêt légitime</span>.
          </li>
          <li>
            Traiter les paiements, lorsqu&apos;ils seront activés —{' '}
            <span className="font-medium text-text-primary">exécution du contrat</span>.
          </li>
        </ul>
      </Section>

      <Section title="Destinataires et sous-traitants">
        <p>
          Vos données ne sont ni vendues, ni utilisées à des fins publicitaires. Elles sont
          traitées par un nombre restreint de sous-traitants techniques :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-text-primary">Google Cloud</span> — hébergement
            et génération par IA (Vertex AI). Le traitement a lieu dans l&apos;Union
            européenne (région Paris).
          </li>
          <li>
            <span className="font-medium text-text-primary">Stripe</span> — traitement des
            paiements (actuellement en mode test, aucun paiement réel). Stripe peut traiter
            certaines données aux États-Unis, encadré par des garanties appropriées (clauses
            contractuelles types / Data Privacy Framework).
          </li>
        </ul>
      </Section>

      <Section title="Durées de conservation">
        <ul className="list-disc space-y-1 pl-5">
          <li>Compte, profil et CV : conservés tant que votre compte est actif.</li>
          <li>
            En cas de suppression du compte : effacement{' '}
            <span className="font-medium text-text-primary">immédiat et définitif</span> de
            l&apos;ensemble de vos données (le droit à l&apos;effacement est intégré au
            produit).
          </li>
          <li>Journaux techniques : conservés pour une durée limitée (12 mois maximum).</li>
        </ul>
      </Section>

      <Section title="Vos droits">
        <p>
          Conformément au Règlement général sur la protection des données (RGPD), vous
          disposez des droits d&apos;accès, de rectification, d&apos;effacement, de
          limitation, d&apos;opposition et de portabilité de vos données.
        </p>
        <p>
          Vous pouvez exercer la plupart de ces droits directement depuis votre profil — la
          suppression de compte efface immédiatement toutes vos données. Pour toute autre
          demande, écrivez à egbedozin@gmail.com.
        </p>
        <p>
          Vous avez également le droit d&apos;introduire une réclamation auprès de la CNIL
          (
          <a
            href="https://www.cnil.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-action hover:underline"
          >
            www.cnil.fr
          </a>
          ).
        </p>
      </Section>

      <Section title="Sécurité">
        <p>
          Nous mettons en œuvre des mesures adaptées : mots de passe hachés (bcrypt),
          sessions à jetons courts et rotatifs, chiffrement des échanges (HTTPS) et principe
          du moindre privilège sur nos accès.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Le service n&apos;utilise que des cookies strictement nécessaires à son
          fonctionnement (session et authentification). Aucun cookie publicitaire ni traceur
          tiers n&apos;est déposé, aucun consentement supplémentaire n&apos;est donc requis.
        </p>
      </Section>
    </article>
  );
}
