/**
 * A complete, working reference simulation. It is shown to the model inside the generation prompt so that even a small,
 * fast model (for example a Groq-hosted one) copies a PROVEN structure instead of inventing one: SimKit3D scene, solid
 * lit parts, real physics in kit.onFrame, drag handle, sliders with units, live readouts with the formula, a goal that
 * calls complete(), tutor lines, Pause/Reset, and a layout that follows its container.
 *
 * Keep it under about 110 lines: it is paid for in tokens on every generation. A test checks that it passes the same
 * quality rules the generator applies to model output. See docs/design/SIM-DESIGN-GUIDE.md.
 */
export const SIM_REFERENCE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pendulum</title>
<script type="application/json" id="sim-meta">{"title":"Tune the pendulum","goal":"Make one full swing take 2 seconds","howTo":["Drag the length slider","Pull the bob back with the handle","Watch the period readout"],"concepts":["period","length","gravity"],"checkQuestion":{"question":"You make the rod 4 times longer. What happens to the period?","options":["It doubles","It quadruples","It halves","It stays the same"],"answer":"It doubles","explanation":"T = 2π√(L/g), so 4 times the length gives √4 = 2 times the period."}}</script>
<style>
*{box-sizing:border-box}body{margin:0;background:#0b0f14;color:#e8eefc;font:16px system-ui,sans-serif;padding:12px}
#goal{background:#13203d;border:1px solid #4A6CF7;border-radius:12px;padding:10px 14px;margin-bottom:10px;font-weight:600}
#stage{width:100%;height:52vh;min-height:260px;border-radius:14px;overflow:hidden;background:#101826}
.row{display:flex;align-items:center;gap:12px;margin-top:10px}.row label{min-width:96px}.row input[type=range]{flex:1;height:32px}
.val{min-width:84px;text-align:right;font-variant-numeric:tabular-nums}
#read{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}#read div{background:#13203d;border-radius:10px;padding:8px 12px}
#pull{position:relative;height:44px;margin-top:10px;background:#13203d;border-radius:22px;touch-action:none}
#knob{position:absolute;top:4px;width:36px;height:36px;border-radius:50%;background:#F5B83A;left:50%;margin-left:-18px}
button{min-height:44px;padding:0 18px;border:0;border-radius:10px;background:#4A6CF7;color:#fff;font-weight:700;margin-right:8px}
#note{margin-top:10px;color:#9fb3d9;font-size:14px}
</style></head><body>
<div id="goal">Goal: make one full swing take 2.0 s (hold it for a second).</div>
<div id="stage"></div>
<div id="pull" aria-label="Pull the bob back"><div id="knob"></div></div>
<div class="row"><label for="len">Length</label><input id="len" type="range" min="0.3" max="2.5" step="0.01" value="1.6"><span class="val" id="lenv"></span></div>
<div id="read"><div>T = 2π√(L/g)</div><div>Period: <b id="per"></b></div><div>Angle: <b id="ang"></b></div></div>
<div class="row"><button id="pp">Pause</button><button id="rs">Reset</button></div>
<div id="note">What to notice: a longer rod swings more slowly. The bob's mass never changes the period.</div>
<script>
(function () {
  var G = 9.81, L = 1.6, theta = 0.5, omega = 0, running = true, held = 0, done = false, touched = false;
  var kit = SimKit3D.create(document.getElementById("stage"));
  kit.lookAt(0, 1.9, 0, 7.5);
  var frame = kit.roundedBox(2.4, 0.12, 0.5, 0x64748b, 0.04, { metalness: 0.6 });
  frame.position.set(0, 3.2, 0);
  var post = kit.cylinder(0.07, 3.2, 0x475569); post.position.set(-1.1, 1.6, 0);
  var pivot = new kit.THREE.Group(); pivot.position.set(0, 3.2, 0); kit.scene.add(pivot);
  var rod = kit.cylinder(0.03, 1, 0xcbd5e1, { metalness: 0.8 }); pivot.add(rod);
  var bob = kit.sphere(0.22, 0x3b6df6, { metalness: 0.5, roughness: 0.25 }); pivot.add(bob);
  function layout() { rod.scale.y = L; rod.position.y = -L / 2; bob.position.y = -L; }
  layout();
  var len = document.getElementById("len"), lenv = document.getElementById("lenv"), per = document.getElementById("per"), ang = document.getElementById("ang");
  function readouts() { var T = 2 * Math.PI * Math.sqrt(L / G); lenv.textContent = L.toFixed(2) + " m"; per.textContent = T.toFixed(2) + " s"; ang.textContent = (theta * 57.3).toFixed(0) + "°"; return T; }
  len.addEventListener("input", function () {
    L = parseFloat(len.value); layout(); readouts();
    if (!touched) { touched = true; window.sunroot.say("Longer rod, slower swing. Keep going until the period reads 2.0 s.", { tone: "hint" }); }
  });
  kit.onFrame(function (dt) {
    if (running) {
      var steps = 4, h = Math.min(dt, 0.05) / steps;
      for (var i = 0; i < steps; i++) { omega += (-(G / L) * Math.sin(theta) - 0.05 * omega) * h; theta += omega * h; }
    }
    pivot.rotation.z = theta;
    var T = readouts();
    if (!done && Math.abs(T - 2) < 0.06) { held += dt; if (held > 1) { done = true; window.sunroot.say("Exactly 2 seconds. You tuned it!", { tone: "praise" }); window.sunroot.complete({ score: 100, level: 1 }); } } else held = 0;
  });
  var pull = document.getElementById("pull"), knob = document.getElementById("knob"), drag = false;
  function setFrom(e) { var r = pull.getBoundingClientRect(); var k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); theta = (k - 0.5) * 2 * 1.2; omega = 0; knob.style.left = k * 100 + "%"; }
  pull.addEventListener("pointerdown", function (e) { drag = true; pull.setPointerCapture(e.pointerId); setFrom(e); });
  pull.addEventListener("pointermove", function (e) { if (drag) setFrom(e); });
  pull.addEventListener("pointerup", function () { drag = false; });
  document.getElementById("pp").addEventListener("click", function () { running = !running; this.textContent = running ? "Pause" : "Play"; });
  document.getElementById("rs").addEventListener("click", function () { theta = 0.5; omega = 0; L = 1.6; len.value = L; layout(); running = true; held = 0; done = false; });
  new ResizeObserver(function () { window.dispatchEvent(new Event("resize")); }).observe(document.getElementById("stage"));
  window.sunroot.say("Predict first: will a longer rod swing faster or slower?", { tone: "ask" });
})();
</script></body></html>`;
