"use client";

import { useEffect } from "react";
import { isLightHex, rgbToHex, type BarsBridge } from "@/lib/native/bars";

/** In the Android app, keeps the status and navigation bars the same colour as the page, whatever theme is on. Does nothing in a browser. */
export function NativeBars() {
  useEffect(() => {
    const bridge = (window as unknown as { SunrootBars?: BarsBridge }).SunrootBars;
    if (!bridge || typeof bridge.set !== "function") return;
    let last = "";
    const push = () => {
      const hex = rgbToHex(getComputedStyle(document.body).backgroundColor) || rgbToHex(getComputedStyle(document.documentElement).backgroundColor);
      if (!hex || hex === last) return;
      last = hex;
      try {
        bridge.set(hex, isLightHex(hex));
      } catch {
        /* an old shell without the bridge */
      }
    };
    push();
    // the theme changes by class, style or data attribute on <html> or <body>
    const obs = new MutationObserver(push);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    const t = setInterval(push, 1500); // route changes can swap the page background without touching those attributes
    return () => {
      obs.disconnect();
      clearInterval(t);
    };
  }, []);
  return null;
}
