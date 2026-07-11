import type { Metadata } from 'next';
import { LegalHeader, Section, Field } from '@/components/legal/prose';

export const metadata: Metadata = {
  title: 'Mentions légales — Talentious',
  description: 'Mentions légales du service Talentious.',
};

export default function MentionsLegalesPage() {
  return (
    <article>
      <LegalHeader title="Mentions légales" updated="11 juillet 2026" />

      <Section title="Éditeur du site">
        <p>
          Le site et le service Talentious sont édités par une personne physique agissant
          à titre non professionnel, dans le cadre d&apos;un projet personnel :
        </p>
        <Field label="Éditeur">Esdras Gbedozin</Field>
        <Field label="Adresse">50 rue du Général Crémer, 92700 Colombes, France</Field>
        <Field label="Contact">egbedozin@gmail.com</Field>
        <Field label="Directeur de la publication">Esdras Gbedozin</Field>
      </Section>

      <Section title="Hébergement">
        <p>Le site est hébergé par :</p>
        <Field label="Hébergeur">Google Cloud EMEA Limited</Field>
        <Field label="Adresse">
          Velasco, Clanwilliam Place, Dublin 2, D02 XR62, Irlande
        </Field>
        <p>
          L&apos;infrastructure applicative et les données sont localisées dans l&apos;Union
          européenne, en région <span className="font-medium text-text-primary">europe-west9 (Paris, France)</span>.
        </p>
      </Section>

      <Section title="Nature du service">
        <p>
          Talentious est un service en ligne de génération et d&apos;adaptation de CV
          assistée par intelligence artificielle. Il est actuellement proposé à titre
          gratuit, en phase de bêta ; aucune transaction financière réelle n&apos;est
          réalisée à ce stade.
        </p>
      </Section>

      <Section title="Propriété intellectuelle">
        <p>
          La structure du site, son identité visuelle et ses contenus originaux sont
          protégés par le droit de la propriété intellectuelle. Toute reproduction non
          autorisée est interdite.
        </p>
        <p>
          Vous conservez l&apos;entière propriété des données que vous saisissez et des CV
          générés à partir de votre profil.
        </p>
      </Section>

      <Section title="Données personnelles">
        <p>
          Le traitement de vos données personnelles est décrit dans notre{' '}
          <a
            href="/legal/confidentialite"
            className="font-medium text-action hover:underline"
          >
            Politique de confidentialité
          </a>
          . Conformément au RGPD, vous disposez de droits que vous pouvez exercer depuis
          votre profil ou à l&apos;adresse egbedozin@gmail.com.
        </p>
      </Section>
    </article>
  );
}
