#!/usr/bin/env bash
# =============================================================================
# scripts/ci/trivy-scan.sh <image-ref> — scan de sécurité d'une image (M2-T23).
#
# SÉCURITÉ (revue T23) : on NE monte NI la socket docker NI le dépôt dans le
# conteneur Trivy. L'image est exportée en tar sur l'hôte (`docker save`) puis
# scannée via `--input`. Cela évite (a) l'escalade root-équivalente via
# /var/run/docker.sock et (b) l'exposition des identifiants WIF présents dans le
# workspace du job de déploiement. Scanner Trivy ÉPINGLÉ PAR DIGEST (on n'utilise
# PAS l'action trivy-action — incident supply-chain 2026-03).
#
# Deux passes :
#   1) INFORMATIVE, non bloquante : HIGH+CRITICAL (y compris non corrigées) →
#      résumé du run, pour la visibilité (angle mort documenté, revue sécu T23).
#   2) GATE bloquant : CRITICAL CORRIGEABLE seulement (--ignore-unfixed) — une
#      CRITICAL sans correctif amont ne bloque pas indéfiniment les déploiements.
#      FAIL-CLOSED : toute erreur de l'outil (DB indisponible, etc.) sort ≠ 0 et
#      bloque. NE JAMAIS neutraliser avec `|| true` / `continue-on-error`.
# Exceptions : .trivyignore à la racine (commentaire + date obligatoires).
# =============================================================================
set -euo pipefail

IMAGE="${1:?usage: trivy-scan.sh <image-ref>}"
TRIVY="aquasec/trivy:0.58.1@sha256:ab70a02200597efa04748f210f793936eb647cbcdb0ea69cc30b226d6f5a22c7"

WORK="$(mktemp -d)"
# Nettoyage BEST-EFFORT : le conteneur Trivy tourne en root et écrit son cache
# (DB de vulnérabilités) dans $WORK ; sur un runner CI non-root, le rm de ces
# fichiers root échoue. Le nettoyage ne doit JAMAIS changer le code de sortie —
# qui doit refléter le SCAN (gate fail-closed) : on capture le code réel, on
# nettoie sans le laisser échouer, puis on ressort avec ce même code.
cleanup() {
  ec=$?
  rm -rf "$WORK" 2>/dev/null || true
  exit "$ec"
}
trap cleanup EXIT
mkdir -p "$WORK/cache"

echo "→ export de l'image $IMAGE"
docker save "$IMAGE" -o "$WORK/image.tar"
# .trivyignore embarqué dans le périmètre monté (jamais le dépôt entier).
cp -f .trivyignore "$WORK/.trivyignore" 2>/dev/null || : >"$WORK/.trivyignore"

run_trivy() {
  # Le cache partagé évite un 2e téléchargement de la DB entre les deux passes.
  docker run --rm -v "$WORK:/scan" "$TRIVY" \
    image --input /scan/image.tar --cache-dir /scan/cache \
    --ignorefile /scan/.trivyignore --scanners vuln "$@"
}

echo "### Trivy — \`$IMAGE\` (informatif, HIGH+CRITICAL)" >>"${GITHUB_STEP_SUMMARY:-/dev/stdout}"
run_trivy --quiet --severity HIGH,CRITICAL --exit-code 0 --format table \
  >>"${GITHUB_STEP_SUMMARY:-/dev/stdout}" || true

echo "→ gate bloquant : CRITICAL corrigeable"
run_trivy --quiet --severity CRITICAL --ignore-unfixed --exit-code 1
echo "✅ scan Trivy OK (0 CRITICAL corrigeable) — $IMAGE"
