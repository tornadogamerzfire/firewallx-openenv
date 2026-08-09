---
title: FirewallX Env
emoji: 🛡️
colorFrom: blue
colorTo: red
sdk: docker
pinned: false
---

# 🛡️ FirewallX OpenEnv

Adaptive Firewall Environment for AI Agent Decision-Making.

---

## 🚀 Overview

FirewallX simulates a cybersecurity environment where an intelligent agent must decide how to handle incoming traffic in real time.

At every step, the agent receives:
- Traffic type (normal / attack)
- Anomaly score (0 → 1)

And must choose:
- ✅ Allow → safe traffic  
- 🟡 Sandbox → suspicious traffic  
- ❌ Block → malicious traffic  

---

## 🎯 Why This Matters

Modern systems need **adaptive security decisions**, not fixed rules.

FirewallX demonstrates how an intelligent agent can:
- Balance security vs usability  
- Reduce false positives  
- Adapt behavior based on difficulty  

---

## 🔄 How It Works (Flow)

1. Environment generates traffic  
2. Agent receives:
   - Traffic type  
   - Anomaly score  
3. Agent computes confidence score  
4. Applies difficulty-based thresholds  
5. Returns decision + reward  

---

## 🧠 Core Idea

The system uses a **dynamic decision strategy** based on:

- Anomaly score  
- Traffic type  
- Task difficulty (easy / medium / hard)

Each difficulty level controls how strict the firewall behaves.

---

## ⚙️ Decision Logic

Every `/predict` response includes a `confidence_score` (0–1), a transparency
signal computed as:

    confidence = 0.7 * anomaly_score + 0.3 * (+1 if attack else -1)   # clamped to [0, 1]

The actual **decision** is produced by a more adaptive engine than the raw
confidence formula alone: it applies difficulty-based thresholds to the
anomaly score, then adjusts for short-term trend and a rolling history
average before locking in a final, safety-checked decision (normal traffic
is never hard-blocked; attack traffic is never fully allowed through).

Base thresholds per difficulty:

| Difficulty | Sandbox | Block |
|-----------|--------|-------|
| Easy      | 0.45   | 0.65  |
| Medium    | 0.50   | 0.72  |
| Hard      | 0.55   | 0.78  |

---

## 🎯 Reward System

| Action   | Condition        | Reward |
|----------|----------------|--------|
| Allow    | Normal traffic | +1     |
| Block    | Attack traffic | +1     |
| Sandbox  | Uncertain      | +0.2   |
| Wrong    | Any mistake    | -2     |

This is the reward used by the **deployed API** (`app.py`, scored by
`inference.py`). The local Gym-style environment (`env/main.py`, used by
`test.py` and `env/grader.py`) shapes sandbox rewards a bit more strictly,
since it's meant for local policy development rather than final scoring:

| Action   | Condition           | Reward |
|----------|---------------------|--------|
| Block    | Attack traffic      | +1.0   |
| Allow    | Normal traffic      | +1.0   |
| Sandbox  | Attack traffic      | -0.5   |
| Sandbox  | Normal traffic      | -0.2   |
| Wrong    | Any mistake         | -2.0   |

`reward_range` in `openenv.yaml` is `[-2.0, 1.0]`, matching both tables.

---

## 🌐 API Endpoints

### ▶️ Predict

    POST /predict

### Example Response

    {
      "current_state": {
        "traffic_type": "attack",
        "anomaly_score": 0.75,
        "task_type": "medium"
      },
      "decision": "block",
      "confidence_score": 0.75,
      "reward": 1.0,
      "done": false,
      "next_state": {
        "traffic_type": "normal",
        "anomaly_score": 0.32
      }
    }

`done` becomes `true` once 5 predictions have been made since the last
`/reset` (matching `MAX_STEPS`), mirroring the episode boundary used by the
local `env/main.py` environment.

---

### ⚙️ Set Difficulty

    POST /set_task?task_type=easy  
    POST /set_task?task_type=medium  
    POST /set_task?task_type=hard  

---

## ⚡ Tech Stack

- Python 3.11  
- FastAPI  
- Uvicorn  
- Docker  
- Requests (for inference)

---

## 🧪 Quick Start

Run locally:

    pip install -r requirements.txt
    python inference.py  # runs evaluation against deployed API
    
---

## 🧪 Example Output

    easy: 1.0000  
    medium: 0.9000  
    hard: 0.8250  

    FINAL SCORE: ~0.90+

---

## 🧪 Testing

A pytest suite covers both the deployed API and the local Gym-style
environment, including regression tests for the bugs described below.

    pip install -r requirements.txt pytest
    pytest tests/ -v

`grader_test.py` (evaluates `env/grader.py` against the local environment)
and `test.py` (a manual smoke test of `env/main.py`) both still work as
standalone scripts:

    python grader_test.py
    python test.py

---

## 🛠️ Audit Notes / Fixes

This project went through a full bug-and-consistency audit. Summary of what
was found and fixed:

- **Crash bug in `env/grader.py`**: `env.step()` returns a dict, but was
  unpacked as a 4-tuple, raising `TypeError` on every run. `grader_test.py`
  never completed before this fix.
- **`confidence_score` was documented but never returned** by `/predict`.
  Now implemented and included in every response.
- **`done` was never returned** despite `MAX_STEPS` existing in the code.
  Now returned and driven by `MAX_STEPS`, matching `env/main.py`.
- **`/set_task` accepted any string** and silently fell back to "hard"
  thresholds for typos. Now validated (`easy` / `medium` / `hard` only,
  422 otherwise).
- **`pyproject.toml` was missing `pydantic`, `requests`, and `openai`**,
  so `pip install .` alone couldn't run the project. Added, and `uv.lock`
  regenerated to match.
- **`reward_range` in `openenv.yaml` was `[-1.0, 1.0]`** but real rewards go
  down to `-2.0`. Corrected.
- **Documented decision thresholds didn't match the deployed code.** The
  README table now reflects the actual, tested thresholds rather than an
  aspirational one.
- Bare `except:` clauses in `inference.py` were replaced with specific
  exception handling so real failures are visible instead of silently
  swallowed.
- `BASE_URL` in `inference.py` is now overridable via a `BASE_URL`
  environment variable, so the evaluation script can target a local server.
- Added `.dockerignore` so `.git`, caches, and virtualenvs never end up in
  the built image.
- Removed stray `__pycache__/` build artifacts from the repository.

The decision engine's actual thresholds and heuristics were left behaviorally
unchanged — before/after simulation across 200 episodes per difficulty
produced identical average scores, so none of the above fixes affected
scoring behavior; they only fix correctness, docs, and tooling.

**Known limitation:** environment state in `app.py` is a single shared
in-process dict, by design, for one sequential caller (matching the OpenEnv
convention used by `env/main.py`). Concurrent callers hitting the same
deployed instance would race on that state.

---

## ⚡ Key Features

- Dynamic difficulty scaling  
- Real-time decision system  
- Reward-driven feedback  
- FastAPI backend  
- Docker deployment  
- Stable inference evaluation  

---

## 🏁 Results

- ✅ Fully deployed on Hugging Face  
- ✅ Achieves ~0.90+ score across tasks  
- ✅ Handles easy / medium / hard scenarios  
- ✅ Efficient and lightweight  

---

## 📌 Final Summary

FirewallX is a lightweight simulation of adaptive firewall decision-making, demonstrating how rule-based intelligence can evolve into difficulty-aware, reward-driven systems.

---