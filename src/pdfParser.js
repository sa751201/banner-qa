// pdfParser.js — PDF → 結構化規則（透過 Claude API）

const pdfParse = require('pdf-parse').default || require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toTypeKey(label) {
  return label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/, '')
    .slice(0, 50);
}

async function parsePdf(buffer, originalFilename) {
  // Step 1：提取 PDF 純文字
  let text, pages;
  try {
    const parsed = await pdfParse(buffer);
    text = parsed.text;
    pages = parsed.numpages;
  } catch (e) {
    throw new Error(`PDF 無法解析：${e.message}`);
  }

  if (!text || text.trim().length < 30) {
    throw new Error('PDF 內容為空或為掃描圖片，請使用含文字層的 PDF');
  }

  // Step 2：Claude 將純文字結構化
  const prompt = `你是 Banner 規格文件解析專家。以下是一份 Banner 設計規格 PDF 的純文字內容。

請提取下列欄位並以 JSON 回傳（不得有任何前言說明）：
{
  "label": "Banner 完整名稱（繁體中文）",
  "aliases": ["其他可能的搜尋關鍵字", "縮寫", "英文名"],
  "dimensions": { "width": 1200, "height": 628 },
  "fileSizeKB": 500,
  "rules": [
    {
      "id": "snake_case_id",
      "description": "規則說明（繁體中文，具體清楚）",
      "checkType": "programmatic 或 vision",
      "severity": "error 或 warning"
    }
  ]
}

規則說明：
- checkType = "programmatic"：尺寸、檔案大小等可量化規則
- checkType = "vision"：需 AI 視覺判斷的規則（文字比例、Logo位置、配色等）
- severity = "error"：必須符合；"warning"：建議符合

若找不到尺寸填 null，找不到大小限制填 null。
aliases 至少填 2-3 個方便廠商搜尋的詞語。

檔案名稱提示：${originalFilename}

PDF 內容：
---
${text.slice(0, 5000)}
---`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = res.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Claude 回傳格式錯誤，請重試`);
  }

  const label = parsed.label || originalFilename.replace(/\.pdf$/i, '');
  const typeKey = toTypeKey(label);

  return {
    typeKey,
    label,
    aliases: parsed.aliases || [],
    dimensions: parsed.dimensions || null,
    fileSizeKB: parsed.fileSizeKB || null,
    rules: parsed.rules || [],
    rawText: text,
    pdfFilename: originalFilename,
    pdfPages: pages,
  };
}

module.exports = { parsePdf };
