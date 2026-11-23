const { chromium } = require("playwright");
const SP = process.env.DEMO_DIR || ".";
const acct = JSON.parse(require("fs").readFileSync(process.env.DEMO_ACCOUNT || SP + "/demo-account.json"));
exports.open = async (opts = {}) => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, ...opts });
  const p = await ctx.newPage();
  return { b, ctx, p };
};
exports.login = async (p) => {
  await p.goto("https://sunrootlearn.com/login", { waitUntil: "domcontentloaded" });
  await p.fill('input[type="email"]', acct.email);
  await p.fill('input[type="password"]', acct.password);
  await p.getByRole("button", { name: /^(Sign in|Log in|Login)/i }).first().click();
  await p.waitForURL(/dashboard|study|classes/, { timeout: 30000 });
};
exports.clean = async (p) => {
  await p.evaluate(() => { document.querySelectorAll('[role="status"]').forEach((e) => { if (/Confirm your email/.test(e.textContent || "")) e.remove(); }); });
};
exports.video = async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, recordVideo: { dir: "clips", size: { width: 780, height: 1688 } } });
  // the demo account's "confirm your email" bar is not part of what the film should show, so it is removed from view
  await ctx.addInitScript(() => {
    setInterval(() => document.querySelectorAll('[role="status"]').forEach((e) => { if (/Confirm your email/.test(e.textContent || "")) e.remove(); }), 150);
  });
  return { b, ctx, p: await ctx.newPage() };
};
const fs = require("fs");
/** records one clip: logs in off-camera time is trimmed later using the returned start offset */
exports.clip = async (name, fn) => {
  const { b, ctx, p } = await exports.video();
  const t00 = Date.now();
  await exports.login(p);
  await p.goto("https://sunrootlearn.com/dashboard", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  // one-time pop-ups for a brand-new account: dismissed before the clip starts
  await p.getByRole("button", { name: "Not now" }).click({ timeout: 2500 }).catch(() => null);
  await p.getByRole("button", { name: "Skip", exact: true }).click({ timeout: 2500 }).catch(() => null);
  await p.waitForTimeout(600);
  const startAt = (Date.now() - t00) / 1000;
  let err = null;
  const marks = {}; const mark = (n) => { marks[n] = (Date.now() - t00) / 1000; };
  try { await fn(p, exports.clean, mark); } catch (e) { err = e; console.log("clip", name, "failed:", String(e.message).split("\n")[0]); }
  const dur = (Date.now() - t00) / 1000;
  const vid = p.video();
  await ctx.close();
  const path = await vid.path();
  fs.renameSync(path, `clips/${name}.webm`);
  fs.writeFileSync(`clips/${name}.json`, JSON.stringify({ startAt, dur, ok: !err, marks }));
  await b.close();
  return !err;
};
