// Load test: 20 new short URLs per second for 30 seconds against staging.
// The CI job fails if more than 1% of requests fail or if 95% of them
// take longer than 1 second.
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
  },
};

export default function () {
  const res = http.post(
    `${BASE_URL}/api/shorten`,
    JSON.stringify({ url: `https://example.com/load/${__VU}/${__ITER}` }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, { 'status is 201': (r) => r.status === 201 });
}
