const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

const REDDIT_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'new.reddit.com',
  'np.reddit.com',
]);

const FLICKR_HOSTS = new Set(['flickr.com', 'www.flickr.com']);
const DAILYMOTION_HOSTS = new Set([
  'dailymotion.com',
  'www.dailymotion.com',
]);

const FLICKR_ALPHABET =
  '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

class ShortenError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalidUrl(
  message = 'Enter a valid URL starting with http:// or https:// (maximum 2048 characters).'
) {
  return new ShortenError(400, 'invalid_url', message);
}

function parseUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) {
    throw invalidUrl();
  }

  let url;

  try {
    url = new URL(value.trim());
  } catch {
    throw invalidUrl();
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw invalidUrl(
      'Use an HTTP or HTTPS URL without credentials or a custom port.'
    );
  }

  return url;
}

function copyContext(source, target, ignored = []) {
  target.search = source.search;
  target.hash = source.hash;

  // Preserve unknown parameters because they may affect the destination.
  for (const key of [...target.searchParams.keys()]) {
    if (
      ['fbclid', 'gclid', ...ignored].includes(key) ||
      key.startsWith('utm_')
    ) {
      target.searchParams.delete(key);
    }
  }

  return target;
}

function unsupported(provider, message) {
  return new ShortenError(
    422,
    'unsupported_url',
    `${provider}: ${message}`
  );
}

function youtubeUrl(url) {
  let id;

  if (url.hostname === 'youtu.be') {
    id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
  } else if (
    url.pathname === '/watch' &&
    url.searchParams.getAll('v').length === 1
  ) {
    id = url.searchParams.get('v');
  } else {
    id = /^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/
      .exec(url.pathname)?.[1];
  }

  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw unsupported(
      'YouTube',
      'use a video link (watch, Shorts, live, embed, or youtu.be).'
    );
  }

  const result = copyContext(
    url,
    new URL(`https://youtu.be/${id}`),
    ['v', 'si', 'feature']
  );

  if (
    result.searchParams.has('start') &&
    !result.searchParams.has('t')
  ) {
    result.searchParams.set('t', result.searchParams.get('start'));
    result.searchParams.delete('start');
  }

  return result.href;
}

function redditUrl(url) {
  let id;

  if (url.hostname === 'redd.it') {
    id = /^\/([a-z0-9]+)\/?$/.exec(url.pathname)?.[1];
  } else {
    id =
      /^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/[^/]+)?\/?$/
        .exec(url.pathname)?.[1] ||
      /^\/gallery\/([a-z0-9]+)\/?$/.exec(url.pathname)?.[1];
  }

  // Avoid changing a comment permalink into a link to its parent post.
  if (
    !id ||
    url.searchParams.has('comment') ||
    url.searchParams.has('comment_id')
  ) {
    throw unsupported(
      'Reddit',
      'use a post URL containing /comments/ and a post ID. Comment permalinks and /s/ share tokens are not supported.'
    );
  }

  return copyContext(
    url,
    new URL(`https://redd.it/${id}`),
    ['share_id']
  ).href;
}

function flickrUrl(url) {
  let code;

  if (url.hostname === 'flic.kr') {
    code = /^\/p\/([1-9a-km-zA-HJ-NP-Z]+)\/?$/
      .exec(url.pathname)?.[1];
  } else {
    const id = /^\/photos\/[^/]+\/([1-9][0-9]*)\/?$/
      .exec(url.pathname)?.[1];

    if (id) {
      // BigInt avoids rounding large photo IDs.
      let remaining = BigInt(id);
      code = '';

      while (remaining > 0n) {
        code = FLICKR_ALPHABET[Number(remaining % 58n)] + code;
        remaining /= 58n;
      }
    }
  }

  if (!code) {
    throw unsupported(
      'Flickr',
      'use an individual photo page, not a profile, album or image-file URL.'
    );
  }

  return copyContext(
    url,
    new URL(`https://flic.kr/p/${code}`)
  ).href;
}

function dailymotionUrl(url) {
  const id =
    url.hostname === 'dai.ly'
      ? /^\/([a-zA-Z0-9]+)\/?$/.exec(url.pathname)?.[1]
      : /^\/(?:embed\/)?video\/([a-zA-Z0-9]+)(?:_[^/]+)?\/?$/
          .exec(url.pathname)?.[1];

  if (!id) {
    throw unsupported(
      'Dailymotion',
      'use a video page or dai.ly link.'
    );
  }

  return copyContext(
    url,
    new URL(`https://dai.ly/${id}`)
  ).href;
}

function shortenUrl(value) {
  const url = parseUrl(value);
  const originalUrl = value.trim();

  let shortUrl;
  let provider;

  if (
    YOUTUBE_HOSTS.has(url.hostname) ||
    url.hostname === 'youtu.be'
  ) {
    shortUrl = youtubeUrl(url);
    provider = 'YouTube';
  } else if (
    REDDIT_HOSTS.has(url.hostname) ||
    url.hostname === 'redd.it'
  ) {
    shortUrl = redditUrl(url);
    provider = 'Reddit';
  } else if (
    FLICKR_HOSTS.has(url.hostname) ||
    url.hostname === 'flic.kr'
  ) {
    shortUrl = flickrUrl(url);
    provider = 'Flickr';
  } else if (
    DAILYMOTION_HOSTS.has(url.hostname) ||
    url.hostname === 'dai.ly'
  ) {
    shortUrl = dailymotionUrl(url);
    provider = 'Dailymotion';
  } else {
    throw new ShortenError(
      422,
      'unsupported_domain',
      'This website is not supported. Try YouTube, Reddit, Flickr or Dailymotion.'
    );
  }

  return {
    originalUrl,
    shortUrl,
    provider,
    method: shortUrl === originalUrl ? 'already_short' : 'rewrite',
  };
}

module.exports = { shortenUrl, ShortenError };