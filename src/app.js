const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Simple request log, picked up by CloudWatch in production
app.use((req, res, next) => {
  const start = Date.now();
  if (process.env.NODE_ENV === 'test') return next();
  res.on('finish', () => {
    console.log(JSON.stringify({
      time: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    }));
  });
  next();
});

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateCode(length = 7) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

function isValidUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

app.get('/health', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ok', database: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

app.post('/api/shorten', async (req, res) => {
  const { url } = req.body || {};
  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Please enter a valid URL starting with http:// or https://' });
  }

  try {
    // Retry on the (very unlikely) chance of a duplicate code
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await db.saveUrl(generateCode(), url);
        const base = `${req.protocol}://${req.get('host')}`;
        return res.status(201).json({
          code: row.code,
          shortUrl: `${base}/${row.code}`,
          originalUrl: row.original_url,
          expiresAt: row.expires_at,
        });
      } catch (err) {
        if (err.code !== '23505') throw err; // 23505 = unique violation
      }
    }
    return res.status(500).json({ error: 'Could not generate a unique code' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
});

app.get('/:code', async (req, res) => {
  const { code } = req.params;
  if (!/^[a-zA-Z0-9]{1,10}$/.test(code)) {
    return res.status(404).send('Link not found');
  }
  try {
    const row = await db.findUrl(code);
    if (!row) return res.status(404).send('Link not found or expired');
    return res.redirect(302, row.original_url);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Something went wrong');
  }
});

module.exports = { app, generateCode, isValidUrl };
