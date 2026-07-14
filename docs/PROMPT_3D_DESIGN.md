# Prompt — Concevoir une section 3D scroll-driven avec une IA

> Modèle de prompt réutilisable pour obtenir d'une IA un design 3D immersif de
> niveau « site à 100 000 € » (type Apple / Igloo). La clé : **déléguer la
> créativité (métaphore + storyboard) à l'IA**, tout en gardant le cadre, les
> critères de qualité et les points de validation.

---

## Le prompt (copier-coller — tu remplis seulement 4 blocs : produit, marque, stack, référence)

> **Produit.** Je travaille sur **[nom + une phrase : ce que ça fait, pour qui,
> quelle émotion je veux déclencher]**.
> _Ex. : « Talentious — génère un CV sur-mesure par IA à partir de ton profil,
> pour des candidats juniors, et je veux que ça inspire maîtrise et transformation »._
>
> **Ce que je te demande.** Conçois une **section scroll-driven immersive** pour
> la landing. **C'est toi qui inventes la métaphore visuelle et le storyboard** —
> c'est le cœur du travail, je ne te les impose pas. Cherche l'image forte qui
> traduit _physiquement_ la promesse du produit (transformation, assemblage,
> révélation, forge, éclosion, cristallisation…). Écarte le premier réflexe
> évident ; propose l'idée qui donne « waouh » sans être un cliché de la catégorie.
>
> **Ta démarche, dans cet ordre — ne code rien avant l'étape 3 :**
> 1. **Réfléchis à voix haute** : 2-3 métaphores candidates pour _ce_ produit,
>    avec pour chacune pourquoi elle colle à la promesse et à l'émotion visée.
>    Recommande-en une.
> 2. **Storyboard de la métaphore retenue**, en 3 actes liés par le scroll :
>    - **Acte 1** — l'état initial (les éléments bruts, dispersés, la « matière première »).
>    - **Acte 2 (la transition — le moment magique)** — comment la matière se
>      transforme / s'assemble / plonge / fusionne. C'est le pic émotionnel :
>      décris précisément le mouvement.
>    - **Acte 3** — le résultat final qui « ressort », mis en valeur,
>      tournant/flottant comme un objet précieux.
>    Décris le mapping scroll→animation (quel geste de scroll déclenche quoi) et le rythme.
> 3. **Attends ma validation** de la direction, **ensuite seulement** tu construis.
>
> **Marque.** Reste **strictement fidèle à mes tokens** : couleurs
> [#… / « lis mes variables CSS existantes »], typo [famille(s)], radius/spacing
> existants. N'invente pas de nouvelle palette ; la métaphore doit vivre _dans_
> mon identité, pas à côté.
>
> **Exigence de réalisme (rends-le tangible, pas « flat 3D ») :** une **source de
> lumière directionnelle** cohérente sur toute la scène ; **ombres de contact +
> ombres portées** pour ancrer les objets ; **matières distinctes et lisibles**
> (verre/métal/papier/cristal… — chacune réagit différemment à la lumière) ;
> **épaisseur réelle** des objets (pas de plans infiniment fins) ; **grain + sheen**
> sur les surfaces ; **atmosphère** (étincelles / god rays / vignette / brume) ;
> **profondeur de champ** ; **aberration chromatique subtile** aux bords.
> _L'objectif : « on dirait un vrai objet filmé », pas « un div qui tourne »._
>
> **Contraintes techniques.** Stack : [Next.js / React / Tailwind / motion /
> three… — mets la tienne]. **Responsive** avec un **dégradé propre sur mobile**
> (version allégée ou statique, jamais cassée). **`prefers-reduced-motion`**
> respecté (alternative crossfade/statique). **Performant en priorité** : anime
> surtout `transform`/`opacity`, filtres/blur **statiques** (rasterisés une fois,
> pas recalculés par frame), pas de `mix-blend-mode` plein écran animé,
> `will-change` ciblé. **Vérifie chaque étape au navigateur par captures d'écran**
> (états clés du scroll) et corrige ce que tu vois.
>
> **Niveau visé.** Aussi soigné que **[ta référence — ex. apple.com, igloo.inc,
> un site Awwwards]**, mais **surtout PAS [l'anti-référence — ex. « un template
> SaaS générique », « un carrousel », « de la 3D gratuite qui tourne sans raison »]**.
>
> **Boucle qualité.** Une fois construit : **auto-critique** ta réalisation
> (lisibilité, réalisme, fidélité marque, perf, cohérence de la métaphore), liste
> les faiblesses par priorité, puis **on itère**. Si tu as une skill de critique
> design (ex. `/impeccable critique`), lance-la et confronte son verdict au tien.

---

## Pourquoi il est construit comme ça (les 5 leviers)

1. **La créativité est déléguée, mais cadrée.** Tu ne dis pas _quelle_ image — tu
   dis « trouve l'image, justifie-la, écarte le cliché ». L'IA réfléchit au lieu
   de piocher le premier visuel. L'étape « 2-3 candidates + recommandation »
   l'oblige à explorer avant de s'engager.
2. **Le point d'arrêt (étape 3) est décisif.** « Ne code rien avant ma
   validation » évite de construire 2h dans une mauvaise direction. Tu valides une
   _idée_ (cheap), pas un _build_ (cher).
3. **Le réalisme est une checklist, pas un adjectif.** « Fais-le réaliste » ne
   produit rien ; « lumière directionnelle + ombres de contact + épaisseur +
   matières distinctes + DOF » donne des critères vérifiables.
4. **La perf est dans le prompt, pas en réparation après coup.** « Filtres
   statiques, pas de mix-blend animé, anime transform/opacity » — sinon on revit
   le « c'est trop lourd ».
5. **La boucle auto-critique force la 2ᵉ passe.** Une IA qui se critique
   elle-même (ou via une skill dédiée) rattrape 80 % des défauts avant qu'ils
   soient visibles.

---

## Le réflexe mental à retenir

Un bon prompt de design 3D ne décrit pas _le résultat_ — il décrit :

- **la matière** (produit + marque),
- **les critères de qualité** (réalisme + perf),
- **le processus** (propose → valide → construis → critique → itère).

La créativité, tu la laisses à l'IA ; ce que tu gardes, c'est le **cadre** et les
**points de validation**.
