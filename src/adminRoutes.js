// adminRoutes.js — 後台管理 API

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parsePdf } = require('./pdfParser');
const { extractPsdLayers } = require('./psdAnalyzer');
const db = require('./db');

const router = express.Router();

const PDF_DIR = process.env.RAILWAY_ENVIRONMENT
  ? '/app/uploads/pdfs'
  : path.join(__dirname, '../uploads/pdfs');

const PSD_DIR = process.env.RAILWAY_ENVIRONMENT
  ? '/app/uploads/psds'
  : path.join(__dirname, '../uploads/psds');

fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(PSD_DIR, { recursive: true });

function auth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!key || key !== process.env.ADMIN_KEY)
    return res.status(401).json({ error: '未授權' });
  next();
}

// ── PDF 上傳 ──────────────────────────────────────────
const uploadPdf = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, PDF_DIR),
    filename: (_, file, cb) => cb(null, `${uuidv4()}.pdf`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('只接受 PDF')),
});

// ── PSD 上傳 ──────────────────────────────────────────
const uploadPsd = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, PSD_DIR),
    filename: (_, file, cb) => cb(null, `${uuidv4()}.psd`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // PSD 最大 100MB
  fileFilter: (_, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.psd') ||
                file.mimetype === 'application/octet-stream' ||
                file.mimetype === 'image/vnd.adobe.photoshop';
    ok ? cb(null, true) : cb(new Error('只接受 PSD 檔案'));
  },
});

// ── POST /admin/upload（PDF） ─────────────────────────
router.post('/upload', auth, uploadPdf.single('pdf'), async (req, res) => {
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

// ── POST /admin/guidelines/:key/psd-templates（上傳 PSD 模板） ──
router.post('/guidelines/:key/psd-templates', auth, uploadPsd.single('psd'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到 PSD 檔案' });

  const templateName = req.body.name?.trim();
  if (!templateName) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: '請填寫版型名稱（例如：A 版 淺色背景）' });
  }

  try {
    // 解析 PSD 圖層
    const buffer = fs.readFileSync(req.file.path);
    let layers = null;
    try {
      const psdData = await extractPsdLayers(buffer);
      layers = {
        width: psdData.width,
        height: psdData.height,
        textLayers: psdData.textLayers.map(l => ({
          name: l.name,
          text: l.text,
          fontSize: l.fontSize,
          fontName: l.fontName,
          charCount: l.charCount,
          width: l.width,
          height: l.height,
          top: l.top,
          left: l.left,
        })),
        totalLayers: psdData.layers.length,
      };
    } catch (psdErr) {
      console.warn('PSD parse warning:', psdErr.message);
      // 解析失敗不影響上傳，只是沒有圖層資訊
    }

    const template = {
      id: uuidv4(),
      name: templateName,
      psdPath: req.file.path,
      psdFilename: req.file.originalname,
      psdSizeKB: Math.round(req.file.size / 1024),
      layers,
    };

    const templates = await db.addPsdTemplate(req.params.key, template);

    res.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        psdFilename: template.psdFilename,
        psdSizeKB: template.psdSizeKB,
        hasLayers: !!layers,
        textLayerCount: layers?.textLayers?.length || 0,
      },
      totalTemplates: templates.length,
    });
  } catch (e) {
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /admin/guidelines/:key/psd-templates/:tid ──
router.delete('/guidelines/:key/psd-templates/:tid', auth, async (req, res) => {
  try {
    const template = await db.getPsdTemplate(req.params.key, req.params.tid);
    if (template?.psdPath) fs.unlink(template.psdPath, () => {});
    await db.removePsdTemplate(req.params.key, req.params.tid);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /admin/guidelines/:key/psd-templates/:tid/download ──
router.get('/guidelines/:key/psd-templates/:tid/download', auth, async (req, res) => {
  const template = await db.getPsdTemplate(req.params.key, req.params.tid);
  if (!template?.psdPath) return res.status(404).json({ error: '找不到 PSD' });
  res.download(template.psdPath, template.psdFilename);
});

// ── GET /admin/guidelines ─────────────────────────────
router.get('/guidelines', auth, async (req, res) => {
  const list = await (req.query.search ? db.search(req.query.search) : db.all());
  res.json({
    total: list.length,
    items: list.map(g => ({
      typeKey: g.typeKey,
      label: g.label,
      aliases: g.aliases,
      dimensions: g.dimensions,
      fileSizeKB: g.fileSizeKB,
      rulesCount: g.rules?.length || 0,
      hasPdf: !!g.pdfPath,
      pdfFilename: g.pdfFilename,
      psdTemplates: (g.psdTemplates || []).map(t => ({
        id: t.id,
        name: t.name,
        psdFilename: t.psdFilename,
        psdSizeKB: t.psdSizeKB,
        hasLayers: !!t.layers,
        textLayerCount: t.layers?.textLayers?.length || 0,
        createdAt: t.createdAt,
      })),
      updatedAt: g.updatedAt,
    })),
  });
});

// ── DELETE /admin/guidelines/:key ────────────────────
router.delete('/guidelines/:key', auth, async (req, res) => {
  const g = await db.findByKey(req.params.key);
  if (!g) return res.status(404).json({ error: '找不到' });
  if (g.pdfPath) fs.unlink(g.pdfPath, () => {});
  (g.psdTemplates || []).forEach(t => { if (t.psdPath) fs.unlink(t.psdPath, () => {}); });
  await db.remove(req.params.key);
  res.json({ success: true });
});

// ── GET /admin/pdf/:key ───────────────────────────────
router.get('/pdf/:key', auth, async (req, res) => {
  const g = await db.findByKey(req.params.key);
  if (!g?.pdfPath) return res.status(404).json({ error: '找不到 PDF' });
  res.download(g.pdfPath, g.pdfFilename || `${g.label}.pdf`);
});

// ── GET /admin/analytics ─────────────────────────────
router.get('/analytics', auth, async (req, res) => {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.userId) filter.userId = req.query.userId;
  if (req.query.from) filter.from = req.query.from;
  if (req.query.to) filter.to = req.query.to;
  if (req.query.limit) filter.limit = parseInt(req.query.limit, 10);
  const records = await db.getAnalytics(filter);
  res.json({ total: records.length, records });
});

// ── GET /admin/analytics/stats ──────────────────────
router.get('/analytics/stats', auth, async (req, res) => {
  const stats = await db.getStats();
  res.json(stats);
});

module.exports = router;
