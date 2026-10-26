# ADR-EXPORT-DELIVERY — Livraison des fichiers d'export : download PROXIFIÉ (R2 tranché)

**Statut : ACCEPTÉ** (M2-T15, 2026-10-25). Tranche la contradiction R2 :
l'architecture V2 disait « download proxifié par le backend », le contrat
v1.1.0 décrivait `result.download_url` comme « URL signée (GCS) ».

## Décision

Le téléchargement d'un export passe par le BACKEND (`download_url` = route
backend authentifiée, ex. `GET /jobs/{job_id}/download`) ; le bucket GCS
reste 100 % PRIVÉ, aucun octet n'en sort sans passer par l'API.

- **Sécurité/RGPD** : l'ownership et l'authentification sont re-vérifiés à
  CHAQUE téléchargement. Une URL signée est un porteur anonyme : qui la
  détient télécharge — fuite d'historique, partage de lien, logs
  intermédiaires — pendant toute sa validité, sans révocation. Posture du
  projet : minimisation, moindre privilège.
- **Technique** : signer des URL depuis Cloud Run sous WIF exige
  `iam.serviceAccounts.signBlob` (API IAM Credentials, pas de clé privée
  locale) — une permission et une dépendance de plus pour un bénéfice nul à
  notre échelle. Le proxy n'exige que le rôle lecture du bucket.
- **Coût/volume** : PDF ≈ 50 Ko, bêta gratuite à faible trafic — proxyfier
  via Cloud Run est négligeable ; un offload CDN/URL signée se réévaluera si
  le volume l'exige (ce document sera alors révisé).

## Conséquences

- Contrat : `download_url` reste `format: uri` (honoré — c'est l'URL de la
  route backend) ; ses DESCRIPTIONS ne parlent plus d'URL signée GCS.
  `expires_at` reste nullable : le lien backend n'expire pas par secret —
  la disponibilité du fichier suit la politique de RÉTENTION du bucket
  (lifecycle GCS, T19) et l'état du job ; « URL expirée » devient « fichier
  purgé ⇒ relancer l'export » (le contrat le disait déjà).
- Le critère « URL expirée refusée » du ticket T15 devient : accès refusé
  sans authentification/ownership, et fichier absent ⇒ erreur typée propre
  (le re-rendu est la voie de renouvellement).
- `storage_service` (T15) expose upload/download/delete d'objets du bucket
  privé ; la route de téléchargement est T17 ; le worker écrit à T16.
- **Sémantique du téléchargement (T17, revue)** : `GET /jobs/{id}/download`
  sert l'export COURANT du CV (`cv.gcs_pdf_url`), pas une copie figée propre à
  ce job. Si le CV a été ré-exporté depuis (contenu modifié ⇒ nouvelle
  empreinte, ancien objet purgé par le worker), le `download_url` d'un ancien
  job `succeeded` sert le fichier À JOUR — comportement voulu (toujours le
  dernier rendu du CV), cohérent avec « expires_at null + relancer l'export
  pour régénérer ». Figer un fichier par job est hors périmètre bêta.
- **RGPD — purge à l'effacement (ROUTÉ, revues T16/T17)** : la suppression
  d'un CV ou d'un compte doit purger le préfixe `exports/{user_id}/...` du
  bucket (aujourd'hui `delete_cv` ne supprime pas l'objet GCS ; `cv_id` passe
  à NULL sur le job, le fichier devient inaccessible via l'API mais reste
  stocké jusqu'à la rétention). À traiter en T18/ticket RGPD avant la V1.
- **Exposition de `gcs_pdf_url` (RÉSOLU M2-T18)** : le nom d'objet interne a été
  retiré de `CVDetailResponse` (contrat + types régénérés) — voir ADR-GATING
  déc. 10. La colonne DB demeure (usage serveur : worker + download proxifié).
- Émulateur : fake-gcs-server (`STORAGE_EMULATOR_HOST`) pour les tests —
  aucun bucket réel n'est touché avant le terraform T19 ([PAH-M2b]).
