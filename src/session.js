// session.js — 管理每位廠商的對話狀態
// 正式環境請換成 Redis

const store = new Map();

const STATE = {
  IDLE: 'idle',
  WAITING_BANNER_NAME: 'waiting_banner_name', // 已收圖，等待廠商說出 Banner 名稱
  PROCESSING: 'processing',
};

function get(userId) {
  if (!store.has(userId)) reset(userId);
  return store.get(userId);
}

function set(userId, patch) {
  store.set(userId, { ...get(userId), ...patch });
}

function reset(userId) {
  store.set(userId, { state: STATE.IDLE, image: null, guidelineKey: null });
}

module.exports = { get, set, reset, STATE };
