"""
M5 — Moteur de Score ATS déterministe (ADR-ATS-DETERMINISTIC).

M5-T05 : normalisation déterministe (casse, accents, ponctuation, repli de
pluriel conservateur). Fonctions pures, verrouillées par des tests tabulaires ;
mêmes entrées => même sortie, et l'ordre des entrées n'affecte pas l'ensemble
de jetons produit.
"""

import pytest

from app.generated.models import ATSKeyword
from app.services.ats_scoring import (
    AtsScoreResult,
    build_cv_corpus,
    compute_ats_score,
    fold_token,
    keyword_weight,
    match_keywords,
    normalize,
    tokenize,
)


def _kw(name, category="hard_skill", importance=None, aliases=None):
    return ATSKeyword(
        name=name,
        category=category,
        importance=importance,
        aliases=aliases or [],
    )


class TestNormalize:
    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("Python", "python"),
            ("Développeur", "developpeur"),  # accents dépouillés
            ("Machine   Learning\n", "machine learning"),  # espaces compressés
            ("R&D", "r d"),  # ponctuation -> espace
            ("Node.js", "node js"),  # point séparateur
            (".NET", "net"),  # point de tête retiré
            ("C++", "c++"),  # « + » conservé (jeton technique)
            ("C#", "c#"),  # « # » conservé (jeton technique)
            ("", ""),
            ("   ", ""),
        ],
    )
    def test_table(self, raw, expected):
        assert normalize(raw) == expected

    def test_deterministe(self):
        s = "Gestion de Projet — Agile/Scrum, CI/CD"
        assert normalize(s) == normalize(s)

    def test_non_string_tolere(self):
        # Défense en profondeur : un champ corrompu ne doit pas lever.
        assert normalize(None) == ""  # type: ignore[arg-type]
        assert normalize(42) == ""  # type: ignore[arg-type]


class TestFoldToken:
    @pytest.mark.parametrize(
        "token, expected",
        [
            ("apis", "api"),  # pluriel anglais
            ("frameworks", "framework"),
            ("languages", "language"),
            ("competences", "competence"),  # pluriel FR (déjà sans accent)
            ("css", "css"),  # se termine par « ss » : intact
            ("process", "process"),
            ("api", "api"),  # déjà singulier
            ("os", "os"),  # trop court (< 4) : intact
            ("c++", "c++"),  # pas de « s » final : intact
            ("go", "go"),
        ],
    )
    def test_table(self, token, expected):
        assert fold_token(token) == expected


class TestTokenize:
    def test_normalise_decoupe_et_replie(self):
        assert tokenize("Python, APIs et Frameworks") == [
            "python",
            "api",
            "et",
            "framework",
        ]

    def test_chaine_vide(self):
        assert tokenize("") == []

    def test_deterministe(self):
        s = "React, TypeScript, Node.js"
        assert tokenize(s) == tokenize(s)

    def test_ordre_sans_effet_sur_l_ensemble(self):
        # L'ensemble de jetons (base du matching) ne dépend pas de l'ordre.
        assert set(tokenize("python java go")) == set(tokenize("go python java"))


# ---------------------------------------------------------------------------
# M5-T06 — Corpus CV + recouvrement mots-clés / contenu
# ---------------------------------------------------------------------------

_CV = {
    "summary": "Ingénieur backend orienté produit",
    "selected_experiences": [
        {
            "title": "Développeur Senior",
            "company": "ACME",
            "description": "Conception d'APIs avec Python et FastAPI",
            "highlighted_skills": ["PostgreSQL"],
        }
    ],
    "selected_educations": [
        {"degree": "Master Informatique", "institution": "Université de Paris"}
    ],
    "selected_projects": [
        {
            "name": "Plateforme Machine Learning",
            "description": "Pipeline de données",
            "relevant_skills": ["Docker"],
        }
    ],
    "selected_certifications": [
        {"name": "Professional Cloud Architect", "issuer": "Google Cloud"}
    ],
    "highlighted_skills": [{"name": "Kubernetes", "category": "hard_skill"}],
}


class TestBuildCvCorpus:
    def test_rassemble_tous_les_champs_de_contenu(self):
        # Vérifie la PRÉSENCE du contenu (avant repli de pluriel) : chaque champ
        # du CV (résumé, expérience, formation, projet, certif, compétence) est
        # bien versé au corpus.
        corpus = normalize(build_cv_corpus(_CV))
        for term in [
            "python",
            "fastapi",
            "postgresql",
            "master",
            "machine learning",
            "docker",
            "kubernetes",
            "google",
        ]:
            assert normalize(term) in corpus

    def test_defensif_sur_document_degrade(self):
        # Champs manquants, listes absentes, valeurs non-string : aucun crash.
        assert build_cv_corpus({}) == ""
        assert build_cv_corpus({"summary": 42, "selected_experiences": "nope"}) == ""
        assert build_cv_corpus(None) == ""

    def test_deterministe(self):
        assert build_cv_corpus(_CV) == build_cv_corpus(_CV)


