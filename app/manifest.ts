import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sunroot — AI-Native Adaptive Learning Platform",
    short_name: "Sunroot",
    description: "Adaptive cognitive tutoring powered by digital twins and Bayesian Knowledge Tracing",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0B0F14",
    theme_color: "#0d9488",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
