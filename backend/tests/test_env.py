"""Tests for the local OpenEnv gym-style environment and grader.

Run with: pytest tests/ -v
"""
import pytest

from env.main import FirewallEnv, Action
from env.grader import run_episode, smart_agent


@pytest.mark.parametrize("task", ["easy", "medium", "hard"])
def test_env_reset_and_step_shapes(task):
    env = FirewallEnv(task_type=task)
    obs = env.reset()
    assert obs.traffic_type in ("normal", "attack")
    assert 0.0 <= obs.anomaly_score <= 1.0
    assert obs.step_count == 0

    result = env.step(Action(decision="sandbox"))
    assert set(result.keys()) == {"observation", "reward", "done", "info"}
    assert -2.0 <= result["reward"] <= 1.0
    assert isinstance(result["done"], bool)


def test_env_episode_terminates_at_max_steps():
    env = FirewallEnv(task_type="medium")
    env.reset()
    done = False
    steps = 0
    while not done:
        result = env.step(Action(decision="sandbox"))
        done = result["done"]
        steps += 1
        assert steps <= env.max_steps, "episode ran past max_steps without done=True"
    assert steps == env.max_steps


@pytest.mark.parametrize("task", ["easy", "medium", "hard"])
def test_grader_run_episode_does_not_crash_and_is_bounded(task):
    """Regression test for the historical grader.py bug: env.step() returns a
    dict, and unpacking it as a 4-tuple silently corrupted `done`/`reward` and
    crashed with a TypeError. This must keep passing."""
    score = run_episode(task, runs=3)
    assert 0.0 <= score <= 1.0


def test_smart_agent_is_deterministic_given_observation():
    from env.main import Observation

    high = Observation(traffic_type="attack", anomaly_score=0.9, step_count=0, task_type="easy")
    mid = Observation(traffic_type="attack", anomaly_score=0.5, step_count=0, task_type="easy")
    low = Observation(traffic_type="normal", anomaly_score=0.1, step_count=0, task_type="easy")

    assert smart_agent(high).decision == "block"
    assert smart_agent(mid).decision == "sandbox"
    assert smart_agent(low).decision == "allow"
