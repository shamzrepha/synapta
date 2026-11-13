/**
 * Sprout Mascot Animation Controller
 * Coordinates Sprout poses, mouth-flap synchronization, and floating motion.
 */

export const POSES = {
  HELLO: "01-sprout-hello.png",
  NEUTRAL: "02-sprout-neutral.png",
  MAGNIFIER: "03-sprout-magnifier.png",
  ROPE: "04-sprout-rope-launcher.png",
  CHEER: "05-sprout-cheer.png",
  THINKING: "06-sprout-thinking.png",
  POINTING: "07-sprout-pointing.png",
  FIRE: "08-sprout-streak-on-fire.png",
  GENIUS: "09-sprout-genius.png",
  SLEEPY: "10-sprout-sleepy.png",
  CAP: "11-sprout-cap-and-glasses.png",
  WIZARD: "12-sprout-wizard-hat.png",
  CROWN: "13-sprout-crown-and-shades.png",
  HEADPHONES: "14-sprout-headphones.png"
};

export class SproutRenderer {
  constructor(canvas, assetsPath = "./assets") {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assetsPath = assetsPath;
    this.loadedImages = {};
    this.currentPose = POSES.HELLO;
    this.x = 540;
    this.y = 1200;
    this.scale = 0.65;
    this.bob = 0;
    this.mouthOpen = false;
  }

  async preload() {
    const promises = Object.values(POSES).map(file => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = `${this.assetsPath}/${file}`;
        img.onload = () => {
          this.loadedImages[file] = img;
          resolve();
        };
        img.onerror = () => resolve();
      });
    });
    await Promise.all(promises);
  }

  setPose(pose) {
    if (this.loadedImages[pose]) {
      this.currentPose = pose;
    }
  }

  update(time, isSpeaking = false) {
    this.bob = Math.sin(time * 3.5) * 12;
    this.mouthOpen = isSpeaking && Math.sin(time * 16) > 0;
  }

  draw() {
    const img = this.loadedImages[this.currentPose];
    if (!img) return;

    const w = img.width * this.scale;
    const h = img.height * this.scale;
    const drawX = this.x - w / 2;
    const drawY = this.y - h / 2 + this.bob;

    this.ctx.save();
    // Soft shadow
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    this.ctx.beginPath();
    this.ctx.ellipse(this.x, this.y + h / 2 + 10, w * 0.35, 14, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Sprite
    this.ctx.drawImage(img, drawX, drawY, w, h);
    this.ctx.restore();
  }
}
