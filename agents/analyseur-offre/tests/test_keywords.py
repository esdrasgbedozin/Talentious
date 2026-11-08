"""
M5-T00/T01 — Sortie `keywords[]` de l'agent analyseur-offre.

Harnais de tests de l'agent (il n'en avait aucun) + ceinture de coercition
post-LLM des mots-clés : normalisés, dédupliqués, bornés, catégorie valide.
Tout tourne SANS google-genai (imports paresseux du service Vertex) : fumée
en CI avec les seules dépendances backend. Le seul appel LLM est MOQUÉ.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.models import ATSKeyword, AnalysisResult
from app.services.keyword_coercion import MAX_ALIASES, MAX_KEYWORDS, coerce_keywords

client = TestClient(app)


# --- T00 : fumée ----------------------------------------------------------


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_modele_accepte_les_keywords():
    kw = ATSKeyword(name="Python", category="hard_skill", importance="Critical")
    assert kw.name == "Python"
    # Le contrat liste `keywords` dans les champs requis, mais le modèle de l'agent
    # le défaute à [] : si le LLM l'omet (ou une analyse en cache d'avant ce champ),
    # on émet une liste vide plutôt que d'échouer. La ceinture garantit le reste.
    res = AnalysisResult(seniority_level="Senior", tone="neutre")
    assert res.keywords == []


# --- T01 : coercition des mots-clés ---------------------------------------


class TestCoerceKeywords:
    def test_non_liste_donne_liste_vide(self):
        assert coerce_keywords(None) == []
        assert coerce_keywords("nope") == []

    def test_dedup_insensible_a_la_casse(self):
        out = coerce_keywords(
            [
                {"name": "Python", "category": "hard_skill"},
                {"name": " python ", "category": "hard_skill"},
            ]
        )
        assert [k["name"] for k in out] == ["Python"]  # 1re occurrence conservée

    def test_categorie_invalide_ecartee(self):
        out = coerce_keywords(
            [
                {"name": "Python", "category": "hard_skill"},
                {"name": "Truc", "category": "pas_une_categorie"},
                {"name": "SansCategorie"},
            ]
        )
        assert [k["name"] for k in out] == ["Python"]

    def test_nom_vide_ou_non_dict_ecarte(self):
        out = coerce_keywords(
            [
                {"name": "   ", "category": "hard_skill"},
                "pas un dict",
                {"name": "Go", "category": "hard_skill"},
            ]
        )
        assert [k["name"] for k in out] == ["Go"]

    def test_importance_invalide_devient_none(self):
        out = coerce_keywords(
            [{"name": "Go", "category": "hard_skill", "importance": "Vital"}]
        )
        assert out[0]["importance"] is None

    def test_aliases_nettoyes_dedupes_et_bornes(self):
        out = coerce_keywords(
            [
                {
                    "name": "JavaScript",
                    "category": "hard_skill",
                    "aliases": ["JS", "JS", "  ", 42, "ES6", "Node", "TS", "React"],
                }
            ]
        )
        aliases = out[0]["aliases"]
        assert len(aliases) <= MAX_ALIASES
        assert aliases[:2] == ["JS", "ES6"]  # dédup + non-string écarté

    def test_borne_globale(self):
        raw = [
            {"name": f"Skill{i}", "category": "hard_skill"}
            for i in range(MAX_KEYWORDS + 15)
        ]
        assert len(coerce_keywords(raw)) == MAX_KEYWORDS

    def test_nom_tronque_a_100(self):
        out = coerce_keywords([{"name": "x" * 250, "category": "hard_skill"}])
        assert len(out[0]["name"]) == 100

    def test_deterministe(self):
        raw = [{"name": "Python", "category": "hard_skill"}]
        assert coerce_keywords(raw) == coerce_keywords(raw)

    def test_valeurs_non_hashables_ne_levent_pas(self):
        # Sortie LLM tordue : category/importance en liste/dict, name non-string.
        # Les gardes isinstance évitent un TypeError (donc un 500) ; tout est écarté
        # ou neutralisé proprement.
        out = coerce_keywords(
            [
                {"name": "a", "category": ["hard_skill"]},  # catégorie non hashable
                {"name": 123, "category": "hard_skill"},  # nom non-string
                {
                    "name": "Go",
                    "category": "hard_skill",
                    "importance": {"x": 1},  # importance non hashable
                },
            ]
        )
        assert [k["name"] for k in out] == ["Go"]
        assert out[0]["importance"] is None

    def test_categorie_tolerante(self):
        out = coerce_keywords(
            [
                {"name": "A", "category": "Hard_Skill"},
                {"name": "B", "category": "hard skill"},
                {"name": "C", "category": "requirement "},
            ]
        )
        assert [k["category"] for k in out] == [
            "hard_skill",
            "hard_skill",
            "requirement",
        ]

    def test_importance_insensible_a_la_casse(self):
        out = coerce_keywords(
            [{"name": "Go", "category": "hard_skill", "importance": "critical"}]
        )
        assert out[0]["importance"] == "Critical"

    def test_charset_assaini(self):
        # Caractères de contrôle (NUL), override bidi et zero-width retirés.
        out = coerce_keywords([{"name": "a\x00b‮c‍", "category": "hard_skill"}])
        assert out[0]["name"] == "abc"
        assert "\x00" not in out[0]["name"]

    def test_alias_dedup_contre_le_nom(self):
        out = coerce_keywords(
            [
                {
                    "name": "Python",
                    "category": "hard_skill",
                    "aliases": ["python", "PY"],
                }
            ]
        )
        # « python » == le nom (casse) -> écarté ; « PY » conservé.
        assert out[0]["aliases"] == ["PY"]


# --- T01 : la coercition est câblée dans l'endpoint (Vertex moqué) ---------


async def _fake_analyze(job_offer_text, prompt_template, **kwargs):
    # Sortie « LLM » volontairement sale : doublon, catégorie invalide, alias en trop.
    return {
        "hard_skills": [],
        "soft_skills": [],
        "seniority_level": "Senior",
        "key_responsibilities": [],
        "tone": "neutre",
        "keywords": [
            {
                "name": "Python",
                "category": "hard_skill",
                "importance": "Critical",
                "aliases": ["py", "py", "python3"],
            },
            {"name": "python", "category": "hard_skill"},  # doublon de casse
            {"name": "Mystere", "category": "inventee"},  # catégorie invalide
        ],
    }


def test_endpoint_applique_la_coercition(monkeypatch):
    monkeypatch.setattr("app.main.vertex_ai_service.analyze_job_offer", _fake_analyze)
    r = client.post("/analyze", json={"text": "o" * 60})
    assert r.status_code == 200
    keywords = r.json()["keywords"]
    assert [k["name"] for k in keywords] == ["Python"]  # dédupe + catégorie filtrée
    assert keywords[0]["aliases"] == ["py", "python3"]


async def _fake_analyze_sans_keywords(job_offer_text, prompt_template, **kwargs):
    # Analyse héritée / en cache : pas de champ `keywords` du tout.
    return {
        "hard_skills": [],
        "soft_skills": [],
        "seniority_level": "Mid-level",
        "key_responsibilities": [],
        "tone": "neutre",
    }


def test_endpoint_keywords_absent_degrade_en_liste_vide(monkeypatch):
    monkeypatch.setattr(
        "app.main.vertex_ai_service.analyze_job_offer", _fake_analyze_sans_keywords
    )
    r = client.post("/analyze", json={"text": "o" * 60})
    assert r.status_code == 200
    assert r.json()["keywords"] == []
