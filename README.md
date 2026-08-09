# 🛡️ FirewallX

### Adaptive Firewall Decision Environment for AI Agent Training

FirewallX is an adaptive cybersecurity decision-making environment built around an [OpenEnv](https://github.com/meta-pytorch/OpenEnv)-style environment for AI agent training and evaluation.

It simulates network traffic and requires an intelligent agent to decide whether each incoming packet should be:

* ✅ **Allow** — trusted or normal traffic
* 🟡 **Sandbox** — suspicious or uncertain traffic
* ❌ **Block** — malicious traffic

The project combines a **Python/FastAPI decision environment**, a **local Gym-style environment**, and a **live 3D browser console** that visualizes decisions as they happen.

The frontend requires **no framework, no bundler, and no external runtime dependencies**. Three.js is vendored locally, allowing the visualization to work without a CDN.

Every packet displayed in the 3D console corresponds to an actual decision returned by the backend.

---

## ✨ What Makes FirewallX Different?

FirewallX is designed as a small but complete environment for experimenting with **adaptive agent decision-making under uncertainty**.

Instead of using a single static firewall rule, the environment considers:

* Traffic type
* Anomaly score
* Task difficulty
* Short-term anomaly trends
* Rolling history
* Decision thresholds
* Reward feedback
* Safety constraints

The result is an environment where an agent has to balance **security against usability**.

The project demonstrates how a simple rule-based decision system can be structured into a difficulty-aware, reward-driven environment suitable for experimentation with AI agents.

---

## 🎯 Why This Matters

Traditional firewall examples often reduce the problem to a fixed rule:

> suspicious → block

That is useful for demonstrating basic filtering, but it does not represent the decision trade-offs an adaptive agent may face.

FirewallX introduces three possible actions:

| Decision  | Meaning                              |
| --------- | ------------------------------------ |
| `allow`   | Permit the traffic                   |
| `sandbox` | Contain or isolate uncertain traffic |
| `block`   | Reject malicious traffic             |

This creates a more interesting decision problem:

* Blocking everything improves theoretical security but hurts legitimate traffic.
* Allowing everything improves usability but increases exposure.
* Sandboxing provides an intermediate response when confidence is insufficient.

The environment therefore gives an agent a measurable way to learn or evaluate these trade-offs.

---

# 🧠 Environment Overview

At every step, the environment generates a traffic state containing information such as:

* **Traffic type:** `normal` or `attack`
* **Anomaly score:** `0 → 1`
* **Task difficulty:** `easy`, `medium`, or `hard`

The agent then produces a decision.

Conceptually:

```text
                ┌─────────────────────────┐
                │   Traffic Generator     │
                └────────────┬────────────┘
                             │
                             ▼
                ┌─────────────────────────┐
                │ Traffic State            │
                │                         │
                │ • traffic_type          │
                │ • anomaly_score         │
                │ • difficulty            │
                └────────────┬────────────┘
                             │
                             ▼
                ┌─────────────────────────┐
                │ Adaptive Decision Engine │
                │                         │
                │ • thresholds             │
                │ • trend                  │
                │ • history                │
                │ • safety checks          │
                └────────────┬────────────┘
                             │
                             ▼
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
           ALLOW          SANDBOX         BLOCK
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                       Reward + State
```

---

# 🏗️ Architecture

FirewallX has two main layers:

```text
┌───────────────────────────────────────────────────────────────┐
│                         FirewallX                             │
│                                                               │
│  ┌─────────────────────────┐       HTTP / JSON       ┌───────┐│
│  │       Frontend          │ ──────────────────────▶ │ API   ││
│  │                         │ ◀────────────────────── │       ││
│  │ index.html              │                        │FastAPI││
│  │ css/                    │                        │       ││
│  │ js/                     │                        └───┬───┘│
│  │ assets/                 │                            │    │
│  │                         │                            ▼    │
│  │ • Dashboard             │                    Decision     │
│  │ • Charts                │                    Engine       │
│  │ • 3D Scope              │                            │    │
│  │ • Logs                  │                            ▼    │
│  │ • Analytics             │                       Environment│
│  └─────────────────────────┘                            │    │
│                                                         ▼    │
│                                                Reward / State│
└───────────────────────────────────────────────────────────────┘
```

The frontend communicates with the backend through HTTP/JSON APIs.

The backend can run locally with Uvicorn or inside Docker.

The repository also contains a local OpenEnv/Gym-style environment for policy development and grading.

---

# 📁 Project Structure

The repository contains both the original adaptive firewall environment and the newer interactive frontend.

```text
.
├── index.html
│
├── css/
│   ├── fonts.css
│   ├── style.css
│   └── animations.css
│
├── js/
│   ├── vendor/
│   │   └── three.min.js
│   ├── config.js
│   ├── api.js
│   ├── chart.js
│   ├── three-scene.js
│   └── dashboard.js
│
├── assets/
│   └── fonts/
│
├── backend/
│   ├── app.py
│   ├── inference.py
│   ├── grader_test.py
│   ├── test.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── README.md
│
├── env/
│   ├── main.py
│   └── grader.py
│
├── server/
│   └── ...
│
├── app.py
├── inference.py
├── grader_test.py
├── test.py
├── openenv.yaml
├── pyproject.toml
├── requirements.txt
├── uv.lock
├── Dockerfile
├── .gitignore
└── README.md
```

### Frontend

| File                     | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `index.html`             | Main dashboard entry point               |
| `css/fonts.css`          | Local font declarations                  |
| `css/style.css`          | Design system, layout and components     |
| `css/animations.css`     | UI animations and CSS 3D effects         |
| `js/config.js`           | API configuration and persisted settings |
| `js/api.js`              | Backend API wrapper                      |
| `js/chart.js`            | Lightweight canvas charts                |
| `js/three-scene.js`      | 3D Interception Scope                    |
| `js/dashboard.js`        | Dashboard state and UI orchestration     |
| `js/vendor/three.min.js` | Locally vendored Three.js                |
| `assets/fonts/`          | Local WOFF2 fonts                        |

### Backend / Environment

| Component              | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `backend/app.py`       | FastAPI service and deployed decision logic |
| `backend/inference.py` | Evaluation against the API                  |
| `env/main.py`          | Local Gym-style environment                 |
| `env/grader.py`        | Local environment grading                   |
| `openenv.yaml`         | OpenEnv environment configuration           |
| `pyproject.toml`       | Python project/dependency configuration     |
| `Dockerfile`           | Container deployment                        |
| `grader_test.py`       | Grader validation                           |
| `test.py`              | Manual environment smoke test               |

For backend-specific implementation details and audit history, see [`backend/README.md`](backend/README.md).

---

# 🚀 Quick Start

## 1. Clone the repository

```bash
git clone https://github.com/tornadogamerzfire/firewallx-openenv.git
cd firewallx-openenv
```

---

## 2. Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

The API will be available at:

```text
http://127.0.0.1:8000
```

You can also run the evaluation script:

```bash
python inference.py
```

---

## 3. Serve the frontend

From the repository root:

```bash
python -m http.server 5500
```

Then open:

```text
http://127.0.0.1:5500
```

You can technically open `index.html` directly, but using a local HTTP server is recommended because some browsers restrict `fetch()` requests originating from `file://`.

---

## 4. Connect the frontend to the backend

The frontend defaults to:

```text
http://127.0.0.1:8000
```

If the backend is running somewhere else:

1. Open the **⚙ API connection settings** panel.
2. Enter the backend base URL.
3. Save the configuration.

The API URL is persisted using `localStorage`.

After connecting:

```text
Reset → Step
```

or:

```text
Reset → Run Episode
```

Packets will begin resolving against the 3D shield.

---

# 🔄 How It Works

The complete decision flow is:

```text
1. Environment generates traffic
             ↓
2. Agent receives traffic state
             ↓
3. Agent evaluates anomaly information
             ↓
4. Difficulty-specific thresholds are applied
             ↓
5. Short-term trend/history are considered
             ↓
6. Safety checks are applied
             ↓
7. Final decision is produced
             ↓
8. Reward is calculated
             ↓
9. Next state is generated
```

The backend exposes the same basic decision concept through the `/predict` endpoint.

---

# ⚙️ Decision Engine

Every `/predict` response exposes a `confidence_score`.

The transparency score is calculated from:

```text
confidence =
    0.7 × anomaly_score
    + 0.3 × traffic_signal
```

where:

```text
traffic_signal = +1 for attack
                 -1 for normal
```

The resulting value is clamped to the supported confidence range.

However, **the final firewall decision is not simply the result of this formula**.

The actual decision engine additionally considers:

* Difficulty-specific thresholds
* Short-term anomaly trend
* Rolling history average
* Safety checks

This distinction is important.

`confidence_score` is a transparency signal. It should not be interpreted as the complete decision algorithm.

---

# 🎚️ Difficulty Levels

FirewallX currently supports three task difficulties:

* `easy`
* `medium`
* `hard`

Each difficulty changes the base thresholds used by the decision engine.

| Difficulty | Sandbox |  Block |
| ---------- | ------: | -----: |
| Easy       |  `0.45` | `0.65` |
| Medium     |  `0.50` | `0.72` |
| Hard       |  `0.55` | `0.78` |

Higher difficulty requires the decision engine to behave more conservatively around the boundary between normal, suspicious, and malicious traffic.

The environment also applies trend/history adjustments before the final decision is locked.

---

# 🛡️ Safety Behavior

The decision engine contains explicit safety constraints.

The deployed decision logic is designed so that:

* Normal traffic is not hard-blocked.
* Attack traffic is not fully allowed through.

These constraints operate in addition to the threshold and history logic.

This makes the environment more useful for evaluating adaptive decision systems without relying exclusively on a single raw anomaly score.

---

# 🎯 Reward System

The deployed API uses the following reward model:

| Action         | Condition         | Reward |
| -------------- | ----------------- | -----: |
| `allow`        | Normal traffic    |   `+1` |
| `block`        | Attack traffic    |   `+1` |
| `sandbox`      | Uncertain traffic | `+0.2` |
| Wrong decision | Any mistake       |   `-2` |

The reward range is therefore:

```text
[-2.0, 1.0]
```

---

## Local Gym-Style Environment Rewards

The local environment used for policy development applies slightly stricter sandbox rewards:

| Action         | Condition      | Reward |
| -------------- | -------------- | -----: |
| `block`        | Attack traffic | `+1.0` |
| `allow`        | Normal traffic | `+1.0` |
| `sandbox`      | Attack traffic | `-0.5` |
| `sandbox`      | Normal traffic | `-0.2` |
| Wrong decision | Any mistake    | `-2.0` |

This difference is intentional.

The deployed API represents the final evaluation behavior, while the local environment provides a stricter signal for developing decision policies.

---

# 🌐 API

## `POST /predict`

Runs one firewall decision step.

```http
POST /predict
```

Example response:

```json
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
```

The `done` flag becomes `true` after **5 predictions** since the last reset, matching the environment's `MAX_STEPS` episode boundary.

---

## `POST /reset`

Resets the current live episode.

```http
POST /reset
```

Use this before starting a new interactive episode.

---

## `POST /set_task`

Changes the current task difficulty.

```http
POST /set_task?task_type=easy
POST /set_task?task_type=medium
POST /set_task?task_type=hard
```

Only the following values are accepted:

```text
easy
medium
hard
```

Invalid values return:

```text
422 Unprocessable Entity
```

---

## `GET /state`

Reads the current state without advancing the environment.

```http
GET /state
```

Example:

```json
{
  "traffic_type": "normal",
  "anomaly_score": 0.34,
  "task_type": "medium",
  "step_count": 2,
  "done": false,
  "history": [
    0.41,
    0.34
  ]
}
```

This endpoint is particularly useful for the frontend because it can restore the current view after a page refresh without consuming a prediction step.

---

## `POST /benchmark`

Runs independent batch simulations.

```http
POST /benchmark?task_type=medium&episodes=50
```

The number of episodes is bounded to:

```text
1–500
```

Example response:

```json
{
  "task_type": "medium",
  "episodes": 50,
  "total_steps": 250,
  "avg_score": 0.836,
  "avg_reward_per_step": 0.65,
  "avg_confidence": 0.41,
  "decision_counts": {
    "allow": 62,
    "block": 40,
    "sandbox": 148
  },
  "attack_block_rate": 0.71,
  "normal_allow_rate": 0.65
}
```

### Important

`/benchmark` runs its simulations independently.

It does **not** modify the shared live episode used by `/predict` and `/reset`.

This allows the frontend analytics panel to run batch analysis without interrupting an active demonstration.

---

# 🌍 CORS Configuration

The backend uses FastAPI's CORS middleware so the static frontend can communicate with the API from a different origin.

The allowed origins are controlled through:

```text
ALLOWED_ORIGINS
```

For local development, the default is:

```text
*
```

For deployment, specify the exact frontend origin.

Example:

```bash
ALLOWED_ORIGINS="https://your-frontend.example.com,http://localhost:5500" uvicorn app:app
```

Credentials are disabled because the API does not use cookies or authentication.

For production deployment, avoid leaving `ALLOWED_ORIGINS=*` unless that behavior is explicitly intended.

---

# 🎯 The Interception Scope

The 3D visualization is not just decorative.

Every packet launched by the visualization corresponds to an actual `/predict` call.

| Decision  | 3D Result                                                             |
| --------- | --------------------------------------------------------------------- |
| `allow`   | Packet passes cleanly through the shield                              |
| `block`   | Packet impacts the shield and shatters into sparks                    |
| `sandbox` | Packet is contained near the impact point, orbits briefly, then fades |

The scene supports:

* Camera orbit
* Scroll-to-zoom
* Packet trajectories
* Impact effects
* Shield reactions
* Decision-specific visual feedback
* Particle bursts

The visualization is powered by a locally vendored Three.js build:

```text
js/vendor/three.min.js
```

There is no CDN dependency.

---

# 🧩 WebGL Graceful Degradation

WebGL is not required for the rest of FirewallX to work.

If WebGL is unavailable because of:

* Disabled hardware acceleration
* Browser limitations
* Old hardware
* Locked-down environments
* Three.js loading failure
* Renderer initialization failure

the dashboard falls back gracefully.

The 3D canvas is replaced by a fallback message while the following features continue to work:

* Reset
* Step
* Run episode
* Decision logging
* Charts
* Batch analysis
* API connection
* Error handling

This prevents a graphics failure from taking down the entire application.

---

# 📊 Frontend Dashboard

The dashboard provides a real-time view of the environment.

It includes:

* Current traffic state
* Anomaly score
* Difficulty
* Current decision
* Confidence score
* Reward
* Episode progress
* Decision history
* Anomaly-score chart
* Decision distribution
* Batch analysis
* API health/status
* Live 3D packet visualization
* API connection settings

---

# 🧩 Frontend Architecture

FirewallX deliberately uses plain HTML/CSS/JavaScript.

There is:

* No React
* No Vue
* No Angular
* No bundler
* No build pipeline
* No external runtime dependency

### `config.js`

Stores the backend API base URL and persists it through `localStorage`.

### `api.js`

Provides a thin `fetch()` wrapper around the backend endpoints.

Errors are normalized through:

```text
FirewallXApiError
```

This allows the dashboard to present a consistent error state regardless of which API operation failed.

### `chart.js`

Provides two lightweight canvas charts:

1. Anomaly-score trace
2. Decision-distribution bar chart

A charting library is intentionally avoided because these two visualizations do not require one.

### `three-scene.js`

Owns the 3D Interception Scope.

The public interface exposes:

```javascript
init(canvas)
```

which returns:

```javascript
{
  reactToPrediction,
  dispose
}
```

Camera movement, particle effects, shield reactions, and rendering internals remain encapsulated inside the scene.

### `dashboard.js`

Acts as the main UI orchestrator.

It owns:

* Current episode
* Step count
* Trace history
* DOM updates
* API calls
* Chart updates
* 3D reactions
* Error handling

---

# 🎨 Design System

FirewallX intentionally avoids the generic "dark hacker terminal" aesthetic.

The visual direction is a:

> **Signal-interception console**

The design uses:

* Void-like dark background
* Cyan scope/tracing elements
* Mint for allow
* Amber for sandbox
* Coral for block
* Space Grotesk for display typography
* IBM Plex Sans for body text
* IBM Plex Mono for live numerical values

The fonts are vendored locally under:

```text
assets/fonts/
```

This keeps the interface independent of external font CDNs.

---

# 🎬 Motion & Accessibility

Motion is used to communicate system state rather than simply decorate the interface.

Examples include:

* Live connection pulse
* Log-row entry animations
* Decision badge transitions
* Tilt-on-hover readout cards
* 3D packet movement
* Shield reactions
* Particle effects

The interface respects:

```css
prefers-reduced-motion
```

including reduced 3D animation behavior.

---

# 🧪 Testing

## Backend

The project includes a pytest suite covering:

* API behavior
* CORS
* `/state`
* `/benchmark`
* Local Gym-style environment
* Regression cases

Run:

```bash
cd backend
pip install -r requirements.txt pytest
pytest tests/ -v
```

The current backend test suite contains **33 tests**.

---

## Standalone Environment Tests

The repository also contains standalone scripts for validating the local environment.

Run:

```bash
python grader_test.py
```

and:

```bash
python test.py
```

---

## Frontend Testing

The frontend intentionally has no build pipeline or bundler-based test runner.

It was additionally verified through:

* Headless DOM integration testing
* Mocked `fetch`
* Button/API interaction testing
* Real Three.js animation execution
* `requestAnimationFrame` ticks
* Actual geometry/material/camera calculations
* Stubbed GPU rendering

The external test harnesses depend on `jsdom` and are not part of the main repository deliverable.

---

# 🛠️ Audit Notes & Important Fixes

FirewallX went through a full consistency and robustness audit.

Several real issues were identified and fixed.

## Frontend

### WebGL failure could crash the entire dashboard

Previously, initialization of the Three.js renderer could throw before the dashboard finished initializing.

That meant a WebGL failure could disable unrelated features such as:

* Step
* Logging
* Charts
* Batch analysis
* Error handling

The scene initialization is now protected with a fallback path.

If WebGL fails:

```text
3D → disabled
Dashboard → continues working
```

---

### Canvas 2D failure

The chart code previously assumed:

```javascript
canvas.getContext("2d")
```

would always succeed.

It now safely handles a missing 2D context rather than throwing during startup.

---

## Backend

The audit also identified and corrected several backend inconsistencies:

* `env/grader.py` incorrectly unpacked the return value from `env.step()`.
* `confidence_score` was documented but missing from `/predict`.
* `done` was not returned even though `MAX_STEPS` existed.
* `/set_task` accepted invalid difficulty values and silently fell back to hard thresholds.
* `pyproject.toml` was missing required dependencies including `pydantic`, `requests`, and `openai`.
* `uv.lock` was regenerated to match dependency changes.
* `openenv.yaml` incorrectly declared a reward range of `[-1.0, 1.0]` even though rewards can reach `-2.0`.
* Documented decision thresholds did not match the deployed implementation.
* Broad `except:` blocks in `inference.py` were replaced with specific exception handling.
* `BASE_URL` in `inference.py` can be overridden using an environment variable.
* `.dockerignore` was added to keep Git metadata, caches, and virtual environments out of Docker builds.
* Stray `__pycache__` artifacts were removed.

The decision engine's behavioral scoring logic was not changed during these corrections.

Before/after simulations across hundreds of episodes showed the same average scoring behavior, indicating that the audit fixed correctness and tooling problems without changing the tuned decision behavior.

---

# 📈 Batch Analysis Integrity

The `/benchmark` endpoint was specifically audited to ensure that it does not accidentally use a different decision implementation from `/predict`.

Its aggregate results were compared against manually running equivalent episodes through `/predict`.

The batch simulator uses the same decision and reward logic and does not mutate the shared live episode.

This is important because the analytics dashboard can therefore run:

```text
Batch benchmark
       ↓
Independent simulation
       ↓
Aggregate metrics
```

without corrupting:

```text
Live episode
```

---

# ⚠️ Known Limitation

The deployed `app.py` environment state is stored in a single shared in-process state object.

This is intentional for the current sequential OpenEnv-style environment design.

It means that multiple concurrent callers hitting the same process can race against the same episode state.

For a production multi-user deployment, the environment would need isolated per-session or per-client state rather than one shared in-process episode.

---

# 🐳 Docker

The backend includes a Docker configuration for containerized deployment.

Build the backend image:

```bash
docker build -t firewallx ./backend
```

Run it:

```bash
docker run -p 8000:8000 firewallx
```

The backend can then be accessed through:

```text
http://127.0.0.1:8000
```

---

# ☁️ Deployment

## Backend

The backend Docker image can be deployed to services that support Docker containers, including:

* Hugging Face Spaces
* Fly.io
* Google Cloud Run
* Other Docker-compatible platforms

For Hugging Face Spaces configured with:

```text
sdk: docker
```

the `Dockerfile` needs to be at the deployed repository root.

Because the main FirewallX repository contains both frontend and backend components, the backend can be deployed independently.

Example using Git subtree:

```bash
git subtree split --prefix=backend -b hf-deploy
git push <hf-space-remote> hf-deploy:main
```

---

## Frontend

The frontend is completely static.

Deploy:

```text
index.html
css/
js/
assets/
```

to any static hosting platform, such as:

* GitHub Pages
* Netlify
* Amazon S3
* Any static web server
* The same server hosting the backend

Once deployed, configure the backend's:

```text
ALLOWED_ORIGINS
```

to include the frontend's actual origin.

---

# 🧪 Example Evaluation

The repository's evaluation workflow can produce results such as:

```text
easy:   1.0000
medium: 0.9000
hard:   0.8250

FINAL SCORE: ~0.90+
```

These values represent example evaluation output from the existing project workflow, not a universal guarantee for every future run.

Results can vary depending on generated traffic and evaluation conditions.

---

# ⚡ Key Features

* 🛡️ Adaptive firewall decision environment
* 🤖 AI-agent-oriented decision problem
* 🎚️ Easy / medium / hard difficulty
* 📊 Anomaly-score driven decisions
* 🧠 Trend and rolling-history awareness
* 🔒 Safety-checked final decisions
* 🎯 Reward-driven feedback
* 🌐 FastAPI backend
* 🔌 HTTP/JSON API
* 🔄 Resettable 5-step episodes
* 📊 Batch benchmark analysis
* 📈 Decision and anomaly visualization
* 🌐 CORS support
* 🎮 Local Gym-style environment
* 🧪 Automated backend testing
* 🧪 Standalone environment grading
* 🐳 Docker deployment
* 🎨 Live 3D Interception Scope
* 📦 Locally vendored Three.js
* 📴 Offline-capable frontend dependencies
* ♿ Reduced-motion support
* 🛡️ Graceful WebGL failure handling
* ⚙️ Configurable API endpoint
* 💾 Persistent frontend API configuration
* 🚫 No frontend build step
* 🚫 No frontend framework
* 🚫 No CDN dependency

---

# ⚡ Tech Stack

## Frontend

* HTML5
* CSS3
* Vanilla JavaScript
* Canvas 2D
* Three.js, vendored locally

## Backend

* Python 3.11
* FastAPI
* Uvicorn
* Docker
* Requests

## Environment

* OpenEnv-style environment architecture
* Gym-style `reset()` / `step()` interaction
* Local grading environment
* Reward-based evaluation

## Testing

* pytest
* Headless DOM integration testing
* Mocked API testing
* Three.js animation testing

---

# 📚 OpenEnv

FirewallX follows the general OpenEnv-style idea of exposing environments through simple, structured interactions such as:

```text
reset()
step(action)
state()
```

OpenEnv is an interface/framework for building isolated execution environments for agentic reinforcement-learning and post-training workflows.

Learn more:

[OpenEnv](https://github.com/meta-pytorch/OpenEnv)

---

# 🏁 Current Project Status

FirewallX currently provides:

* ✅ Adaptive firewall environment
* ✅ Easy / medium / hard tasks
* ✅ FastAPI deployment
* ✅ Local environment
* ✅ Reward-based scoring
* ✅ Inference/evaluation workflow
* ✅ Docker deployment
* ✅ Interactive frontend
* ✅ Live 3D visualization
* ✅ Batch analytics
* ✅ CORS configuration
* ✅ Automated backend tests
* ✅ Frontend robustness handling
* ✅ Hugging Face deployment

The repository is currently structured as a working environment plus an interactive demonstration console rather than just a static firewall simulator.

---

# 📌 Final Summary

FirewallX is a lightweight but complete simulation of adaptive firewall decision-making.

It combines:

```text
AI Agent Decision-Making
          +
Cybersecurity Traffic Simulation
          +
Reward-Based Evaluation
          +
Difficulty Scaling
          +
OpenEnv-Style Environment
          +
FastAPI
          +
Interactive 3D Visualization
```

The core idea is simple:

> **Give an agent uncertain network traffic, require a security decision, measure the result, and visualize the decision in real time.**

The project is intentionally lightweight enough to understand and modify while still providing a complete environment, API, evaluation workflow, visualization layer, testing infrastructure, and containerized deployment path.

---

## 🔗 Repository

**FirewallX OpenEnv**

https://github.com/tornadogamerzfire/firewallx-openenv

---

## 📄 Additional Documentation

For backend-specific API details, environment behavior, testing, audit history, deployment notes, and implementation details, see:

```text
backend/README.md
```

---

## 🤝 Contributing

Contributions, bug reports, improvements, and experiments are welcome.

A typical workflow is:

```bash
git clone https://github.com/tornadogamerzfire/firewallx-openenv.git
cd firewallx-openenv

git checkout -b feature/your-feature
```

Make your changes, test them locally, then commit and push your branch:

```bash
git add .
git commit -m "Describe your change"
git push origin feature/your-feature
```

Then open a pull request on GitHub.

---

## ⚖️ License

See the repository's license files and project metadata for the applicable license information.
