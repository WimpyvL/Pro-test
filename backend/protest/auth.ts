import { api } from "encore.dev/api";

import { applyCorsHeaders, handleCorsPreflight, listActiveTesters, loadUserProfile, requireAdminSession, requireSession, sendError, sendJson } from "./helpers";

export const authPreflight = api.raw(
  { expose: true, method: "OPTIONS", path: "/auth/:path" },
  (req, resp) => {
    handleCorsPreflight(req, resp);
  },
);

export const adminPreflight = api.raw(
  { expose: true, method: "OPTIONS", path: "/admin/:path" },
  (req, resp) => {
    handleCorsPreflight(req, resp);
  },
);

export const me = api.raw(
  { expose: true, method: "GET", path: "/auth/me" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        const auth = await requireSession(req);
        sendJson(resp, 200, { user: await loadUserProfile(auth.userID) });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const activeUsers = api.raw(
  { expose: true, method: "GET", path: "/admin/active-testers" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        const auth = await requireAdminSession(req);
        sendJson(resp, 200, { testers: await listActiveTesters(auth.userID) });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);
