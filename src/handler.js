// handler.js — LINE Webhook 核心邏輯（支援圖片 + PSD 雙模式審查）

const db = require('./db');
const session = require('./session');
const { STATE } = session;
const msg = require('./messages');
const { analyze } = require('./analyzer');
const { analyzePsd } = require('./psdAnalyzer');
const { annotate } = require('./annotator');
const os = require('os');
const path = require('path');
const fs = require('fs');

async function fetchContent(messageId, client) {
  const stream = await client.getMessageContent(messageId);
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function uploadAnnotated(buffer) {
  if (!buffer) return null;
  const filename = `annotated_${Date.now()}.jpg`;
  const filepath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(filepath, buffer);
  return `${process.env.BASE_URL}/annotated/${filename}`;
}

function createHandler(client) {

  async function handleEvent(event) {
    const userId = event.source.userId;
    if (event.type === 'follow')
      return client.replyMessage(event.replyToken, msg.welcome());
    if (event.type === 'message' && event.message.type === 'image')
      return onImage(event, userId, client);
    if (event.type === 'message' && event.message.type === 'file')
      return onFile(event, userId, client);
    if (event.type === 'message' && event.message.type === 'text')
      return onText(event, userId, client);
    if (event.type === 'postback')
      return onPostback(event, userId, client);
  }

  // ── 收到圖片 ──────────────────────────────────────────
  async function onImage(event, userId, client) {
    const s = session.get(userId);
    if (s.state === STATE.PROCESSING)
      return client.replyMessage(event.replyToken, { type: 'text', text: '⏳ 上一張圖片仍在審查中，請稍後。' });

    let buffer;
    try { buffer = await fetchContent(event.message.id, client); }
    catch (e) { return client.replyMessage(event.replyToken, msg.error('圖片下載失敗')); }

    session.set(userId, {
      state: STATE.WAITING_BANNER_NAME,
      image: buffer,
      fileType: 'image',
    });
    db.logEvent({ type: 'interaction', userId, action: 'upload_image' }).catch(() => {});
    return client.replyMessage(event.replyToken, msg.askBannerName());
  }

  // ── 收到檔案（PSD）────────────────────────────────────
  async function onFile(event, userId, client) {
    const fileName = event.message.fileName || '';
    const isPsd = fileName.toLowerCase().endsWith('.psd');

    if (!isPsd) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '目前僅支援 PSD 或圖片格式。\n\n請傳送 PNG/JPG 圖片，或 PSD 設計稿檔案。',
      });
    }

    const s = session.get(userId);
    if (s.state === STATE.PROCESSING)
      return client.replyMessage(event.replyToken, { type: 'text', text: '⏳ 上一個檔案仍在審查中，請稍後。' });

    let buffer;
    try { buffer = await fetchContent(event.message.id, client); }
    catch (e) { return client.replyMessage(event.replyToken, msg.error('PSD 下載失敗')); }

    session.set(userId, {
      state: STATE.WAITING_BANNER_NAME,
      image: buffer,
      fileType: 'psd',
      fileName,
    });
    db.logEvent({ type: 'interaction', userId, action: 'upload_psd' }).catch(() => {});
    return client.replyMessage(event.replyToken, msg.askBannerNamePsd());
  }

  // ── 文字訊息 ──────────────────────────────────────────
  async function onText(event, userId, client) {
    const text = event.message.text.trim();
    const s = session.get(userId);

    if (['取消', '重新上傳'].includes(text)) {
      session.reset(userId);
      db.logEvent({ type: 'interaction', userId, action: 'cancel' }).catch(() => {});
      return client.replyMessage(event.replyToken, { type: 'text', text: '🔄 已重置，請重新傳送圖片或 PSD。' });
    }

    if (s.state === STATE.WAITING_BANNER_NAME) {
      return onBannerNameProvided(event, userId, text, s, client);
    }

    return onGuidelineQuery(event, userId, text, client);
  }

  // ── 廠商提供 Banner 名稱 ──────────────────────────────
  async function onBannerNameProvided(event, userId, keyword, sess, client) {
    const results = await db.search(keyword);

    if (results.length === 0) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `找不到「${keyword}」的規格，請確認名稱後重試，或輸入「取消」重新開始。`,
      });
    }

    if (results.length > 1) {
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
        text: `找到 ${results.length} 個相符規格，請選擇：`,
        quickReply: { items },
      });
    }

    await startAnalysis(event.replyToken, userId, sess, results[0], client);
  }

  // ── 查詢規格 ──────────────────────────────────────────
  async function onGuidelineQuery(event, userId, keyword, client) {
    const results = await db.search(keyword);
    db.logEvent({ type: 'interaction', userId, action: 'search_guideline', keyword, resultCount: results.length }).catch(() => {});
    if (results.length === 0) return client.replyMessage(event.replyToken, msg.notFound(keyword));
    if (results.length === 1) return client.replyMessage(event.replyToken, msg.guidelineFound(results[0]));
    return client.replyMessage(event.replyToken, msg.searchResults(results));
  }

  // ── Postback ──────────────────────────────────────────
  async function onPostback(event, userId, client) {
    const params = new URLSearchParams(event.postback.data);
    const action = params.get('action');
    const key = params.get('key');
    const s = session.get(userId);

    if (action === 'show_guideline') {
      const g = await db.findByKey(key);
      if (!g) return client.replyMessage(event.replyToken, msg.error('找不到此規格'));
      db.logEvent({ type: 'interaction', userId, action: 'select_guideline', guidelineKey: key }).catch(() => {});
      return client.replyMessage(event.replyToken, msg.guidelineFound(g));
    }

    if (action === 'send_pdf') {
      const g = await db.findByKey(key);
      if (!g?.pdfPath) return client.replyMessage(event.replyToken, msg.error('此規格尚未上傳 PDF'));
      db.logEvent({ type: 'interaction', userId, action: 'download_pdf', guidelineKey: key }).catch(() => {});
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `📥 ${g.label} 規格 PDF\n\n點擊下載：\n${process.env.BASE_URL}/api/pdf/${g.typeKey}`,
      });
    }

    if (action === 'start_qa') {
      if (!s.image) return client.replyMessage(event.replyToken, { type: 'text', text: '請先傳送圖片或 PSD 檔案。' });
      const g = await db.findByKey(key);
      if (!g) return client.replyMessage(event.replyToken, msg.error('找不到此規格'));
      await startAnalysis(event.replyToken, userId, s, g, client);
    }
  }

  // ── 開始分析 ──────────────────────────────────────────
  async function startAnalysis(replyToken, userId, sess, guideline, client) {
    session.set(userId, { state: STATE.PROCESSING, guidelineKey: guideline.typeKey });
    const isPsd = sess.fileType === 'psd';
    await client.replyMessage(replyToken, msg.analyzing(guideline, isPsd));
    runAnalysis(userId, sess.image, sess.fileType, guideline, client).catch(console.error);
  }

  async function runAnalysis(userId, buffer, fileType, guideline, client) {
    const startTime = Date.now();
    try {
      let violations = [];
      let psdData = null;

      if (fileType === 'psd') {
        const result = await analyzePsd(buffer, guideline);
        violations = result.violations;
        psdData = result.psdData;
      } else {
        violations = await analyze(buffer, guideline);
      }

      const durationMs = Date.now() - startTime;
      db.logEvent({
        type: 'review', userId, fileType,
        guidelineKey: guideline.typeKey,
        guidelineLabel: guideline.label,
        result: violations.length === 0 ? 'pass' : 'fail',
        violationCount: violations.length,
        violations: violations.map(v => ({ rule_id: v.rule_id, severity: v.severity })),
        hasContrastIssue: violations.some(v => v.rule_id === 'contrast'),
        durationMs,
      }).catch(() => {});

      let messages;
      if (violations.length === 0) {
        messages = [msg.pass(guideline, fileType)];
      } else {
        let annotatedUrl = null;
        if (fileType === 'image') {
          const annotatedBuffer = await annotate(buffer, violations);
          annotatedUrl = await uploadAnnotated(annotatedBuffer);
        }
        messages = [msg.fail(guideline, violations, annotatedUrl, fileType, psdData)];
      }

      await client.pushMessage(userId, messages);
    } catch (e) {
      console.error('Analysis error:', e);
      db.logEvent({
        type: 'error', userId, action: 'analysis',
        errorMessage: e.message,
        fileType,
        guidelineKey: guideline.typeKey,
        durationMs: Date.now() - startTime,
      }).catch(() => {});
      await client.pushMessage(userId, [msg.error('分析過程發生錯誤')]);
    } finally {
      session.reset(userId);
    }
  }

  return { handleEvent };
}

module.exports = { createHandler };
