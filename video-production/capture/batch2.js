const { clip } = require("./lib");
const ID = "6ZTnplFqqp0Tg3LmnUow";
const only = process.argv[2];
const jobs = {
  async classread(p, _c, mark) {
    await p.goto(`https://sunrootlearn.com/classes/${ID}/read`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000); mark("offer");
    await p.screenshot({ path: "shots/cr-offer.png" });
    await p.waitForTimeout(1500);
    await p.getByRole("button", { name: "Start reading" }).click(); mark("tap");
    for (let i = 0; i < 6; i++) { await p.waitForTimeout(3000); await p.screenshot({ path: `shots/cr-read${i}.png` }); }
    mark("end");
  },
  async classread2(p, _c, mark) {
    await p.goto(`https://sunrootlearn.com/classes/${ID}/read`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(8500); mark("offer");
    await p.waitForTimeout(1500);
    await p.getByRole("button", { name: "Start reading" }).click(); mark("tap");
    for (let i = 0; i < 12; i++) { await p.waitForTimeout(2500); await p.screenshot({ path: `shots/cr2-${i}.png` }); if (i > 1 && /LISTENING/i.test(await p.locator("body").innerText())) { mark("listening"); break; } }
    await p.waitForTimeout(16000); mark("end");
  },
  async contents(p, _c, mark) {
    await p.goto(`https://sunrootlearn.com/classes/${ID}/read`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(8000);
    await p.getByRole("button", { name: "Not now" }).click({ timeout: 3000 }).catch(() => null);
    await p.waitForTimeout(800); mark("a");
    await p.getByText("Contents", { exact: true }).first().click();
    await p.waitForTimeout(3500); mark("b");
    await p.screenshot({ path: "shots/contents.png" });
    await p.mouse.wheel(0, 500); await p.waitForTimeout(1500); mark("c");
  },
  async teach2(p, _c, mark) {
    await p.goto("https://sunrootlearn.com/study/notes", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2500);
    await p.getByText("Newton's Laws of Motion").first().click({ timeout: 10000 });
    await p.waitForTimeout(2500); mark("a");
    await p.getByText("Teach me", { exact: true }).click(); await p.waitForTimeout(5000); mark("lesson");
    await p.screenshot({ path: "shots/teach-a.png" });
    await p.getByText("Play lesson").click(); mark("play");
    for (let i = 0; i < 5; i++) { await p.waitForTimeout(3500); await p.screenshot({ path: `shots/teach-p${i}.png` }); }
    mark("b");
  },
  async map(p) {
    await p.goto(`https://sunrootlearn.com/classes/${ID}/map`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(25000);
    await p.screenshot({ path: "shots/map.png" });
    await p.getByText("List View").click().catch(() => null); await p.waitForTimeout(3000);
    await p.screenshot({ path: "shots/map-list.png" });
    console.log("links:", (await p.locator("a[href*=topics]").evaluateAll(a => a.slice(0,3).map(x => x.getAttribute("href")))).join(" "));
    console.log("map:", (await p.locator("main").innerText()).slice(0, 300).replace(/\n+/g, " | "));
  },
  async teach(p, _c, mark) {
    await p.goto("https://sunrootlearn.com/study/notes", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2500);
    await p.getByText("Newton's Laws of Motion").first().click({ timeout: 10000 });
    await p.waitForTimeout(2500); mark("a");
    await p.getByText("Teach me", { exact: true }).click(); mark("tap");
    for (let i = 0; i < 40; i++) { await p.waitForTimeout(3000); if (!/Building your interactive lesson/.test(await p.locator("main").innerText())) break; } await p.waitForTimeout(2500); mark("b");
    await p.screenshot({ path: "shots/teach.png" });
    console.log("teach:", (await p.locator("main").innerText()).slice(380, 1100).replace(/\n+/g, " | "));
  },
};
(async () => { for (const [n, f] of Object.entries(jobs)) if (!only || only === n) await clip(n, f); })();
