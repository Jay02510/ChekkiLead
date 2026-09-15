// Vercel Edge Middleware — gates the whole deployment (app pages + /api/*)
// behind HTTP Basic Auth. Without this, anyone with the URL gets an
// anonymous Firestore session (full read/write on the leads database) and
// can call /api/naver-search, /api/enrich-lead, /api/generate-email
// directly, burning the Naver/Gemini quota on our account for free.
// Only enforced when both env vars are set, so local dev (Express, no
// middleware support) stays open on localhost.
export const config = { matcher: '/((?!favicon.ico).*)' };

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
