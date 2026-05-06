// ── Dummy App ───────────────────────────────────────────────────────────────
// A deliberately broken Express server for BugProof testing.
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/crash', (req, res) => {
  // Intentional crash
  const obj = null;
  res.json({ name: obj.name });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
