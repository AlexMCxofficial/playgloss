// lean-qr.js - Minimal QR code generator for PlayGloss (ES Module)
// Based on lean-qr by David Evans (MIT), adapted from ha.mr by p2r3 (MIT)
// MIT License (see LICENSE)

// QR Code constants
export var mode = { NUMERIC: 1, ALPHANUMERIC: 2, BYTE: 4, KANJI: 8 };
export var correction = { L: 1, M: 0, Q: 3, H: 2 };

var EC_BLOCKS = [
  [1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1],[2,2,2,2],[2,2,2,2],[2,2,2,2],
  [2,2,2,2],[4,4,4,4],[4,4,4,4],[4,4,4,4],[4,4,4,4],[4,4,4,4],[6,6,6,6],[6,6,6,6],
  [6,6,6,6],[6,6,6,6],[6,6,6,6],[6,6,6,6],[8,8,8,8],[8,8,8,8],[8,8,8,8],[8,8,8,8],
  [8,8,8,8],[8,8,8,8],[10,10,10,10],[10,10,10,10],[10,10,10,10],[10,10,10,10],
  [12,12,12,12],[12,12,12,12],[12,12,12,12],[12,12,12,12],[14,14,14,14],[14,14,14,14],
  [14,14,14,14],[14,14,14,14],[16,16,16,16],[16,16,16,16],[16,16,16,16],[16,16,16,16]
];
var EC_CODEWORDS = [
  [7,10,13,17],[10,16,22,28],[15,26,36,44],[20,36,52,64],[26,48,72,88],[36,64,96,112],
  [40,72,108,130],[48,88,132,156],[60,110,160,192],[72,130,192,224],[80,150,224,264],
  [96,176,260,308],[104,198,288,352],[120,216,320,384],[132,240,360,432],[144,280,408,480],
  [168,308,448,532],[180,338,504,588],[196,364,546,650],[224,416,600,728],[224,442,644,792],
  [252,476,690,858],[270,504,750,924],[300,560,810,990],[312,588,870,1050],[336,644,952,1140],
  [360,700,1020,1218],[390,728,1050,1296],[420,784,1140,1374],[450,812,1200,1452],
  [480,868,1290,1530],[510,924,1350,1608],[540,980,1440,1686],[570,1036,1530,1764],
  [570,1064,1590,1842],[600,1120,1680,1920],[630,1204,1770,1998],[660,1260,1860,2076],
  [720,1316,1950,2154],[750,1372,2040,2232]
];

var GF256_EXP = new Array(512), GF256_LOG = new Array(256);
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) { GF256_EXP[i] = x; GF256_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (var i = 255; i < 512; i++) GF256_EXP[i] = GF256_EXP[i - 255];
})();

function gfMul(a, b) { return a && b ? GF256_EXP[GF256_LOG[a] + GF256_LOG[b]] : 0; }
function gfDiv(a, b) { return a === 0 ? 0 : GF256_EXP[GF256_LOG[a] - GF256_LOG[b] + 255]; }

function getMode(text) {
  if (/^[0-9]+$/.test(text)) return mode.NUMERIC;
  if (/^[A-Z0-9 $%*+\-./:]+$/.test(text)) return mode.ALPHANUMERIC;
  return mode.BYTE;
}

function getCharCountBits(m, version) {
  if (m === mode.NUMERIC) return version < 10 ? 10 : version < 27 ? 12 : 14;
  if (m === mode.ALPHANUMERIC) return version < 10 ? 9 : version < 27 ? 11 : 13;
  if (m === mode.BYTE) return version < 10 ? 8 : 16;
  return 8;
}

function encodeNumeric(text) {
  var bits = '';
  for (var i = 0; i < text.length; i += 3) {
    var chunk = text.slice(i, i + 3), val = parseInt(chunk, 10);
    bits += val.toString(2).padStart(chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4, '0');
  }
  return bits;
}

