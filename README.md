# 🛡️ FirewallX

An adaptive firewall decision environment, built as an [OpenEnv](https://github.com/meta-pytorch/OpenEnv)-style
environment for AI agent training — with a live 3D console on top of it.

A backend FastAPI service simulates network traffic and grades an adaptive
decision engine's calls (allow / block / sandbox) against it. A static
HTML/CSS/JS frontend — no build step, no framework, no external runtime
dependencies — visualizes every decision as it happens: packets fly toward
a 3D shield and either pass through, shatter, or get contained, depending
on what the backend actually decided.

    ┌──────────────────────────┐        HTTP / JSON        ┌─────────────────────────┐
    │  Frontend                │ ─────────────────────────▶│  Backend                │
    │  index.html + css/ + js/ │ ◀───────────────────────── │  backend/app.py (FastAPI)│
    │  (static, any web server)│                            │  (Docker / uvicorn)      │
    └──────────────────────────┘                            └─────────────────────────┘

---

## 📁 Project Structure

    .
    ├── index.html          entry point — open this or serve the folder
    ├── css/
    │   ├── fonts.css        vendored @font-face declarations
    │   ├── style.css        design tokens, layout, all components
    │   └── animations.css   keyframes + CSS 3D transforms, reduced-motion
    ├── js/
    │   ├── vendor/
    │   │   └── three.min.js the only third-party dependency, vendored locally
    │   ├── config.js        API base URL, persisted in localStorage
    │   ├── api.js            thin fetch wrapper around the backend
    │   ├── chart.js          dependency-free canvas 2D charts
    │   ├── three-scene.js    the 3D "Interception Scope"
    │   └── dashboard.js      wires DOM + API + 3D scene + charts together
    ├── assets/
    │   └── fonts/            vendored woff2 files (Space Grotesk, IBM Plex)
    ├── backend/               FastAPI service — see backend/README.md
    └── README.md              this file

---

## 🚀 Quick Start

**1. Run the backend**

    cd backend
    pip install -r requirements.txt
    uvicorn app:app --reload

This serves the API on `http://127.0.0.1:8000`.

**2. Serve the frontend**

Open `index.html` directly, *or* (recommended — some browsers restrict
`fetch()` from `file://` origins) serve the folder with any static server:

    python -m http.server 5500
    # then visit http://127.0.0.1:5500

**3. Connect them**

The frontend defaults to `http://127.0.0.1:8000`. If your backend runs
elsewhere, open the **⚙ API connection settings** panel at the bottom of
the page, update the base URL, and save. The setting persists across
reloads.

That's it — press **Reset**, then **Step** or **Run episode**, and watch
packets resolve against the shield in real time.

---

## 🎯 The Interception Scope

The 3D visualization isn't decorative — every packet launched corresponds
to a real `/predict` call:

| Decision  | What you see                                                        |
|-----------|----------------------------------------------------------------------|
| `allow`   | Packet passes clean through the shield and exits the far side       |
| `block`   | Packet shatters into sparks on impact; the shield flashes red       |
| `sandbox` | Packet is caught, orbits the impact point briefly, then fades       |

Drag to orbit the camera, scroll to zoom. Built on a locally vendored
Three.js (`js/vendor/three.min.js`) — no CDN, works offline. If WebGL is
unavailable (disabled hardware acceleration, very old browser, locked-down
environment), the scene degrades gracefully: a fallback message replaces
the canvas and every other feature — stepping, the log, charts, batch
analysis — keeps working normally.

---

## 🧩 Frontend Architecture

Plain HTML/CSS/JS, no bundler, no framework:

- **`config.js`** — the API base URL, backed by `localStorage`.
- **`api.js`** — one `fetch` wrapper per backend endpoint; every call
  throws a uniform `FirewallXApiError` on failure so the UI can show one
  consistent error banner regardless of what went wrong.
- **`chart.js`** — two small canvas 2D charts (an anomaly-score trace and
  a decision-distribution bar chart), hand-written rather than pulling in
  a charting library for two simple visualizations.
- **`three-scene.js`** — the 3D scope. Exposes `init(canvas)` returning
  `{ reactToPrediction, dispose }`; everything else (camera orbit,
  particle bursts, shield color flashes) is internal.
- **`dashboard.js`** — the only file that touches all the others. Owns
  UI state (current episode, step count, trace history) and DOM updates.

No component framework, no build step: open `index.html` and it runs.

---

## 🎨 Design

The visual direction is a **signal-interception console**, not a generic
dark hacker-terminal theme: a void backdrop, a cyan "scope" trace color,
and semantic allow/sandbox/block colors (mint / amber / coral rather than
literal traffic-light red-yellow-green) carried through the badges, the
log, the charts, and the 3D shield consistently. Typography is Space
Grotesk (display) + IBM Plex Sans (body) + IBM Plex Mono (every live
number), all vendored locally as woff2 files under `assets/fonts/`.

Motion is deliberate, not decorative: a live-connection pulse, log rows
entering, a 3D flip on the decision badge, a tilt-on-hover readout card,
and the 3D scope itself. Everything respects
`prefers-reduced-motion`, including the 3D animation durations.

---

## 🧪 Testing

**Backend** — 33 pytest tests covering the API, CORS, and the local
Gym-style environment:

    cd backend && pip install -r requirements.txt pytest && pytest tests/ -v

**Frontend** — no build step means no bundler-based test runner either;
the frontend was verified with a headless DOM + mocked-`fetch` integration
test exercising every button and API call, plus a real Three.js animation
soak test (real geometries/materials/camera math running through actual
`requestAnimationFrame` ticks, only the GPU render call stubbed). These
harnesses live outside this deliverable since they depend on `jsdom`; the
important behaviors they caught and fixed are documented below.

---

## 🛠️ Frontend Audit Notes

Building the frontend surfaced two real robustness gaps that were fixed
before shipping:

- **A WebGL failure would have crashed the entire dashboard.**
  `FirewallXScene.init()` (which constructs a `THREE.WebGLRenderer`) was
  called unguarded at the top of `dashboard.js`. If WebGL is unavailable
  for *any* reason — disabled hardware acceleration, an old browser, a
  locked-down environment, or the vendor script failing to load — the
  constructor throws, and since nothing caught it, **no buttons would
  have worked**, not even features that need zero 3D. Fixed: the scene
  init is now wrapped in a try/catch with a graceful fallback (canvas
  hidden, a message shown, a no-op scene stub used) — verified by
  simulating a WebGL-unavailable environment and confirming every other
  feature (stepping, logging, charts, batch analysis, error handling)
  still works normally.
- **The same class of bug existed in the 2D chart code.** `chart.js`
  called `canvas.getContext("2d")` without checking for `null`. 2D canvas
  support is virtually universal, but if it were ever missing, the very
  first `redrawTrace()` call at startup would throw *before* the health-
  check polling and initial state hydration ever ran. Hardened to bail
  out safely instead of throwing.

Backend-side, the batch-analysis endpoint (`POST /benchmark`, added for
the frontend's analytics panel) was verified to never touch the shared
live-episode state `/predict` and `/reset` use, and its aggregate scores
were checked against many manual `/predict` episodes for the same
difficulty to confirm it's using the same decision logic, not a diverging
copy. See `backend/README.md` for the full backend audit history.

---

## ☁️ Deployment Notes

**Backend** — `backend/Dockerfile` builds a standalone image; deploy it
anywhere that runs a Dockerfile (Hugging Face Spaces, Fly.io, Cloud Run,
etc.). If deploying to a platform that expects the `Dockerfile` at the
repository root (like HF Spaces' `sdk: docker`), deploy `backend/` as
that repo's root rather than this whole monorepo — e.g. with git subtree:

    git subtree split --prefix=backend -b hf-deploy
    git push <hf-space-remote> hf-deploy:main

**Frontend** — fully static; deploy `index.html`, `css/`, `js/`, and
`assets/` to any static host (GitHub Pages, Netlify, S3, or the same
server as the backend). Set `ALLOWED_ORIGINS` on the backend to the
frontend's deployed origin once you're not using the `*` default.

---

## ⚡ Tech Stack

- **Frontend:** HTML5, CSS3, vanilla JavaScript, Three.js (vendored)
- **Backend:** Python, FastAPI, Uvicorn, Docker — see `backend/README.md`
