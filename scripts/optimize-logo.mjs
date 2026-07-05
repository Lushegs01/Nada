// Optimize logo.png → logo.webp using sharp
// Run: node scripts/optimize-logo.mjs

import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "apps", "web", "public");
const inputPath = path.join(publicDir, "logo.png");

async function optimize() {
  const originalSize = fs.statSync(inputPath).size;
  console.log(`Original logo.png: ${(originalSize / 1024).toFixed(1)} KB`);

  // Full-size WebP for general use
  await sharp(inputPath)
    .webp({ quality: 82 })
    .toFile(path.join(publicDir, "logo.webp"));
  const webpSize = fs.statSync(path.join(publicDir, "logo.webp")).size;
  console.log(`logo.webp: ${(webpSize / 1024).toFixed(1)} KB (${((1 - webpSize / originalSize) * 100).toFixed(0)}% smaller)`);

  // 192px for PWA manifest and icons
  await sharp(inputPath)
    .resize(192, 192)
    .webp({ quality: 82 })
    .toFile(path.join(publicDir, "logo-192.webp"));
  const size192 = fs.statSync(path.join(publicDir, "logo-192.webp")).size;
  console.log(`logo-192.webp: ${(size192 / 1024).toFixed(1)} KB`);

  // 512px for PWA splash
  await sharp(inputPath)
    .resize(512, 512)
    .webp({ quality: 82 })
    .toFile(path.join(publicDir, "logo-512.webp"));
  const size512 = fs.statSync(path.join(publicDir, "logo-512.webp")).size;
  console.log(`logo-512.webp: ${(size512 / 1024).toFixed(1)} KB`);

  // Tiny 64px for inline splash screen
  await sharp(inputPath)
    .resize(64, 64)
    .webp({ quality: 78 })
    .toFile(path.join(publicDir, "logo-64.webp"));
  const size64 = fs.statSync(path.join(publicDir, "logo-64.webp")).size;
  console.log(`logo-64.webp: ${(size64 / 1024).toFixed(1)} KB`);

  console.log("\nDone! Keep logo.png as fallback for old browsers/tools.");
}

optimize().catch(console.error);
