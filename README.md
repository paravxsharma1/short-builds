# Short Builds: URL Shortener with a CI/CD Pipeline

SWE40006 Software Deployment and Evolution, Group 6.

Paste a long URL, get a short one that redirects to it. Links expire after 30 days.

## How the pipeline works

```
push to staging ──► tests ──► build Docker image ──► deploy to STAGING (EC2 :8080) ──► k6 load test
                                   │
pull request staging → main ──► tests must pass before merge
                                   │
merge into main ──► tests ──► build Docker image ──► deploy to PRODUCTION (EC2 :80) ──► logs to CloudWatch
```

All of it lives in `.github/workflows/ci-cd.yml`.

| Stage | Tool |
|---|---|
| Source control | GitHub (`main` and `staging` branches) |
| CI/CD | GitHub Actions |
| Container | Docker + Docker Compose |
| Registry | GitHub Container Registry (GHCR) |
| Unit/API tests | Jest + Supertest (80% coverage minimum, build fails below it) |
| Load test | k6, 20 URLs per second for 30 seconds against staging |
| Hosting | AWS EC2 (Ubuntu 24.04) |
| Database | PostgreSQL 16 |
| Monitoring | Amazon CloudWatch Logs + CPU alarm |

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/` | The web page |
| POST | `/api/shorten` | Body `{"url": "https://..."}` returns `{code, shortUrl, originalUrl, expiresAt}` |
| GET | `/:code` | 302 redirect to the original URL, or 404 if unknown/expired |
| GET | `/health` | Checks the app and database are up |

## Database

One table, `urls`: `id`, `code` (unique), `original_url`, `created_at`, `expires_at`.
The redirect only works while `expires_at` is in the future, and a cleanup job inside the app deletes expired rows every hour.

## Running locally (optional, needs Docker Desktop)

```
docker compose up --build
```

Then open http://localhost:3000

## Running the tests locally (optional, needs Node 22 and PostgreSQL)

```
npm install
npm test
```

## Required GitHub secrets

| Secret | Value |
|---|---|
| `EC2_HOST` | Public IPv4 address of the EC2 instance |
| `EC2_SSH_KEY` | Full contents of the `.pem` key file |

## Changes from the project brief

- Staging and production run on the same EC2 instance as two separate Docker Compose projects (ports 8080 and 80) to stay within the free tier.
- PostgreSQL runs as a container on EC2 instead of Amazon RDS. The app only needs `DATABASE_URL`, so moving to RDS later is a one-line change.
- Deployment pulls a tested image from GHCR rather than pulling source code onto the server.
- Short links use their own 7-character codes on our domain instead of each platform's own shortener (e.g. youtu.be), so it works for any website.
