import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    shorten: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const res = http.post(
    `${BASE_URL}/api/shorten`,
    JSON.stringify({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  check(res, {
    'returns the YouTube short link': (r) =>
      r.status === 200 &&
      r.json('shortUrl') === 'https://youtu.be/dQw4w9WgXcQ',
  });
}