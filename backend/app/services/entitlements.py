"""
Service `entitlements` — LE point de décision du gating serveur (ADR-GATING).

Toute capacité premium (Bible §4.3) se décide ICI, jamais dans le front ni
éparpillée dans les routes. Les décisions sont PURES (un `Subject` + des faits
⇒ une `Decision`, aucune I/O) : la table de vérité complète se teste en
unitaire. Chaque refus porte le type Problem RFC 7807 EXACT du contrat
(réponse `PassRequired`, 402) — la route n'a qu'à le transporter.

Règles produit encodées :
- D1 (anti-ressentiment) : « Pass expiré » ≡ « gratuit » pour les actions
  NEUVES — la lecture et le re-téléchargement de l'existant ne passent JAMAIS
  par ce service (ownership seul, anti-IDOR 404 — M2-T17) ;
- l'admin n'est jamais concerné par le gating (contrat : PassRequired) ;
- quota de variantes par COUNT à la demande (jamais un compteur stocké, qui
  divergerait) ;
- `created_under_pass` : l'édition d'un document créé sous Pass est premium ;
  un document créé gratuit reste éditable gratuitement.

Seuls `subject_for` et `count_variants` touchent la base (chargeurs minces).
"""

import enum
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.career_pass import CareerPass
from app.models.generated_cv import DocumentLanguage, GeneratedCV
from app.models.user import User, UserRole

# Engagement produit (Bible §4.3) : la gratuité autorise UNE variante.
FREE_VARIANT_LIMIT = 1


class DenialReason(str, enum.Enum):
    """Motifs de refus = types Problem RFC 7807 du contrat. Les motifs premium
    viennent de la réponse `PassRequired` (402) ; AUTH_REQUIRED est un 401 —
    `http_status` évite qu'une route transporte le mauvais code (revue sécu
    M1-T08, pt 5)."""

    AUTH_REQUIRED = "https://talentious.fr/errors/unauthorized"
    CAREER_PASS_REQUIRED = "https://talentious.fr/errors/career-pass-required"
    PREMIUM_TEMPLATE_REQUIRED = "https://talentious.fr/errors/premium-template-required"
    PREMIUM_THEME_REQUIRED = "https://talentious.fr/errors/premium-theme-required"
    PREMIUM_LANGUAGE_REQUIRED = "https://talentious.fr/errors/premium-language-required"
    VARIANT_LIMIT_REACHED = "https://talentious.fr/errors/variant-limit-reached"

    @property
    def http_status(self) -> int:
        return 401 if self is DenialReason.AUTH_REQUIRED else 402


@dataclass(frozen=True)
class Decision:
    """Résultat d'une décision de gating : autorisé, ou refusé AVEC motif."""

    allowed: bool
    reason: DenialReason | None = None

    def __post_init__(self) -> None:
        # Un refus sans motif serait un 402 muet ; un motif sur une
        # autorisation, un mensonge. Invariant structurel.
        if self.allowed == (self.reason is not None):
            raise ValueError("Decision : allowed et reason sont exclusifs")

    def __bool__(self) -> bool:
        return self.allowed


_ALLOW = Decision(True)


@dataclass(frozen=True)
class Subject:
    """Qui demande — projection minimale du user pour décider (pure)."""

    is_authenticated: bool
    is_admin: bool
    has_active_pass: bool

    def __post_init__(self) -> None:
        # Un anonyme ne peut être ni admin ni porteur de Pass : l'état
        # incohérent est IRREPRÉSENTABLE (revue sécu M1-T08, pt 6) plutôt
        # que rattrapé par l'ordre des tests dans chaque règle.
        if not self.is_authenticated and (self.is_admin or self.has_active_pass):
            raise ValueError("Subject anonyme : ni admin ni Pass possibles")


def _premium(subject: Subject, reason: DenialReason) -> Decision:
    """Capacité premium : admin ou Pass actif ; sinon refus motivé."""
    if not subject.is_authenticated:
        return Decision(False, DenialReason.AUTH_REQUIRED)
    if subject.is_admin or subject.has_active_pass:
        return _ALLOW
    return Decision(False, reason)


