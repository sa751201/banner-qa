// db.js — NeDB flat-file 資料庫
// Railway 上 Volume 掛載到 /app/data，本地用 ./data/

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

async function create(data) {
  return guidelines.insert({ ...data, createdAt: new Date(), updatedAt: new Date() });
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

async function count() {
  return guidelines.count({});
}

module.exports = { create, upsert, findByKey, search, all, remove, count };
