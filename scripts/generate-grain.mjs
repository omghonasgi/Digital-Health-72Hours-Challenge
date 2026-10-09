// Generates assets/grain.png: a 128x128 transparent tile of monochrome noise.
// Rendered at low opacity over every non-status surface (see skills.md, "Grain").
// Pure Node, no dependencies: writes a PNG by hand (RGBA, deflate, CRC32).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 128;
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../assets/grain.png');

// Deterministic PRNG so the tile is reproducible across machines.
let seed = 0x5eed1234;
function rand() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 10000) / 10000;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter byte: none
  for (let x = 0; x < SIZE; x++) {
    const i = y * (SIZE * 4 + 1) + 1 + x * 4;
    const v = rand();
    // Mostly transparent; sparse light and dark specks give paper-like grain.
    const dark = v < 0.5;
    const alpha = Math.round(Math.pow(rand(), 2.2) * 255);
    raw[i] = dark ? 20 : 255;
    raw[i + 1] = dark ? 26 : 255;
    raw[i + 2] = dark ? 34 : 255;
    raw[i + 3] = alpha;
  }
}

const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
