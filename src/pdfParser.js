// pdfParser.js — 直接用 Claude API 讀取 PDF（不依賴 pdf-parse）

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toTypeKey(label) {
  return label.toLowerCase().replace(/\s+/g,'_').replace(/[^\w_]/g,'').replace(/_+/g,'_').replace(/^_|_$/,'').slice(0,50);
}

async function parsePdf(buffer, originalFilename) {
  const base64 = buffer.toString('base64');

  const prompt = `這是一份 Banner 設計規格 PDF 文件。請仔細閱讀所有頁面，提取以下欄位並以 JSON 回傳（不得有任何前言說明）：
{
  "label": "Banner 完整名稱（繁體中文，例如：首頁 蓋版 PopUp Banner）",
  "aliases": ["其他搜尋關鍵字", "英文名", "縮寫"],
  "dimensions": { "width": 600, "height": 820 },
  "fileSizeKB": 200,
  "rules": [
    {
      "id": "snake_case_英文id",
      "description": "規則說明（繁體中文，具體清楚）",
      "checkType": "programmatic 或 vision",
      "severity": "error 或 warning"
    }
  ]
}

注意：
- checkType = "programmatic"：尺寸、檔案大小、輸出格式等可量化規則
- checkType = "vision"：需視覺判斷的規則（文字字數、位置、對比度、圖片去背等）
- severity = "error"：必須符合；"warning"：建議符合
- 請把文件中所有設計規範都轉成 rules
- 檔名提示：${originalFilename}`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64,
          },
        },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const raw = res.content[0].text.trim().replace(/^```json\n?/,'').replace(/\n?```$/,'');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch(e) {
    throw new Error('Claude 回傳格式錯誤，請重試');
  }

  const label = parsed.label || originalFilename.replace(/\.pdf$/i,'');
  return {
    typeKey: toTypeKey(label),
    label,
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
