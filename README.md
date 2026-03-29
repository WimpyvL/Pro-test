# Pro-test

The Firebase and Gemini client-side wiring is gone. The app now uses:

- a React/Vite frontend in the repo root
- an Encore TypeScript backend in `backend/`
- SQL-backed users, sessions, games, and bug reports
- Clerk for sign-in

## Local development

Prerequisites:

- Node.js 20+
- Encore CLI

Frontend:

```bash
npm install
npm run dev
```

Backend:

```bash
cd backend
encore run
```

Auth env:

```bash
# frontend
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_API_BASE_URL=

# backend
CLERK_SECRET_KEY=sk_...
CORS_ALLOWED_ORIGINS=
```

The Vite dev server proxies `/auth`, `/admin`, `/games`, and `/reports` to the Encore backend on `http://127.0.0.1:4000`.

## Cloud backend shape

For production, stop depending on the Vite proxy.

You have two credible deployment modes:

1. Same-origin reverse proxy
   - Frontend served from `https://yourdomain.com`
   - Backend exposed behind a reverse proxy at `https://yourdomain.com/api`
   - Set `VITE_API_BASE_URL=/api`
   - Rewrite `/api/*` to the Encore backend and strip the `/api` prefix
   - This is the cleanest option because the browser sees one origin

2. Split frontend/backend origins
   - Frontend at `https://app.yourdomain.com`
   - Backend at `https://api.yourdomain.com`
   - Set `VITE_API_BASE_URL=https://api.yourdomain.com`
   - Set backend `CORS_ALLOWED_ORIGINS=https://app.yourdomain.com`

If you keep the frontend and backend on different origins, the backend now supports CORS preflight for Clerk bearer-token requests.

## Auth model

- Clerk owns sign-in.
- The Encore backend verifies Clerk bearer tokens and syncs the local app user row from Clerk user data.
- The first synced user becomes `admin`.
- Later users become `tester`.
