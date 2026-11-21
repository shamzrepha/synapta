import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sunroot — AI-Native Adaptive Learning Platform",
    short_name: "Sunroot",
    description: "Adaptive learning that tracks what you have mastered and adapts your lessons",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0B0F14",
    theme_color: "#0d9488",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
