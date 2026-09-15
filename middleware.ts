// Vercel Edge Middleware — gates the whole deployment (app pages + /api/*)
// behind HTTP Basic Auth. Without this, anyone with the URL gets an
// anonymous Firestore session (full read/write on the leads database) and
// can call /api/naver-search, /api/enrich-lead, /api/generate-email
// directly, burning the Naver/Gemini quota on our account for free.
// Only enforced when both env vars are set, so local dev (Express, no
// middleware support) stays open on localhost.
//
// /api/cron-sweep is excluded — Vercel's cron invoker sends
// `Authorization: Bearer $CRON_SECRET`, not Basic Auth credentials, so it
// would otherwise get locked out of its own scheduled run. That endpoint
// checks CRON_SECRET itself instead (see api/cron-sweep.ts).
export const config = { matcher: '/((?!favicon.ico|api/cron-sweep).*)' };

export default function middleware(req: Request) {
  const user = process.env.APP_USER;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return;

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    const [suppliedUser, suppliedPass] = atob(auth.slice(6)).split(':');
    if (suppliedUser === user && suppliedPass === pass) return;
  }

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Chekki Lead Gen"' },
  });
}
