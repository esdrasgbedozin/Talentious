import type { Metadata } from 'next';
import { LegalHeader, Section } from '@/components/legal/prose';

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — Talentious",
  description: "Conditions générales d'utilisation du service Talentious.",
};

export default function CGUPage() {
  return (
    <article>
      <LegalHeader title="Conditions générales d'utilisation" updated="11 juillet 2026" />

      <Section title="1. Objet">
        <p>
          Les présentes conditions générales d&apos;utilisation (les « CGU ») régissent
          l&apos;accès et l&apos;utilisation du service Talentious. En créant un compte ou en
          utilisant le service, vous acceptez ces CGU.
        </p>
      </Section>

      <Section title="2. Description du service">
        <p>
          Talentious est un service en ligne de génération et d&apos;adaptation de CV
          assistée par intelligence artificielle. Il est actuellement fourni à titre gratuit,
          en phase de bêta, et est susceptible d&apos;évoluer.
        </p>
      </Section>

      <Section title="3. Compte utilisateur">
        <p>
          Vous vous engagez à fournir des informations exactes lors de votre inscription et à
          préserver la confidentialité de vos identifiants. Vous êtes responsable des
          activités réalisées depuis votre compte.
        </p>
      </Section>

      <Section title="4. Utilisation acceptable">
        <p>Vous vous engagez à ne pas :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>utiliser le service à des fins illicites ou frauduleuses ;</li>
          <li>
            saisir des données dont vous n&apos;êtes pas titulaire ou que vous n&apos;êtes
            pas autorisé à utiliser ;
          </li>
          <li>
            tenter de porter atteinte à la sécurité, à l&apos;intégrité ou à la
            disponibilité du service ;
          </li>
          <li>contourner les limitations techniques ou les mécanismes d&apos;accès.</li>
        </ul>
      </Section>

      <Section title="5. Contenus générés par IA">
        <p>
          Les CV sont produits automatiquement à partir des informations que vous fournissez.
          Vous devez relire et vérifier l&apos;exactitude de chaque CV avant toute
          utilisation. Talentious ne garantit aucun résultat (obtention d&apos;entretien ou
          d&apos;emploi).
        </p>
      </Section>

      <Section title="6. Propriété intellectuelle">
        <p>
          Le service et ses composants restent la propriété de l&apos;éditeur. Vous conservez
          la propriété de vos données et des CV générés à partir de votre profil.
        </p>
      </Section>

      <Section title="7. Disponibilité">
        <p>
          Le service étant en bêta, il peut évoluer, être temporairement indisponible ou
          interrompu, sans préavis. Aucune garantie de disponibilité continue n&apos;est
          fournie.
        </p>
      </Section>

      <Section title="8. Responsabilité">
        <p>
          Le service est fourni « en l&apos;état ». Dans les limites permises par la loi,
          l&apos;éditeur ne saurait être tenu responsable des dommages indirects résultant de
          l&apos;utilisation du service. Vous êtes seul responsable de l&apos;usage que vous
          faites des CV générés.
        </p>
      </Section>

      <Section title="9. Données personnelles">
        <p>
          Le traitement de vos données est décrit dans notre{' '}
          <a href="/legal/confidentialite" className="font-medium text-action hover:underline">
            Politique de confidentialité
          </a>
          .
        </p>
      </Section>

      <Section title="10. Résiliation">
        <p>
          Vous pouvez supprimer votre compte à tout moment depuis votre profil ; cette
          suppression entraîne l&apos;effacement immédiat et définitif de vos données.
        </p>
      </Section>

      <Section title="11. Modification des CGU">
        <p>
          Les présentes CGU peuvent être mises à jour. La version applicable est celle publiée
          sur cette page à la date de votre utilisation.
        </p>
      </Section>

      <Section title="12. Droit applicable et litiges">
        <p>
          Les présentes CGU sont soumises au droit français. En cas de différend, une solution
          amiable sera recherchée en priorité. À défaut, les tribunaux français seront
          compétents.
        </p>
      </Section>
    </article>
  );
}
