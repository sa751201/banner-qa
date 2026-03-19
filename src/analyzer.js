const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    .map((r, i) => `${i + 1}. [${r.id}] (${r.severity || 'error'}) ${r.description}`)
    .join('\n');

  const prompt = `你是「${guideline.label}」的 Banner 規格審查員。

請逐條審查此圖片是否符合以下規則：
${rulesText}

只回傳 JSON，不通過的規則列於 violations（全部通過則回傳空陣列）：
{
  "violations": [
    {
      "rule_id": "同上方[]內的id",
      "description": "具體說明違規原因（繁體中文，30字以內）",
      "bbox": {"x": 0, "y": 0, "width": 100, "height": 100} 或 null,
      "severity": "error 或 warning"
    }
  ]
}`;

  // 偵測圖片格式
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
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: imageBuffer.toString('base64'),
          },
        },
        { type: 'text', text: prompt },
      ],
    }],
  });

  try {
    const clean = res.content[0].text.trim()
      .replace(/^```json\n?/, '').replace(/\n?```$/, '');
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
