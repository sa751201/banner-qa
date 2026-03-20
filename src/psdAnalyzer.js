// psdAnalyzer.js — 解析廠商上傳的 PSD，提取圖層數值做精確審查

const PSD = require('psd');
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const os = require('os');
const path = require('path');
const fs = require('fs');
const { checkPsdContrast } = require('./contrastChecker');

// ── 從 PSD Buffer 提取圖層資訊 ─────────────────────────
async function extractPsdLayers(psdBuffer) {
  // psd.js 需要檔案路徑，先寫入暫存
  const tmpPath = path.join(os.tmpdir(), `upload_${Date.now()}.psd`);
  fs.writeFileSync(tmpPath, psdBuffer);

  try {
    const psd = await PSD.open(tmpPath);
    await psd.parse();

    const tree = psd.tree().export();
    const layers = [];

    function walkNode(node, depth = 0) {
      if (!node) return;

      const layer = {
        name: node.name || '',
        type: node.type || 'layer',
        depth,
        visible: node.visible !== false,
      };

      // 文字圖層
      if (node.text) {
        layer.isText = true;
        layer.text = node.text.value || '';
        layer.fontSize = node.text.font?.sizes?.[0] || null;
        layer.fontName = node.text.font?.names?.[0] || null;
        layer.fontWeight = node.text.font?.weights?.[0] || null;
        layer.color = node.text.font?.colors?.[0] || null;
        layer.charCount = (node.text.value || '').replace(/\s/g, '').length;
      }

      // 尺寸與位置
      if (node.width !== undefined) {
        layer.width = node.width;
        layer.height = node.height;
        layer.top = node.top;
        layer.left = node.left;
      }

      layers.push(layer);

      // 遞迴子節點
      if (node.children) {
        node.children.forEach(child => walkNode(child, depth + 1));
      }
    }

    walkNode(tree);

    // 取得合成圖像素資料（RGBA）供對比度檢查使用
    let compositePixels = null;
    try {
      if (psd.image && psd.image.pixelData) {
        compositePixels = Buffer.from(psd.image.pixelData);
      }
    } catch (_) {}

    return {
      width: psd.header.width,
      height: psd.header.height,
      layers,
      textLayers: layers.filter(l => l.isText && l.visible),
      compositePixels,
    };
  } finally {
    fs.unlink(tmpPath, () => {});
  }
}

// ── 用 Claude 比對 PSD 圖層與規格 ──────────────────────
async function analyzePsdAgainstGuideline(psdData, guideline) {
  const textSummary = psdData.textLayers.map(l =>
    `・${l.name}：「${l.text}」（${l.charCount} 字）字體 ${l.fontSize ? l.fontSize + 'px' : '未知'} ${l.fontName || ''}`
  ).join('\n');

  const rulesText = (guideline.rules || [])
    .map((r, i) => `${i + 1}. [${r.id}] [${r.severity === 'warning' ? '建議' : '必須'}] ${r.description}`)
    .join('\n');

  const prompt = `你是「${guideline.label}」的 Banner 規格審查員。

以下是從 PSD 檔案提取的精確數值：

【畫布尺寸】${psdData.width} × ${psdData.height} px

【文字圖層】
${textSummary || '（無文字圖層）'}

【規格要求】
${rulesText}

請根據上方精確的 PSD 數值，逐條核對規格，回傳 JSON：
{
  "violations": [
    {
      "rule_id": "規則id",
      "description": "具體違規說明，引用實際數值（繁體中文）",
      "bbox": null,
      "severity": "error 或 warning"
    }
  ]
}

數值精確，請嚴格判斷。符合規範的項目不列出。`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const clean = res.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(clean).violations || [];
  } catch (e) {
    console.error('PSD analysis parse error:', e.message);
    return [];
  }
}

// ── 主流程：PSD Buffer → 違規清單 ─────────────────────
async function analyzePsd(psdBuffer, guideline) {
  const psdData = await extractPsdLayers(psdBuffer);

  // 程式化檢查：畫布尺寸
  const violations = [];
  if (guideline.dimensions) {
    const { width, height } = guideline.dimensions;
    if (psdData.width !== width || psdData.height !== height) {
      violations.push({
        rule_id: 'dimensions',
        description: `畫布尺寸 ${psdData.width}×${psdData.height}px，規格要求 ${width}×${height}px`,
        bbox: null,
        severity: 'error',
      });
    }
  }

  // 對比度檢查（WCAG AA）
  let contrastViolations = [];
  if (psdData.compositePixels) {
    try {
      contrastViolations = await checkPsdContrast(psdData.compositePixels, psdData);
    } catch (e) {
      console.error('Contrast check error:', e.message);
    }
  }

  // AI 比對其他規則
  const aiViolations = await analyzePsdAgainstGuideline(psdData, guideline);

  return {
    violations: [...violations, ...contrastViolations, ...aiViolations],
    psdData, // 回傳原始數據供 Flex Message 顯示
  };
}

module.exports = { analyzePsd, extractPsdLayers };
