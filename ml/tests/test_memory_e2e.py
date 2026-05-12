"""End-to-end tests for the memory router using actual TF-IDF embeddings."""

import os
import time
import pytest
from fastapi.testclient import TestClient

# Ensure tests use local memory mode
os.environ["USE_LOCAL_MEMORY"] = "true"

from main import app
from routers.memory import FAISS_DIR

client = TestClient(app)

TEST_USER_ID = "test_user_memory_123"
TEST_DEBATE_ID = "test_debate_456"

@pytest.fixture(autouse=True)
def setup_teardown():
    # Setup: ensure clean state
    client.delete(f"/memory/clear/{TEST_USER_ID}")
    yield
    # Teardown: clean up after test
    client.delete(f"/memory/clear/{TEST_USER_ID}")


def test_memory_store_and_weakness_profile_e2e():
    """Verify end-to-end vector memory and weakness profiling claims."""
    
    # 1. Store a strong argument
    res1 = client.post("/memory/store", json={
        "user_id": TEST_USER_ID,
        "argument_text": "Solar energy is highly efficient and creates jobs.",
        "scores": {"logic": 90, "evidence": 85, "clarity": 95, "overall": 90},
        "fallacy_type": "no_fallacy",
        "topic": "climate_change",
        "debate_id": TEST_DEBATE_ID,
        "turn_number": 1
    })
    assert res1.status_code == 200
    assert res1.json()["stored"] is True
    
    # 2. Store a weak argument with a fallacy
    res2 = client.post("/memory/store", json={
        "user_id": TEST_USER_ID,
        "argument_text": "If we use solar energy, the sun will run out and everyone will freeze.",
        "scores": {"logic": 30, "evidence": 20, "clarity": 80, "overall": 43},
        "fallacy_type": "slippery_slope",
        "topic": "climate_change",
        "debate_id": TEST_DEBATE_ID,
        "turn_number": 2
    })
    assert res2.status_code == 200
    
    # 3. Store another weak argument with the same fallacy
    res3 = client.post("/memory/store", json={
        "user_id": TEST_USER_ID,
        "argument_text": "If we build wind turbines, the wind will stop blowing.",
        "scores": {"logic": 25, "evidence": 15, "clarity": 75, "overall": 38},
        "fallacy_type": "slippery_slope",
        "topic": "renewable_energy",
        "debate_id": TEST_DEBATE_ID,
        "turn_number": 3
    })
    assert res3.status_code == 200
    
    # 4. Verify weakness profiling
    res_weak = client.get(f"/memory/weaknesses/{TEST_USER_ID}")
    assert res_weak.status_code == 200
    data = res_weak.json()
    
    # The system should identify the recurring fallacy and weak topics
    assert data["top_fallacy"] == "slippery_slope"
    assert len(data["weak_topics"]) > 0
    assert "climate_change" in data["weak_topics"] or "renewable_energy" in data["weak_topics"]
    assert "target these areas" in data["weakness_summary"].lower()
    
    # 5. Verify coaching plan generation
    res_coach = client.get(f"/memory/coaching-plan/{TEST_USER_ID}")
    assert res_coach.status_code == 200
    coach_data = res_coach.json()
    
    assert coach_data["drill_fallacy"] == "slippery_slope"
    assert coach_data["drill_fallacy_count"] == 2
    assert "slippery slope" in coach_data["scenario_prompt"].lower()

def test_memory_clear():
    """Verify clearing the vector memory works properly."""
    res = client.post("/memory/store", json={
        "user_id": TEST_USER_ID,
        "argument_text": "Test argument",
        "scores": {"logic": 50},
        "topic": "test",
        "debate_id": "test"
    })
    
    # Verify index file exists
    index_path = os.path.join(FAISS_DIR, f"{TEST_USER_ID}.index")
    assert os.path.exists(index_path)
    
    # Clear memory
    del_res = client.delete(f"/memory/clear/{TEST_USER_ID}")
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True
    
    # Verify index file is deleted
    assert not os.path.exists(index_path)
