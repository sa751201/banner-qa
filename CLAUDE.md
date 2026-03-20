# Banner QA Bot

## 專案說明
LINE Official Account 機器人，用於審查廠商上傳的 Banner 是否符合規格。

## 技術架構
- Node.js + Express
- LINE Messaging API (@line/bot-sdk)
- Claude Vision API（圖片審查）
- NeDB（資料庫）
- 部署在 Railway

## 關鍵檔案
- src/handler.js — LINE Webhook 核心邏輯
- src/messages.js — LINE Flex Message 模板
- src/analyzer.js — Claude Vision 圖片審查
- src/psdAnalyzer.js — PSD 圖層解析
- src/adminRoutes.js — 後台管理 API
- src/db.js — 資料庫操作
- src/session.js — 對話狀態管理（exports: get/set/reset/STATE）

## 部署流程
git push → Railway 自動部署（約 2-3 分鐘）

## 環境變數（在 Railway Variables 設定）
LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET
ANTHROPIC_API_KEY, ADMIN_KEY, BASE_URL

## 常見問題
- session.js 匯出的是 get/set/reset，不是 getSession/setSession/clearSession
- LINE Flex Message 不支援 alignItems 屬性
