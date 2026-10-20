const express = require('express');
const path = require('path');
const { shortenUrl, ShortenError } = require('./shorten');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '4kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Log request metadata, never submitted URLs or response bodies.
  app.use((req, res, next) => {
    const start = Date.now();

    if (process.env.NODE_ENV !== 'test') {
      res.on('finish', () => {
        console.log(JSON.stringify({
          time: new Date().toISOString(),
          method: req.method,
          route: req.route ? req.route.path : 'unmatched',
          status: res.statusCode,
          ms: Date.now() - start,
        }));
      });
    }

    next();
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/shorten', (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      return res.json(shortenUrl(req.body && req.body.url));
    } catch (err) {
      if (err instanceof ShortenError) {
        return res.status(err.status).json({
          error: err.message,
          code: err.code,
        });
      }

      return res.status(500).json({
        error: 'Something went wrong. Please try again.',
      });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Page not found' });
  });

  app.use((err, req, res, next) => {
    const status = err.type === 'entity.too.large' ? 413 : 400;

    res.status(status).json({
      error: status === 413
        ? 'Request is too large.'
        : 'Invalid JSON request.',
    });
  });

  return app;
}

module.exports = { app: createApp(), createApp };