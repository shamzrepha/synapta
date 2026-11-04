import type { NextConfig } from "next";

/** The site's content security policy. `extraScript` adds script hosts (used only for the push-notification worker). */
const contentSecurityPolicy = (extraScript: string[] = []) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com${extraScript.length ? ` ${extraScript.join(" ")}` : ""}`,
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
    // the voice tutor needs the microphone on our own pages; everything else stays off
    value: "camera=(), microphone=(self), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy(),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // no browser source maps in production: the shipped code stays minified
  productionBrowserSourceMaps: false,
  experimental: {
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
