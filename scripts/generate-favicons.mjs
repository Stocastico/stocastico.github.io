#!/usr/bin/env node
/**
 * Rasterise public/favicon.svg into the PNG + ICO sizes browsers expect.
 *
 * Outputs (all under public/, so Vite serves them at site root):
 *   favicon.ico            — multi-resolution 16/32/48
 *   apple-touch-icon.png   — 180 × 180 (iOS Add-to-Home-Screen)
 *   icon-192.png           — 192 × 192 (Android / PWA manifest)
 *   icon-512.png           — 512 × 512 (Android splash / PWA manifest)
 *
 * The inline SVG in each HTML head stays as the primary `rel="icon"`;
 * these raster files are fallbacks for clients that don't render SVG
 * (Safari pinned tabs, older Android, the Windows taskbar, etc.).
 *
 * Run: npm run generate-favicons
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG_PATH = path.join(ROOT, 'public', 'favicon.svg');
const PUBLIC_DIR = path.join(ROOT, 'public');

/**
 * Pack a list of square PNG buffers into a single ICO container. Modern
 * Windows/macOS/iOS readers accept PNG-encoded entries inside ICO, so we
 * skip BMP entirely. Spec: https://en.wikipedia.org/wiki/ICO_(file_format).
 */
function encodeIco(entries) {
  const HEADER_BYTES = 6;
  const ENTRY_BYTES = 16;
  const dirSize = HEADER_BYTES + ENTRY_BYTES * entries.length;

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16LE(0, 0);              /* reserved */
  header.writeUInt16LE(1, 2);              /* type: 1 = ICO */
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  let offset = dirSize;
  for (const { size, buffer } of entries) {
    const e = Buffer.alloc(ENTRY_BYTES);
    e.writeUInt8(size === 256 ? 0 : size, 0);    /* width  (0 means 256) */
    e.writeUInt8(size === 256 ? 0 : size, 1);    /* height (0 means 256) */
    e.writeUInt8(0, 2);                          /* color count (0 = ≥256) */
    e.writeUInt8(0, 3);                          /* reserved */
    e.writeUInt16LE(1, 4);                       /* color planes */
    e.writeUInt16LE(32, 6);                      /* bits per pixel */
    e.writeUInt32LE(buffer.length, 8);           /* bytes in image data */
    e.writeUInt32LE(offset, 12);                 /* offset of image data */
    dirEntries.push(e);
    offset += buffer.length;
  }

  return Buffer.concat([
    header,
    ...dirEntries,
    ...entries.map(e => e.buffer),
  ]);
}

async function renderPng(svg, size) {
  return sharp(svg, { density: Math.max(72, size * 4) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function main() {
  const svg = await readFile(SVG_PATH);
  await mkdir(PUBLIC_DIR, { recursive: true });

  const sizes = [16, 32, 48, 180, 192, 512];
  const pngs = {};
  for (const size of sizes) {
    pngs[size] = await renderPng(svg, size);
  }

  await writeFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), pngs[180]);
  await writeFile(path.join(PUBLIC_DIR, 'icon-192.png'), pngs[192]);
  await writeFile(path.join(PUBLIC_DIR, 'icon-512.png'), pngs[512]);

  const ico = encodeIco([
    { size: 16, buffer: pngs[16] },
    { size: 32, buffer: pngs[32] },
    { size: 48, buffer: pngs[48] },
  ]);
  await writeFile(path.join(PUBLIC_DIR, 'favicon.ico'), ico);

  console.log('Wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
