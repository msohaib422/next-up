import app from '../backend/server.js';
import connectDB from '../backend/config/db.js';

/**
 * Single serverless entry point for the whole API.
 *
 * The Express application is unchanged and is mounted here exactly as it was on
 * a long-running server, so routing, middleware, controllers and business logic
 * are identical in development and production. What changes is only the
 * lifecycle: Vercel calls this function per request instead of keeping a process
 * alive.
 *
 * WHY THE PATH IS NORMALISED HERE
 * -------------------------------
 * vercel.json rewrites `/api/(.*)` to this file. A Vercel rewrite replaces the
 * matched source with the destination, so a request for `/api/tasks` arrives
 * here with the `/api` prefix already stripped and `req.url` reading `/tasks`.
 * Express is mounted at `/api/...`, so it answered 404 for every single route -
 * the deployment built and served the frontend, and the API appeared entirely
 * broken. Restoring the prefix makes the function correct for the rewritten
 * path, for a direct hit on `/api`, and for a request that already carries the
 * prefix, without any of them needing to know which happened.
 */
export default async function handler(req, res) {
  /*
   * Connect before routing so a cold start does not answer the first request
   * with a 503 from an unopened connection. `connectDB()` never rejects - it
   * logs and returns null - so a database outage falls through to the route's
   * own query, which reports a real, correctly-classified error.
   */
  await connectDB();

  const url = req.url || '/';

  if (!url.startsWith('/api')) {
    // Preserve any query string: `/tasks?highlight=1` -> `/api/tasks?highlight=1`.
    const [pathname, search = ''] = url.split('?');
    const mounted = `/api${pathname === '/' ? '' : pathname}`;

    // `originalUrl` drives the 404 message and the rate limiter's key, so both
    // must see the path the client actually asked for.
    req.url = search ? `${mounted}?${search}` : mounted;
    if (!req.originalUrl) req.originalUrl = req.url;
  }

  return app(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
