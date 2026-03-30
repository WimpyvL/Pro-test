# Pro-test Encore Backend

This folder contains the Encore backend for Pro-test.

It owns:

- auth verification against Clerk
- local user/session synchronization
- game catalog APIs
- bug report APIs
- SQL persistence
- object storage for report images

## Local Run

```bash
encore run
```

## Validation

```bash
encore check
npx tsc --noEmit
```

## Required Secrets

```bash
CLERK_SECRET_KEY=sk_...
CORS_ALLOWED_ORIGINS=https://your-frontend-domain
```

## Deployment

See the full deployment guide in [docs/DEPLOYMENT.md](C:\Git Repos\protest\docs\DEPLOYMENT.md).
