"""
M1-T08 — Service `entitlements` : les décisions de gating serveur (ADR-GATING).

Critère du ticket : TABLE DE VÉRITÉ unitaire sur les cinq profils (anonyme,
gratuit, Pass actif, Pass expiré, admin), y compris l'effet de
`created_under_pass`.

Principes testés (Bible §4.3/§4.4, D1 actée) :
- les décisions sont PURES (aucune I/O) : un sujet + des faits ⇒ une décision ;
- chaque refus porte le type Problem RFC 7807 EXACT du contrat (PassRequired) ;
- « Pass expiré » ≡ « gratuit » dans l'espace de décision (D1 : retour aux
  capacités gratuites pour le neuf) — la table le PROUVE ligne à ligne ;
- l'admin n'est jamais concerné par le gating (contrat : « le rôle admin n'est
  jamais concerné ») ;
- quota de variantes par COUNT (jamais un compteur stocké) ;
- `created_under_pass` : l'édition d'un document créé sous Pass est premium ;
  un document créé gratuit reste éditable gratuitement.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.models import DocumentLanguage, GeneratedCV, User
from app.models.career_pass import CareerPass, PassType
from app.services.entitlements import (
    FREE_VARIANT_LIMIT,
    DenialReason,
    Subject,
    can_create_variant,
    can_edit,
    can_use_language,
    can_use_template,
    can_use_theme,
    count_variants,
    subject_for,
)

# Les profils de la table de vérité. « Pass expiré » et « gratuit » ont
# le même Subject PAR CONSTRUCTION (subject_for ne retient qu'un pass ACTIF) :
# les deux lignes restent distinctes ici pour prouver la règle D1.
# « admin_et_pass » (cumul) verrouille le cas revue sécu 6.
ANONYME = Subject(is_authenticated=False, is_admin=False, has_active_pass=False)
GRATUIT = Subject(is_authenticated=True, is_admin=False, has_active_pass=False)
PASS_ACTIF = Subject(is_authenticated=True, is_admin=False, has_active_pass=True)
PASS_EXPIRE = Subject(is_authenticated=True, is_admin=False, has_active_pass=False)
ADMIN = Subject(is_authenticated=True, is_admin=True, has_active_pass=False)
ADMIN_ET_PASS = Subject(is_authenticated=True, is_admin=True, has_active_pass=True)

_PROFILS = {
    "anonyme": ANONYME,
    "gratuit": GRATUIT,
    "pass_actif": PASS_ACTIF,
    "pass_expire": PASS_EXPIRE,
    "admin": ADMIN,
    "admin_et_pass": ADMIN_ET_PASS,
}


def _expect(decision, attendu):
    """`attendu` : True (autorisé) ou le DenialReason exact du refus."""
    if attendu is True:
        assert decision.allowed is True
        assert decision.reason is None
        assert bool(decision) is True
    else:
        assert decision.allowed is False
        assert decision.reason is attendu
        assert bool(decision) is False


class TestTableDeVerite:
    @pytest.mark.parametrize(
        ("profil", "created_under_pass", "attendu"),
        [
            # Document créé GRATUIT : éditable par son auteur, Pass ou pas (D1).
            ("anonyme", False, DenialReason.AUTH_REQUIRED),
            ("gratuit", False, True),
            ("pass_actif", False, True),
            ("pass_expire", False, True),
            ("admin", False, True),
            # Document créé SOUS PASS : l'édition premium se verrouille (D1).
            ("anonyme", True, DenialReason.AUTH_REQUIRED),
            ("gratuit", True, DenialReason.CAREER_PASS_REQUIRED),
            ("pass_actif", True, True),
            ("pass_expire", True, DenialReason.CAREER_PASS_REQUIRED),
            ("admin", True, True),
            ("admin_et_pass", True, True),
        ],
    )
    def test_can_edit(self, profil, created_under_pass, attendu):
        decision = can_edit(_PROFILS[profil], created_under_pass=created_under_pass)
        _expect(decision, attendu)

    @pytest.mark.parametrize(
        ("profil", "is_free", "attendu"),
        [
            ("anonyme", True, DenialReason.AUTH_REQUIRED),
            ("gratuit", True, True),
            ("pass_actif", True, True),
            ("pass_expire", True, True),
            ("admin", True, True),
            ("anonyme", False, DenialReason.AUTH_REQUIRED),
            ("gratuit", False, DenialReason.PREMIUM_TEMPLATE_REQUIRED),
            ("pass_actif", False, True),
            ("pass_expire", False, DenialReason.PREMIUM_TEMPLATE_REQUIRED),
            ("admin", False, True),
        ],
    )
    def test_can_use_template(self, profil, is_free, attendu):
        _expect(can_use_template(_PROFILS[profil], is_free=is_free), attendu)

    @pytest.mark.parametrize(
        ("profil", "preset_is_free", "attendu"),
        [
            # Preset gratuit (anthracite).
            ("anonyme", True, DenialReason.AUTH_REQUIRED),
            ("gratuit", True, True),
            ("pass_actif", True, True),
            ("pass_expire", True, True),
            ("admin", True, True),
            # Preset premium.
            ("anonyme", False, DenialReason.AUTH_REQUIRED),
            ("gratuit", False, DenialReason.PREMIUM_THEME_REQUIRED),
            ("pass_actif", False, True),
            ("pass_expire", False, DenialReason.PREMIUM_THEME_REQUIRED),
            ("admin", False, True),
            # Thème PERSONNALISÉ (pas de preset — T05 : preset_id NULL).
            ("anonyme", None, DenialReason.AUTH_REQUIRED),
            ("gratuit", None, DenialReason.PREMIUM_THEME_REQUIRED),
            ("pass_actif", None, True),
            ("pass_expire", None, DenialReason.PREMIUM_THEME_REQUIRED),
            ("admin", None, True),
            ("admin_et_pass", None, True),
        ],
    )
    def test_can_use_theme(self, profil, preset_is_free, attendu):
        _expect(can_use_theme(_PROFILS[profil], preset_is_free=preset_is_free), attendu)

    @pytest.mark.parametrize(
        ("profil", "langue", "attendu"),
        [
            ("anonyme", DocumentLanguage.FR, DenialReason.AUTH_REQUIRED),
            ("gratuit", DocumentLanguage.FR, True),
            ("pass_actif", DocumentLanguage.FR, True),
            ("pass_expire", DocumentLanguage.FR, True),
            ("admin", DocumentLanguage.FR, True),
            ("anonyme", DocumentLanguage.EN, DenialReason.AUTH_REQUIRED),
            ("gratuit", DocumentLanguage.EN, DenialReason.PREMIUM_LANGUAGE_REQUIRED),
            ("pass_actif", DocumentLanguage.EN, True),
            (
                "pass_expire",
                DocumentLanguage.EN,
                DenialReason.PREMIUM_LANGUAGE_REQUIRED,
            ),
            ("admin", DocumentLanguage.EN, True),
            ("admin_et_pass", DocumentLanguage.EN, True),
        ],
    )
    def test_can_use_language(self, profil, langue, attendu):
        _expect(can_use_language(_PROFILS[profil], langue), attendu)

    @pytest.mark.parametrize(
        ("profil", "variant_count", "attendu"),
        [
            # Première variante : la gratuité en autorise UNE (Bible §4.3).
            ("anonyme", 0, DenialReason.AUTH_REQUIRED),
            ("gratuit", 0, True),
            ("pass_actif", 0, True),
            ("pass_expire", 0, True),
            ("admin", 0, True),
            # Au-delà : premium. Un stock hérité du Pass (D1 : les variantes
            # existantes RESTENT) bloque le neuf gratuit, sans rien supprimer.
            ("gratuit", 1, DenialReason.VARIANT_LIMIT_REACHED),
            ("gratuit", 3, DenialReason.VARIANT_LIMIT_REACHED),
            ("pass_actif", 3, True),
            ("pass_expire", 1, DenialReason.VARIANT_LIMIT_REACHED),
            ("pass_expire", 3, DenialReason.VARIANT_LIMIT_REACHED),
            ("admin", 3, True),
            ("admin_et_pass", 3, True),
        ],
    )
    def test_can_create_variant(self, profil, variant_count, attendu):
        _expect(
            can_create_variant(_PROFILS[profil], variant_count=variant_count),
            attendu,
        )

    def test_la_limite_gratuite_est_une_seule_variante(self):
        """La valeur elle-même est un engagement produit (Bible §4.3)."""
        assert FREE_VARIANT_LIMIT == 1

    def test_un_count_negatif_est_refuse_pas_fail_open(self):
        """Revue sécu 2 : `variant_count < limite` autoriserait n'importe quel
        entier négatif passé par erreur — on lève au lieu d'autoriser."""
        with pytest.raises(ValueError, match="variant_count"):
            can_create_variant(GRATUIT, variant_count=-1)

    def test_un_subject_incoherent_est_irrepresentable(self):
        """Revue sécu 6 : un anonyme ne peut être ni admin ni porteur de Pass
        — l'état incohérent lève à la construction au lieu d'exister."""
        with pytest.raises(ValueError, match="anonyme"):
            Subject(is_authenticated=False, is_admin=True, has_active_pass=False)
        with pytest.raises(ValueError, match="anonyme"):
            Subject(is_authenticated=False, is_admin=False, has_active_pass=True)

    def test_le_statut_http_de_chaque_motif(self):
        """Revue sécu 5 : AUTH_REQUIRED est un 401, pas un 402 PassRequired —
        une route qui transporte la décision ne doit pas se tromper de code."""
        assert DenialReason.AUTH_REQUIRED.http_status == 401
        for reason in DenialReason:
            if reason is not DenialReason.AUTH_REQUIRED:
                assert reason.http_status == 402

    def test_les_motifs_existent_dans_le_contrat(self):
        """Revue sécu 9 : ancrage ANTI-DÉRIVE — chaque URL de motif doit
        exister telle quelle dans contracts/openapi.yaml (si le contrat
        renomme un type d'erreur, ce test casse ici, pas en prod)."""
        contrat = (
            Path(__file__).resolve().parents[2] / "contracts" / "openapi.yaml"
        ).read_text(encoding="utf-8")
        for reason in DenialReason:
            assert reason.value in contrat, f"{reason.name} absent du contrat"

    def test_les_raisons_portent_les_types_problem_du_contrat(self):
        """Chaque refus doit pointer le type RFC 7807 EXACT du contrat
        (PassRequired) — c'est ce que les routes renverront en 402."""
        assert (
            DenialReason.CAREER_PASS_REQUIRED.value
            == "https://talentious.fr/errors/career-pass-required"
        )
        assert (
            DenialReason.PREMIUM_TEMPLATE_REQUIRED.value
            == "https://talentious.fr/errors/premium-template-required"
        )
        assert (
            DenialReason.PREMIUM_THEME_REQUIRED.value
            == "https://talentious.fr/errors/premium-theme-required"
        )
        assert (
            DenialReason.PREMIUM_LANGUAGE_REQUIRED.value
            == "https://talentious.fr/errors/premium-language-required"
        )
        assert (
            DenialReason.VARIANT_LIMIT_REACHED.value
            == "https://talentious.fr/errors/variant-limit-reached"
        )
        assert (
            DenialReason.AUTH_REQUIRED.value
            == "https://talentious.fr/errors/unauthorized"
        )


