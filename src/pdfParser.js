const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toTypeKey(label) {
  return label.toLowerCase().replace(/\s+/g,'_').replace(/[^\w_]/g,'').replace(/_+/g,'_').replace(/^_|_$/,'').slice(0,50);
}

async function parsePdf(buffer, originalFilename) {
  const base64 = buffer.toString('base64');

  const prompt = `這是一份 Banner 設計規格 PDF 文件。請仔細閱讀所有頁面，提取以下欄位並以 JSON 回傳（不得有任何前言說明）：
{
  "label": "頁面名稱 + Banner 類型，例如「首頁 蓋版 PopUp Banner」或「首頁 置頂輪播 Banner」",
  "aliases": [
    "頁面簡稱，例如「首頁蓋版」",
    "類型縮寫，例如「蓋版」或「PopUp」",
    "英文名稱，例如「Home PopUp Banner」",
    "文件編號，例如「A01」",
    "其他廠商可能輸入的關鍵字"
  ],
  "dimensions": { "width": 600, "height": 820 },
  "fileSizeKB": 200,
  "rules": [
    {
      "id": "snake_case英文id",
      "description": "規則說明（繁體中文）。若為可選項目請在說明開頭加上【可選】",
      "checkType": "programmatic 或 vision",
      "severity": "error 或 warning"
    }
  ]
}

重要：
- aliases 至少要有 5 個，包含所有廠商可能輸入的關鍵字
- 可選項目（如活動期間）的 severity 設為 "warning"，必填項目設為 "error"
- 檔名提示：${originalFilename}`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const raw = res.content[0].text.trim().replace(/^```json\n?/,'').replace(/\n?```$/,'');
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) { throw new Error('Claude 回傳格式錯誤，請重試'); }

  const label = parsed.label || originalFilename.replace(/\.pdf$/i,'');
  return {
    typeKey: toTypeKey(label), label,
    aliases: parsed.aliases || [],
    dimensions: parsed.dimensions || null,
    fileSizeKB: parsed.fileSizeKB || null,
    rules: parsed.rules || [],
    rawText: '',
    pdfFilename: originalFilename,
    pdfPages: 0,
  };
}

module.exports = { parsePdf };
