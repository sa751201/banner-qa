const store = new Map();

const STATE = {
  IDLE: 'idle',
  WAITING_BANNER_NAME: 'waiting_banner_name',
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
  store.set(userId, { state: STATE.IDLE, image: null, fileType: null, guidelineKey: null });
}

module.exports = { get, set, reset, STATE };
