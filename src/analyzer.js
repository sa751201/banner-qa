// analyzer.js — Claude Vision 圖片審查

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 程式化檢查（尺寸、檔案大小） ─────────────────────────
async function checkProgrammatic(imageBuffer, guideline) {
  const violations = [];
  const sizeKB = imageBuffer.length / 1024;

  if (guideline.fileSizeKB && sizeKB > guideline.fileSizeKB) {
    violations.push({
      rule_id: 'file_size',
      description: `檔案大小 ${Math.round(sizeKB)} KB，超過規格上限 ${guideline.fileSizeKB} KB`,
      bbox: null,
      severity: 'error',
    });
  }

  try {
    const sharp = require('sharp');
    const meta = await sharp(imageBuffer).metadata();
    if (guideline.dimensions) {
      const { width, height } = guideline.dimensions;
      if (meta.width !== width || meta.height !== height) {
        violations.push({
          rule_id: 'dimensions',
          description: `圖片尺寸 ${meta.width}×${meta.height}px，規格要求 ${width}×${height}px`,
          bbox: null,
          severity: 'error',
        });
      }
    }
  } catch (_) { /* sharp 未安裝時略過 */ }

  return violations;
}

// ── Claude Vision 視覺分析 ────────────────────────────────
async function checkVision(imageBuffer, guideline) {
  const visionRules = (guideline.rules || []).filter(r => r.checkType === 'vision');
  if (visionRules.length === 0) return [];

  const rulesText = visionRules
    .map((r, i) => `${i + 1}. [${r.id}] (${r.severity}) ${r.description}`)
    .join('\n');

  const pdfContext = guideline.rawText
    ? `\n\n【規格文件原文節錄】\n${guideline.rawText.slice(0, 3000)}`
    : '';

  const prompt = `你是「${guideline.label}」的 Banner 規格審查員。

請逐條審查此圖片是否符合以下規則：
${rulesText}
${pdfContext}

只回傳 JSON，不通過的規則列於 violations（通過的不用列）：
{
  "violations": [
    {
      "rule_id": "同上方[]內的id",
      "description": "具體說明違規原因與數值（繁體中文，20字以內）",
      "bbox": {"x": 左上角X像素, "y": 左上角Y像素, "width": 寬, "height": 高} 或 null,
      "severity": "error 或 warning"
    }
  ]
}

bbox 請以圖片實際像素座標標示違規區域；若無法定位填 null。`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: imageBuffer.toString('base64') },
        },
        { type: 'text', text: prompt },
      ],
    }],
  });

  try {
    const clean = res.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(clean).violations || [];
  } catch (e) {
    console.error('Vision parse error:', e.message);
    return [];
  }
}

async function analyze(imageBuffer, guideline) {
  const [prog, vision] = await Promise.all([
    checkProgrammatic(imageBuffer, guideline),
    checkVision(imageBuffer, guideline),
  ]);
  return [...prog, ...vision];
}

module.exports = { analyze };
