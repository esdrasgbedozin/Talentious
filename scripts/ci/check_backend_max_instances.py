#!/usr/bin/env python3
"""Garde-fou CI (M2-T21) : échoue si le backend Cloud Run n'est pas borné à UNE
instance (`max_instance_count == 1`).

Pourquoi : le backend assume une seule instance en bêta (cf. commentaire dans
infra/services.tf). Deux invariants en dépendent et casseraient en SILENCE
au-delà d'une instance, faute d'état partagé (pas de Redis) :
  - le rate-limit est in-memory (par instance) ;
  - « un seul job actif par utilisateur » s'appuie sur un verrou applicatif.

Le garde-fou lit la valeur DÉCLARÉE dans le Terraform (source de vérité de la
config de service). Posture FAIL-CLOSED : tout ce qui ne peut pas être vérifié
avec certitude (bloc absent, déclaration multiple, valeur non littérale, scaling
manuel, fichier ambigu) renvoie le code 2 (CI rouge) plutôt que de laisser
passer.

Parsing sans dépendance HCL : `_mask()` neutralise (remplace par des espaces, en
préservant longueur et sauts de ligne) le CONTENU des chaînes doubles — donc les
interpolations `${...}` et les `}` qui y vivent —, les commentaires (`#`, `//`,
`/* */`) et les corps de heredocs (`<<ID … ID`). La recherche ne porte alors que
sur du CODE : un `max_instance_count` en commentaire n'est jamais pris pour la
vraie valeur (c'était un faux négatif de la 1re version, revue T21).

PÉRIMÈTRE : vérifie `template.scaling.max_instance_count` tel que DÉCLARÉ. Le
scaling MANUEL (`scaling_mode`/`manual_instance_count`) fait échouer fermé (non
couvert → à revoir à la main). Ne détecte pas une dérive runtime hors Terraform
(un `gcloud run services update --max-instances` manuel) : l'IaC reste la source
de vérité, la CI ne déploie que des images. Ne lit que `infra/services.tf` : une
2e ressource backend dans un autre fichier échapperait au contrôle, mais
Terraform refuse de toute façon un doublon d'adresse.
"""

from __future__ import annotations

import re
import sys

BACKEND_HEADER = re.compile(
    r'resource\s+"google_cloud_run_v2_service"\s+"backend"\s*\{'
)
# Capture la valeur jusqu'à la fin de ligne de CODE (ou `}` d'un bloc inline) :
# on exige ensuite un entier littéral APRÈS strip, donc `1 + 4`, `1 * 5`, un
# ternaire, etc. ne passent pas pour « 1 » (faux négatif de la 2e revue T21).
_MAX_DECL = re.compile(r"max_instance_count\s*=\s*([^\n}]*)")
_MANUAL_MARKERS = re.compile(r"\b(?:scaling_mode|manual_instance_count)\b")
_INT_LITERAL = re.compile(r"\d+")


class GuardError(Exception):
    """Config impossible à vérifier de façon fiable → échec fermé (code 2)."""


def _mask(text: str) -> str:
    """Remplace par des espaces (longueur et `\\n` préservés) le contenu des
    chaînes doubles, les commentaires et les corps de heredocs, pour que les
    recherches ne portent que sur du code. Lève GuardError sur une chaîne ou un
    heredoc non terminé (ambiguïté → échec fermé)."""
    out = list(text)
    n = len(text)

    def blank(start: int, end: int) -> None:
        for k in range(start, end):
            if out[k] != "\n":
                out[k] = " "

    i = 0
    while i < n:
        c = text[i]
        if c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == "\n":
                    raise GuardError("chaîne non terminée")
                j += 1
            if j >= n:
                raise GuardError("chaîne non terminée")
            blank(i, j + 1)
            i = j + 1
        elif c == "#" or (c == "/" and i + 1 < n and text[i + 1] == "/"):
            j = i
            while j < n and text[j] != "\n":
                j += 1
            blank(i, j)
            i = j
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            j = i + 2
            while j + 1 < n and not (text[j] == "*" and text[j + 1] == "/"):
                j += 1
            end = min(j + 2, n)
            blank(i, end)
            i = end
        elif c == "<" and i + 1 < n and text[i + 1] == "<":
            opener = re.match(r"<<-?(\w+)", text[i:])
            if opener is None:
                i += 1
                continue
            tag = opener.group(1)
            newline = text.find("\n", i)
            if newline == -1:
                raise GuardError("heredoc non terminé")
            terminator = re.search(
                rf"^[ \t]*{re.escape(tag)}[ \t]*$", text[newline + 1 :], re.M
            )
            if terminator is None:
                raise GuardError("heredoc non terminé")
            end = newline + 1 + terminator.end()
            blank(i, end)
            i = end
        else:
            i += 1
    return "".join(out)


