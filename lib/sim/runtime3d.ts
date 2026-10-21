import { SIM_HEAD_INJECT } from "./inject";

/**
 * Simulations written with the Maker Studio look (lit solid 3D) use the global `THREE` and `SimKit3D`. The sandbox
 * forbids loading anything from outside, so the two scripts are inlined into the frame when it is shown. They are
 * never stored with the simulation (it would pass the size limit), only added at display time.
 */
export const THREE_URL = "/sim/three.min.js";
export const KIT_URL = "/sim/simkit3d.js";

export function needs3d(html: string): boolean {
  return /\bTHREE\b|SimKit3D/.test(html);
}

/** Puts the runtime scripts right after the host's own head injection, so the simulation's code finds THREE ready. */
export function injectRuntime(html: string, three: string, kit: string): string {
  const safe = (js: string) => js.replace(/<\/script/gi, "<\\/script");
  const scripts = `<script>${safe(three)}</script><script>${safe(kit)}</script>`;
  // a function replacement: the script text contains `$'` and friends, which a plain replacement string would expand
  if (html.includes(SIM_HEAD_INJECT)) return html.replace(SIM_HEAD_INJECT, () => SIM_HEAD_INJECT + scripts);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + scripts);
  return scripts + html;
}

let cache: Promise<{ three: string; kit: string }> | null = null;
function loadRuntime() {
  cache ||= Promise.all([fetch(THREE_URL).then((r) => (r.ok ? r.text() : Promise.reject(new Error("three")))), fetch(KIT_URL).then((r) => (r.ok ? r.text() : Promise.reject(new Error("kit"))))]).then(([three, kit]) => ({ three, kit }));
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

/** The html to put in the frame: unchanged for 2D simulations, with the 3D runtime added for 3D ones. */
export async function frameHtmlFor(html: string): Promise<string> {
  if (!needs3d(html)) return html;
  const { three, kit } = await loadRuntime();
  return injectRuntime(html, three, kit);
}
