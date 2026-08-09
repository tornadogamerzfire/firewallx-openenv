"""Tests for the deployed FirewallX API (app.py).

Run with: pytest tests/ -v
"""
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app as app_module

REWARD_RANGE_RE = re.compile(r"reward_range:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]")


@pytest.fixture
def client():
    return TestClient(app_module.app)


@pytest.fixture
def declared_reward_range():
    """Parse reward_range straight out of openenv.yaml so tests fail the moment
    the spec and the implementation drift apart again."""
    text = (Path(__file__).parent.parent / "openenv.yaml").read_text()
    match = REWARD_RANGE_RE.search(text)
    assert match, "openenv.yaml must declare reward_range: [min, max]"
    return float(match.group(1)), float(match.group(2))


def test_root(client):
    assert client.get("/").json() == {"status": "running"}


def test_reset_returns_valid_state(client):
    data = client.post("/reset").json()
    assert data["state"]["traffic_type"] in ("normal", "attack")
    assert 0.0 <= data["state"]["anomaly_score"] <= 1.0
    assert data["state"]["step_count"] == 0


@pytest.mark.parametrize("task", ["easy", "medium", "hard"])
def test_set_task_valid(client, task):
    resp = client.post("/set_task", params={"task_type": task})
    assert resp.status_code == 200
    assert resp.json()["task_type"] == task


def test_set_task_invalid_is_rejected(client):
    resp = client.post("/set_task", params={"task_type": "impossible"})
    assert resp.status_code == 422


def test_set_task_missing_param_is_rejected(client):
    resp = client.post("/set_task")
    assert resp.status_code == 422


def test_predict_schema_and_bounds(client, declared_reward_range):
    lo, hi = declared_reward_range
    client.post("/set_task", params={"task_type": "medium"})
    client.post("/reset")

    data = client.post("/predict").json()

    assert data["decision"] in ("allow", "block", "sandbox")
    assert 0.0 <= data["confidence_score"] <= 1.0
    assert lo <= data["reward"] <= hi
    assert isinstance(data["done"], bool)
    assert data["current_state"]["traffic_type"] in ("normal", "attack")
    assert data["next_state"]["traffic_type"] in ("normal", "attack")


def test_episode_done_flag_after_max_steps(client):
    client.post("/set_task", params={"task_type": "easy"})
    client.post("/reset")

    results = [client.post("/predict").json() for _ in range(5)]

    assert [r["done"] for r in results] == [False, False, False, False, True]


def test_normal_traffic_never_hard_blocked(client):
    """Regression guard: a block decision on normal traffic would always score
    -2 and represents a false-positive the safety lock is meant to prevent."""
    client.post("/set_task", params={"task_type": "hard"})
    for _ in range(300):
        client.post("/reset")
        data = client.post("/predict").json()
        if data["current_state"]["traffic_type"] == "normal":
            assert data["decision"] != "block"


@pytest.mark.parametrize("task", ["easy", "medium", "hard"])
def test_average_score_meets_readme_target(client, task):
    """README claims ~0.90+ per task in its example output; we assert a looser
    but still meaningful floor (0.6) across many random episodes so a future
    change to the decision engine that meaningfully hurts accuracy gets caught."""

    def normalize(r):
        return (r + 10) / 15

    client.post("/set_task", params={"task_type": task})

    total = 0.0
    episodes = 150
    for _ in range(episodes):
        client.post("/reset")
        ep_reward = sum(client.post("/predict").json()["reward"] for _ in range(5))
        total += normalize(ep_reward)

    avg = total / episodes
    assert avg >= 0.6, f"{task} average score {avg:.3f} fell below floor"
