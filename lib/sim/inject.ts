/** The sandbox policy and host bridge added to every simulation. Pure strings: safe to import from client code. */

export const SIM_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";

/** Runs inside the sandbox; the parent only listens to messages from this exact iframe. */
export const SIM_BRIDGE_SCRIPT = `<script>
(function () {
  function send(type, detail) {
    try { parent.postMessage({ source: "sunroot-sim", type: type, detail: detail || null }, "*"); } catch (e) {}
    try { parent.postMessage({ source: "synapta-sim", type: type, detail: detail || null }, "*"); } catch (e) {}
  }
  var bridge = {
    complete: function (detail) { send("goal_complete", detail); },
    progress: function (detail) { send("progress", detail); }
  };
  window.sunroot = bridge;
  window.synapta = bridge;
  window.addEventListener("error", function (e) { send("runtime_error", { message: String((e && e.message) || "Script error") }); });
  // Sandboxed (opaque-origin) frames throw on storage access; give generated code a harmless stand-in.
  try { window.localStorage.getItem("x"); } catch (e) {
    var mem = {};
    var fake = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; }, clear: function () { mem = {}; } };
    try { Object.defineProperty(window, "localStorage", { value: fake }); Object.defineProperty(window, "sessionStorage", { value: fake }); } catch (e2) {}
  }
  window.alert = function (m) { send("progress", { message: String(m) }); };
  window.confirm = function () { return true; };
  window.prompt = function () { return null; };
})();
</script>`;

/** Everything we add to the model's document. Kept as one exact string so edits can remove it again. */
export const SIM_HEAD_INJECT = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SIM_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1">${SIM_BRIDGE_SCRIPT}`;
