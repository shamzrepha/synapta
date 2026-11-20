import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * The site's content security policy. 'unsafe-eval' is added only outside production: Next's dev runtime needs it and
 * nothing the app ships does (no eval/new Function in our code; three.js, blockly, mermaid and katex do not need it;
 * the sim iframe sets its own meta CSP). 'unsafe-inline' stays for scripts until Next inline scripts get nonces.
 * `extraScript` adds script hosts (used only for the push-notification worker). */
const contentSecurityPolicy = (extraScript: string[] = []) =>
  [
    "default-src 'self'",
    `script-src 'self'${isProd ? "" : " 'unsafe-eval'"} 'unsafe-inline' https://apis.google.com${extraScript.length ? ` ${extraScript.join(" ")}` : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "media-src 'self' blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://generativelanguage.googleapis.com",
    // build videos embed from YouTube (privacy-enhanced) and Vimeo
    "frame-src 'self' https://*.firebaseapp.com https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    // camera and microphone on our own pages only (voice tutor, photo questions); everything else stays off
    value: "camera=(self), microphone=(self), geolocation=()",
  },
  {
    // lets Google/Firebase sign-in popups talk back to the opener (plain same-origin would break them)
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy(),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-hosting (Docker): a small standalone server. Vercel builds are untouched because SELF_HOST is only set in the Dockerfile.
  ...(process.env.SELF_HOST === "1" ? { output: "standalone" as const } : {}),
  // each deployment knows its own id, so an open page can tell when the site has been updated under it (see /api/version)
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || "dev" },
  // Worlds reads its prompt and Subject Pack files at run time; without this they are missing from the serverless bundle
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**/*", "./subject-packs/**/*", "./fixtures/worlds/*.txt"],
  },
  // no browser source maps in production: the shipped code stays minified
  productionBrowserSourceMaps: false,
  experimental: {
    // keep visited pages in the browser's router cache so Back and Forward show them at once (default is not at all)
    staleTimes: { dynamic: 120, static: 300 },
    // API requests pass through proxy.ts (write guard); let bodies up to the largest upload (25 MB video) through
    proxyClientMaxBodySize: "26mb",
  },
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // The app's update check reads this file: a saved copy would hide a new release
      { source: "/app-version.json", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
      // The push-notification worker loads Firebase's own scripts from gstatic.com with importScripts(). A worker is
      // governed by the policy sent with ITS file, so without this it fails to start ("script evaluation failed") and the
      // notification toggle can't register it. Listed after the rule above so these headers win for this one file.
      {
        source: "/firebase-messaging-sw.js",
        headers: [
          ...securityHeaders.filter((h) => h.key !== "Content-Security-Policy"),
          { key: "Content-Security-Policy", value: contentSecurityPolicy(["https://www.gstatic.com"]) },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
          // browsers re-check a worker file for changes, so never serve a stale copy
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
