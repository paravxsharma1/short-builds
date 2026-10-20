const { shortenUrl } = require('../src/shorten');

beforeEach(() => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('Unexpected network request');
  });
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('Reddit', () => {
  test.each([
    'https://www.reddit.com/r/announcements/comments/eorhm/reddit_30_less_typing/',
    'https://old.reddit.com/r/announcements/comments/eorhm/reddit_30_less_typing/',
    'https://reddit.com/comments/eorhm',
    'https://www.reddit.com/gallery/eorhm',
  ])('converts %s', (url) => {
    expect(shortenUrl(url).shortUrl).toBe('https://redd.it/eorhm');
  });

  test('preserves sorting while removing tracking', () => {
    const result = shortenUrl(
      'https://reddit.com/comments/eorhm?utm_source=share&share_id=123&sort=top#section'
    );

    expect(result.shortUrl)
      .toBe('https://redd.it/eorhm?sort=top#section');
  });

  test.each([
    'https://reddit.com/r/test/comments/eorhm/title/abc123/',
    'https://reddit.com/comments/eorhm?comment=abc123',
    'https://reddit.com/comments/eorhm?comment_id=abc123',
    'https://reddit.com/r/test/s/opaqueToken',
    'https://reddit.com/r/test/',
    'https://redd.it/',
  ])('rejects unsupported URL %s', (url) => {
    expect(() => shortenUrl(url)).toThrow('Reddit:');
  });
});

describe('Flickr', () => {
  test('encodes a photo ID using Flickr Base58', () => {
    const result = shortenUrl(
      'https://www.flickr.com/photos/example/5169665786/'
    );

    expect(result.shortUrl).toBe('https://flic.kr/p/8SPTwJ');
  });

  test.each([
    ['1', '2'],
    ['57', 'Z'],
    ['58', '21'],
    ['59', '22'],
    ['9007199254740993', '2dknRmrjUH'],
  ])('encodes %s as %s without rounding', (id, code) => {
    const result = shortenUrl(
      `https://www.flickr.com/photos/example/${id}`
    );

    expect(result.shortUrl).toBe(`https://flic.kr/p/${code}`);
  });

  test('preserves access parameters and fragments', () => {
    const result = shortenUrl(
      'https://flickr.com/photos/example/5169665786?secret=keep&utm_source=share#comment'
    );

    expect(result.shortUrl)
      .toBe('https://flic.kr/p/8SPTwJ?secret=keep#comment');
  });

  test.each([
    'https://flickr.com/photos/example/',
    'https://flickr.com/photos/example/albums/123',
    'https://flickr.com/photos/example/0',
    'https://flic.kr/p/0OIl',
    'https://flic.kr/s/abc',
  ])('rejects unsupported URL %s', (url) => {
    expect(() => shortenUrl(url)).toThrow('Flickr:');
  });
});

describe('Dailymotion', () => {
  test.each([
    'https://www.dailymotion.com/video/x26m1j4',
    'https://dailymotion.com/video/x26m1j4_a_video_title',
    'https://www.dailymotion.com/embed/video/x26m1j4',
  ])('converts %s', (url) => {
    expect(shortenUrl(url).shortUrl)
      .toBe('https://dai.ly/x26m1j4');
  });

  test('preserves timestamps', () => {
    const result = shortenUrl(
      'https://www.dailymotion.com/video/x26m1j4?start=90&utm_source=share'
    );

    expect(result.shortUrl)
      .toBe('https://dai.ly/x26m1j4?start=90');
  });

  test.each([
    'https://www.dailymotion.com/playlist/abc',
    'https://dai.ly/',
    'https://www.dailymotion.com/video/',
  ])('rejects unsupported URL %s', (url) => {
    expect(() => shortenUrl(url)).toThrow('Dailymotion:');
  });
});

describe('Existing short links', () => {
  test.each([
    'https://youtu.be/dQw4w9WgXcQ',
    'https://redd.it/eorhm',
    'https://flic.kr/p/8SPTwJ',
    'https://dai.ly/x26m1j4',
  ])('keeps %s unchanged', (url) => {
    const result = shortenUrl(url);

    expect(result.shortUrl).toBe(url);
    expect(result.method).toBe('already_short');
    expect(shortenUrl(result.shortUrl)).toEqual(result);
  });
});