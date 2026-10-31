#!/usr/bin/env python3
"""Tests du garde-fou M2-T21 (stdlib unittest, aucune dépendance).

Lancé en CI par `python scripts/ci/test_check_backend_max_instances.py` : le
répertoire du script est alors sur sys.path, d'où l'import direct.
Critère de fin du ticket : ROUGE sur une config à 2, VERT à 1 — plus les
régressions trouvées en revue (faux négatifs par commentaire, valeur non
littérale, 0, scaling manuel, ambiguïté → échec fermé).
"""

from __future__ import annotations

import os
import tempfile
import unittest

import check_backend_max_instances as guard
from check_backend_max_instances import check, find_backend_max_instances

# frontend autorise LÉGITIMEMENT 2 instances : le garde-fou doit lire le bloc
# BACKEND, pas celui du frontend.
_FRONTEND_MAX_2 = """
resource "google_cloud_run_v2_service" "frontend" {
  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = "${local.registry}/frontend:${var.image_tag}"
      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }
    }
  }
}
"""


def _backend(body: str) -> str:
    """Bloc backend avec une image interpolée (contient des `}`) + `body` injecté
    dans le template, pour tester le contenu réel du scaling."""
    return f"""
resource "google_cloud_run_v2_service" "backend" {{
  template {{
{body}
    containers {{
      image = "${{local.registry}}/backend:${{var.image_tag}}"
      resources {{
        limits = {{ cpu = "1", memory = "512Mi" }}
      }}
    }}
  }}
}}
"""


def _scaling(max_count: str) -> str:
    return f"""    scaling {{
      min_instance_count = 0
      max_instance_count = {max_count}
    }}"""


class FindBackendMaxInstances(unittest.TestCase):
    def test_vert_a_1_et_rouge_a_2(self):
        self.assertEqual(find_backend_max_instances(_backend(_scaling("1"))), 1)
        self.assertEqual(find_backend_max_instances(_backend(_scaling("2"))), 2)

    def test_ignore_le_frontend_et_lit_le_backend(self):
        hcl = _FRONTEND_MAX_2 + _backend(_scaling("1")) + _FRONTEND_MAX_2
        self.assertEqual(find_backend_max_instances(hcl), 1)

    def test_bloc_backend_absent(self):
        self.assertIsNone(find_backend_max_instances(_FRONTEND_MAX_2))

    # --- Faux négatifs trouvés en revue : un commentaire ne doit JAMAIS compter ---
    def test_commentaire_leurre_avant_la_vraie_valeur(self):
        body = "    # historique : max_instance_count = 1\n" + _scaling("5")
        # L'ancienne version renvoyait 1 (vert à tort) ; on attend 5 → violation.
        self.assertEqual(find_backend_max_instances(_backend(body)), 5)

    def test_commentaire_leurre_ne_cree_pas_de_faux_positif(self):
        body = "    # avant: max_instance_count = 2\n" + _scaling("1")
        self.assertEqual(find_backend_max_instances(_backend(body)), 1)

    def test_valeur_non_litterale_est_indeterminable(self):
        self.assertIsNone(find_backend_max_instances(_backend(_scaling("var.m"))))

    def test_declaration_multiple_est_indeterminable(self):
        body = _scaling("1") + "\n    scaling { max_instance_count = 1 }"
        self.assertIsNone(find_backend_max_instances(_backend(body)))

    def test_scaling_manuel_est_indeterminable(self):
        body = '    scaling_mode = "MANUAL"\n    manual_instance_count = 2'
        self.assertIsNone(find_backend_max_instances(_backend(body)))

    def test_sans_espaces_et_crlf(self):
        hcl = _backend("    scaling { max_instance_count=3 }").replace("\n", "\r\n")
        self.assertEqual(find_backend_max_instances(hcl), 3)

    def test_heredoc_equilibre_est_neutralise(self):
        body = (
            "    # heredoc avec une accolade } et un faux max_instance_count = 9\n"
            "    annotation = <<EOT\n    } max_instance_count = 9\n    EOT\n"
            + _scaling("1")
        )
        self.assertEqual(find_backend_max_instances(_backend(body)), 1)

    def test_chaine_non_terminee_leve_guarderror(self):
        with self.assertRaises(guard.GuardError):
            find_backend_max_instances(_backend('    annotation = "oops\n'))

    # --- 2e revue : une EXPRESSION commençant par un entier ne doit pas passer ---
    def test_expression_additive_indeterminable(self):
        self.assertIsNone(find_backend_max_instances(_backend(_scaling("1 + 4"))))

    def test_expression_ternaire_indeterminable(self):
        self.assertIsNone(
            find_backend_max_instances(_backend(_scaling("1 == 1 ? 5 : 1")))
        )

    def test_bloc_inline_valide_est_lu(self):
        body = "    scaling { max_instance_count = 1 }"
        self.assertEqual(find_backend_max_instances(_backend(body)), 1)

    # --- 2e revue : en-tête en commentaire/chaîne ne doit pas être choisi ---
    def test_entete_backend_en_commentaire_est_ignore(self):
        leurre = '# resource "google_cloud_run_v2_service" "backend" {\n'
        # Leurre commenté AVANT le vrai backend à 5 : doit lire 5, pas être trompé.
        hcl = leurre + _backend(_scaling("5"))
        self.assertEqual(find_backend_max_instances(hcl), 5)

    def test_deux_entetes_backend_reels_indeterminable(self):
        hcl = _backend(_scaling("1")) + _backend(_scaling("2"))
        self.assertIsNone(find_backend_max_instances(hcl))


