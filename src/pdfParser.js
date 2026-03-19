const pdfParse = require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toTypeKey(label) {
  return label.toLowerCase().replace(/\s+/g,'_').replace(/[^\w_]/g,'').replace(/_+/g,'_').replace(/^_|_$/,'').slice(0,50);
}

async function parsePdf(buffer, originalFilename) {
  let text, pages;
  try {
    const data = await pdfParse(buffer);
    text = data.text;
    pages = data.numpages;
  } catch(e) {
    throw new Error(`PDF 無法解析：${e.message}`);
  }

  if (!text || text.trim().length < 30)
    throw new Error('PDF 內容為空或為掃描圖片');

  const prompt = `你是 Banner 規格文件解析專家。以下是 PDF 純文字，請提取欄位以 JSON 回傳（不得有前言）：
{
  "label": "Banner 完整名稱（繁體中文）",
  "aliases": ["搜尋關鍵字1","搜尋關鍵字2"],
  "dimensions": { "width": 1200, "height": 628 },
  "fileSizeKB": 500,
  "rules": [{"id":"rule_id","description":"規則說明","checkType":"vision","severity":"error"}]
}
若無尺寸填 null，無大小限制填 null。
檔名：${originalFilename}
內容：---\n${text.slice(0,5000)}\n---`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = res.content[0].text.trim().replace(/^```json\n?/,'').replace(/\n?```$/,'');
  let parsed;
  try { parsed = JSON.parse(raw); } catch(e) { throw new Error('Claude 回傳格式錯誤'); }

  const label = parsed.label || originalFilename.replace(/\.pdf$/i,'');
  return {
    typeKey: toTypeKey(label), label,
    aliases: parsed.aliases || [],
    dimensions: parsed.dimensions || null,
    fileSizeKB: parsed.fileSizeKB || null,
    rules: parsed.rules || [],
    rawText: text, pdfFilename: originalFilename, pdfPages: pages,
  };
}

module.exports = { parsePdf };