var ALPHANUMERIC_MAP = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
function encodeAlphanumeric(text) {
  var bits = '';
  for (var i = 0; i < text.length; i += 2) {
    var v1 = ALPHANUMERIC_MAP.indexOf(text[i]);
    if (i + 1 < text.length) {
      var v2 = ALPHANUMERIC_MAP.indexOf(text[i + 1]);
      bits += (v1 * 45 + v2).toString(2).padStart(11, '0');
    } else {
      bits += v1.toString(2).padStart(6, '0');
    }
  }
  return bits;
}

function encodeByte(text) {
  var bits = '';
  for (var i = 0; i < text.length; i++) {
    bits += text.charCodeAt(i).toString(2).padStart(8, '0');
  }
  return bits;
}

function getVersionInfo(version) {
  var bits = version.toString(2).padStart(6, '0');
  var poly = 0x1f25;
  for (var i = 0; i < 6; i++) {
    if (bits[i] === '1') poly ^= 0x1f25 >> i;
  }
  return (version << 12) | poly;
}

function getFormatInfo(ecLevel, mask) {
  var fmt = (ecLevel << 3) | mask;
  var bits = fmt.toString(2).padStart(5, '0');
  var poly = 0x537;
  for (var i = 0; i < 5; i++) {
    if (bits[i] === '1') poly ^= 0x537 >> i;
  }
  return (fmt << 10) | poly;
}

function addFinderPatterns(matrix, size) {
  var pattern = [
    [1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1]
  ];
  for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++) matrix[y][x] = pattern[y][x];
  for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++) matrix[y][size - 7 + x] = pattern[y][x];
  for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++) matrix[size - 7 + y][x] = pattern[y][x];
  for (var i = 0; i < 8; i++) { matrix[7][i] = 0; matrix[i][7] = 0; matrix[7][size - 1 - i] = 0; matrix[size - 1 - i][7] = 0; matrix[size - 8][i] = 0; matrix[i][size - 8] = 0; }
}

function addTimingPatterns(matrix, size) {
  for (var i = 8; i < size - 8; i++) { matrix[6][i] = matrix[i][6] = i % 2 === 0 ? 1 : 0; }
}

function getAlignmentPositions(version) {
  if (version === 1) return [];
  var size = version * 4 + 17;
  var step = version < 32 ? Math.floor((version * 4 + 4) / (version - 1)) * 2 : 28;
  var positions = [6];
  var pos = size - 7;
  while (pos > 6) { positions.unshift(pos); pos -= step; }
  return positions;
}

function addAlignmentPatterns(matrix, size, version) {
  var positions = getAlignmentPositions(version);
  var pattern = [
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,1,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1]
  ];
  for (var i = 0; i < positions.length; i++) {
    for (var j = 0; j < positions.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === positions.length - 1) || (i === positions.length - 1 && j === 0)) continue;
      var y = positions[i], x = positions[j];
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) matrix[y + dy][x + dx] = pattern[dy + 2][dx + 2];
    }
  }
}

function addVersionInfo(matrix, size, version) {
  if (version < 7) return;
  var bits = getVersionInfo(version).toString(2).padStart(18, '0');
  for (var i = 0; i < 18; i++) {
    var x = i % 3, y = Math.floor(i / 3);
    matrix[size - 11 + y][x] = matrix[x][size - 11 + y] = bits[i] === '1' ? 1 : 0;
  }
}

function addFormatInfo(matrix, size, ecLevel, mask) {
  var bits = getFormatInfo(ecLevel, mask).toString(2).padStart(15, '0');
  for (var i = 0; i < 15; i++) {
    var v = bits[i] === '1' ? 1 : 0;
    if (i < 6) { matrix[8][i] = v; matrix[size - 1 - i][8] = v; }
    else if (i < 8) { matrix[8][i + 1] = v; matrix[size - 1 - (i - 6)][8] = v; }
    else { matrix[8][size - 15 + i] = v; matrix[14 - i][8] = v; }
  }
  matrix[8][size - 8] = 1;
}

function getMaskFunction(mask) {
  switch (mask) {
    case 0: return function (x, y) { return (x + y) % 2 === 0; };
    case 1: return function (x, y) { return y % 2 === 0; };
    case 2: return function (x, y) { return x % 3 === 0; };
    case 3: return function (x, y) { return (x + y) % 3 === 0; };
    case 4: return function (x, y) { return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; };
    case 5: return function (x, y) { return (x * y) % 2 + (x * y) % 3 === 0; };
    case 6: return function (x, y) { return ((x * y) % 2 + (x * y) % 3) % 2 === 0; };
    case 7: return function (x, y) { return ((x + y) % 2 + (x * y) % 3) % 2 === 0; };
  }
}

