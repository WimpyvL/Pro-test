import { api, APIError } from "encore.dev/api";

import {
  applyCorsHeaders,
  assertNonEmpty,
  endGameSession,
  handleCorsPreflight,
  heartbeatGameSession,
  readJsonBody,
  requireAdminSession,
  requireSession,
  sendError,
  sendJson,
  startGameSession,
  listTesterInsights,
} from "./helpers";

interface StartGameSessionRequest {
  gameId: string;
}

function extractSessionId(pathname: string | undefined): string {
  const parts = pathname?.split("/").filter(Boolean) ?? [];
  const sessionId = parts[1];
  if (!sessionId) {
    throw APIError.invalidArgument("Session id is required.");
  }
  return sessionId;
}

export const listAdminTesterInsights = api.raw(
  { expose: true, method: "GET", path: "/admin/tester-insights" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        await requireAdminSession(req);
        sendJson(resp, 200, { testers: await listTesterInsights() });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const startSession = api.raw(
  { expose: true, method: "POST", path: "/game-sessions/start" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        const auth = await requireSession(req);
        const body = await readJsonBody<StartGameSessionRequest>(req);
        sendJson(resp, 200, { session: await startGameSession(auth.userID, assertNonEmpty(body.gameId, "Game")) });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const heartbeatSession = api.raw(
  { expose: true, method: "POST", path: "/game-sessions/:sessionId/heartbeat" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        const auth = await requireSession(req);
        const sessionId = extractSessionId(req.url);
        sendJson(resp, 200, { session: await heartbeatGameSession(auth.userID, sessionId) });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const endSession = api.raw(
  { expose: true, method: "POST", path: "/game-sessions/:sessionId/end" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        const auth = await requireSession(req);
        const sessionId = extractSessionId(req.url);
        sendJson(resp, 200, { session: await endGameSession(auth.userID, sessionId) });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const adminInsightsPreflight = api.raw(
  { expose: true, method: "OPTIONS", path: "/admin/tester-insights" },
  (req, resp) => {
    handleCorsPreflight(req, resp);
  },
);

export const gameSessionsPreflightRoot = api.raw(
  { expose: true, method: "OPTIONS", path: "/game-sessions/start" },
  (req, resp) => {
    handleCorsPreflight(req, resp);
  },
);

export const gameSessionsPreflightById = api.raw(
  { expose: true, method: "OPTIONS", path: "/game-sessions/:sessionId/:action" },
  (req, resp) => {
    handleCorsPreflight(req, resp);
  },
);
