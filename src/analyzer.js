const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const { checkImageContrast } = require('./contrastChecker');

async function checkProgrammatic(imageBuffer, guideline) {
  const violations = [];
  const sizeKB = imageBuffer.length / 1024;
  if (guideline.fileSizeKB && sizeKB > guideline.fileSizeKB) {
    violations.push({
      rule_id: 'file_size',
      description: `檔案大小 ${Math.round(sizeKB)} KB，超過規格上限 ${guideline.fileSizeKB} KB`,
      bbox: null, severity: 'error',
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
          bbox: null, severity: 'error',
        });
      }
    }
  } catch (_) {}
  return violations;
}

async function checkVision(imageBuffer, guideline) {
  const visionRules = (guideline.rules || []).filter(r => r.checkType === 'vision');
  if (visionRules.length === 0) return [];

  const rulesText = visionRules
    .map((r, i) => `${i + 1}. [${r.id}] [${r.severity === 'warning' ? '建議' : '必須'}] ${r.description}`)
    .join('\n');

  const prompt = `你是「${guideline.label}」的 Banner 規格審查員。

【重要判斷原則】
- 只有當規則「明確違反」時才列入 violations，有疑問時判定為通過
- 標示「可選」或「建議」的項目：只有明顯違反才列入，且 severity 設為 "warning"
- 數量/字數限制：只有「超過上限」才算違規，「符合上限」或「低於上限」均為通過
- 不要對圖片中沒有出現的可選元素報告違規

【待審查規則】
${rulesText}

請逐條審查圖片，並額外偵測圖片中所有文字區域的前景色與背景色。回傳 JSON：
{
  "violations": [
    {
      "rule_id": "規則id",
      "description": "具體說明違規原因（繁體中文，說明實際數值與限制）",
      "bbox": {"x": 0, "y": 0, "width": 100, "height": 100} 或 null,
      "severity": "error 或 warning"
    }
  ],
  "text_regions": [
    {
      "label": "文字描述（如「標題」「副標」「按鈕文字」）",
      "fg_color": [255, 255, 255],
      "bg_color": [0, 0, 0],
      "fontSize_approx": 16,
      "isBold": false,
      "bbox": {"x": 0, "y": 0, "width": 100, "height": 100}
    }
  ]
}

text_regions 請列出圖片中所有可見文字，估算其 RGB 前景色與背景色。
符合規範的項目不要列出 violations。violations 為空陣列代表全部通過。`;

  let mediaType = 'image/jpeg';
  if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) mediaType = 'image/png';
  else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) mediaType = 'image/gif';
  else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) mediaType = 'image/webp';

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBuffer.toString('base64') } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  try {
    const clean = res.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(clean);
    return {
      violations: parsed.violations || [],
      textRegions: parsed.text_regions || [],
    };
  } catch (e) {
    console.error('Vision parse error:', e.message);
    return { violations: [], textRegions: [] };
  }
}

async function analyze(imageBuffer, guideline) {
  const [prog, visionResult] = await Promise.all([
    checkProgrammatic(imageBuffer, guideline),
    checkVision(imageBuffer, guideline),
  ]);
  // 對比度檢查（WCAG AA）
  const contrastViolations = checkImageContrast(visionResult.textRegions);
  return [...prog, ...visionResult.violations, ...contrastViolations];
}

module.exports = { analyze };
