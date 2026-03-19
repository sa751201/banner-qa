// messages.js — 所有 LINE 訊息模板

function welcome() {
  return {
    type: 'text',
    text: '👋 歡迎使用 Banner Design QA 系統\n\n您可以：\n📄 輸入 Banner 名稱 → 取得規格 PDF\n🖼 上傳 Banner 圖片 → 自動審查是否合規\n\n範例：輸入「首頁蓋版」或「PopUp Banner」',
  };
}

function guidelineFound(guideline) {
  const dimText = guideline.dimensions ? `${guideline.dimensions.width} × ${guideline.dimensions.height} px` : '未指定';
  const sizeText = guideline.fileSizeKB ? `最大 ${guideline.fileSizeKB} KB` : '未指定';
  return {
    type: 'flex',
    altText: `找到規格：${guideline.label}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#2C3E50', paddingAll: '16px',
        contents: [
          { type: 'text', text: guideline.label, color: '#FFFFFF', size: 'lg', weight: 'bold', wrap: true },
          { type: 'text', text: `${guideline.rules?.length || 0} 項設計規則`, color: '#BDC3C7', size: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '📐 尺寸', size: 'sm', color: '#666666', flex: 1 },
            { type: 'text', text: dimText, size: 'sm', weight: 'bold', flex: 2 },
          ]},
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '📦 大小', size: 'sm', color: '#666666', flex: 1 },
            { type: 'text', text: sizeText, size: 'sm', weight: 'bold', flex: 2 },
          ]},
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [{
          type: 'button', style: 'primary', color: '#2C3E50',
          action: { type: 'postback', label: '📥 下載規格 PDF', data: `action=send_pdf&key=${guideline.typeKey}`, displayText: '下載規格 PDF' },
        }],
      },
    },
  };
}

function searchResults(list) {
  const items = list.slice(0, 13).map(g => ({
    type: 'action',
    action: {
      type: 'postback',
      label: g.label.slice(0, 20),
      data: `action=show_guideline&key=${g.typeKey}`,
      displayText: `查詢：${g.label}`,
    },
  }));
  return { type: 'text', text: `找到 ${list.length} 個相符規格，請選擇：`, quickReply: { items } };
}

function notFound(keyword) {
  return { type: 'text', text: `🔍 找不到「${keyword}」相關的規格。\n\n請嘗試其他關鍵字，或聯絡管理員。` };
}

function askBannerName() {
  return { type: 'text', text: '✅ 已收到圖片！\n\n請輸入這張圖片的 Banner 名稱（例：「首頁蓋版」），系統將依對應規格進行審查。' };
}

function analyzing(guideline) {
  return { type: 'text', text: `🔍 正在審查「${guideline.label}」...\n共 ${guideline.rules?.length || 0} 項規則，請稍候約 15 秒。` };
}

function pass(guideline) {
  return {
    type: 'flex',
    altText: '✅ ' + guideline.label + ' 審查通過',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
        contents: [
          {
            type: 'box', layout: 'horizontal', spacing: 'md',
            contents: [
              { type: 'text', text: '✅', size: 'xxl', flex: 0 },
              {
                type: 'box', layout: 'vertical', flex: 1,
                contents: [
                  { type: 'text', text: '審查通過', size: 'xl', weight: 'bold', color: '#27AE60' },
                  { type: 'text', text: guideline.label, size: 'sm', color: '#666666', wrap: true },
                ],
              },
            ],
          },
          { type: 'separator' },
          { type: 'text', text: '此 Banner 符合所有規格要求，可以使用 🎉', size: 'sm', color: '#666666', wrap: true },
        ],
      },
    },
  };
}

function fail(guideline, violations, annotatedImageUrl) {
  const errors = violations.filter(v => v.severity !== 'warning');
  const warnings = violations.filter(v => v.severity === 'warning');

  const makeRow = (v, i) => ({
    type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm',
    contents: [
      { type: 'text', text: `${i + 1}.`, size: 'sm', color: '#E74C3C', flex: 0 },
      { type: 'text', text: v.description, size: 'sm', wrap: true, flex: 1, color: '#333333' },
    ],
  });

  const bodyContents = [
    { type: 'text', text: `發現 ${violations.length} 項問題`, weight: 'bold', color: '#C0392B' },
    { type: 'separator', margin: 'sm' },
  ];

  if (errors.length) {
    bodyContents.push({ type: 'text', text: '🔴 必須修正', size: 'sm', color: '#C0392B', weight: 'bold', margin: 'md' });
    errors.forEach((v, i) => bodyContents.push(makeRow(v, i)));
  }
  if (warnings.length) {
    bodyContents.push({ type: 'text', text: '🟡 建議改善', size: 'sm', color: '#E67E22', weight: 'bold', margin: 'md' });
    warnings.forEach((v, i) => bodyContents.push(makeRow(v, errors.length + i)));
  }
  bodyContents.push({ type: 'separator', margin: 'md' });
  bodyContents.push({ type: 'text', text: '請修正後重新上傳', size: 'xs', color: '#888888' });

  const bubble = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#C0392B', paddingAll: '16px',
      contents: [
        { type: 'text', text: '❌ 審查未通過', color: '#FFFFFF', size: 'xl', weight: 'bold' },
        { type: 'text', text: guideline.label, color: '#FADBD8', size: 'sm', wrap: true },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'xs', contents: bodyContents },
    footer: {
      type: 'box', layout: 'vertical',
      contents: [{
        type: 'button', style: 'primary', color: '#C0392B',
        action: { type: 'message', label: '🔄 重新上傳圖片', text: '重新上傳' },
      }],
    },
  };

  if (annotatedImageUrl) {
    bubble.hero = { type: 'image', url: annotatedImageUrl, size: 'full', aspectMode: 'cover', aspectRatio: '20:13' };
  }

  return {
    type: 'flex',
    altText: `❌ ${guideline.label} 未通過，${violations.length} 項問題`,
    contents: bubble,
  };
}

function error(reason) {
  return { type: 'text', text: `⚠️ 發生錯誤：${reason}\n請稍後再試。` };
}

module.exports = { welcome, guidelineFound, searchResults, notFound, askBannerName, analyzing, pass, fail, error };
