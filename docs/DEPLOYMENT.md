# Deployment Guide

This project has two deployable parts:

- frontend: React/Vite app
- backend: Encore TypeScript app

The current intended deployment model is:

- frontend on Vercel
- backend on Encore Cloud

## 1. Frontend Deployment

The frontend project is the repo root.

Build command:

```bash
npm run build
```

Required frontend env vars:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_API_BASE_URL=https://your-backend-url
```

If the backend is exposed behind the same domain under `/api`, use:

```bash
VITE_API_BASE_URL=/api
```

## 2. Backend Deployment

The backend project is [backend](C:\Git Repos\protest\backend).

Deploy flow:

```bash
cd backend
encore app link <app-id>
git push encore master:main
```

Required backend secrets:

```bash
CLERK_SECRET_KEY=sk_...
CORS_ALLOWED_ORIGINS=https://your-frontend-domain
```

If multiple frontend origins must call the backend directly, use a comma-separated list:

```bash
CORS_ALLOWED_ORIGINS=https://app.example.com,https://preview.example.com
```

## 3. Same-Origin vs Split-Origin

### Same-origin

Example:

- frontend: `https://example.com`
- backend: `https://example.com/api`

This is the best option.

Frontend:

```bash
VITE_API_BASE_URL=/api
```

Reverse proxy requirement:

- forward `/api/*` to Encore
- strip the `/api` prefix before sending the request upstream

### Split-origin

Example:

- frontend: `https://app.example.com`
- backend: `https://api.example.com`

Frontend:

```bash
VITE_API_BASE_URL=https://api.example.com
```

Backend:

```bash
CORS_ALLOWED_ORIGINS=https://app.example.com
```

This works, but it is more fragile because browser preflight and CORS become part of the runtime path.

## 4. Vercel Notes

The frontend currently expects:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL`

Useful Vercel commands:

```bash
vercel project inspect pro-test --scope loop69
vercel env ls production --scope loop69
vercel env pull .vercel\\.env.production --environment production --yes --scope loop69
```

## 5. Encore Notes

Useful Encore commands:

```bash
encore auth whoami
encore secret list
encore secret set --env staging CORS_ALLOWED_ORIGINS
encore secret set --env staging CLERK_SECRET_KEY
git push encore master:main
```

## 6. Common Failures

### Browser says CORS is blocked

Cause:

- frontend origin is not included in `CORS_ALLOWED_ORIGINS`
- or the backend environment did not pick up the secret
- or the deployed backend is not using the expected CORS config

What to check:

1. exact frontend origin
2. backend secret values for the target environment
3. fresh backend deploy after secret changes
4. preflight response headers on the live backend

### Clerk works locally but not in cloud

Cause:

- `CLERK_SECRET_KEY` missing on the deployed backend environment

What to check:

1. `encore secret list`
2. target environment secrets in the Encore dashboard
3. redeploy after updating secrets

### Frontend points to the wrong backend

Cause:

- `VITE_API_BASE_URL` in Vercel is stale or unset

What to check:

1. `vercel env ls production --scope loop69`
2. `vercel env pull`

## 7. Sanity Checklist

Before calling the deployment good:

- frontend build passes
- backend `encore check` passes
- Vercel has the two frontend env vars
- Encore has the two backend secrets
- frontend origin matches the backend allowlist exactly
- browser preflight returns `Access-Control-Allow-Origin`
- authenticated requests reach `/auth/me`, `/games`, and `/reports`