function applyMask(matrix, size, mask) {
  var fn = getMaskFunction(mask);
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      if (!isReserved(x, y, size)) matrix[y][x] ^= fn(x, y) ? 1 : 0;
    }
  }
}

function isReserved(x, y, size) {
  if (y < 9 && x < 9) return true;
  if (y < 9 && x >= size - 8) return true;
  if (y >= size - 8 && x < 9) return true;
  if (y === 6 || x === 6) return true;
  if (size > 21) {
    if (y < 6 && x >= size - 11) return true;
    if (x < 6 && y >= size - 11) return true;
  }
  return false;
}

function placeData(matrix, size, dataBits) {
  var x = size - 1, y = size - 1, dir = -1, bitIndex = 0;
  while (x > 0) {
    if (x === 6) x--;
    for (var i = 0; i < size; i++) {
      var cy = dir === -1 ? size - 1 - i : i;
      for (var dx = 0; dx < 2; dx++) {
        var cx = x - dx;
        if (!isReserved(cx, cy, size) && bitIndex < dataBits.length) {
          matrix[cy][cx] = dataBits[bitIndex++] === '1' ? 1 : 0;
        }
      }
    }
    dir *= -1;
    x -= 2;
  }
}

function calculatePenalty(matrix, size) {
  var penalty = 0;
  for (var y = 0; y < size; y++) {
    var run = 1;
    for (var x = 1; x < size; x++) {
      if (matrix[y][x] === matrix[y][x - 1]) run++; else { if (run >= 5) penalty += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }
  for (var x = 0; x < size; x++) {
    var run = 1;
    for (var y = 1; y < size; y++) {
      if (matrix[y][x] === matrix[y - 1][x]) run++; else { if (run >= 5) penalty += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }
  for (var y = 0; y < size - 1; y++) {
    for (var x = 0; x < size - 1; x++) {
      var c = matrix[y][x];
      if (c === matrix[y][x + 1] && c === matrix[y + 1][x] && c === matrix[y + 1][x + 1]) penalty += 3;
    }
  }
  var pattern = [1,0,1,1,1,0,1,0,0,0,0];
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size - 10; x++) {
      var match = true;
      for (var i = 0; i < 11; i++) if (matrix[y][x + i] !== pattern[i]) { match = false; break; }
      if (match) penalty += 40;
    }
  }
  for (var x = 0; x < size; x++) {
    for (var y = 0; y < size - 10; y++) {
      var match = true;
      for (var i = 0; i < 11; i++) if (matrix[y + i][x] !== pattern[i]) { match = false; break; }
      if (match) penalty += 40;
    }
  }
  var dark = 0;
  for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (matrix[y][x]) dark++;
  var ratio = dark / (size * size);
  penalty += Math.floor(Math.abs(ratio - 0.5) / 0.05) * 10;
  return penalty;
}

function generateECC(data, ecCodewords) {
  var poly = new Array(ecCodewords).fill(0);
  for (var i = 0; i < data.length; i++) {
    var fb = data[i] ^ poly[0];
    for (var j = 0; j < ecCodewords; j++) {
      var val = poly[j + 1] || 0;
      poly[j] = val ^ gfMul(fb, GF256_EXP[255 - ecCodewords + j]);
    }
  }
  return poly;
}

function getTotalCodewords(version) {
  return [26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706][version - 1];
}

function buildMatrix(text, ecLevel) {
  var m = getMode(text);
  var version = 1;
  var dataBits = '';
  for (; version <= 40; version++) {
    var charBits = getCharCountBits(m, version);
    var header = 4 + charBits;
    var payloadBits = m === mode.NUMERIC ? encodeNumeric(text) :
                     m === mode.ALPHANUMERIC ? encodeAlphanumeric(text) : encodeByte(text);
    var totalBits = header + payloadBits.length;
    var maxBits = (getTotalCodewords(version) - EC_CODEWORDS[version - 1][ecLevel]) * 8;
    if (totalBits <= maxBits) break;
  }
  if (version > 40) throw new Error('Text too long for QR code');

  var size = version * 4 + 17;
  var matrix = new Array(size);
  for (var i = 0; i < size; i++) matrix[i] = new Array(size).fill(0);

  addFinderPatterns(matrix, size);
  addTimingPatterns(matrix, size);
  addAlignmentPatterns(matrix, size, version);
  addVersionInfo(matrix, size, version);

  var charBits = getCharCountBits(m, version);
  dataBits = m.toString(2).padStart(4, '0') + text.length.toString(2).padStart(charBits, '0');
  dataBits += m === mode.NUMERIC ? encodeNumeric(text) :
              m === mode.ALPHANUMERIC ? encodeAlphanumeric(text) : encodeByte(text);
  dataBits += '0000';
  while (dataBits.length % 8) dataBits += '0';
  var padBytes = [0xec, 0x11];
  var byteIndex = 0;
  while (dataBits.length < (getTotalCodewords(version) - EC_CODEWORDS[version - 1][ecLevel]) * 8) {
    dataBits += padBytes[byteIndex++ % 2].toString(2).padStart(8, '0');
  }

  var codewords = [];
  for (var i = 0; i < dataBits.length; i += 8) {
    codewords.push(parseInt(dataBits.slice(i, i + 8), 2));
  }

  var ecCodewords = EC_CODEWORDS[version - 1][ecLevel];
  var blocks = EC_BLOCKS[version - 1][ecLevel];
  var dataCodewords = codewords.length;
  var codewordsPerBlock = Math.floor(dataCodewords / blocks);
  var extraBlocks = dataCodewords % blocks;

  var blockData = [];
  var idx = 0;
  for (var b = 0; b < blocks; b++) {
    var len = codewordsPerBlock + (b < extraBlocks ? 1 : 0);
    blockData.push(codewords.slice(idx, idx + len));
    idx += len;
  }

  var blockECC = blockData.map(function (d) { return generateECC(d, ecCodewords); });

  var finalData = [];
  var maxDataLen = Math.max.apply(null, blockData.map(function (d) { return d.length; }));
  for (var i = 0; i < maxDataLen; i++) {
    for (var b = 0; b < blocks; b++) if (i < blockData[b].length) finalData.push(blockData[b][i]);
  }
  for (var i = 0; i < ecCodewords; i++) {
    for (var b = 0; b < blocks; b++) finalData.push(blockECC[b][i]);
  }

  var bestMatrix = null, bestPenalty = Infinity;
  for (var mask = 0; mask < 8; mask++) {
    var mtx = matrix.map(function (row) { return row.slice(); });
    addFormatInfo(mtx, size, ecLevel, mask);
    placeData(mtx, size, finalData.map(function (c) { return c.toString(2).padStart(8, '0'); }).join(''));
    applyMask(mtx, size, mask);
    var penalty = calculatePenalty(mtx, size);
    if (penalty < bestPenalty) { bestPenalty = penalty; bestMatrix = mtx; }
  }

  return { matrix: bestMatrix, size: size };
}

export function generate(text, options) {
  options = options || {};
  var ecLevel = correction[options.correction || 'M'] || 0;
  var result = buildMatrix(text, ecLevel);
  var matrix = result.matrix, size = result.size;

  return {
    size: size,
    get: function (x, y) { return matrix[y] && matrix[y][x] ? 1 : 0; },
    toCanvas: function (canvas) {
      var ctx = canvas.getContext('2d');
      var scale = Math.floor(Math.min(canvas.width, canvas.height) / size);
      var offsetX = Math.floor((canvas.width - size * scale) / 2);
      var offsetY = Math.floor((canvas.height - size * scale) / 2);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (matrix[y][x]) ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
        }
      }
    },
    toDataURL: function (type) {
      var c = document.createElement('canvas');
      c.width = c.height = size * 4;
      this.toCanvas(c);
      return c.toDataURL(type || 'image/png');
    }
  };
}