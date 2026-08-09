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


# =========================================================================
# CORS (added for the HTML/CSS/JS frontend, which runs on a different origin)
# =========================================================================
def test_cors_preflight_allows_cross_origin_post(client):
    resp = client.options(
        "/predict",
        headers={
            "Origin": "http://localhost:5500",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "*"


def test_cors_header_present_on_actual_response(client):
    resp = client.post("/predict", headers={"Origin": "http://localhost:5500"})
    assert resp.headers.get("access-control-allow-origin") == "*"


# =========================================================================
# GET /state — read-only, must never mutate the environment
# =========================================================================
def test_get_state_is_read_only(client):
    client.post("/set_task", params={"task_type": "medium"})
    client.post("/reset")

    first = client.get("/state").json()
    second = client.get("/state").json()
    third = client.get("/state").json()

    assert first == second == third, "GET /state must not mutate the environment"
    assert first["step_count"] == 0
    assert first["done"] is False


def test_get_state_reflects_predict_progress(client):
    client.post("/set_task", params={"task_type": "easy"})
    client.post("/reset")
    client.post("/predict")
    client.post("/predict")

    state = client.get("/state").json()
    assert state["step_count"] == 2
    assert len(state["history"]) == 2


def test_get_state_schema(client):
    data = client.get("/state").json()
    assert set(data.keys()) == {
        "traffic_type", "anomaly_score", "task_type", "step_count", "done", "history",
    }
    assert data["traffic_type"] in ("normal", "attack")
    assert 0.0 <= data["anomaly_score"] <= 1.0


# =========================================================================
# POST /benchmark — batch analysis for the frontend's analytics panel
# =========================================================================
@pytest.mark.parametrize("task", ["easy", "medium", "hard"])
def test_benchmark_schema_and_bounds(client, task, declared_reward_range):
    resp = client.post("/benchmark", params={"task_type": task, "episodes": 20})
    assert resp.status_code == 200
    data = resp.json()

    assert data["task_type"] == task
    assert data["episodes"] == 20
    assert data["total_steps"] == 100
    assert 0.0 <= data["avg_score"] <= 1.0
    assert 0.0 <= data["avg_confidence"] <= 1.0
    assert 0.0 <= data["attack_block_rate"] <= 1.0
    assert 0.0 <= data["normal_allow_rate"] <= 1.0

    lo, hi = declared_reward_range
    assert lo <= data["avg_reward_per_step"] <= hi

    counts = data["decision_counts"]
    assert counts["allow"] + counts["block"] + counts["sandbox"] == data["total_steps"]


def test_benchmark_rejects_invalid_task(client):
    resp = client.post("/benchmark", params={"task_type": "impossible", "episodes": 5})
    assert resp.status_code == 422


def test_benchmark_episode_count_is_bounded(client):
    too_many = client.post("/benchmark", params={"task_type": "easy", "episodes": 100000})
    assert too_many.status_code == 422

    zero = client.post("/benchmark", params={"task_type": "easy", "episodes": 0})
    assert zero.status_code == 422


def test_benchmark_does_not_disturb_live_episode_state(client):
    """Regression guard: batch analysis runs its own independent simulation
    and must never touch the shared `state` dict the step-by-step demo uses."""
    client.post("/set_task", params={"task_type": "easy"})
    client.post("/reset")
    client.post("/predict")

    before = client.get("/state").json()
    client.post("/benchmark", params={"task_type": "hard", "episodes": 100})
    after = client.get("/state").json()

    assert before == after


def test_benchmark_score_is_consistent_with_predict_endpoint(client):
    """The batch simulation reuses the same decision/reward functions as
    /predict, so its average score should land close to what many manual
    episodes through /predict itself produce for the same difficulty."""

    def normalize(r):
        return (r + 10) / 15

    client.post("/set_task", params={"task_type": "medium"})
    manual_total = 0.0
    manual_episodes = 80
    for _ in range(manual_episodes):
        client.post("/reset")
        ep_reward = sum(client.post("/predict").json()["reward"] for _ in range(5))
        manual_total += normalize(ep_reward)
    manual_avg = manual_total / manual_episodes

    bench = client.post("/benchmark", params={"task_type": "medium", "episodes": 300}).json()

    assert abs(manual_avg - bench["avg_score"]) < 0.08, (
        f"manual avg {manual_avg:.3f} vs benchmark avg {bench['avg_score']:.3f} diverged too much"
    )
