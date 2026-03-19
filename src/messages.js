// messages.js — 所有 LINE 訊息模板

// ── 歡迎 ──────────────────────────────────────────────────
function welcome() {
  return {
    type: 'text',
    text: [
      '👋 歡迎使用 Banner Design QA 系統',
      '',
      '您可以：',
      '📄 輸入 Banner 名稱 → 取得規格 PDF',
      '🖼 上傳 Banner 圖片 → 自動審查是否合規',
      '',
      '範例指令：',
      '「電商主視覺 Banner」',
      '「查詢 Rich Menu」',
      '',
      '或直接傳送圖片開始審查。',
    ].join('\n'),
  };
}

// ── 找到 Guideline，問廠商要 PDF 還是上傳圖片 ────────────
function guidelineFound(guideline) {
  const dimText = guideline.dimensions
    ? `${guideline.dimensions.width} × ${guideline.dimensions.height} px`
    : '未指定';
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
            { type: 'text', text: '📐 尺寸', size: 'sm', color: '#666', flex: 1 },
            { type: 'text', text: dimText, size: 'sm', weight: 'bold', flex: 2 },
          ]},
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '📦 大小上限', size: 'sm', color: '#666', flex: 1 },
            { type: 'text', text: sizeText, size: 'sm', weight: 'bold', flex: 2 },
          ]},
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          {
            type: 'button', style: 'primary', color: '#2C3E50',
            action: { type: 'postback', label: '📥 下載規格 PDF', data: `action=send_pdf&key=${guideline.typeKey}`, displayText: '下載規格 PDF' },
          },
        ],
      },
    },
  };
}

// ── 搜尋結果（多筆） ──────────────────────────────────────
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
  return {
    type: 'text',
    text: `找到 ${list.length} 個相符規格，請選擇：`,
    quickReply: { items },
  };
}

// ── 查無結果 ──────────────────────────────────────────────
function notFound(keyword) {
  return {
    type: 'text',
    text: `🔍 找不到「${keyword}」相關的規格。\n\n請嘗試其他關鍵字，或聯絡管理員確認規格是否已建立。`,
  };
}

// ── 收到圖片，詢問 Banner 名稱 ────────────────────────────
function askBannerName() {
  return {
    type: 'text',
    text: '✅ 已收到圖片！\n\n請輸入這張圖片的 Banner 名稱（例：「電商主視覺 Banner」），系統將依對應規格進行審查。',
  };
}

// ── 分析中 ────────────────────────────────────────────────
function analyzing(guideline) {
  return {
    type: 'text',
    text: `🔍 正在審查「${guideline.label}」...\n共 ${guideline.rules?.length || 0} 項規則，請稍候約 15 秒。`,
  };
}

// ── 審查通過 ──────────────────────────────────────────────
function pass(guideline) {
  const ruleRows = (guideline.rules || []).slice(0, 8).map(r => ({
    type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
    contents: [
      { type: 'text', text: '✅', size: 'sm', flex: 0 },
      { type: 'text', text: r.description, size: 'sm', color: '#2C3E50', wrap: true, flex: 1 },
    ],
  }));

  const extra = guideline.rules?.length > 8
    ? [{ type: 'text', text: `…及其他 ${guideline.rules.length - 8} 項規則`, size: 'xs', color: '#999' }]
    : [];

  return {
    type: 'flex',
    altText: `✅ ${guideline.label} 審查通過`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#27AE60', paddingAll: '16px',
        contents: [
          { type: 'text', text: '✅ 審查通過', color: '#FFFFFF', size: 'xl', weight: 'bold' },
          { type: 'text', text: guideline.label, color: '#D5F5E3', size: 'sm', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'text', text: '所有規格均符合要求 🎉', weight: 'bold' },
          { type: 'separator' },
          ...ruleRows,
          ...extra,
        ],
      },
    },
  };
}

// ── 審查不通過 ────────────────────────────────────────────
function fail(guideline, violations, annotatedImageUrl) {
  const errors = violations.filter(v => v.severity !== 'warning');
  const warnings = violations.filter(v => v.severity === 'warning');

  const makeRow = (v, i) => ({
    type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm', alignItems: 'flex-start',
    contents: [
      {
        type: 'box', layout: 'vertical', flex: 0, width: '20px', height: '20px',
        cornerRadius: '10px',
        backgroundColor: v.severity === 'warning' ? '#E67E22' : '#E74C3C',
        justifyContent: 'center', alignItems: 'center',
        contents: [{ type: 'text', text: `${i + 1}`, size: 'xxs', color: '#FFFFFF', align: 'center' }],
      },
      { type: 'text', text: v.description, size: 'sm', wrap: true, flex: 1, color: '#2C3E50' },
    ],
  });

  const bodyContents = [
    { type: 'text', text: `發現 ${violations.length} 項問題`, weight: 'bold', color: '#C0392B' },
    { type: 'separator', margin: 'sm' },
  ];

  if (errors.length) {
    bodyContents.push({ type: 'text', text: '🔴 必須修正', size: 'xs', color: '#C0392B', weight: 'bold', margin: 'md' });
    errors.forEach((v, i) => bodyContents.push(makeRow(v, i)));
  }
  if (warnings.length) {
    bodyContents.push({ type: 'text', text: '🟡 建議改善', size: 'xs', color: '#D35400', weight: 'bold', margin: 'md' });
    warnings.forEach((v, i) => bodyContents.push(makeRow(v, errors.length + i)));
  }

  bodyContents.push({ type: 'separator', margin: 'md' });
  bodyContents.push({ type: 'text', text: '請依標注圖修正後重新上傳', size: 'xs', color: '#888' });

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

  // 如果有標注圖，插入 hero
  if (annotatedImageUrl) {
    bubble.hero = {
      type: 'image', url: annotatedImageUrl,
      size: 'full', aspectMode: 'cover', aspectRatio: '20:13',
    };
  }

  return {
    type: 'flex',
    altText: `❌ ${guideline.label} 未通過，${violations.length} 項問題`,
    contents: bubble,
  };
}

// ── 錯誤 ──────────────────────────────────────────────────
function error(reason) {
  return { type: 'text', text: `⚠️ 發生錯誤：${reason}\n請稍後再試。` };
}

module.exports = { welcome, guidelineFound, searchResults, notFound, askBannerName, analyzing, pass, fail, error };
