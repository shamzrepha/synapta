// Generates the static Sprout icons from app/icon.svg using sharp (already in node_modules).
// Run once after changing app/icon.svg:  node scripts/gen-icons.mjs
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const svg = readFileSync("app/icon.svg");
mkdirSync("public/icons", { recursive: true });

const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

writeFileSync("public/icons/icon-192.png", await png(192));
writeFileSync("public/icons/icon-512.png", await png(512));

// maskable: Sprout inside the central 80% safe zone on a solid brand-tint background
const inner = await sharp(svg, { density: 384 }).resize(380, 380).png().toBuffer();
const maskable = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#eaf0ff" } })
  .composite([{ input: inner, left: 66, top: 66 }])
  .png()
  .toBuffer();
writeFileSync("public/icons/icon-maskable-512.png", maskable);

writeFileSync("app/apple-icon.png", await png(180));

// favicon.ico: a single 48x48 PNG-in-ICO entry
const p48 = await png(48);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 48; head[7] = 48; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(p48.length, 14); head.writeUInt32LE(22, 18);
writeFileSync("app/favicon.ico", Buffer.concat([head, p48]));
console.log("icons written");
