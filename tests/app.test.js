const request = require('supertest');
const { app, generateCode, isValidUrl } = require('../src/app');
const db = require('../src/db');

beforeAll(async () => {
  await db.init();
  await db.pool.query('DELETE FROM urls');
});

afterAll(async () => {
  await db.pool.end();
});

describe('URL validation', () => {
  test('accepts http and https URLs', () => {
    expect(isValidUrl('https://www.youtube.com/watch?v=rUHYbwZDVVI')).toBe(true);
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  test('rejects anything that is not a web URL', () => {
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl(undefined)).toBe(false);
    expect(isValidUrl('https://a.com/' + 'x'.repeat(3000))).toBe(false);
  });
});

describe('Code generation', () => {
  test('creates a 7 character alphanumeric code', () => {
    const code = generateCode();
    expect(code).toMatch(/^[a-zA-Z0-9]{7}$/);
  });

  test('codes are random', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateCode()));
    expect(codes.size).toBe(1000);
  });
});

describe('POST /api/shorten', () => {
  test('returns a short URL for a valid long URL', async () => {
    const res = await request(app)
      .post('/api/shorten')
      .send({ url: 'https://www.youtube.com/watch?v=rUHYbwZDVVI' });

    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[a-zA-Z0-9]{7}$/);
    expect(res.body.shortUrl).toContain(res.body.code);
    expect(res.body.originalUrl).toBe('https://www.youtube.com/watch?v=rUHYbwZDVVI');
  });

  test('sets the expiry 30 days ahead', async () => {
    const res = await request(app).post('/api/shorten').send({ url: 'https://example.com' });
    const days = (new Date(res.body.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  test('rejects an invalid URL with 400', async () => {
    const res = await request(app).post('/api/shorten').send({ url: 'hello world' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('rejects a missing URL with 400', async () => {
    const res = await request(app).post('/api/shorten').send({});
    expect(res.status).toBe(400);
  });

  test('responds quickly (well under the 10 second target)', async () => {
    const start = Date.now();
    await request(app).post('/api/shorten').send({ url: 'https://example.com/speed' });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('GET /:code', () => {
  test('redirects to the original URL', async () => {
    const created = await request(app).post('/api/shorten').send({ url: 'https://www.linkedin.com/in/someone' });
    const res = await request(app).get(`/${created.body.code}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://www.linkedin.com/in/someone');
  });

  test('returns 404 for a code that does not exist', async () => {
    const res = await request(app).get('/zzzzzzz');
    expect(res.status).toBe(404);
  });

  test('returns 404 for a badly formed code', async () => {
    const res = await request(app).get('/bad-code!');
    expect(res.status).toBe(404);
  });

  test('returns 404 once a link has expired', async () => {
    await db.pool.query(
      "INSERT INTO urls (code, original_url, expires_at) VALUES ('expired1', 'https://old.com', NOW() - INTERVAL '1 day')"
    );
    const res = await request(app).get('/expired1');
    expect(res.status).toBe(404);
  });
});

describe('Expiry cleanup job', () => {
  test('deletes links past 30 days and keeps current ones', async () => {
    await db.pool.query(
      "INSERT INTO urls (code, original_url, expires_at) VALUES ('expired2', 'https://old.com', NOW() - INTERVAL '1 day')"
    );
    const removed = await db.deleteExpired();
    expect(removed).toBeGreaterThanOrEqual(1);

    const left = await db.pool.query('SELECT COUNT(*) FROM urls WHERE expires_at <= NOW()');
    expect(Number(left.rows[0].count)).toBe(0);
  });
});

describe('GET /health', () => {
  test('reports app and database as healthy', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });
});