def can_edit(subject: Subject, *, created_under_pass: bool) -> Decision:
    """Éditer une Variante existante. Un document créé GRATUIT reste éditable
    gratuitement ; un document créé SOUS PASS verrouille son édition (D1 —
    l'ownership est contrôlé en amont par la route, anti-IDOR)."""
    if not subject.is_authenticated:
        return Decision(False, DenialReason.AUTH_REQUIRED)
    if not created_under_pass:
        return _ALLOW
    return _premium(subject, DenialReason.CAREER_PASS_REQUIRED)


def can_use_template(subject: Subject, *, is_free: bool) -> Decision:
    """Utiliser un template (génération, édition, duplication)."""
    if not subject.is_authenticated:
        return Decision(False, DenialReason.AUTH_REQUIRED)
    if is_free:
        return _ALLOW
    return _premium(subject, DenialReason.PREMIUM_TEMPLATE_REQUIRED)


def can_use_theme(subject: Subject, *, preset_is_free: bool | None) -> Decision:
    """Utiliser un thème. `preset_is_free=None` = thème PERSONNALISÉ (pas de
    preset — T05 : `theme_preset_id` NULL), toujours premium (Bible §4.3)."""
    if not subject.is_authenticated:
        return Decision(False, DenialReason.AUTH_REQUIRED)
    if preset_is_free is True:
        return _ALLOW
    return _premium(subject, DenialReason.PREMIUM_THEME_REQUIRED)


def can_use_language(subject: Subject, language: DocumentLanguage) -> Decision:
    """Langue du document : FR gratuit, EN premium (Bible §4.3)."""
    if not subject.is_authenticated:
        return Decision(False, DenialReason.AUTH_REQUIRED)
    if language is DocumentLanguage.FR:
        return _ALLOW
    return _premium(subject, DenialReason.PREMIUM_LANGUAGE_REQUIRED)


def can_create_variant(subject: Subject, *, variant_count: int) -> Decision:
    """Créer une variante NEUVE. Le stock existant n'est jamais supprimé (D1) :
    un stock hérité du Pass bloque simplement le neuf gratuit."""
    if variant_count < 0:
        # Fail-closed : un compte négatif est un bug de l'appelant, pas une
        # autorisation (revue sécu M1-T08, pt 2).
        raise ValueError(f"variant_count négatif ({variant_count})")
    if not subject.is_authenticated:
        return Decision(False, DenialReason.AUTH_REQUIRED)
    if subject.is_admin or subject.has_active_pass:
        return _ALLOW
    if variant_count < FREE_VARIANT_LIMIT:
        return _ALLOW
    return Decision(False, DenialReason.VARIANT_LIMIT_REACHED)


async def subject_for(db: AsyncSession, user: User | None) -> Subject:
    """Construit le Subject d'un user : seul un pass ACTIF (valid_until dans
    le futur) compte — un pass expiré redonne le profil « gratuit » (D1)."""
    if user is None:
        return Subject(is_authenticated=False, is_admin=False, has_active_pass=False)
    active = await db.execute(
        select(CareerPass.id)
        .where(CareerPass.user_id == user.id)
        .where(CareerPass.valid_until > datetime.now(timezone.utc))
        .limit(1)
    )
    return Subject(
        is_authenticated=True,
        is_admin=user.role == UserRole.ADMIN,
        has_active_pass=active.scalar_one_or_none() is not None,
    )


async def count_variants(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Quota par COUNT à la demande (ADR-GATING) : l'état réel de la base,
    jamais un compteur dénormalisé. ⚠️ Le COUNT ne protège PAS de la
    concurrence (TOCTOU : deux créations simultanées lisent le même compte —
    revue sécu M1-T08, pt 1) : la route qui crée une variante doit prendre
    `pg_advisory_xact_lock(user_id)` (ou FOR UPDATE sur la ligne user) dans
    la MÊME transaction que le COUNT et l'INSERT — exigé au ticket de
    câblage, avec test de concurrence."""
    result = await db.execute(
        select(func.count())
        .select_from(GeneratedCV)
        .where(GeneratedCV.user_id == user_id)
    )
    return int(result.scalar_one())