class TestChargeursDB:
    """Les deux seuls points de contact avec la base : construire le Subject
    (pass ACTIF uniquement) et compter les variantes (quota par COUNT)."""

    async def test_subject_for_sans_user_rend_l_anonyme(self, test_db):
        """Revue sécu 7 : le chemin `user=None` est couvert explicitement."""
        assert await subject_for(test_db, None) == ANONYME

    async def test_subject_for_distingue_pass_actif_et_expire(self, test_db, test_user):
        now = datetime.now(timezone.utc)

        subject = await subject_for(test_db, test_user)
        assert subject == GRATUIT

        # Pass EXPIRÉ : le sujet reste « gratuit » (D1).
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=now - timedelta(days=1),
            )
        )
        await test_db.flush()
        subject = await subject_for(test_db, test_user)
        assert subject == PASS_EXPIRE
        assert subject.has_active_pass is False

        # Pass ACTIF.
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=now + timedelta(days=10),
            )
        )
        await test_db.flush()
        subject = await subject_for(test_db, test_user)
        assert subject == PASS_ACTIF

    async def test_subject_for_admin(self, test_db, admin_user):
        subject = await subject_for(test_db, admin_user)
        assert subject.is_admin is True
        assert subject.is_authenticated is True

    async def test_count_variants_compte_les_cv_du_seul_user(
        self, test_db, test_user, admin_user
    ):
        assert await count_variants(test_db, test_user.id) == 0
        for owner, name in (
            (test_user, "mien 1"),
            (test_user, "mien 2"),
            (admin_user, "pas à moi"),
        ):
            test_db.add(
                GeneratedCV(
                    user_id=owner.id,
                    cv_name=name,
                    template_id="modern_sobre",
                    cv_data_json={"summary": "x"},
                )
            )
        await test_db.flush()
        assert await count_variants(test_db, test_user.id) == 2
        assert await count_variants(test_db, admin_user.id) == 1
