/**
 * Lightweight, zero-dependency QR Code (Model 2, Version 1–4, Byte Mode) SVG Generator.
 * Generates an SVG path or data matrix for any arbitrary string without external network calls.
 */

// Reed-Solomon Log / Anti-Log Tables for GF(256) with primitive polynomial 0x11d
const EXP: number[] = new Array(512);
const LOG: number[] = new Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x <<= 1;
    if (x >= 256) x ^= 0x11d;
  }
})();

function glog(n: number) {
  if (n < 1) throw new Error(`glog(${n})`);
  return LOG[n];
}

function gexp(n: number) {
  while (n < 0) n += 255;
  while (n >= 256) n -= 255;
  return EXP[n];
}

function rsMultiply(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      if (p1[i] !== 0 && p2[j] !== 0) {
        result[i + j] ^= gexp(glog(p1[i]) + glog(p2[j]));
      }
    }
  }
  return result;
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    poly = rsMultiply(poly, [1, gexp(i)]);
  }
  return poly;
}

function rsEncode(data: number[], numEcBytes: number): number[] {
  const gen = rsGeneratorPoly(numEcBytes);
  const info = [...data, ...new Array(numEcBytes).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const lead = info[i];
    if (lead !== 0) {
      const logLead = glog(lead);
      for (let j = 0; j < gen.length; j++) {
        info[i + j] ^= gexp(logLead + glog(gen[j]));
      }
    }
  }
  return info.slice(data.length);
}

// Versions 1 to 4 with Low (L) or Medium (M) error correction capacities
interface QRVersionSpec {
  version: number;
  size: number;
  dataCapacityBytes: number;
  ecBytes: number;
  alignmentPatterns: number[];
}

const QR_SPECS: QRVersionSpec[] = [
  { version: 1, size: 21, dataCapacityBytes: 19, ecBytes: 7, alignmentPatterns: [] },
  { version: 2, size: 25, dataCapacityBytes: 34, ecBytes: 10, alignmentPatterns: [6, 18] },
  { version: 3, size: 29, dataCapacityBytes: 55, ecBytes: 15, alignmentPatterns: [6, 22] },
  { version: 4, size: 33, dataCapacityBytes: 80, ecBytes: 20, alignmentPatterns: [6, 26] },
];

export function generateQRCodeMatrix(text: string): boolean[][] {
  const utf8Bytes = Array.from(new TextEncoder().encode(text));
  
  // Pick smallest fitting version
  const spec = QR_SPECS.find((s) => s.dataCapacityBytes >= utf8Bytes.length + 3) || QR_SPECS[QR_SPECS.length - 1];
  const totalDataBytes = spec.dataCapacityBytes;
  
  // Build bitstream: Mode (0100 = 8-bit byte), Char Count (8 bits for v1-4), Data, Terminator (0000)
  const bits: number[] = [];
  function pushBits(val: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  // 1. Mode Indicator: 8-bit Byte Mode (0100)
  pushBits(0b0100, 4);
  // 2. Character Count Indicator (8 bits for Version 1-4 Byte Mode)
  pushBits(utf8Bytes.length, 8);
  // 3. Data bytes
  for (const b of utf8Bytes) {
    pushBits(b, 8);
  }
  // 4. Terminator (up to 4 zeroes)
  const remainingBits = totalDataBytes * 8 - bits.length;
  pushBits(0, Math.min(4, Math.max(0, remainingBits)));

  // 5. Pad to multiple of 8
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // 6. Pad with alternating 0xEC and 0x11 until full
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) {
      byteVal = (byteVal << 1) | bits[i + j];
    }
    dataBytes.push(byteVal);
  }

  let pad = 0xec;
  while (dataBytes.length < totalDataBytes) {
    dataBytes.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }

  // 7. Calculate Reed-Solomon Error Correction Code
  const ecBytes = rsEncode(dataBytes, spec.ecBytes);
  const finalCodewords = [...dataBytes, ...ecBytes];

  // 8. Place on Matrix
  const size = spec.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  function setModule(r: number, c: number, val: boolean) {
    matrix[r][c] = val;
    isFunction[r][c] = true;
  }

  // 8a. Finder Patterns (Top-Left, Top-Right, Bottom-Left)
  function drawFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBlack = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            setModule(nr, nc, isBlack);
          } else {
            setModule(nr, nc, false);
          }
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 8b. Alignment Pattern (for versions > 1)
  if (spec.alignmentPatterns.length > 0) {
    const pos = spec.alignmentPatterns[1];
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const nr = pos + r;
        const nc = pos + c;
        if (!isFunction[nr][nc]) {
          const isBlack = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
          setModule(nr, nc, isBlack);
        }
      }
    }
  }

  // 8c. Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6][i]) setModule(6, i, i % 2 === 0);
    if (!isFunction[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // 8d. Dark Module & Format Info Reserve
  setModule(size - 8, 8, true);

  // Reserve format areas
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }

  // 8e. Data Placement with Zigzag Traversal
  const codewordBits: number[] = [];
  for (const byte of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      codewordBits.push((byte >> i) & 1);
    }
  }

  let bitIdx = 0;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip vertical timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const curCol = col - c;
        if (!isFunction[row][curCol]) {
          const bitVal = bitIdx < codewordBits.length ? codewordBits[bitIdx++] === 1 : false;
          // Apply standard Mask 0: (row + col) % 2 == 0
          const mask = (row + curCol) % 2 === 0;
          matrix[row][curCol] = bitVal !== mask;
        }
      }
    }
    upward = !upward;
  }

  // 8f. Standard Mask 0 Format Information (EC Level L + Mask 000 -> 0x77c4)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  const formatCoordsTopLeft = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];

  for (let i = 0; i < 15; i++) {
    const val = formatBits[i] === 1;
    const [r, c] = formatCoordsTopLeft[i];
    matrix[r][c] = val;
  }

  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = formatBits[i] === 1;
  }
  for (let i = 7; i < 15; i++) {
    matrix[8][size - 15 + i] = formatBits[i] === 1;
  }

  return matrix.map((row) => row.map((cell) => cell === true));
}
