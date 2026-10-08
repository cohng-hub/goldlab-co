const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const WIDTH = 540;
const HEIGHT = 960;
const FPS = 30;
const DURATION = 1.44;
const TOTAL_FRAMES = Math.round(FPS * DURATION);

console.log(`Rendering ${TOTAL_FRAMES} aurora frames at ${WIDTH}x${HEIGHT}...`);

// Generate static stars
const STARS = [];
for (let i = 0; i < 60; i++) {
  STARS.push({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT,
    size: Math.random() < 0.2 ? 2 : 1,
    speed: 15 + Math.random() * 25,
    phase: Math.random() * Math.PI * 2,
    brightness: 0.4 + Math.random() * 0.6
  });
}

function renderFrame(frameIdx) {
  const t = frameIdx / FPS;
  const buffer = Buffer.alloc(WIDTH * HEIGHT * 4);

  // Aurora wave parameters
  const w1_y = (x) => HEIGHT * 0.38 + Math.sin(x * 0.008 + t * 2.5) * 60 + Math.cos(x * 0.015 - t * 1.8) * 35;
  const w2_y = (x) => HEIGHT * 0.52 + Math.sin(x * 0.006 - t * 2.0) * 80 + Math.sin(x * 0.012 + t * 2.8) * 45;
  const w3_y = (x) => HEIGHT * 0.68 + Math.cos(x * 0.007 + t * 1.6) * 70 + Math.sin(x * 0.014 - t * 2.2) * 30;

  for (let y = 0; y < HEIGHT; y++) {
    const ny = y / HEIGHT;
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;

      // Base: Deep luxury midnight space (#030712 -> #081026 -> #02040a)
      let r = 3 + ny * 6;
      let g = 6 + ny * 10;
      let b = 15 + ny * 20;

      // Wave 1: Ethereal Emerald / Jade Green Aurora Ribbon
      const d1 = Math.abs(y - w1_y(x));
      if (d1 < 180) {
        const curtain1 = Math.pow(Math.max(0, 1 - d1 / 180), 1.8);
        const verticalFlutter1 = 0.7 + 0.3 * Math.sin(x * 0.05 + y * 0.08 + t * 4.0);
        const intensity1 = curtain1 * verticalFlutter1 * 0.45;
        r += 10 * intensity1;
        g += 180 * intensity1;
        b += 130 * intensity1;
      }

      // Wave 2: Mystical Cyan / Electric Teal Ribbon
      const d2 = Math.abs(y - w2_y(x));
      if (d2 < 200) {
        const curtain2 = Math.pow(Math.max(0, 1 - d2 / 200), 2.0);
        const verticalFlutter2 = 0.7 + 0.3 * Math.cos(x * 0.04 - y * 0.06 - t * 3.5);
        const intensity2 = curtain2 * verticalFlutter2 * 0.40;
        r += 15 * intensity2;
        g += 140 * intensity2;
        b += 220 * intensity2;
      }

      // Wave 3: Subtle Violet / Gold Sheen Lower Ribbon
      const d3 = Math.abs(y - w3_y(x));
      if (d3 < 160) {
        const curtain3 = Math.pow(Math.max(0, 1 - d3 / 160), 1.6);
        const intensity3 = curtain3 * 0.28;
        r += 120 * intensity3;
        g += 60 * intensity3;
        b += 160 * intensity3;
      }

      // Ambient Gold Glow around the Center (behind GoldLab logo)
      const dx = x - WIDTH * 0.5;
      const dy = y - HEIGHT * 0.52;
      const distCenter = Math.sqrt(dx * dx + dy * dy);
      if (distCenter < 280) {
        const goldGlow = Math.pow(Math.max(0, 1 - distCenter / 280), 1.5) * (0.18 + 0.06 * Math.sin(t * 3.0));
        r += 212 * goldGlow;
        g += 175 * goldGlow;
        b += 55 * goldGlow;
      }

      // Clamp colors
      buffer[idx] = Math.min(255, Math.round(r));
      buffer[idx + 1] = Math.min(255, Math.round(g));
      buffer[idx + 2] = Math.min(255, Math.round(b));
      buffer[idx + 3] = 255;
    }
  }

  // Draw shimmering stars
  for (const s of STARS) {
    const starY = (s.y - t * s.speed + HEIGHT) % HEIGHT;
    const twinkle = s.brightness * (0.6 + 0.4 * Math.sin(t * 6.0 + s.phase));
    const ix = Math.floor(s.x);
    const iy = Math.floor(starY);
    if (ix >= 0 && ix < WIDTH && iy >= 0 && iy < HEIGHT) {
      const idx = (iy * WIDTH + ix) * 4;
      buffer[idx] = Math.min(255, buffer[idx] + 255 * twinkle);
      buffer[idx + 1] = Math.min(255, buffer[idx + 1] + 255 * twinkle);
      buffer[idx + 2] = Math.min(255, buffer[idx + 2] + 230 * twinkle);
    }
  }

  return buffer;
}

const rawPath = path.join(__dirname, '..', 'assets', 'aurora_raw.yuv');
console.log('Writing raw frames to ffmpeg...');

const ffmpeg = spawn('ffmpeg', [
  '-y',
  '-f', 'rawvideo',
  '-pix_fmt', 'rgba',
  '-s', `${WIDTH}x${HEIGHT}`,
  '-r', `${FPS}`,
  '-i', '-',
  '-vf', 'scale=1080:1920:flags=lanczos,boxblur=2:1',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-preset', 'fast',
  path.join(__dirname, '..', 'assets', 'aurora_bg.mp4')
]);

ffmpeg.stderr.on('data', d => {});

for (let i = 0; i < TOTAL_FRAMES; i++) {
  const buf = renderFrame(i);
  ffmpeg.stdin.write(buf);
}
ffmpeg.stdin.end();

ffmpeg.on('close', code => {
  console.log('Aurora background generated successfully with code', code);
});
