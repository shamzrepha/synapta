const { clip } = require("./lib");
const openNote = async (p) => {
  await p.goto("https://sunrootlearn.com/study/notes", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2200);
  await p.getByText("Newton's Laws of Motion").first().click({ timeout: 10000 });
  await p.waitForTimeout(2500);
};
const waitGone = async (p, re, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await p.waitForTimeout(2500); if (!re.test(await p.locator("main").innerText())) return true; } return false; };
const only = process.argv[2];
const jobs = {
  async quiz(p, _c, mark) {
    await openNote(p);
    await p.getByText("Quiz me", { exact: true }).click({ timeout: 10000 });
    mark("gen"); await waitGone(p, /Writing your quiz/); await p.waitForTimeout(1500); mark("q1");
    await p.screenshot({ path: "shots/quiz-q1.png" });
    await p.waitForTimeout(1500); mark("tap");
    await p.getByText("newton (N)", { exact: true }).first().click(); await p.waitForTimeout(3500); mark("right");
    await p.screenshot({ path: "shots/quiz-right.png" });
    await p.getByRole("button", { name: /Next/ }).first().click().catch(() => null); await p.waitForTimeout(2000);
    await p.screenshot({ path: "shots/quiz-q2.png" });
    const opts = p.locator("main button").filter({ hasNotText: /Next|Read|Change|Simpler|More|Exam|Shorter|Go|Download|Print|All notes|Notes|Teach|Flash|Quiz|Pictures|Written|Upgrade/ });
    const n = await opts.count(); console.log("options", n);
    if (n > 1) { await opts.nth(n - 1).click(); await p.waitForTimeout(2500); }
    await p.screenshot({ path: "shots/quiz-wrong.png" });
  },
  async readalong(p, _c, mark) {
    await openNote(p);
    mark("a"); await p.getByText("Read page", { exact: true }).click({ timeout: 10000 }); mark("tap");
    await p.waitForTimeout(16000); mark("b");
    await p.screenshot({ path: "shots/readalong.png" });
  },
  async flash(p) {
    await openNote(p);
    await p.getByText("Flashcards", { exact: true }).first().click({ timeout: 10000 });
    await waitGone(p, /Making|Writing|Generating/i, 90000); await p.waitForTimeout(2500);
    await p.screenshot({ path: "shots/flash.png" });
    console.log("flash:", (await p.locator("main").innerText()).slice(380, 900).replace(/\n+/g, " | "));
  },
  async written(p) {
    await openNote(p);
    await p.getByText("Written practice", { exact: true }).click({ timeout: 10000 });
    await waitGone(p, /Setting|Writing|Generating|Making/i, 90000); await p.waitForTimeout(2500);
    await p.screenshot({ path: "shots/written.png" });
    console.log("written:", (await p.locator("main").innerText()).slice(380, 1100).replace(/\n+/g, " | "));
  },
  async tutor(p, _c, mark) {
    await p.goto("https://sunrootlearn.com/tutor", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(3000); mark("a");
    await p.screenshot({ path: "shots/tutor0.png" });
    const box = p.locator("textarea, input[type=text]").first();
    await box.click(); await box.pressSequentially("Can you explain Newton's second law with a simple example?", { delay: 45 });
    await p.waitForTimeout(500); await p.keyboard.press("Enter"); mark("sent");
    await p.waitForTimeout(14000); mark("b");
    await p.screenshot({ path: "shots/tutor1.png" });
  },
  async review(p) {
    await p.goto("https://sunrootlearn.com/study/review", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4000);
    await p.screenshot({ path: "shots/review.png" });
    await p.goto("https://sunrootlearn.com/study/mistakes", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4000);
    await p.screenshot({ path: "shots/mistakes.png" });
  },
  async wrong(p, _c, mark) {
    await openNote(p);
    await p.getByText("Quiz me", { exact: true }).click({ timeout: 10000 });
    await waitGone(p, /Writing your quiz/); await p.waitForTimeout(1800); mark("q1");
    await p.getByText("kilogram (kg)", { exact: true }).first().click(); await p.waitForTimeout(3200); mark("wrong");
    await p.screenshot({ path: "shots/quiz-wrong.png" });
  },
  async community(p) {
    await p.goto("https://sunrootlearn.com/community", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4000);
    await p.screenshot({ path: "shots/community.png" });
    await p.goto("https://sunrootlearn.com/focus", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3500);
    await p.screenshot({ path: "shots/focus.png" });
  },
  async labs(p) {
    await p.goto("https://sunrootlearn.com/experiments", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4000);
    await p.screenshot({ path: "shots/labs.png" });
    await p.goto("https://sunrootlearn.com/studio", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4000);
    await p.screenshot({ path: "shots/studio.png" });
  },
};
(async () => { for (const [name, fn] of Object.entries(jobs)) if (!only || only === name) await clip(name, fn); })();