def _matching_brace(masked: str, open_idx: int) -> int:
    """Index de l'accolade fermante correspondant à `masked[open_idx] == '{'`.
    `masked` est déjà neutralisé, donc toutes les accolades sont structurelles."""
    depth = 0
    for i in range(open_idx, len(masked)):
        if masked[i] == "{":
            depth += 1
        elif masked[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    raise GuardError("accolade du bloc backend non refermée")


def find_backend_max_instances(hcl: str) -> int | None:
    """Valeur ENTIÈRE LITTÉRALE de `max_instance_count` du bloc backend, ou None
    si elle est indéterminable de façon fiable (bloc/champ absent, déclaration
    multiple, valeur non littérale, scaling manuel). None ⇒ échec fermé.
    Lève GuardError si le fichier est ambigu (chaîne/heredoc non terminés)."""
    masked = _mask(hcl)  # longueur préservée : les index restent alignés
    # En-têtes cherchés sur le texte ORIGINAL (labels intacts) mais retenus
    # seulement s'ils sont du CODE — non blanchis par _mask. Un en-tête en
    # commentaire ou en chaîne (`# resource ... "backend" {`) est donc ignoré
    # (même classe de leurre que le commentaire-leurre, revue T21). On exige
    # EXACTEMENT un en-tête réel.
    headers = [m for m in BACKEND_HEADER.finditer(hcl) if masked[m.start()] != " "]
    if len(headers) != 1:
        return None
    open_idx = headers[0].end() - 1  # position du '{' ouvrant du bloc
    block = masked[open_idx : _matching_brace(masked, open_idx) + 1]

    if _MANUAL_MARKERS.search(block):
        return None  # scaling manuel non couvert → échec fermé
    decls = [d.strip() for d in _MAX_DECL.findall(block)]
    if len(decls) != 1:
        return None  # 0 ou plusieurs déclarations → échec fermé
    if not _INT_LITERAL.fullmatch(decls[0]):
        return None  # valeur non littérale (var/local/expression) → échec fermé
    return int(decls[0])


def check(path: str) -> tuple[int, str]:
    """(code de sortie, message). 0 = OK (==1), 1 = violation (!=1),
    2 = indéterminable (échec fermé)."""
    try:
        with open(path, encoding="utf-8") as handle:
            hcl = handle.read()
    except OSError as exc:
        return 2, f"{path}: lecture impossible ({exc}) — garde-fou M2-T21 fermé."
    try:
        value = find_backend_max_instances(hcl)
    except GuardError as exc:
        return 2, f"{path}: config non vérifiable ({exc}) — garde-fou M2-T21 fermé."

    if value is None:
        return 2, (
            f"{path}: max_instance_count du backend indéterminable (bloc absent, "
            "déclaration multiple, valeur non littérale, ou scaling manuel) — "
            "garde-fou M2-T21 en échec fermé. Déclarer explicitement un entier : "
            "scaling { max_instance_count = 1 }."
        )
    if value != 1:
        return 1, (
            f"{path}: backend max_instance_count = {value} (attendu : 1). Le "
            "rate-limit in-memory et l'unicité de job par utilisateur exigent 1 "
            "instance tant qu'il n'y a pas de store partagé (Redis). Remettre à 1, "
            "ou introduire ce store AVANT de lever cette borne. (M2-T21)"
        )
    return 0, f"{path}: backend max_instance_count = 1 — OK. (M2-T21)"


def main(argv: list[str]) -> int:
    path = argv[1] if len(argv) > 1 else "infra/services.tf"
    code, message = check(path)
    print(message, file=sys.stderr if code else sys.stdout)
    return code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