class TestMatchKeywords:
    def test_present_vs_absent(self):
        kws = [_kw("Python"), _kw("Rust")]
        matched, missing = match_keywords(kws, build_cv_corpus(_CV))
        assert [k.name for k in matched] == ["Python"]
        assert [k.name for k in missing] == ["Rust"]

    def test_multi_mots_contigus(self):
        corpus = build_cv_corpus(_CV)
        matched, _ = match_keywords([_kw("Machine Learning")], corpus)
        assert [k.name for k in matched] == ["Machine Learning"]

    def test_multi_mots_ordre_inverse_non_apparie(self):
        corpus = build_cv_corpus(_CV)
        _, missing = match_keywords([_kw("Learning Machine")], corpus)
        assert [k.name for k in missing] == ["Learning Machine"]

    def test_alias_apparie(self):
        # Nom absent, mais un alias présent dans le CV.
        kw = _kw("JavaScript", aliases=["PostgreSQL"])
        matched, _ = match_keywords([kw], build_cv_corpus(_CV))
        assert [k.name for k in matched] == ["JavaScript"]

    def test_tolerance_pluriel(self):
        # Le CV contient « APIs », le mot-clé est « API ».
        matched, _ = match_keywords([_kw("API")], build_cv_corpus(_CV))
        assert [k.name for k in matched] == ["API"]

    def test_ordre_des_motcles_preserve(self):
        kws = [_kw("Rust"), _kw("Python"), _kw("Go"), _kw("Docker")]
        matched, missing = match_keywords(kws, build_cv_corpus(_CV))
        assert [k.name for k in matched] == ["Python", "Docker"]
        assert [k.name for k in missing] == ["Rust", "Go"]

    def test_deterministe(self):
        kws = [_kw("Python"), _kw("Rust")]
        corpus = build_cv_corpus(_CV)
        assert match_keywords(kws, corpus) == match_keywords(kws, corpus)


# ---------------------------------------------------------------------------
# M5-T07 — Pondération catégorie × importance + score borné 0-100
# ---------------------------------------------------------------------------


class TestKeywordWeight:
    @pytest.mark.parametrize(
        "category, importance, expected",
        [
            ("hard_skill", "Critical", 4.5),  # 3 × 1.5
            ("hard_skill", "Important", 3.0),  # 3 × 1.0
            ("hard_skill", None, 3.0),  # absente = Important
            ("requirement", None, 2.0),  # 2 × 1.0
            ("soft_skill", "Nice to have", 0.5),  # 1 × 0.5
        ],
    )
    def test_table(self, category, importance, expected):
        assert keyword_weight(_kw("X", category, importance)) == expected


class TestComputeScore:
    def test_moitie_couverte(self):
        # Un hard matché, un hard manquant (même poids) => 50.
        kws = [_kw("Python"), _kw("Rust")]
        res = compute_ats_score(kws, _CV)
        assert res.score == 50

    def test_tout_matche(self):
        res = compute_ats_score([_kw("Python"), _kw("Docker")], _CV)
        assert res.score == 100

    def test_rien_matche(self):
        res = compute_ats_score([_kw("Rust"), _kw("Elixir")], _CV)
        assert res.score == 0

    def test_zero_motcle(self):
        res = compute_ats_score([], _CV)
        assert res.score == 0
        assert res.matched == []
        assert res.missing == []

    def test_importance_pondere_le_score(self):
        # Même recouvrement, mais le manquant est Critical (poids plus lourd)
        # => score plus bas que si le manquant était Nice to have.
        base = [_kw("Python", "hard_skill", "Important")]  # matché, poids 3
        crit_missing = base + [_kw("Rust", "hard_skill", "Critical")]  # 4.5
        nice_missing = base + [_kw("Rust", "hard_skill", "Nice to have")]  # 1.5
        assert (
            compute_ats_score(crit_missing, _CV).score
            < compute_ats_score(nice_missing, _CV).score
        )

    def test_deterministe(self):
        kws = [_kw("Python"), _kw("Rust")]
        assert compute_ats_score(kws, _CV) == compute_ats_score(kws, _CV)

    def test_golden(self):
        # Scénario de référence figé (golden) : toute dérive de la formule casse
        # ce test — on amende alors l'ADR. Calcul :
        #   matchés : Python(hard,Crit=4.5) FastAPI(hard,Imp=3) Docker(hard,—=3)
        #             Master(req,Imp=2) = 12.5
        #   total   : +Rust(hard,Crit=4.5) +Leadership(soft,Nice=0.5) = 17.5
        #   score   : round(100 × 12.5 / 17.5) = 71
        kws = [
            _kw("Python", "hard_skill", "Critical"),
            _kw("FastAPI", "hard_skill", "Important"),
            _kw("Rust", "hard_skill", "Critical"),
            _kw("Docker", "hard_skill", None),
            _kw("Leadership", "soft_skill", "Nice to have"),
            _kw("Master", "requirement", "Important"),
        ]
        res = compute_ats_score(kws, _CV)
        assert res.score == 71
        assert [k.name for k in res.matched] == [
            "Python",
            "FastAPI",
            "Docker",
            "Master",
        ]
        assert [k.name for k in res.missing] == ["Rust", "Leadership"]
        assert isinstance(res, AtsScoreResult)