class Check(unittest.TestCase):
    def _run_on(self, content: str) -> tuple[int, str]:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".tf", delete=False, encoding="utf-8"
        ) as handle:
            handle.write(content)
            path = handle.name
        try:
            return check(path)
        finally:
            os.unlink(path)

    def test_vert_a_1(self):
        code, _ = self._run_on(_FRONTEND_MAX_2 + _backend(_scaling("1")))
        self.assertEqual(code, 0)

    def test_rouge_a_2(self):
        code, msg = self._run_on(_FRONTEND_MAX_2 + _backend(_scaling("2")))
        self.assertEqual(code, 1)
        self.assertIn("max_instance_count = 2", msg)

    def test_zero_est_une_violation(self):
        code, _ = self._run_on(_backend(_scaling("0")))
        self.assertEqual(code, 1)

    def test_commentaire_leurre_ne_masque_pas_une_violation(self):
        body = "    # max_instance_count = 1\n" + _scaling("5")
        code, msg = self._run_on(_backend(body))
        self.assertEqual(code, 1)
        self.assertIn("= 5", msg)

    def test_non_litteral_echoue_ferme(self):
        code, _ = self._run_on(_backend(_scaling("var.m")))
        self.assertEqual(code, 2)

    def test_scaling_manuel_echoue_ferme(self):
        body = '    scaling_mode = "MANUAL"\n    manual_instance_count = 2'
        code, _ = self._run_on(_backend(body))
        self.assertEqual(code, 2)

    def test_bloc_absent_echoue_ferme(self):
        code, _ = self._run_on(_FRONTEND_MAX_2)
        self.assertEqual(code, 2)

    def test_chaine_non_terminee_echoue_ferme(self):
        code, _ = self._run_on(_backend('    annotation = "oops\n'))
        self.assertEqual(code, 2)

    def test_fichier_illisible_echoue_ferme(self):
        code, _ = check("/chemin/qui/n/existe/pas.tf")
        self.assertEqual(code, 2)

    def test_fichier_reel_actuellement_vert(self):
        real = os.path.join(
            os.path.dirname(__file__), "..", "..", "infra", "services.tf"
        )
        code, msg = check(os.path.normpath(real))
        self.assertEqual(code, 0, msg)


class Main(unittest.TestCase):
    def _write(self, content: str) -> str:
        handle = tempfile.NamedTemporaryFile(
            "w", suffix=".tf", delete=False, encoding="utf-8"
        )
        handle.write(content)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def test_main_rend_le_code(self):
        self.assertEqual(guard.main(["prog", self._write(_backend(_scaling("1")))]), 0)
        self.assertEqual(guard.main(["prog", self._write(_backend(_scaling("2")))]), 1)
        self.assertEqual(guard.main(["prog", self._write(_FRONTEND_MAX_2)]), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
