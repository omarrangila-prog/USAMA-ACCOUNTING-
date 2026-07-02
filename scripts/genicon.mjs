import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('build/icon.svg');
await sharp(svg, { density: 384 }).resize(512, 512).png().toFile('build/icon.png');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const buffers = await Promise.all(
  sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer())
);
writeFileSync('build/icon.ico', await pngToIco(buffers));
console.log('generated build/icon.png (512) + build/icon.ico');
