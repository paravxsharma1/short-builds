const request = require('supertest');
const { createApp } = require('../src/app');
const { shortenUrl } = require('../src/shorten');

const LONG = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SHORT = 'https://youtu.be/dQw4w9WgXcQ';

let app;
let networkSpy;

beforeEach(() => {
  networkSpy = jest.spyOn(globalThis, 'fetch')
    .mockImplementation(() => {
      throw new Error('Conversion must not call an external service');
    });

  app = createApp();
});

afterEach(() => {
  expect(networkSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

function post(url) {
  return request(app).post('/api/shorten').send({ url });
}

describe('YouTube conversions', () => {
  test.each([
    LONG,
    `${SHORT}?si=oI-Jl-cLf1H8Vz4j`,
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    `  ${LONG}  `,
  ])('converts %s', async (url) => {
    const res = await post(url);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      originalUrl: url.trim(),
      shortUrl: SHORT,
      provider: 'YouTube',
      method: 'rewrite',
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('keeps clean short links unchanged across app instances', async () => {
    expect((await post(SHORT)).body.method).toBe('already_short');

    const restarted = createApp();
    const res = await request(restarted)
      .post('/api/shorten')
      .send({ url: SHORT });

    expect(res.body.shortUrl).toBe(SHORT);
    expect(res.body).not.toHaveProperty('code');
    expect(res.body).not.toHaveProperty('expiresAt');
  });

  test('preserves useful context while removing tracking', async () => {
    const res = await post(
      `${LONG}&t=1m30s&list=PL123&index=2&context=keep` +
      '&si=abc&utm_source=x&feature=share&fbclid=x&gclid=x#t=90'
    );

    const output = new URL(res.body.shortUrl);

    expect(output.origin + output.pathname).toBe(SHORT);
    expect(Object.fromEntries(output.searchParams)).toEqual({
      t: '1m30s',
      list: 'PL123',
      index: '2',
      context: 'keep',
    });
    expect(output.hash).toBe('#t=90');
  });

  test('converts embed start time to a share timestamp', async () => {
    const res = await post(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?start=90'
    );

    expect(res.body.shortUrl).toBe(`${SHORT}?t=90`);
  });

  test.each([
    'https://youtube.com/watch?v=short',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&v=AAAAAAAAAAA',
    'https://youtube.com/playlist?list=PL123',
    'https://youtube.com/@channel',
    'https://youtu.be/dQw4w9WgXcQ.',
    'https://youtu.be/dQw4w9WgXcQ/extra',
  ])('rejects unsupported video URL %s', async (url) => {
    expect((await post(url)).status).toBe(422);
  });
});

describe('Input validation', () => {
  test.each([
    undefined,
    null,
    42,
    {},
    [],
    '',
    'hello',
    '/relative',
    'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'https://name:password@youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com:8443/watch?v=dQw4w9WgXcQ',
    'https://example.com/' + 'x'.repeat(2048),
  ])('rejects invalid input %p', async (url) => {
    const res = await post(url);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_url');
  });

  test.each([
    'https://example.com',
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://en.wikipedia.org/wiki/Example',
    'https://w.wiki/AbC',
    'https://x.com/user/status/123',
    'https://twitter.com/user/status/123',
    'https://t.co/AbC',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
  ])('rejects unsupported host %s', async (url) => {
    const res = await post(url);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('unsupported_domain');
  });
});

describe('App endpoints', () => {
  test('health works without a database', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('serves the updated page without expiry wording', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('This app does not save your links.');
    expect(res.text).not.toMatch(/expiresAt|30 days/);
  });

  test('does not host local redirect codes', async () => {
    const res = await request(app).get('/abc1234');

    expect(res.status).toBe(404);
    expect(res.headers.location).toBeUndefined();
  });

  test('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/api/shorten')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON request.');
  });

  test('rejects oversized bodies', async () => {
    expect((await post('x'.repeat(5000))).status).toBe(413);
  });
});

test('conversion also works independently of Express', () => {
  expect(shortenUrl(LONG).shortUrl).toBe(SHORT);
});