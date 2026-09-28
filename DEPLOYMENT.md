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
| `FRONTEND_URL` | The deployed origin, no trailing slash, e.g. `https://nextup.vercel.app`. Recommended, but see below — a wrong value can no longer break an email. |

All configured admin addresses go into the `To` header of a **single** message,
so one event is one email operation no matter how many administrators there are.

#### `FRONTEND_URL`, and why a localhost link can no longer be emailed

`FRONTEND_URL` builds every link in every email: the admin email's **View
Registration** button (`/users?highlight=<id>`), the approval email's **Login**
button (`/login`), and the re-registration links.

It used to be the only source, which made one mistake invisible: a
`http://localhost:5173` value left in the production environment produced emails
whose buttons sent the administrator to their own machine. That was a
configuration problem, not a code problem, so it is now handled where the URLs
are built — `backend/config/appUrl.js`:

| Order | Source | When it is used |
| --- | --- | --- |
| 1 | `FRONTEND_URL` | Whenever it is set to a usable public origin. |
| 2 | `APP_URL`, `NEXT_PUBLIC_APP_URL`, `PUBLIC_APP_URL` | Accepted aliases. |
| 3 | `VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL` | Set by Vercel itself, so a project that forgot `FRONTEND_URL` still gets real links. |
| 4 | `http://localhost:5173` | **Development only.** |

In production a candidate is refused when it points at `localhost`, `127.x`,
`::1`, a private range or a `*.local` host, when it is not `http(s)`, or when it
carries embedded credentials — and the search moves on to the next source. A
refused value is logged (`[app-url] ignoring unusable app URL(s)…`) and reported
at start-up (`[app-url] email links will use …`). If nothing at all is usable
the buttons are **omitted** rather than sent with a dead link.

So `FRONTEND_URL` is worth setting for a custom domain, but leaving it at
`localhost` in production is no longer able to email a localhost link.

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
| `SESSION_IDLE_MINUTES` | `10` | How long a session survives without activity. See below. |
| `EMAIL_MAX_FAILURES` | `3` | Failures before an address stops being emailed. |
| `EMAIL_SUPPRESSED_ADDRESSES` | empty | Addresses never to email again. |
| `MONGO_MAX_POOL_SIZE` | `10` | |
| `VITE_API_URL` | unset | Leave unset. The frontend then calls `/api` on its own origin. |

### Sessions and the ten-minute window

`SESSION_IDLE_MINUTES` (default `10`) is an **idle** window, not a total session
length, and the distinction matters:

- The credential is signed for one window and **renewed by the server on every
  request it accepts**. A user who signs in and works for half an hour keeps
  their session the whole time; there is no timer anywhere that can end it.
- A session that is left alone — the tab closed, the browser shut — stops being
  renewed, so it expires one window after the last request. The next request is
  refused with `401 TOKEN_EXPIRED` and the user is asked to sign in again.

The browser checks the same window on start-up so the user is asked to sign in
straight away rather than watching a protected page load and then bounce. It can
only do that for a tab that is *closed* (`sessionStorage` is per-tab), which is
why a page refresh and a second tab are both left alone.

Existing tokens are not affected by adding the variable: setting it only changes
how long a newly issued session lasts.

### Frontend variables

Only `VITE_API_URL` and `VITE_API_TIMEOUT_MS` are read by the browser. Vite
inlines every `VITE_*` value into the JavaScript bundle, so a secret placed in
one is readable by anyone who opens the site. No backend secret belongs in a
`VITE_` variable.

## After deploying

1. Optional but recommended: set `FRONTEND_URL` to the deployed origin if it is
   a custom domain. Without it the links use the Vercel origin, which is correct
   for a default `*.vercel.app` deployment. Read the start-up line
   `[app-url] email links will use …` to see which one is in effect.
2. Confirm the two admin accounts can sign in and reach `/users` and
   `/approvals`.
3. Submit a test registration and confirm one email arrives addressed to both
   administrators, and that its **View Registration** button opens
   `https://<your-deployment>/users?highlight=<id>` — signing in first if the
   administrator is not already signed in.
4. Approve the registration and confirm the approval email ends with a **Login**
   button that opens the deployed `/login` in a new tab.
5. Check `GET /api/health`. It returns `200` with `database: "connected"`.

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

Runs the verification suites covering the database, account preservation, admin
parity, real password logins, outage and reconnection behaviour, session
survival, secret exposure, the production email links and the session window, and
the deployment shape and routing. Each suite can also be run on its own from
`backend/`, e.g. `node scripts/verify-session-and-email-links.mjs`.

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

### Forgotten administrator password

Passwords are stored as one-way hashes, so a forgotten one cannot be read back
and has to be replaced with a new hash:

```bash
npm run set:admin-password -- --email msohaib.ai.dev@gmail.com --password 12345678
npm run set:admin-password -- --email msohaib.ai.dev@gmail.com --password 12345678 --apply
```

The first line is the dry run and writes nothing. `--apply` updates the existing
account in place: same id, email, name and role, and no second account is
created. It refuses to run if the address holds no account, because choosing
which addresses are administrators is `sync:admins`' job, not this script's. The
new hash is written with the model's own `hashPassword()`, then read back and
compared exactly as the login handler does, so "the new password works" is
observed rather than assumed.

It only changes the password. If the account's role is not `collaborator`, or
its status is not `Approved`, the script says so and the account still cannot be
signed in as an administrator - run `sync:admins` for that.
