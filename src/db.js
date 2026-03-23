// db.js — NeDB flat-file 資料庫
// Guideline 文件結構新增 psdTemplates 欄位：
// psdTemplates: [
//   { id, name, psdPath, psdFilename, layers, createdAt }
// ]

const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.RAILWAY_ENVIRONMENT
  ? '/app/data'
  : path.join(__dirname, '../data');

fs.mkdirSync(DATA_DIR, { recursive: true });

const guidelines = Datastore.create({
  filename: path.join(DATA_DIR, 'guidelines.db'),
  autoload: true,
});
guidelines.ensureIndex({ fieldName: 'typeKey', unique: true });
guidelines.ensureIndex({ fieldName: 'label' });

const analytics = Datastore.create({
  filename: path.join(DATA_DIR, 'analytics.db'),
  autoload: true,
});
analytics.ensureIndex({ fieldName: 'type' });
analytics.ensureIndex({ fieldName: 'timestamp' });

async function create(data) {
  return guidelines.insert({ ...data, psdTemplates: [], createdAt: new Date(), updatedAt: new Date() });
}

async function upsert(typeKey, data) {
  const existing = await findByKey(typeKey);
  if (existing) {
    await guidelines.update({ typeKey }, { $set: { ...data, updatedAt: new Date() } });
    return { ...existing, ...data, action: 'updated' };
  }
  const doc = await create({ typeKey, ...data });
  return { ...doc, action: 'created' };
}

async function findByKey(typeKey) {
  return guidelines.findOne({ typeKey });
}

async function search(keyword) {
  if (!keyword || keyword.trim() === '') return guidelines.find({}).sort({ label: 1 });
  const re = new RegExp(keyword.trim(), 'i');
  return guidelines.find({
    $or: [{ label: re }, { aliases: { $elemMatch: re } }, { typeKey: re }],
  }).sort({ label: 1 });
}

async function all() {
  return guidelines.find({}).sort({ label: 1 });
}

async function remove(typeKey) {
  return guidelines.remove({ typeKey }, {});
}

// ── PSD Template 操作 ─────────────────────────────────

async function addPsdTemplate(typeKey, template) {
  const g = await findByKey(typeKey);
  if (!g) throw new Error('找不到此 Guideline');
  const templates = g.psdTemplates || [];
  templates.push({ ...template, createdAt: new Date() });
  await guidelines.update({ typeKey }, { $set: { psdTemplates: templates, updatedAt: new Date() } });
  return templates;
}

async function removePsdTemplate(typeKey, templateId) {
  const g = await findByKey(typeKey);
  if (!g) throw new Error('找不到此 Guideline');
  const templates = (g.psdTemplates || []).filter(t => t.id !== templateId);
  await guidelines.update({ typeKey }, { $set: { psdTemplates: templates, updatedAt: new Date() } });
  return templates;
}

async function getPsdTemplate(typeKey, templateId) {
  const g = await findByKey(typeKey);
  if (!g) return null;
  return (g.psdTemplates || []).find(t => t.id === templateId) || null;
}

// ── Analytics 操作 ───────────────────────────────────

async function logEvent(data) {
  return analytics.insert({ ...data, timestamp: new Date() });
}

async function getAnalytics(filter = {}) {
  const query = {};
  if (filter.type) query.type = filter.type;
  if (filter.userId) query.userId = filter.userId;
  if (filter.from || filter.to) {
    query.timestamp = {};
    if (filter.from) query.timestamp.$gte = new Date(filter.from);
    if (filter.to) query.timestamp.$lte = new Date(filter.to);
  }
  return analytics.find(query).sort({ timestamp: -1 }).limit(filter.limit || 200);
}

async function getStats() {
  const all = await analytics.find({ type: 'review' });
  const interactions = await analytics.find({ type: 'interaction' });
  const errors = await analytics.find({ type: 'error' });

  const passCount = all.filter(r => r.result === 'pass').length;
  const failCount = all.filter(r => r.result === 'fail').length;
  const totalReviews = all.length;
  const avgDuration = totalReviews > 0
    ? Math.round(all.reduce((sum, r) => sum + (r.durationMs || 0), 0) / totalReviews)
    : 0;

  // 常見違規 top 10
  const ruleCounts = {};
  all.forEach(r => (r.violations || []).forEach(v => {
    ruleCounts[v.rule_id] = (ruleCounts[v.rule_id] || 0) + 1;
  }));
  const topViolations = Object.entries(ruleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule_id, count]) => ({ rule_id, count }));

  // 檔案類型分布
  const byFileType = { image: 0, psd: 0 };
  all.forEach(r => { if (r.fileType) byFileType[r.fileType] = (byFileType[r.fileType] || 0) + 1; });

  // 互動類型分布
  const byAction = {};
  interactions.forEach(r => { byAction[r.action] = (byAction[r.action] || 0) + 1; });

  // 對比度問題數
  const contrastIssues = all.filter(r => r.hasContrastIssue).length;

  return {
    totalReviews,
    passCount,
    failCount,
    passRate: totalReviews > 0 ? Math.round(passCount / totalReviews * 100) : 0,
    avgDurationMs: avgDuration,
    topViolations,
    byFileType,
    byAction,
    contrastIssues,
    totalInteractions: interactions.length,
    totalErrors: errors.length,
  };
}

module.exports = {
  create, upsert, findByKey, search, all, remove,
  addPsdTemplate, removePsdTemplate, getPsdTemplate,
  logEvent, getAnalytics, getStats,
};
