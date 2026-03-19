// handler.js — LINE Webhook 核心邏輯
//
// 廠商對話流程：
//   查詢規格：輸入名稱 → OA 搜尋 → 顯示 Guideline 卡片 → 廠商點「下載 PDF」→ OA 發送 PDF
//   審查圖片：廠商傳圖 → OA 問名稱 → 廠商回答 → OA 分析 → 回傳結果（Pass 或 Fail+標注圖）

const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('./db');
const session = require('./session');
const msg = require('./messages');
const { analyze } = require('./analyzer');
const { annotate } = require('./annotator');

const { STATE } = session;

// ── 下載 LINE 圖片到 Buffer ──────────────────────────────
async function fetchImage(messageId, client) {
  const stream = await client.getMessageContent(messageId);
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// ── 上傳標注圖到暫存（回傳公開 URL） ───────────────────────
// 簡易版：寫到 /tmp，由 express.static 提供存取
// 正式環境：換成 GCS / S3 / Cloudflare R2
async function uploadAnnotated(buffer) {
  if (!buffer) return null;
  const filename = `annotated_${Date.now()}.jpg`;
  const filepath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(filepath, buffer);
  // 需要 express 掛載 /annotated → tmpdir
  return `${process.env.BASE_URL}/annotated/${filename}`;
}

function createHandler(client) {

  async function handleEvent(event) {
    const userId = event.source.userId;

    if (event.type === 'follow')
      return client.replyMessage(event.replyToken, msg.welcome());

    if (event.type === 'message' && event.message.type === 'image')
      return onImage(event, userId, client);

    if (event.type === 'message' && event.message.type === 'text')
      return onText(event, userId, client);

    if (event.type === 'postback')
      return onPostback(event, userId, client);
  }

  // ── 收到圖片 ──────────────────────────────────────────
  async function onImage(event, userId, client) {
    const s = session.get(userId);
    if (s.state === STATE.PROCESSING) {
      return client.replyMessage(event.replyToken, {
        type: 'text', text: '⏳ 上一張圖片仍在審查中，請稍後再上傳。',
      });
    }

    let imageBuffer;
    try {
      imageBuffer = await fetchImage(event.message.id, client);
    } catch (e) {
      return client.replyMessage(event.replyToken, msg.error('圖片下載失敗'));
    }

    session.set(userId, { state: STATE.WAITING_BANNER_NAME, image: imageBuffer });
    return client.replyMessage(event.replyToken, msg.askBannerName());
  }

  // ── 收到文字 ──────────────────────────────────────────
  async function onText(event, userId, client) {
    const text = event.message.text.trim();
    const s = session.get(userId);

    // 重置指令
    if (['取消', '重新上傳', '重新上傳'].includes(text)) {
      session.reset(userId);
      return client.replyMessage(event.replyToken, { type: 'text', text: '🔄 已重置，請重新傳送圖片或查詢規格。' });
    }

    // 有待審圖片 → 文字視為 Banner 名稱
    if (s.state === STATE.WAITING_BANNER_NAME) {
      return onBannerNameProvided(event, userId, text, s.image, client);
    }

    // 一般文字 → 查詢規格
    return onGuidelineQuery(event, userId, text, client);
  }

  // ── 廠商提供了 Banner 名稱（有圖片待審） ──────────────
  async function onBannerNameProvided(event, userId, keyword, imageBuffer, client) {
    const results = await db.search(keyword);

    if (results.length === 0) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `找不到「${keyword}」的規格，請確認名稱後重試，或輸入「取消」重新開始。`,
      });
    }

    if (results.length > 1) {
      // 多筆結果：讓廠商選一個
      const items = results.slice(0, 13).map(g => ({
        type: 'action',
        action: {
          type: 'postback',
          label: g.label.slice(0, 20),
          data: `action=start_qa&key=${g.typeKey}`,
          displayText: `審查：${g.label}`,
        },
      }));
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `找到 ${results.length} 個相符規格，請選擇要用哪個規格審查：`,
        quickReply: { items },
      });
    }

    // 只有一筆 → 直接審查
    const guideline = results[0];
    await startAnalysis(event.replyToken, userId, imageBuffer, guideline, client);
  }

  // ── 查詢規格（無圖片） ────────────────────────────────
  async function onGuidelineQuery(event, userId, keyword, client) {
    const results = await db.search(keyword);

    if (results.length === 0) return client.replyMessage(event.replyToken, msg.notFound(keyword));
    if (results.length === 1) return client.replyMessage(event.replyToken, msg.guidelineFound(results[0]));
    return client.replyMessage(event.replyToken, msg.searchResults(results));
  }

  // ── Postback ──────────────────────────────────────────
  async function onPostback(event, userId, client) {
    const params = new URLSearchParams(event.postback.data);
    const action = params.get('action');
    const key = params.get('key');

    // 廠商選了某個規格要查看
    if (action === 'show_guideline') {
      const g = await db.findByKey(key);
      if (!g) return client.replyMessage(event.replyToken, msg.error('找不到此規格'));
      return client.replyMessage(event.replyToken, msg.guidelineFound(g));
    }

    // 廠商點「下載規格 PDF」
    if (action === 'send_pdf') {
      const g = await db.findByKey(key);
      if (!g || !g.pdfPath) return client.replyMessage(event.replyToken, msg.error('此規格尚未上傳 PDF'));

      // LINE 發送 PDF 訊息（直接附上下載 URL）
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `📥 ${g.label} 規格 PDF\n\n點擊以下連結下載：\n${process.env.BASE_URL}/api/pdf/${g.typeKey}`,
      });
    }

    // 廠商選好規格，開始審查（從多筆結果選一）
    if (action === 'start_qa') {
      const s = session.get(userId);
      if (!s.image) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '請先傳送 Banner 圖片。' });
      }
      const g = await db.findByKey(key);
      if (!g) return client.replyMessage(event.replyToken, msg.error('找不到此規格'));
      await startAnalysis(event.replyToken, userId, s.image, g, client);
    }
  }

  // ── 開始 QA 分析流程 ──────────────────────────────────
  async function startAnalysis(replyToken, userId, imageBuffer, guideline, client) {
    session.set(userId, { state: STATE.PROCESSING, guidelineKey: guideline.typeKey });

    // 先回「分析中」
    await client.replyMessage(replyToken, msg.analyzing(guideline));

    // 非同步分析，完成後 push message
    runAnalysis(userId, imageBuffer, guideline, client).catch(console.error);
  }

  async function runAnalysis(userId, imageBuffer, guideline, client) {
    try {
      const violations = await analyze(imageBuffer, guideline);

      let messages;
      if (violations.length === 0) {
        messages = [msg.pass(guideline)];
      } else {
        // 生成標注圖
        const annotatedBuffer = await annotate(imageBuffer, violations);
        const annotatedUrl = await uploadAnnotated(annotatedBuffer);
        messages = [msg.fail(guideline, violations, annotatedUrl)];
      }

      await client.pushMessage(userId, messages);
    } catch (e) {
      console.error('Analysis error:', e);
      await client.pushMessage(userId, [msg.error('分析過程發生錯誤')]);
    } finally {
      session.reset(userId);
    }
  }

  return { handleEvent };
}

module.exports = { createHandler };
