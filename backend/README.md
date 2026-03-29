# Pro-test Encore Backend

This backend owns:

- session cookies
- users and roles
- game catalog management
- bug report persistence

Run it locally with:

```bash
encore run
```

Validate the backend shape with:

```bash
encore check
```

## Cloud deployment notes

Environment:

```bash
CLERK_SECRET_KEY=sk_...
CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
```

If the frontend is reverse-proxied through the same origin, you do not need cross-origin browser access.
If the frontend calls the backend directly from another origin, set `CORS_ALLOWED_ORIGINS` to a comma-separated allowlist.

Recommended production layout:

- frontend: `https://yourdomain.com`
- encore backend: internal/private service
- reverse proxy: expose backend under `https://yourdomain.com/api`

In that layout the frontend should use `VITE_API_BASE_URL=/api`.
