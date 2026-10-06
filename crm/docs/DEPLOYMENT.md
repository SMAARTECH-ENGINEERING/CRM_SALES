# Deployment

Two things are deployed: the API (a Node process) and the web app (static
files). They can live on one machine behind one reverse proxy, or apart.

```text
                 ┌──────────── reverse proxy (TLS) ────────────┐
Browser ──HTTPS──┤  /            → static files (client/dist)  │
                 │  /api/        → Node API :5000              │
                 │  /socket.io/  → Node API :5000 (WebSocket)  │
                 └─────────────────────────────────────────────┘
                              MongoDB        Object storage (S3-compatible)
```

## Requirements

- Node.js 20 or newer
- MongoDB 6 or newer (a replica set or a managed cluster in production)
- An S3-compatible bucket for uploaded files (recommended), or a persistent disk
- An SMTP account, if quotations and contract reminders are to be emailed

## 1. The API

```bash
cd server
npm ci --omit=dev
```

Create `server/.env` (start from `.env.example`). For production, at least:

| Variable | Value |
| -------- | ----- |
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `MONGODB_URI` | Your cluster's connection string, with a user that can only use this database |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Two **different** random strings of at least 32 characters. `npm run setup:env` generates them |
| `CORS_ORIGIN` | The exact address of the web app, e.g. `https://crm.yourcompany.com`. Several: comma-separated |
| `TRUST_PROXY` | `1` behind one reverse proxy, so rate limiting and the audit log see the real client address |
| `RATE_LIMIT_ENABLED` | `true` |
| `SCRAPER_ALLOW_PRIVATE_HOSTS` | `false` |
| `ALLOW_PUBLIC_REGISTRATION` | `false` (the default in production): accounts are created by administrators |
| `STORAGE_DRIVER` | `s3`, with `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (and `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` for a store other than AWS) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Your mail server; leave unset to switch email off |
| `LOG_LEVEL` | `info` |

The server validates its environment at start and refuses to run with a missing
or malformed value, naming it.

First start:

```bash
npm start                          # loads the permission catalogue and the starting lists
ADMIN_PASSWORD='<strong password>' npm run create:admin -- --first-name Ada --last-name Admin --email ada@yourcompany.com
```

Do **not** run `npm run seed:demo` in production: it creates demo companies and leads.

Keep it running with a process manager:

```bash
# systemd, pm2, a container - any of them. With pm2:
pm2 start src/server.js --name crm-api --time
pm2 save && pm2 startup
```

The process handles `SIGTERM` / `SIGINT`: it stops accepting requests, finishes
those in flight, closes the database and exits. Logs are JSON on stdout.

`GET /api/v1/health` answers 200 with the database state - use it for the load
balancer's health check.

### More than one API instance

Supported, with two things to know:

- **Real-time notifications** are sent to connections on the instance that
  created them. With several instances either use sticky sessions and accept
  that a notification may arrive on the next poll (the app re-reads them every
  minute), or add the Socket.IO Redis adapter.
- **Settings** are cached for 15 seconds per instance, so a change reaches the
  others within that time.

Background jobs are safe to run on every instance: each piece of work is
claimed with a unique key.

## 2. The web app

```bash
cd client
npm ci
VITE_API_BASE_URL=https://crm.yourcompany.com/api/v1 VITE_APP_NAME="CRM" npm run build
```

`client/dist/` is the whole app. `VITE_*` values are baked in at build time and
are public - never put a secret there.

Serve `dist/` as static files, sending every unknown path to `index.html` (the
app does its own routing).

## 3. Reverse proxy (nginx example)

```nginx
server {
  listen 443 ssl http2;
  server_name crm.yourcompany.com;
  # ssl_certificate ...; ssl_certificate_key ...;

  root /var/www/crm/dist;
  index index.html;

  location / {
    try_files $uri /index.html;
  }
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
  location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 60m;          # at least UPLOAD_MAX_FILE_MB x UPLOAD_MAX_FILES
  }
  location /socket.io/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

Serve everything over HTTPS only.

## 4. After deploying

1. Sign in as the administrator and fill in **Application settings**: company
   details, number prefixes, currency, time zone, upload limits, branding.
2. Review the lists under **Lists and statuses** (lead sources, statuses,
   pipeline stages, ticket categories, contract types, taxes, units) so they
   match your business.
3. Create roles, then users.

## Checklist

- [ ] `NODE_ENV=production`, strong JWT secrets, different from each other and from any other environment
- [ ] `CORS_ORIGIN` is the real web address, not `*`
- [ ] `RATE_LIMIT_ENABLED=true` and `TRUST_PROXY` matches the number of proxies
- [ ] `SCRAPER_ALLOW_PRIVATE_HOSTS=false` (the default): the web data scraper must not reach internal addresses
- [ ] `ALLOW_PUBLIC_REGISTRATION=false`
- [ ] HTTPS everywhere; the API port is not reachable from outside
- [ ] MongoDB requires authentication and is not exposed to the internet
- [ ] Files are in object storage (or on a disk that is backed up)
- [ ] Database and files are backed up together, and a restore has been tried
- [ ] `.env` files are not in version control (`.gitignore` covers them)
- [ ] Demo data was not seeded

## Upgrading

```bash
git pull
(cd server && npm ci --omit=dev)
(cd client && npm ci && npm run build)
pm2 reload crm-api
```

New permissions and indexes are added at start. Records that existed before a
release that needs a new stored value (for example the search keys) are brought
up to date at start as well.
