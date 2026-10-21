import { describe, expect, it } from "vitest";
import { SIM_HEAD_INJECT } from "./inject";
import { injectRuntime, needs3d } from "./runtime3d";
import { looksLikeRunnableSimulation } from "./build";

describe("3D simulation runtime", () => {
  const html = `<!DOCTYPE html><html><head>${SIM_HEAD_INJECT}</head><body><div id="stage"></div><script>const kit = SimKit3D.create(document.getElementById("stage"));${"/* pad */".repeat(40)}</script></body></html>`;

  it("detects simulations that use the 3D kit", () => {
    expect(needs3d(html)).toBe(true);
    expect(needs3d("<canvas></canvas><script>ctx.fillRect(0,0,1,1)</script>")).toBe(false);
  });

  it("a 3D simulation without a <canvas> tag still counts as runnable", () => {
    expect(looksLikeRunnableSimulation(html)).toBe(true);
  });

  it("inlines the runtime after the host injection, byte for byte (even with $ patterns in the script)", () => {
    const three = "var a=\"$'\";var b='$&';var c='$`';var d='$1$$';";
    const out = injectRuntime(html, three, "window.SimKit3D={};");
    expect(out.indexOf(three)).toBeGreaterThan(out.indexOf(SIM_HEAD_INJECT));
    expect(out).toContain(three);
    expect(out.indexOf("window.SimKit3D={};")).toBeLessThan(out.indexOf("SimKit3D.create"));
    // the page's own code is untouched
    expect(out.endsWith("</html>")).toBe(true);
  });

  it("a script containing </script> cannot end the inlined block early", () => {
    const out = injectRuntime(html, 'var s="</script><b>";', "");
    expect(out).not.toContain('var s="</script>');
  });
});
