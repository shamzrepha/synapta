/** generated from the approved 2-minute script: scene, length (s), voice length (s), words */
export interface LongScene { id: number; scene: string; len: number; voLen: number; vo: string; text: string; at: number }
const rows: Array<[number, string, number, number, string]> = [
  [1, "S1", 8.16, 7.46, "It's week three. The slides keep piling up, the exam date keeps getting closer, and honestly, you're not sure you actually understand any of it."],
  [2, "S2", 10.16, 9.46, "So you do what everyone does. You read it again. And again. It feels like studying. But re-reading does very little for memory. Recalling the idea is what makes it stick."],
  [3, "N3", 8.04, 7.34, "Then exam week arrives, and what you need isn't more pages. You need to know what you remember, and what you don't, before the exam finds out first."],
  [4, "N4", 6.39, 5.69, "That's why we built Sunroot. A study app that turns the material you already have into something you can actually learn from."],
  [5, "N5", 8.12, 7.42, "Maybe your lecturer's class is already there. Find it, join it, and the whole course is laid out for you. Chapter by chapter, ready to read."],
  [6, "N6", 8.02, 7.32, "Press start, and the lesson reads out loud. Every word lights up as it's spoken, and Sprout moves with it, so you never lose your place."],
  [7, "N7", 7.4, 6.7, "Stuck on an idea? Ask the tutor in your own words. Or tap Teach me, and get it as a short lesson, scene by scene."],
  [8, "N8", 9.6, 8.9, "And if nothing's set up yet, bring your own slides, a PDF, or a photo of handwritten notes. Within a minute, they become clean, structured study notes."],
  [9, "N9", 8.57, 7.87, "Then comes the part that makes it stick. Quiz yourself. Flip flashcards. Write answers in your own words. The result shows the moment you answer."],
  [10, "S7", 9.34, 8.64, "Got one wrong? Good. That's useful information. Sunroot keeps it in your mistake notebook, sends you back to the idea, and tests you again with a fresh question."],
  [11, "S8", 6.63, 5.93, "Spaced review brings back what you're about to forget. And the exam planner builds your revision backwards from your exam date."],
  [12, "N12", 7.68, 6.98, "Some ideas need to be seen. So there are virtual labs, and a maker studio, where you can build and test circuits without buying a single part."],
  [13, "N13", 8.19, 7.49, "And you don't have to do it alone. Study in focus rooms with friends, and climb a weekly leaderboard that resets, so newcomers can win too."],
  [14, "N14", 7.28, 6.58, "Because understanding isn't about reading more. It's about practising the right way, at the right time. Sunroot does that part with you."],
  [15, "S11", 7.42, 4.82, "Sunroot. Understand it. Build it. Prove it. Find it at sunrootlearn.com."],
];
let t = 0;
export const LONG: LongScene[] = rows.map((r) => { const s = { id: r[0], scene: r[1], len: r[2], voLen: r[3], vo: `vo2/v${String(r[0]).padStart(2, "0")}.mp3`, text: r[4], at: t }; t += r[2]; return s; });
export const LONG_SECONDS = t;
export const LONG_VO_DELAY = 0.35;
