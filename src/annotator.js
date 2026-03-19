// annotator.js — 在圖片上繪製紅框 + 標籤，標示違規位置

async function annotate(imageBuffer, violations) {
  let sharp;
  try { sharp = require('sharp'); } catch (_) { return null; }

  const withBbox = violations.filter(v => v.bbox);
  if (withBbox.length === 0) return null;

  const meta = await sharp(imageBuffer).metadata();
  const { width, height } = meta;

  // ── 建構 SVG overlay ──────────────────────────────────
  const LABEL_H = 28;
  const FONT_SIZE = 15;
  const PAD = 8;

  const shapes = withBbox.map((v, i) => {
    const { x, y, width: w, height: h } = v.bbox;
    const isError = v.severity !== 'warning';
    const color = isError ? '#E74C3C' : '#E67E22';
    const num = i + 1;
    // Clamp label y position so it doesn't go above the image
    const labelY = y >= LABEL_H ? y - LABEL_H : y + h;
    const labelText = `${num}. ${v.description}`.slice(0, 40);
    // Approximate label width
    const labelW = Math.min(labelText.length * 9 + PAD * 2, width - x);

    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}"
            fill="none" stroke="${color}" stroke-width="3" rx="3"/>
      <rect x="${x}" y="${labelY}" width="${labelW}" height="${LABEL_H}"
            fill="${color}" rx="3"/>
      <text x="${x + PAD}" y="${labelY + LABEL_H / 2}"
            font-family="Arial,sans-serif" font-size="${FONT_SIZE}"
            font-weight="bold" fill="white"
            dominant-baseline="central">${labelText}</text>
    `;
  });

  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${shapes.join('')}
    </svg>
  `);

  return sharp(imageBuffer)
    .composite([{ input: svg, blend: 'over' }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

module.exports = { annotate };
