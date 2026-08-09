/**
 * Config — where the frontend finds the FirewallX API.
 *
 * The frontend is deliberately decoupled from the backend (separate origin,
 * separate deploy target), so the base URL is user-configurable rather than
 * hardcoded. It's persisted in localStorage so it survives a page reload.
 */
const FirewallXConfig = (() => {
  const STORAGE_KEY = "firewallx.apiBaseUrl";

  // Same-origin by default ('' = relative requests) works if you serve the
  // frontend from the backend's own static host. Most setups run the
  // backend on a different port/origin during local dev, so change this
  // via the Settings panel in the UI (bottom of the page) — no code edits
  // needed.
  const DEFAULT_BASE_URL = "http://127.0.0.1:8000";

  function getBaseUrl() {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored : DEFAULT_BASE_URL;
  }

  function setBaseUrl(url) {
    const trimmed = url.trim().replace(/\/+$/, ""); // strip trailing slash(es)
    window.localStorage.setItem(STORAGE_KEY, trimmed);
    return trimmed;
  }

  return { getBaseUrl, setBaseUrl, DEFAULT_BASE_URL };
})();
