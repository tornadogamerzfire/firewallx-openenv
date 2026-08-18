/**
 * API — thin fetch wrapper around the FirewallX backend.
 *
 * Every function returns a parsed JSON body and throws a FirewallXApiError
 * on network failure or a non-2xx response, so callers can handle both
 * uniformly with try/catch.
 */
class FirewallXApiError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name = "FirewallXApiError";
    this.status = status;
    this.cause = cause;
  }
}

const FirewallXApi = (() => {
  /**
   * Fire-and-forget wake-up request for Render's free service. The request is
   * intentionally not awaited by the page bootstrap because its only job is
   * to cause an idle backend to start waking before the user presses a
   * backend-dependent control. `keepalive` lets the browser keep the request
   * alive across short navigation events where supported.
   */
  function wakeup() {
    const base = FirewallXConfig.getBaseUrl();
    const url = `${base}/healthz`;

    try {
      return fetch(url, {
        method: "GET",
        cache: "no-store",
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      return Promise.resolve(undefined);
    }
  }

  async function request(path, { method = "GET", params = null } = {}) {
    const base = FirewallXConfig.getBaseUrl();
    let url = `${base}${path}`;

    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }

    let response;
    try {
      response = await fetch(url, { method });
    } catch (err) {
      throw new FirewallXApiError(
        `Could not reach the API at ${base}. Is the backend running and is CORS enabled?`,
        { cause: err }
      );
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body.detail ? ` — ${JSON.stringify(body.detail)}` : "";
      } catch {
        /* response wasn't JSON; ignore */
      }
      throw new FirewallXApiError(`${method} ${path} failed (${response.status})${detail}`, {
        status: response.status,
      });
    }

    return response.json();
  }

  return {
    wakeup,
    health: () => request("/healthz"),
    getState: () => request("/state"),
    reset: () => request("/reset", { method: "POST" }),
    setTask: (taskType) => request("/set_task", { method: "POST", params: { task_type: taskType } }),
    predict: () => request("/predict", { method: "POST" }),
    benchmark: (taskType, episodes) =>
      request("/benchmark", {
        method: "POST",
        params: { task_type: taskType, episodes: String(episodes) },
      }),
  };
})();
