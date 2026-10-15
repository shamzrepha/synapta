/* Caching rules shared by public/sw.js (importScripts) and the vitest tests (require). Plain JS, no deps. */
(function (root) {
  // Anything that smells like auth/session/token must never be stored.
  var NEVER = /\/(auth|session|sessions|login|logout|signup|token|tokens|csrf|me|admin|uploads|jobs|events|client-errors)(\/|$|\?)/i;

  function parse(url) {
    try {
      return new URL(url, "https://sunroot.local");
    } catch (e) {
      return null;
    }
  }

  function isNeverCache(url) {
    var u = parse(url);
    if (!u) return true;
    return NEVER.test(u.pathname) || /__session|idToken|access_token/i.test(u.search);
  }

  function isStaticAsset(url) {
    var u = parse(url);
    return !!u && u.pathname.indexOf("/_next/static/") === 0;
  }

  function isApiPath(url) {
    var u = parse(url);
    return !!u && u.pathname.indexOf("/api/") === 0;
  }

  /** May the service worker serve/store this request from the "downloads" cache? */
  function isDownloadable(method, url) {
    return method === "GET" && isApiPath(url) && !isNeverCache(url);
  }

  var api = { isNeverCache: isNeverCache, isStaticAsset: isStaticAsset, isApiPath: isApiPath, isDownloadable: isDownloadable };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SunrootPolicy = api;
})(typeof self !== "undefined" ? self : this);
