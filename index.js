require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const line = require('@line/bot-sdk');
const { createHandler } = require('./src/handler');
const adminRoutes = require('./src/adminRoutes');
const db = require('./src/db');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(lineConfig);
const { handleEvent } = createHandler(client);
const app = express();

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  res.status(200).end();
  req.body.events.forEach(e => handleEvent(e).catch(console.error));
});

app.use('/admin', adminRoutes);

app.get('/api/pdf/:key', async (req, res) => {
  const g = await db.findByKey(req.params.key);
  if (!g?.pdfPath) return res.status(404).send('找不到此規格 PDF');
  res.download(g.pdfPath, `${g.label}.pdf`);
});

app.use('/annotated', express.static(os.tmpdir()));
app.use('/admin-ui', express.static(path.join(__dirname, 'public/admin')));
app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Banner QA Bot running on port ${PORT}`);
});
