// messages.js — 所有 LINE 訊息模板（支援圖片 + PSD 雙模式）

function welcome() {
  return {
    type: 'flex',
    altText: '歡迎使用 Banner Design QA 系統',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#2C3E50', paddingAll: '20px',
        contents: [
          { type: 'text', text: '📐 Banner Design QA', color: '#FFFFFF', size: 'lg', weight: 'bold' },
          { type: 'text', text: '自動審查 Banner 規格合規性', color: '#BDC3C7', size: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: '使用方式', weight: 'bold' },
          { type: 'separator' },
          { type: 'text', text: '1. 傳送 Banner 圖片（PNG/JPG）', size: 'sm', wrap: true },
          { type: 'text', text: '2. 傳送 PSD 設計稿（更精確）', size: 'sm', wrap: true, color: '#2980B9' },
          { type: 'text', text: '3. 輸入 Banner 名稱', size: 'sm', wrap: true },
          { type: 'text', text: '4. 等候審查結果', size: 'sm', wrap: true },
          { type: 'separator' },
          { type: 'text', text: '查詢規格 PDF', weight: 'bold', size: 'sm' },
          { type: 'text', text: '輸入 Banner 名稱即可搜尋', size: 'sm', color: '#666666' },
        ],
      },
    },
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
  return {
    type: 'text',
    text: '✅ 已收到圖片！\n\n請輸入這張圖片的 Banner 名稱（例：「首頁蓋版」），系統將依對應規格進行審查。\n\n💡 提示：上傳 PSD 設計稿可獲得更精確的字體大小與位置審查。',
  };
}

function askBannerNamePsd() {
  return {
    type: 'text',
    text: '✅ 已收到 PSD 檔案！\n\n請輸入這個設計稿的 Banner 名稱（例：「首頁蓋版」），系統將讀取圖層數值進行精確審查。',
  };
}

function analyzing(guideline, isPsd = false) {
  const mode = isPsd ? '🔬 PSD 精確審查（讀取圖層數值）' : '🔍 圖片視覺審查';
  return {
    type: 'text',
    text: `${mode}\n\n正在審查「${guideline.label}」...\n共 ${guideline.rules?.length || 0} 項規則，請稍候約 15 秒。`,
  };
}

function pass(guideline, fileType = 'image') {
  const modeNote = fileType === 'psd'
    ? '（PSD 精確審查）'
    : '（圖片視覺審查）';

  return {
    type: 'flex',
    altText: `✅ ${guideline.label} 審查通過`,
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
                  { type: 'text', text: modeNote, size: 'xs', color: '#999999' },
                ],
              },
            ],
          },
          { type: 'separator' },
          { type: 'text', text: '此 Banner 符合所有規格要求，可以使用 🎉', size: 'sm', color: '#666666', wrap: true },
          ...(fileType === 'image' ? [{
            type: 'text',
            text: '💡 上傳 PSD 設計稿可進行更精確的字體大小與圖層位置審查',
            size: 'xs', color: '#2980B9', wrap: true, margin: 'sm',
          }] : []),
        ],
      },
    },
  };
}

function fail(guideline, violations, annotatedImageUrl, fileType = 'image', psdData = null) {
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

  // PSD 圖層摘要（如果有）
  if (psdData?.textLayers?.length) {
    bodyContents.push({ type: 'text', text: '📋 偵測到的文字圖層', size: 'xs', color: '#666666', weight: 'bold', margin: 'sm' });
    psdData.textLayers.slice(0, 4).forEach(l => {
      let info = `・${l.name}：「${l.text.slice(0, 10)}」${l.fontSize ? l.fontSize + 'px' : ''}`;
      if (l.contrastRatio != null) {
        const icon = l.contrastPasses ? '✓' : '✗';
        info += ` 對比 ${l.contrastRatio}:1 ${icon}`;
      }
      bodyContents.push({
        type: 'text',
        text: info,
        size: 'xs',
        color: l.contrastPasses === false ? '#E67E22' : '#888888',
        wrap: true,
      });
    });
  }

  bodyContents.push({ type: 'text', text: '請修正後重新上傳', size: 'xs', color: '#888888', margin: 'sm' });

  // 提示上傳 PSD（圖片模式才顯示）
  if (fileType === 'image') {
    bodyContents.push({
      type: 'text',
      text: '💡 上傳 PSD 設計稿可獲得更精確的字體大小審查',
      size: 'xs', color: '#2980B9', wrap: true, margin: 'sm',
    });
  }

  const bubble = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#C0392B', paddingAll: '16px',
      contents: [
        { type: 'text', text: '❌ 審查未通過', color: '#FFFFFF', size: 'xl', weight: 'bold' },
        {
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: guideline.label, color: '#FADBD8', size: 'sm', wrap: true, flex: 1 },
            { type: 'text', text: fileType === 'psd' ? 'PSD' : '圖片', color: '#FADBD8', size: 'xs', flex: 0 },
          ],
        },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'xs', contents: bodyContents },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [{
        type: 'button', style: 'primary', color: '#C0392B',
        action: { type: 'message', label: '🔄 重新上傳', text: '重新上傳' },
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

module.exports = {
  welcome, guidelineFound, searchResults, notFound,
  askBannerName, askBannerNamePsd, analyzing,
  pass, fail, error,
};
