import os
import random
from typing import List, Literal

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="FirewallX",
    description="Adaptive Firewall Environment for AI Agent Decision-Making.",
)

# =========================
# CORS (needed so the static HTML/CSS/JS frontend, served from a different
# origin than the API, can call these endpoints from the browser)
# =========================
# ALLOWED_ORIGINS can be set to a comma-separated list of exact origins in
# production (e.g. "https://your-frontend.example.com"). Defaults to "*" for
# ease of local development and demoing; credentials are disabled either way
# since this API doesn't use cookies/auth.
_allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
_origins = ["*"] if _allowed_origins_env == "*" else [
    o.strip() for o in _allowed_origins_env.split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

TaskType = Literal["easy", "medium", "hard"]
Decision = Literal["allow", "block", "sandbox"]

MAX_STEPS = 5

# Documented confidence formula (see README "Decision Logic"):
#   confidence = ANOMALY_WEIGHT * anomaly_score + TRAFFIC_WEIGHT * (+1 if attack else -1)
# This is an interpretable diagnostic signal returned alongside every decision.
# The decision itself is produced by the adaptive engine below, which additionally
# uses short-term trend/history to reduce false positives/negatives beyond what a
# single-step confidence score alone can capture.
ANOMALY_WEIGHT = 0.7
TRAFFIC_WEIGHT = 0.3

# Difficulty-based thresholds for the adaptive decision engine.
THRESHOLDS = {
    "easy":   {"block": 0.65, "sandbox": 0.45},
    "medium": {"block": 0.72, "sandbox": 0.50},
    "hard":   {"block": 0.78, "sandbox": 0.55},
}


# =========================
# SCHEMAS
# =========================
class ResetResponse(BaseModel):
    message: str
    state: dict


class SetTaskResponse(BaseModel):
    task_type: TaskType


class CurrentState(BaseModel):
    traffic_type: str
    anomaly_score: float
    task_type: TaskType


class NextState(BaseModel):
    traffic_type: str
    anomaly_score: float


class PredictResponse(BaseModel):
    current_state: CurrentState
    decision: Decision
    confidence_score: float
    reward: float
    done: bool
    next_state: NextState


class StateResponse(BaseModel):
    traffic_type: str
    anomaly_score: float
    task_type: TaskType
    step_count: int
    done: bool
    history: List[float]


class DecisionCounts(BaseModel):
    allow: int
    block: int
    sandbox: int


class BenchmarkResponse(BaseModel):
    task_type: TaskType
    episodes: int
    total_steps: int
    avg_score: float
    avg_reward_per_step: float
    avg_confidence: float
    decision_counts: DecisionCounts
    attack_block_rate: float
    normal_allow_rate: float


# =========================
# GLOBAL STATE
# =========================
# NOTE: state is a single shared instance (by design, this environment is meant
# to be driven by one sequential grader/client at a time, per the OpenEnv
# convention used by env/main.py). Concurrent callers would race on this dict;
# if multi-tenant use is ever needed, wrap this in a per-session store.
# /benchmark deliberately does NOT touch this dict (see below) so running a
# batch analysis from the frontend never disturbs the live step-by-step demo.
state = {
    "traffic_type": "normal",
    "anomaly_score": 0.5,
    "step_count": 0,
    "task_type": "easy",
    "history": [],
}


def _new_traffic():
    return random.choice(["normal", "attack"]), random.random()


# =========================
# RESET
# =========================
@app.post("/reset", response_model=ResetResponse)
def reset():
    state["traffic_type"], state["anomaly_score"] = _new_traffic()
    state["step_count"] = 0
    state["history"] = []

    return {"message": "environment reset", "state": state}


# =========================
# STATE (read-only)
# =========================
@app.get("/state", response_model=StateResponse)
def get_state():
    """Read the current environment state without mutating it. Lets the
    frontend render an initial view (or recover after a page refresh)
    without wasting a prediction step."""
    return {
        "traffic_type": state["traffic_type"],
        "anomaly_score": state["anomaly_score"],
        "task_type": state["task_type"],
        "step_count": state["step_count"],
        "done": state["step_count"] >= MAX_STEPS,
        "history": state["history"],
    }


# =========================
# SET TASK
# =========================
@app.post("/set_task", response_model=SetTaskResponse)
def set_task(task_type: TaskType):
    # FastAPI validates task_type against the Literal above and returns a 422
    # automatically for anything outside {easy, medium, hard}.
    state["task_type"] = task_type
    return {"task_type": task_type}


def _confidence_score(traffic: str, anomaly: float) -> float:
    raw = ANOMALY_WEIGHT * anomaly + TRAFFIC_WEIGHT * (1 if traffic == "attack" else -1)
    return round(max(0.0, min(1.0, raw)), 4)


def _decide(task: str, traffic: str, anomaly: float, trend: float, history: List[float]) -> str:
    th = THRESHOLDS[task]
    block_th = th["block"]
    sandbox_th = th["sandbox"]

    # Trend-based adaptation: fast-rising anomaly tightens the block threshold,
    # fast-falling anomaly widens the sandbox threshold, so the engine reacts to
    # short bursts rather than only single-sample noise.
    if trend > 0.08:
        block_th -= 0.05
    elif trend < -0.08:
        sandbox_th += 0.05

    if anomaly > block_th:
        decision = "block"
    elif anomaly > sandbox_th:
        decision = "sandbox"
    else:
        decision = "allow"

    # Attack traffic is never fully "allowed" through by this engine; the
    # question is only whether it's confident enough to block outright.
    if traffic == "attack":
        decision = "block" if anomaly > (block_th - 0.05) else "sandbox"

    # Normal traffic is never hard-blocked (false positives are contained to
    # a sandbox instead of a full block).
    if traffic == "normal" and decision == "block":
        decision = "sandbox"

    # Consistency control: use the recent rolling average to catch sustained
    # attack pressure or sustained calm that a single noisy sample would miss.
    if len(history) >= 3:
        avg_recent = sum(history[-3:]) / 3
        if traffic == "attack":
            if avg_recent > 0.65:
                decision = "block"
            elif avg_recent > 0.45:
                decision = "sandbox"
        elif avg_recent > 0.75:
            decision = "sandbox"

    # Anti-false-negative shield: don't let a borderline "allow" through if
    # the anomaly score or trend is creeping up.
    if decision == "allow" and (anomaly > 0.55 or trend > 0.08):
        decision = "sandbox"

    # Final safety lock (belt-and-suspenders, cheap to keep given the checks above).
    if traffic == "normal" and decision == "block":
        decision = "sandbox"

    # Confidence upgrade: only ever escalates towards the correct action once
    # the recent trend strongly supports it; never used to relax safety.
    if len(history) >= 3:
        avg_recent = sum(history[-3:]) / 3
        if traffic == "attack" and avg_recent > 0.75 and decision == "sandbox":
            decision = "block"
        if traffic == "normal" and avg_recent < 0.25 and decision == "sandbox":
            decision = "allow"

    return decision


def _reward(decision: str, traffic: str) -> float:
    if decision == "allow" and traffic == "normal":
        return 1.0
    if decision == "block" and traffic == "attack":
        return 1.0
    if decision == "sandbox":
        return 0.2
    return -2.0


# =========================
# PREDICT (MAIN LOGIC)
# =========================
@app.post("/predict", response_model=PredictResponse)
def predict():
    traffic = state["traffic_type"]
    anomaly = state["anomaly_score"]
    task = state["task_type"]

    # History tracking (rolling window of the last 5 anomaly scores).
    state["history"].append(anomaly)
    if len(state["history"]) > 5:
        state["history"].pop(0)

    trend = 0.0
    if len(state["history"]) >= 2:
        trend = state["history"][-1] - state["history"][-2]

    decision = _decide(task, traffic, anomaly, trend, state["history"])
    reward = _reward(decision, traffic)
    confidence = _confidence_score(traffic, anomaly)

    state["step_count"] += 1
    done = state["step_count"] >= MAX_STEPS

    state["traffic_type"], state["anomaly_score"] = _new_traffic()

    return {
        "current_state": {
            "traffic_type": traffic,
            "anomaly_score": anomaly,
            "task_type": task,
        },
        "decision": decision,
        "confidence_score": confidence,
        "reward": reward,
        "done": done,
        "next_state": {
            "traffic_type": state["traffic_type"],
            "anomaly_score": state["anomaly_score"],
        },
    }


# =========================
# BENCHMARK (batch analysis for the dashboard's analytics panel)
# =========================
def _safe_div(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0


def _simulate_episode(task: str):
    """Run one MAX_STEPS-long episode entirely with local variables, never
    touching the shared `state` dict, so batch analysis can't disturb the
    live step-by-step demo the frontend's main panel is driving."""
    traffic, anomaly = _new_traffic()
    history: List[float] = []

    reward_sum = 0.0
    confidence_sum = 0.0
    counts = {"allow": 0, "block": 0, "sandbox": 0}
    attack_steps = attack_blocked = 0
    normal_steps = normal_allowed = 0

    for _ in range(MAX_STEPS):
        history.append(anomaly)
        if len(history) > 5:
            history.pop(0)

        trend = 0.0
        if len(history) >= 2:
            trend = history[-1] - history[-2]

        decision = _decide(task, traffic, anomaly, trend, history)
        reward = _reward(decision, traffic)
        confidence = _confidence_score(traffic, anomaly)

        reward_sum += reward
        confidence_sum += confidence
        counts[decision] += 1

        if traffic == "attack":
            attack_steps += 1
            attack_blocked += decision == "block"
        else:
            normal_steps += 1
            normal_allowed += decision == "allow"

        traffic, anomaly = _new_traffic()

    return reward_sum, confidence_sum, counts, attack_steps, attack_blocked, normal_steps, normal_allowed


@app.post("/benchmark", response_model=BenchmarkResponse)
def benchmark(task_type: TaskType, episodes: int = Query(50, ge=1, le=500)):
    """Run many independent episodes server-side and return aggregate
    metrics. Used by the dashboard's analytics panel so the frontend doesn't
    have to fire episodes * MAX_STEPS individual HTTP requests."""
    agg_counts = {"allow": 0, "block": 0, "sandbox": 0}
    reward_sum = confidence_sum = 0.0
    norm_score_sum = 0.0
    total_steps = 0
    attack_steps_total = attack_blocked_total = 0
    normal_steps_total = normal_allowed_total = 0

    for _ in range(episodes):
        ep_reward, ep_conf, counts, a_steps, a_blocked, n_steps, n_allowed = _simulate_episode(task_type)

        norm_score_sum += (ep_reward + 10) / 15  # same normalization inference.py uses
        reward_sum += ep_reward
        confidence_sum += ep_conf
        for k in agg_counts:
            agg_counts[k] += counts[k]
        attack_steps_total += a_steps
        attack_blocked_total += a_blocked
        normal_steps_total += n_steps
        normal_allowed_total += n_allowed
        total_steps += MAX_STEPS

    return {
        "task_type": task_type,
        "episodes": episodes,
        "total_steps": total_steps,
        "avg_score": round(norm_score_sum / episodes, 4),
        "avg_reward_per_step": round(reward_sum / total_steps, 4),
        "avg_confidence": round(confidence_sum / total_steps, 4),
        "decision_counts": agg_counts,
        "attack_block_rate": _safe_div(attack_blocked_total, attack_steps_total),
        "normal_allow_rate": _safe_div(normal_allowed_total, normal_steps_total),
    }


# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {"status": "running"}


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
