/**
 * Kongsian auth bus — global 401 handler.
 *
 * Loaded once on every dashboard page. Two safety nets:
 *   1. Wrapped apiFetch / apiJson helpers (window.kongsianApi) that emit
 *      `kongsian:unauthorized` on 401 and throw a typed error.
 *   2. A global `fetch()` interceptor (installed lazily) that does the same
 *      for any /v1/* response on pages still using raw fetch(). This is the
 *      P0-2 + P2-6 fix that protects all existing dashboard pages without
 *      requiring per-page rewrites.
 *
 * A single listener clears the session and redirects to /login. Pages and
 * components should prefer `window.kongsianApi.apiFetch()` / `apiJson()`,
 * but the interceptor means even legacy `fetch()` is safe.
 *
 * Usage:
 *   <script src="/kongsian-auth-bus.js" defer></script>
 *   const data = await window.kongsianApi.apiJson('/v1/notifications');
 *   if (!data) return; // already redirected to /login
 */
(function () {
  "use strict";

  // --- 1. Global 401 handler ---------------------------------------------
  let redirecting = false;
  function handleUnauthorized(reason) {
    if (redirecting) return;
    redirecting = true;
    try {
      localStorage.removeItem("kongsian_session");
    } catch (_) {
      /* ignore */
    }
    // Use replace so the user can't go back into a broken page.
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace("/login?expired=1&next=" + next);
  }
  window.addEventListener("kongsian:unauthorized", function (e) {
    handleUnauthorized(e && e.detail && e.detail.reason);
  });

  // --- 2. URL resolution helper ------------------------------------------
  // Pages that proxy /v1/* through Pages Functions (same-origin) don't need
  // an API base. Pages that call the Worker directly set
  // window.__KONGSIAN_API__ = "https://kongsian-api....workers.dev".
  function resolveApiUrl(path) {
    if (!path) return path;
    // Absolute URL or path-with-absolute-URL — return as-is.
    if (/^https?:\/\//i.test(path)) return path;
    const base =
      (typeof window !== "undefined" && window.__KONGSIAN_API__) || "";
    if (!base) return path;
    return base.replace(/\/+$/, "") + path;
  }

  // --- 3. Global fetch interceptor (lazy, idempotent) --------------------
  // Wraps window.fetch so any /v1/* 401 response emits the event. Installs
  // once. Pages that still use raw `fetch(API+"/v1/...")` are protected.
  if (!window.__KONGSIAN_FETCH_PATCHED__) {
    window.__KONGSIAN_FETCH_PATCHED__ = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const promise = origFetch(input, init);
      // Extract URL string. Response cloning to peek at status is not
      // possible; we wrap the promise instead.
      let url = "";
      try {
        if (typeof input === "string") url = input;
        else if (input && typeof input.url === "string") url = input.url;
      } catch (_) {}
      return promise.then(function (res) {
        if (
          res &&
          res.status === 401 &&
          (url.indexOf("/v1/") !== -1 || url.indexOf("/api/v1/") !== -1)
        ) {
          window.dispatchEvent(
            new CustomEvent("kongsian:unauthorized", { detail: { reason: "fetch_401" } })
          );
        }
        return res;
      });
    };
  }

  // --- 4. Wrapped fetch helpers ------------------------------------------
  // Convenience for code that prefers the typed API over raw fetch. Emits
  // kongsian:unauthorized on 401 and returns the Response / JSON.
  async function apiFetch(input, init) {
    const url = typeof input === "string" ? resolveApiUrl(input) : input;
    return window.fetch(url, init);
  }
  async function apiJson(path, init) {
    const res = await apiFetch(path, init);
    if (!res.ok) {
      if (res.status === 401) {
        // Interceptor already dispatched the event; throw a typed error so
        // awaiting code can early-return. (Idempotent — the redirect is in
        // flight; throwing here just gives the caller a clean abort path.)
        throw new KongsianUnauthorizedError();
      }
      const body = await res.text().catch(() => "");
      throw new Error("API " + res.status + ": " + (body || res.statusText));
    }
    return res.json();
  }

  class KongsianUnauthorizedError extends Error {
    constructor() {
      super("Kongsian session expired");
      this.name = "KongsianUnauthorizedError";
      this.code = "UNAUTHENTICATED";
    }
  }

  // --- 5. Public API ------------------------------------------------------
  window.kongsianApi = {
    apiFetch: apiFetch,
    apiJson: apiJson,
    UnauthorizedError: KongsianUnauthorizedError,
  };
})();
