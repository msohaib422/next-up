# Deploying to Vercel

The project is a single Vercel project containing both halves:

- `frontend/` — a Vite + React single-page app. Vercel builds it and serves it
  as static files.
- `backend/` — an Express + Mongoose API, mounted into one serverless function
  at `api/index.js`.

`vercel.json` wires the two together. Nothing needs to be running locally after
deployment.

## How a request is served

| Request | Handled by |
| --- | --- |
| `/`, `/tasks`, `/users`, … | `frontend/dist/index.html` (the SPA) |
| `/assets/*` | the built static files |
| `/api/*` | the `api/index.js` serverless function |

Vercel checks the filesystem before applying `rewrites`, so hashed assets are
served as files and only genuine client-side routes fall back to `index.html`.
The `/api/(.*)` rewrite is listed first, so API calls are never caught by the
SPA fallback.

## Environment variables

Set these in **Project Settings → Environment Variables**. Do not create a
`.env` file in the repository; `backend/.env.example` documents every name and
every variable is optional unless noted.

### Required

| Variable | Notes |
| --- | --- |
| `MONGODB_URI` | **The database name must be in the path**, e.g. `.../nextup`. Omitting it makes the driver default to `test`. |
| `JWT_SECRET` | Long random string. Rotating it signs everyone out once. |

### Required for admin email

| Variable | Notes |
| --- | --- |
| `ADMIN_EMAIL_1` | First administrator. |
| `ADMIN_EMAIL_2` | Second administrator. |
| `ADMIN_EMAILS` | Optional. Extra recipients, comma separated. `ADMIN_EMAIL_3` also works. |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587`, or `465` with `SMTP_SECURE=true` |
| `SMTP_SECURE` | `false` for 587, `true` for 465 |
| `SMTP_USER` | The sending mailbox. |
| `SMTP_PASS` | An **app password**, not the account password. |
| `SMTP_FROM` | The From address shown to recipients. |
| `FRONTEND_URL` | The deployed origin, no trailing slash, e.g. `https://nextup.vercel.app`. A `localhost` value is ignored in production and email links are omitted. |

All configured admin addresses go into the `To` header of a **single** message,
so one event is one email operation no matter how many administrators there are.

### Required for file uploads

| Variable | Notes |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME` | |
| `CLOUDINARY_API_KEY` | |
| `CLOUDINARY_API_SECRET` | |

### Optional

| Variable | Default | Notes |
| --- | --- | --- |
| `CORS_ORIGINS` | any origin | Comma-separated allowlist. Leave unset for a single-origin deployment. |
| `RATE_LIMIT_MAX` | `1000` | Requests per IP per window across `/api`. |
| `RATE_LIMIT_WINDOW_MS` | `900000` | |
| `MAX_UPLOAD_MB` | `4` | See the upload limitation below. |
| `EMAIL_MAX_FAILURES` | `3` | Failures before an address stops being emailed. |
| `EMAIL_SUPPRESSED_ADDRESSES` | empty | Addresses never to email again. |
| `MONGO_MAX_POOL_SIZE` | `10` | |
| `VITE_API_URL` | unset | Leave unset. The frontend then calls `/api` on its own origin. |

### Frontend variables

Only `VITE_API_URL` and `VITE_API_TIMEOUT_MS` are read by the browser. Vite
inlines every `VITE_*` value into the JavaScript bundle, so a secret placed in
one is readable by anyone who opens the site. No backend secret belongs in a
`VITE_` variable.

## After deploying

1. Set `FRONTEND_URL` to the deployed origin. Until you do, approval emails have
   no working links (a `localhost` value is deliberately ignored in production).
2. Confirm the two admin accounts can sign in and reach `/users` and
   `/approvals`.
3. Submit a test registration and confirm one email arrives addressed to both
   administrators.
4. Check `GET /api/health`. It returns `200` with `database: "connected"`.

## Known platform limitations

These are real constraints of the serverless model, not oversights.

### Upload size is capped at 4 MB

Vercel rejects a request body larger than 4.5 MB **before** the function runs, so
a larger limit can never take effect in production. `MAX_UPLOAD_MB` therefore
defaults to `4` and the same value drives both the enforced limit and the
message the user sees. Raising it above 4 works locally and fails on Vercel.
Supporting larger files needs direct-to-Cloudinary uploads, where the file never
passes through the function.

### Rate limiting is per instance

`express-rate-limit` keeps its counters in memory, and each serverless instance
has its own. The limit is therefore approximate rather than exact. It is set
generously (`1000` per 15 minutes) so ordinary use never reaches it; a strict
global limit needs a shared store such as Upstash Redis.

### There is no Socket.IO

The project has never used Socket.IO. Live notification updates are delivered by
a 30-second poll plus a refetch when the tab regains focus
(`frontend/src/context/NotificationContext.jsx`). Polling is what makes this
deployable to a serverless platform at all, so no architectural change was
needed. The code is structured so a real-time transport could be introduced
later behind `applyIncoming` without touching any component.

### Cold starts

A cold function establishes one MongoDB connection before serving. The
connection is cached on `global`, so a warm container reuses it. First request
after a period of inactivity is slower; this is inherent to the platform and is
mitigated by `maxDuration: 30` on the function.

## Local development

```bash
cp backend/.env.example backend/.env   # then fill it in
npm install && cd frontend && npm install

npm run dev:backend    # http://localhost:5000
npm run dev:frontend   # http://localhost:5173, proxies /api to the backend
```

Vite proxies `/api` to `localhost:5000` in development only. The proxy is not
used in production; the deployment routes `/api` to the function directly.

## Verifying a deployment

```bash
npm run verify
```

Runs 269 checks across five suites covering the database, account preservation,
admin parity, real password logins, outage and reconnection behaviour, session
survival, secret exposure, and the deployment shape and routing.

## Database operations

These are read-only unless `--apply` is passed, and each prints its plan first.

```bash
npm run inspect:cluster   # what databases and collections exist
npm run backup:accounts   # dump every account to .backups/ (git-ignored)
npm run migrate:db        # move data to the production database name
npm run reset:content     # clear content, never accounts
npm run sync:admins       # reconcile the administrator accounts
```

`reset:content` keeps `users` and only ever removes application content. It
asserts the account count is unchanged afterwards and exits non-zero if not.
