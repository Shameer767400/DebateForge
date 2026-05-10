"""ML service test suite — fallacy detection, scoring, and pipelines."""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


class TestHealth:
    def test_health_endpoint(self):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "nlp" in data

    def test_root_endpoint(self):
        res = client.get("/")
        assert res.status_code == 200
        data = res.json()
        assert data["service"] == "DebateForge ML"
        assert "endpoints" in data


class TestFallacyDetection:
    def test_no_fallacy_in_clean_argument(self):
        res = client.post("/fallacy/detect", json={
            "argument": "Research shows that renewable energy reduces costs by 30%.",
            "context": [],
        })
        assert res.status_code == 200
        data = res.json()
        assert data["fallacy_type"] in ("no_fallacy", "appeal_to_authority")

    def test_detects_slippery_slope(self):
        res = client.post("/fallacy/detect", json={
            "argument": "If we allow this policy, it will lead to complete chaos.",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["detected"] is True
        assert data["fallacy_type"] == "slippery_slope"

    def test_detects_ad_hominem(self):
        res = client.post("/fallacy/detect", json={
            "argument": "You clearly don't understand basic economics.",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["detected"] is True
        assert data["fallacy_type"] == "ad_hominem"

    def test_detects_false_dichotomy(self):
        res = client.post("/fallacy/detect", json={
            "argument": "Either we ban this completely or we accept total chaos.",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["detected"] is True
        assert data["fallacy_type"] == "false_dichotomy"

    def test_empty_argument(self):
        res = client.post("/fallacy/detect", json={"argument": ""})
        assert res.status_code == 200
        assert res.json()["detected"] is False


class TestScoring:
    def test_scores_argument(self):
        res = client.post("/scorer/score", json={
            "argument": "Studies show that 73% of participants improved with practice.",
            "topic": "education reform",
        })
        assert res.status_code == 200
        data = res.json()
        assert 0 <= data["logic"] <= 100
        assert 0 <= data["evidence"] <= 100
        assert 0 <= data["clarity"] <= 100
        assert "feedback" in data

    def test_sentiment_in_response(self):
        res = client.post("/scorer/score", json={
            "argument": "This is absolutely devastating and heartbreaking!",
            "topic": "test",
        })
        data = res.json()
        assert "sentiment" in data

    def test_short_argument(self):
        res = client.post("/scorer/score", json={
            "argument": "I disagree.",
            "topic": "test",
        })
        assert res.status_code == 200


class TestPipelines:
    def test_language_detection(self):
        from pipelines import detect_language
        assert detect_language("Hello world") == "en"
        assert detect_language("") is None

    def test_non_latin_detection(self):
        from utils import is_non_latin
        assert is_non_latin("Hello world") is False

    def test_sentence_splitting(self):
        from utils import split_sentences
        result = split_sentences("First point. Second point! Third?")
        assert len(result) == 3

    def test_cosine_similarity(self):
        import numpy as np
        from utils.embedding_utils import cosine_similarity
        a = np.array([1, 0, 0])
        b = np.array([1, 0, 0])
        assert cosine_similarity(a, b) == pytest.approx(1.0)

        c = np.array([0, 1, 0])
        assert cosine_similarity(a, c) == pytest.approx(0.0)
