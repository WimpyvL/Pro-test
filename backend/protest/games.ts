import { randomUUID } from "node:crypto";

import { api, APIError } from "encore.dev/api";

import { db } from "./db";
import { applyCorsHeaders, assertNonEmpty, handleCorsPreflight, listGamesFromDb, readJsonBody, requireAdminSession, requireSession, sendError, sendJson } from "./helpers";

interface CreateGameRequest {
  title: string;
  url: string;
  description?: string;
  thumbnail?: string | null;
}

function extractGameId(pathname: string | undefined): string {
  const gameId = pathname?.split("/").filter(Boolean)[1];
  if (!gameId) {
    throw APIError.invalidArgument("Game id is required.");
  }
  return gameId;
}

export const listGames = api.raw(
  { expose: true, method: "GET", path: "/games" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        await requireSession(req);
        sendJson(resp, 200, { games: await listGamesFromDb() });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const createGame = api.raw(
  { expose: true, method: "POST", path: "/games" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        const auth = await requireAdminSession(req);
        const body = await readJsonBody<CreateGameRequest>(req);
        const title = assertNonEmpty(body.title, "Game title");
        const url = assertNonEmpty(body.url, "Game URL");
        const description = body.description?.trim() ?? "";
        const thumbnail = body.thumbnail?.trim() || null;
        const id = randomUUID();

        await db.exec`
          INSERT INTO games (id, title, url, description, thumbnail, created_by)
          VALUES (${id}, ${title}, ${url}, ${description}, ${thumbnail}, ${auth.userID})
        `;

        const games = await listGamesFromDb();
        const game = games.find((entry) => entry.id === id);
        if (!game) {
          throw APIError.internal("Game was created but could not be loaded.");
        }

        sendJson(resp, 200, { game });
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const deleteGame = api.raw(
  { expose: true, method: "DELETE", path: "/games/:gameId" },
  (req, resp) => {
    void (async () => {
      try {
        applyCorsHeaders(req, resp);
        await requireAdminSession(req);
        const gameId = extractGameId(req.url);
        await db.exec`DELETE FROM games WHERE id = ${gameId}`;
        sendJson(resp, 204);
      } catch (error) {
        sendError(resp, error);
      }
    })();
  },
);

export const gamesPreflightRoot = api.raw(
  { expose: true, method: "OPTIONS", path: "/games" },
  (req, resp) => {
    handleCorsPreflight(req, resp);
  },
);

export const gamesPreflightById = api.raw(
  { expose: true, method: "OPTIONS", path: "/games/:gameId" },
  (req, resp) => {
    handleCorsPreflight(req, resp);
  },
);
