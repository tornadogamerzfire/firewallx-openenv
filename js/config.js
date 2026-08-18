/**
 * Config — where the frontend finds the FirewallX API.
 *
 * The frontend is deliberately decoupled from the backend (separate origin,
 * separate deploy target), so the base URL is user-configurable rather than
 * hardcoded in the API wrapper. The production Render URL is the default,
 * while the settings panel still allows a different backend to be selected.
 * The value is persisted in localStorage so it survives a page reload.
 */
const FirewallXConfig = (() => {
  const STORAGE_KEY = "firewallx.apiBaseUrl";
  const PRODUCTION_BASE_URL = "https://firewallx-openenv.onrender.com";
  const LEGACY_LOCAL_BASE_URL = "http://127.0.0.1:8000";

  function getBaseUrl() {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    // Migrate an old value from the pre-deployment frontend. This matters for
    // visitors who opened the site before the production backend was wired in.
    if (stored === LEGACY_LOCAL_BASE_URL) {
      window.localStorage.removeItem(STORAGE_KEY);
      return PRODUCTION_BASE_URL;
    }

    return stored !== null && stored.trim() !== "" ? stored : PRODUCTION_BASE_URL;
  }

  function setBaseUrl(url) {
    const trimmed = url.trim().replace(/\/+$/, ""); // strip trailing slash(es)
    window.localStorage.setItem(STORAGE_KEY, trimmed);
    return trimmed;
  }

  return {
    getBaseUrl,
    setBaseUrl,
    DEFAULT_BASE_URL: PRODUCTION_BASE_URL,
    PRODUCTION_BASE_URL,
  };
})();
