# Pro-test

Pro-test is a game testing and bug reporting system with:

- a React/Vite frontend in the repo root
- an Encore TypeScript backend in [backend](C:\Git Repos\protest\backend)
- Clerk authentication
- SQL-backed games, users, sessions, and bug reports
- tester/admin dashboards with report triage and feedback loops

## Repo Layout

```text
protest/
  backend/            Encore backend
  public/             static frontend assets
  src/                React frontend
  docs/               deployment and operational guides
```

## Quickstart

Prerequisites:

- Node.js 20+
- Docker
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

Frontend env:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_API_BASE_URL=
```

Backend env:

```bash
CLERK_SECRET_KEY=sk_...
CORS_ALLOWED_ORIGINS=
```

Local URLs:

- frontend: `http://127.0.0.1:3000`
- backend: `http://127.0.0.1:4000`
- Encore local dashboard: `http://127.0.0.1:9400`

## Scripts

Frontend:

- `npm run dev`
- `npm run build`
- `npm run lint`

Backend:

- `encore run`
- `encore check`
- `npx tsc --noEmit`

## Auth Model

- Clerk owns sign-in.
- The frontend sends Clerk bearer tokens to the backend.
- The Encore backend verifies Clerk tokens and syncs the local user row.
- The first synced user becomes `admin`.
- Later users become `tester`.

## Deployment

See the full guide in [docs/DEPLOYMENT.md](C:\Git Repos\protest\docs\DEPLOYMENT.md).

That guide covers:

- Vercel frontend deployment
- Encore Cloud backend deployment
- required environment variables
- CORS
- same-origin vs split-origin setups
- common failure modes

## Current Recommendation

For production, the cleanest setup is:

- frontend on Vercel
- backend on Encore Cloud
- frontend configured with `VITE_API_BASE_URL`

If you can keep frontend and backend on the same origin through a reverse proxy, do that.
If not, use explicit CORS allowlists on the Encore side.
