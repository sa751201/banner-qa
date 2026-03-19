// adminRoutes.js — 後台管理 API

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parsePdf } = require('./pdfParser');
const db = require('./db');

const router = express.Router();

// Railway 上 PDF 存到 /app/uploads，本地用 ./uploads/pdfs/
const PDF_DIR = process.env.RAILWAY_ENVIRONMENT
  ? '/app/uploads/pdfs'
  : path.join(__dirname, '../uploads/pdfs');

fs.mkdirSync(PDF_DIR, { recursive: true });

function auth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: '未授權，請提供正確的 Admin Key' });
  }
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, PDF_DIR),
    filename: (_, file, cb) => cb(null, `${uuidv4()}.pdf`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('只接受 PDF')),
});

router.post('/upload', auth, upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到 PDF' });
  try {
    const buffer = fs.readFileSync(req.file.path);
    const parsed = await parsePdf(buffer, req.file.originalname || 'unknown.pdf');
    if (req.body.typeKey) parsed.typeKey = req.body.typeKey;
    const result = await db.upsert(parsed.typeKey, { ...parsed, pdfPath: req.file.path });
    res.json({ success: true, action: result.action, typeKey: result.typeKey, label: result.label, rulesCount: result.rules?.length || 0 });
  } catch (e) {
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: e.message });
  }
});

router.post('/upload-batch', auth, upload.array('pdfs', 40), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: '未收到 PDF' });
  const results = [];
  for (const file of req.files) {
    try {
      const buffer = fs.readFileSync(file.path);
      const parsed = await parsePdf(buffer, file.originalname || 'unknown.pdf');
      const result = await db.upsert(parsed.typeKey, { ...parsed, pdfPath: file.path });
      results.push({ file: file.originalname, ok: true, label: result.label, action: result.action });
    } catch (e) {
      fs.unlink(file.path, () => {});
      results.push({ file: file.originalname, ok: false, error: e.message });
    }
  }
  res.json({ results });
});

router.get('/guidelines', auth, async (req, res) => {
  const list = await (req.query.search ? db.search(req.query.search) : db.all());
  res.json({
    total: list.length,
    items: list.map(g => ({
      typeKey: g.typeKey, label: g.label, aliases: g.aliases,
      dimensions: g.dimensions, fileSizeKB: g.fileSizeKB,
      rulesCount: g.rules?.length || 0, hasPdf: !!g.pdfPath,
      pdfFilename: g.pdfFilename, updatedAt: g.updatedAt,
    })),
  });
});

router.delete('/guidelines/:key', auth, async (req, res) => {
  const g = await db.findByKey(req.params.key);
  if (!g) return res.status(404).json({ error: '找不到' });
  if (g.pdfPath) fs.unlink(g.pdfPath, () => {});
  await db.remove(req.params.key);
  res.json({ success: true });
});

router.get('/pdf/:key', auth, async (req, res) => {
  const g = await db.findByKey(req.params.key);
  if (!g?.pdfPath) return res.status(404).json({ error: '找不到 PDF' });
  res.download(g.pdfPath, g.pdfFilename || `${g.label}.pdf`);
});

module.exports = router;
