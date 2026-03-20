// contrastChecker.js — WCAG 2.1 AA 對比度檢查

// sRGB → 線性轉換
function linearize(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// 相對亮度 (WCAG 2.1 定義)
function relativeLuminance(r, g, b) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

// 對比度 (1:1 ~ 21:1)
function contrastRatio(color1, color2) {
  const L1 = relativeLuminance(...color1);
  const L2 = relativeLuminance(...color2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// 判斷是否達 WCAG AA 標準
function meetsWCAG(ratio, fontSize, isBold) {
  const isLargeText = fontSize >= 18 || (isBold && fontSize >= 14);
  const required = isLargeText ? 3 : 4.5;
  return { passes: ratio >= required, required, isLargeText };
}

// 將 color 陣列轉為 hex 字串
function toHex(color) {
  return '#' + color.map(c => Math.round(c).toString(16).padStart(2, '0').toUpperCase()).join('');
}

// ── PSD 對比度檢查 ────────────────────────────────────
// compositePixels: raw RGBA Buffer from psd.image.pixelData
// psdData: { width, height, textLayers, ... }
async function checkPsdContrast(compositePixels, psdData) {
  let sharp;
  try { sharp = require('sharp'); } catch (_) { return []; }
  if (!compositePixels || !psdData?.textLayers?.length) return [];

  const violations = [];
  const image = sharp(compositePixels, {
    raw: { width: psdData.width, height: psdData.height, channels: 4 },
  });
  const metadata = { width: psdData.width, height: psdData.height };

  for (const layer of psdData.textLayers) {
    if (!layer.color || layer.color.length < 3) continue;
    const fgColor = layer.color.slice(0, 3);

    // 取樣文字圖層位置的背景色
    const bgColor = await sampleBackground(image, metadata, layer, fgColor);
    if (!bgColor) continue;

    const ratio = contrastRatio(fgColor, bgColor);
    const roundedRatio = Math.round(ratio * 10) / 10;
    const isBold = layer.fontWeight && layer.fontWeight >= 700;
    const fontSize = layer.fontSize || 16;
    const result = meetsWCAG(ratio, fontSize, isBold);

    // 附加到 textLayer 供 messages.js 顯示
    layer.contrastRatio = roundedRatio;
    layer.bgColor = bgColor;
    layer.contrastPasses = result.passes;

    if (!result.passes) {
      violations.push({
        rule_id: 'contrast',
        description: `「${layer.name}」對比度 ${roundedRatio}:1，未達 WCAG AA 標準 ${result.required}:1（文字 ${toHex(fgColor)} / 背景 ${toHex(bgColor)}）`,
        bbox: null,
        severity: 'warning',
      });
    }
  }

  return violations;
}

// 取樣文字圖層區域的背景色（排除文字色）
async function sampleBackground(sharpInstance, metadata, layer, fgColor) {
  const x = Math.max(0, layer.left || 0);
  const y = Math.max(0, layer.top || 0);
  const w = Math.min(layer.width || 50, metadata.width - x);
  const h = Math.min(layer.height || 50, metadata.height - y);
  if (w <= 0 || h <= 0) return null;

  try {
    const { data, info } = await sharpInstance
      .clone()
      .extract({ left: x, top: y, width: w, height: h })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const samples = [];
    const step = Math.max(1, Math.floor(data.length / channels / 100)); // 最多取 100 個樣本

    for (let i = 0; i < data.length; i += step * channels) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // 排除與文字色相近的像素（容差 30）
      if (Math.abs(r - fgColor[0]) < 30 && Math.abs(g - fgColor[1]) < 30 && Math.abs(b - fgColor[2]) < 30) continue;
      samples.push([r, g, b]);
    }

    if (samples.length === 0) return null;

    // 取中位數作為背景色
    const mid = Math.floor(samples.length / 2);
    samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
    return samples[mid];
  } catch (_) {
    return null;
  }
}

// ── 圖片模式對比度檢查（處理 Vision 回報的文字區域）────
function checkImageContrast(textRegions) {
  if (!textRegions?.length) return [];

  const violations = [];
  for (const region of textRegions) {
    if (!region.fg_color || !region.bg_color) continue;

    const ratio = contrastRatio(region.fg_color, region.bg_color);
    const roundedRatio = Math.round(ratio * 10) / 10;
    const isBold = region.isBold || false;
    const fontSize = region.fontSize_approx || 16;
    const result = meetsWCAG(ratio, fontSize, isBold);

    if (!result.passes) {
      violations.push({
        rule_id: 'contrast',
        description: `「${region.label}」對比度 ${roundedRatio}:1，未達 WCAG AA 標準 ${result.required}:1（文字 ${toHex(region.fg_color)} / 背景 ${toHex(region.bg_color)}）`,
        bbox: region.bbox || null,
        severity: 'warning',
      });
    }
  }
  return violations;
}

module.exports = { contrastRatio, meetsWCAG, toHex, checkPsdContrast, checkImageContrast };
