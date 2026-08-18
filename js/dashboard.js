/**
 * Dashboard — application controller. Wires DOM, FirewallXApi, FirewallXScene
 * and FirewallXCharts together. No framework; plain DOM + small state object.
 */
(function () {
  const MAX_STEPS = 5;
  const TRACE_WINDOW = 30;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    taskType: "easy",
    stepCount: 0,
    done: false,
    totalReward: 0,
    tracePoints: [], // { anomaly, decision, traffic }
    busy: false,
  };

  // The first page load should warm Render and then hydrate the dashboard
  // once the backend becomes reachable after a possible cold start.
  let initialHydrationComplete = false;
  let healthCheckInFlight = false;

  // ---------- DOM refs ----------
  const el = {
    statusDot: document.getElementById("status-dot"),
    statusText: document.getElementById("status-text"),
    segmented: document.getElementById("difficulty-select"),
    hudTraffic: document.getElementById("hud-traffic"),
    hudStep: document.getElementById("hud-step"),
    scopeCanvas: document.getElementById("scope-canvas"),

    badgeInner: document.getElementById("decision-badge-inner"),
    readoutTraffic: document.getElementById("readout-traffic"),
    readoutAnomaly: document.getElementById("readout-anomaly"),
    anomalyMeter: document.getElementById("anomaly-meter"),
    readoutConfidence: document.getElementById("readout-confidence"),
    confidenceMeter: document.getElementById("confidence-meter"),
    readoutReward: document.getElementById("readout-reward"),
    readoutTotalReward: document.getElementById("readout-total-reward"),
    readoutScore: document.getElementById("readout-score"),
    stepDots: document.getElementById("step-dots"),

    btnReset: document.getElementById("btn-reset"),
    btnStep: document.getElementById("btn-step"),
    btnRunEpisode: document.getElementById("btn-run-episode"),

    logTableBody: document.getElementById("log-table-body"),
    logEmptyState: document.getElementById("log-empty-state"),
    traceCanvas: document.getElementById("trace-canvas"),

    benchTask: document.getElementById("benchmark-task"),
    benchEpisodes: document.getElementById("benchmark-episodes"),
    btnRunBenchmark: document.getElementById("btn-run-benchmark"),
    benchResultsWrap: document.getElementById("benchmark-results-wrap"),
    benchPlaceholder: document.getElementById("benchmark-placeholder"),
    benchScore: document.getElementById("bench-score"),
    benchAttackRate: document.getElementById("bench-attack-rate"),
    benchNormalRate: document.getElementById("bench-normal-rate"),
    benchConfidence: document.getElementById("bench-confidence"),
    benchmarkCanvas: document.getElementById("benchmark-canvas"),

    apiBaseInput: document.getElementById("api-base-input"),
    btnSaveApi: document.getElementById("btn-save-api"),
    settingsStatus: document.getElementById("settings-status"),

    errorBanner: document.getElementById("error-banner"),
    errorMessage: document.getElementById("error-message"),
    errorDismiss: document.getElementById("error-dismiss"),
  };

  // ---------- error banner ----------
  let errorTimer = null;
  function showError(message) {
    el.errorMessage.textContent = message;
    el.errorBanner.hidden = false;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => { el.errorBanner.hidden = true; }, 6000);
  }
  el.errorDismiss.addEventListener("click", () => { el.errorBanner.hidden = true; });

  // ---------- 3D scene (guarded: WebGL can be unavailable — disabled
  // hardware acceleration, old browsers, locked-down environments, or the
  // vendor script failing to load. None of that should break the rest of
  // the dashboard, which works fine without the visualization.) ----------
  let scene = { reactToPrediction() {} };
  try {
    if (typeof THREE === "undefined") throw new Error("THREE failed to load");
    scene = FirewallXScene.init(el.scopeCanvas);
  } catch (err) {
    console.warn("3D scope unavailable, continuing without it:", err);
    const wrap = el.scopeCanvas.parentElement;
    el.scopeCanvas.hidden = true;
    const fallback = document.createElement("div");
    fallback.className = "scope-fallback";
    fallback.textContent = "3D visualization unavailable in this browser — predictions still work normally below.";
    wrap.appendChild(fallback);
  }

  // ---------- connectivity ----------
  async function pollHealth() {
    if (healthCheckInFlight) return;
    healthCheckInFlight = true;

    try {
      await FirewallXApi.health();
      el.statusDot.className = "status-dot is-live";
      el.statusText.textContent = "connected";

      // If the backend was asleep during the initial wake-up request, retry
      // hydration the first time the health check succeeds. /state is read-only
      // and does not consume a prediction step.
      if (!initialHydrationComplete) {
        await hydrateFromServer();
      }
    } catch {
      // Keep the dashboard usable while Render is waking from an idle state.
      // The next health poll will retry automatically.
      el.statusDot.className = "status-dot is-down";
      el.statusText.textContent = "offline";
    } finally {
      healthCheckInFlight = false;
    }
  }

  // ---------- rendering helpers ----------
  function renderStepDots() {
    el.stepDots.innerHTML = "";
    for (let i = 0; i < MAX_STEPS; i++) {
      const dot = document.createElement("span");
      dot.className = "step-dot";
      if (i < state.stepCount) dot.classList.add(state.done && i === MAX_STEPS - 1 ? "is-done" : "is-filled");
      el.stepDots.appendChild(dot);
    }
  }

  function flashMeter(meterEl) {
    meterEl.classList.remove("is-updating");
    void meterEl.offsetWidth; // force reflow to restart animation
    meterEl.classList.add("is-updating");
  }

  function setBadge(decision) {
    el.badgeInner.textContent = decision ? decision : "awaiting signal";
    el.badgeInner.className = "decision-badge-inner" + (decision ? ` decision-${decision}` : "");
    if (!prefersReducedMotion) {
      el.badgeInner.classList.remove("is-flipping");
      void el.badgeInner.offsetWidth;
      el.badgeInner.classList.add("is-flipping");
    }
  }

  function updateHud(traffic, step) {
    if (traffic) {
      el.hudTraffic.textContent = traffic.toUpperCase();
      el.hudTraffic.className = "hud-traffic-tag type-" + traffic;
    }
    el.hudStep.textContent = `STEP ${Math.min(step, MAX_STEPS)}/${MAX_STEPS}`;
  }

  function appendLogRow(row) {
    if (el.logEmptyState) el.logEmptyState.remove();
    const tr = document.createElement("tr");
    tr.className = "row-enter";
    tr.innerHTML = `
      <td>${row.step}</td>
      <td><span class="tag traffic-${row.traffic}">${row.traffic}</span></td>
      <td class="mono">${row.anomaly.toFixed(3)}</td>
      <td class="mono">${row.confidence.toFixed(3)}</td>
      <td><span class="tag decision-${row.decision}">${row.decision}</span></td>
      <td class="mono ${row.reward >= 0 ? "reward-pos" : "reward-neg"}">${row.reward > 0 ? "+" : ""}${row.reward.toFixed(2)}</td>
    `;
    el.logTableBody.appendChild(tr);
    el.logTableBody.parentElement.scrollTop = el.logTableBody.parentElement.scrollHeight;
  }

  function redrawTrace() {
    FirewallXCharts.drawTrace(el.traceCanvas, state.tracePoints);
  }

  function setControlsBusy(busy) {
    state.busy = busy;
    el.btnReset.disabled = busy;
    el.btnStep.disabled = busy || state.done;
    el.btnRunEpisode.disabled = busy || state.done;
    Array.from(el.segmented.querySelectorAll("button")).forEach((b) => (b.disabled = busy));
  }

  // ---------- core actions ----------
  async function doReset() {
    setControlsBusy(true);
    try {
      const res = await FirewallXApi.reset();
      state.stepCount = 0;
      state.done = false;
      state.totalReward = 0;
      el.logTableBody.innerHTML = `<tr id="log-empty-state"><td colspan="6" class="empty-state">No predictions yet — press Step or Run Episode.</td></tr>`;
      el.logEmptyState = document.getElementById("log-empty-state");
      renderStepDots();
      setBadge(null);
      updateHud(res.state.traffic_type, 0);
      el.readoutTraffic.textContent = res.state.traffic_type;
      el.readoutAnomaly.textContent = res.state.anomaly_score.toFixed(3);
      el.anomalyMeter.style.width = `${res.state.anomaly_score * 100}%`;
      el.readoutConfidence.textContent = "—";
      el.confidenceMeter.style.width = "0%";
      el.readoutReward.textContent = "—";
      el.readoutTotalReward.textContent = "0.00";
      el.readoutScore.textContent = "—";
    } catch (err) {
      showError(err.message);
    } finally {
      setControlsBusy(false);
    }
  }

  async function doStep() {
    if (state.done || state.busy) return;
    setControlsBusy(true);
    await doStepInline();
    setControlsBusy(false);
  }

  async function doRunEpisode() {
    if (state.busy) return;
    setControlsBusy(true);
    try {
      while (!state.done && state.stepCount < MAX_STEPS) {
        await doStepInline();
        if (!state.done) await sleep(prefersReducedMotion ? 60 : 700);
      }
    } finally {
      setControlsBusy(false);
    }
  }

  // A version of doStep that doesn't manage the busy flag itself, used by
  // the run-episode loop which owns busy state for the whole run.
  async function doStepInline() {
    try {
      const res = await FirewallXApi.predict();
      state.stepCount = res.done ? MAX_STEPS : state.stepCount + 1;
      state.done = res.done;
      state.totalReward += res.reward;

      const traffic = res.current_state.traffic_type;
      const anomaly = res.current_state.anomaly_score;

      updateHud(traffic, state.stepCount);
      el.readoutTraffic.textContent = traffic;
      el.readoutAnomaly.textContent = anomaly.toFixed(3);
      el.anomalyMeter.style.width = `${anomaly * 100}%`;
      flashMeter(el.anomalyMeter);

      el.readoutConfidence.textContent = res.confidence_score.toFixed(3);
      el.confidenceMeter.style.width = `${res.confidence_score * 100}%`;
      flashMeter(el.confidenceMeter);

      el.readoutReward.textContent = (res.reward > 0 ? "+" : "") + res.reward.toFixed(2);
      el.readoutTotalReward.textContent = state.totalReward.toFixed(2);
      el.readoutScore.textContent = (((state.totalReward + 10) / 15) * 100).toFixed(0) + "%";

      setBadge(res.decision);
      renderStepDots();
      appendLogRow({
        step: state.stepCount,
        traffic,
        anomaly,
        confidence: res.confidence_score,
        decision: res.decision,
        reward: res.reward,
      });

      state.tracePoints.push({ anomaly, decision: res.decision, traffic });
      if (state.tracePoints.length > TRACE_WINDOW) state.tracePoints.shift();
      redrawTrace();

      scene.reactToPrediction({ decision: res.decision, traffic });
    } catch (err) {
      showError(err.message);
      state.done = true; // stop the run-episode loop on error
    }
  }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  async function doSetTask(taskType) {
    if (state.busy || taskType === state.taskType) return;
    setControlsBusy(true);
    try {
      await FirewallXApi.setTask(taskType);
      state.taskType = taskType;
      Array.from(el.segmented.querySelectorAll("button")).forEach((b) => {
        b.classList.toggle("is-active", b.dataset.task === taskType);
      });
      await doReset();
    } catch (err) {
      showError(err.message);
    } finally {
      setControlsBusy(false);
    }
  }

  async function doBenchmark() {
    const taskType = el.benchTask.value;
    const episodes = Math.min(500, Math.max(1, parseInt(el.benchEpisodes.value, 10) || 50));
    el.benchEpisodes.value = episodes;

    el.btnRunBenchmark.disabled = true;
    const originalLabel = el.btnRunBenchmark.textContent;
    el.btnRunBenchmark.textContent = "Running…";
    try {
      const res = await FirewallXApi.benchmark(taskType, episodes);
      if (el.benchPlaceholder) el.benchPlaceholder.hidden = true;
      el.benchResultsWrap.hidden = false;
      el.benchScore.textContent = (res.avg_score * 100).toFixed(1) + "%";
      el.benchAttackRate.textContent = (res.attack_block_rate * 100).toFixed(1) + "%";
      el.benchNormalRate.textContent = (res.normal_allow_rate * 100).toFixed(1) + "%";
      el.benchConfidence.textContent = res.avg_confidence.toFixed(3);
      FirewallXCharts.drawDecisionBars(el.benchmarkCanvas, res.decision_counts);
    } catch (err) {
      showError(err.message);
    } finally {
      el.btnRunBenchmark.disabled = false;
      el.btnRunBenchmark.textContent = originalLabel;
    }
  }

  // ---------- tilt effect (skipped entirely under reduced motion) ----------
  function wireTilt() {
    document.querySelectorAll("[data-tilt]").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty("--ry", `${px * 6}deg`);
        card.style.setProperty("--rx", `${-py * 6}deg`);
        card.classList.add("is-tilting");
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
        card.classList.remove("is-tilting");
      });
    });
  }

  // ---------- settings ----------
  function wireSettings() {
    el.apiBaseInput.value = FirewallXConfig.getBaseUrl();
    el.btnSaveApi.addEventListener("click", async () => {
      const saved = FirewallXConfig.setBaseUrl(el.apiBaseInput.value || FirewallXConfig.DEFAULT_BASE_URL);
      el.apiBaseInput.value = saved;
      initialHydrationComplete = false;
      el.settingsStatus.textContent = "saved — checking connection…";
      await pollHealth();
      el.settingsStatus.textContent = "saved";
      setTimeout(() => { el.settingsStatus.textContent = ""; }, 2000);
    });
  }

  async function hydrateFromServer() {
    try {
      const s = await FirewallXApi.getState();
      state.taskType = s.task_type;
      state.stepCount = Math.min(s.step_count, MAX_STEPS);
      state.done = s.done;
      Array.from(el.segmented.querySelectorAll("button")).forEach((b) => {
        b.classList.toggle("is-active", b.dataset.task === s.task_type);
      });
      updateHud(s.traffic_type, state.stepCount);
      el.readoutTraffic.textContent = s.traffic_type;
      el.readoutAnomaly.textContent = s.anomaly_score.toFixed(3);
      el.anomalyMeter.style.width = `${s.anomaly_score * 100}%`;
      renderStepDots();
      el.btnStep.disabled = state.done;
      el.btnRunEpisode.disabled = state.done;
      initialHydrationComplete = true;
    } catch {
      // backend unreachable — the health poll will retry hydration later
    }
  }

  // ---------- wire up ----------
  el.btnReset.addEventListener("click", doReset);
  el.btnStep.addEventListener("click", doStep);
  el.btnRunEpisode.addEventListener("click", doRunEpisode);
  el.btnRunBenchmark.addEventListener("click", doBenchmark);

  el.segmented.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => doSetTask(b.dataset.task));
  });

  wireTilt();
  wireSettings();
  renderStepDots();
  redrawTrace();

  // Wake Render immediately when a visitor opens the Vercel frontend. This
  // request is fire-and-forget, so the browser does not block on Render's
  // cold-start response. Health polling then detects when the backend is live
  // and hydrates the initial state automatically.
  el.statusText.textContent = "waking backend…";
  FirewallXApi.wakeup();
  setTimeout(pollHealth, 1000);
  setInterval(pollHealth, 8000);
})();
