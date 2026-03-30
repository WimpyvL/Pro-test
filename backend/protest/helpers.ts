import { randomUUID } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";

import { createClerkClient, verifyToken } from "@clerk/backend";
import { APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";

import { db } from "./db";
import { resolveImageSource } from "./storage";
import type {
  ActiveTester,
  GameRecord,
  ReportMessageRecord,
  ReportPriority,
  ReportRecord,
  TesterGameStat,
  TesterInsight,
  UserProfile,
  UserRole,
} from "./types";

const SESSION_COOKIE_NAME = "protest_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const clerkSecretKeySecret = secret("CLERK_SECRET_KEY");

const seedGames: Array<Pick<GameRecord, "title" | "url" | "description">> = [
  {
    title: "Eco Dominion",
    url: "https://aureus-eco-dominion.vercel.app/",
    description: "A strategy game focused on ecological balance and dominion.",
  },
  {
    title: "Bureaucracy",
    url: "https://aureus-bureaucracy.vercel.app/",
    description: "Navigate the complex world of administrative hurdles.",
  },
];

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  last_seen: Date;
  total_reports: number;
  fixed_reports: number;
}

interface GameRow {
  id: string;
  title: string;
  url: string;
  description: string;
  thumbnail: string | null;
  created_at: Date;
}

interface ReportRow {
  id: string;
  timestamp: Date;
  updated_at: Date;
  image: string | null;
  annotated_image: string | null;
  video: string | null;
  title: string;
  description: string;
  status: "open" | "pending" | "fixed";
  priority: ReportPriority;
  admin_notes: string;
  author_uid: string;
  author_name: string;
  game_title: string | null;
  game_url: string | null;
}

interface ReportMessageRow {
  id: string;
  report_id: string;
  author_id: string;
  author_name: string;
  author_role: "admin" | "tester";
  body: string;
  created_at: Date;
}

interface GameSessionRow {
  id: string;
  game_id: string;
  started_at: Date;
}

interface TesterInsightRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  last_seen: Date;
  is_online: boolean;
  total_reports: number;
  fixed_reports: number;
  open_reports: number;
  pending_reports: number;
  high_priority_reports: number;
  total_sessions: number;
  games_played_count: number;
  total_play_seconds: number;
  avg_session_seconds: number | null;
  last_played_at: Date | null;
  current_game_title: string | null;
  current_session_started_at: Date | null;
}

interface TesterGameStatRow {
  user_id: string;
  game_id: string;
  game_title: string;
  game_url: string;
  session_count: number;
  total_play_seconds: number;
  reports_filed: number;
  last_played_at: Date | null;
}

export interface SessionAuth {
  userID: string;
  email: string;
  name: string;
  role: "admin" | "tester";
}

let cachedClerkClient: ReturnType<typeof createClerkClient> | null = null;

function getClerkSecretKey() {
  return clerkSecretKeySecret();
}

function getClerkClient() {
  if (!cachedClerkClient) {
    cachedClerkClient = createClerkClient({ secretKey: getClerkSecretKey() });
  }

  return cachedClerkClient;
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    throw APIError.invalidArgument("Request body is required.");
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch (error) {
    throw APIError.invalidArgument("Request body must be valid JSON.", error as Error);
  }
}

export function sendJson(resp: ServerResponse, statusCode: number, payload?: unknown) {
  resp.statusCode = statusCode;
  resp.setHeader("Content-Type", "application/json; charset=utf-8");
  if (payload === undefined) {
    resp.end();
    return;
  }

  resp.end(JSON.stringify(payload));
}

export function applyCorsHeaders(_req: IncomingMessage, _resp: ServerResponse) {
  return true;
}

export function handleCorsPreflight(req: IncomingMessage, resp: ServerResponse) {
  applyCorsHeaders(req, resp);
  resp.statusCode = 204;
  resp.end();
}

export function sendError(resp: ServerResponse, error: unknown) {
  if (error instanceof APIError) {
    const statusCode =
      error.code === "unauthenticated"
        ? 401
        : error.code === "permission_denied"
          ? 403
          : error.code === "not_found"
            ? 404
            : error.code === "invalid_argument"
              ? 400
              : 500;
    sendJson(resp, statusCode, { error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  sendJson(resp, 500, { error: message });
}

export function parseSessionCookie(req: IncomingMessage): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(";").map((value) => value.trim());
  const sessionPair = pairs.find((pair) => pair.startsWith(`${SESSION_COOKIE_NAME}=`));
  return sessionPair ? decodeURIComponent(sessionPair.split("=")[1] ?? "") : null;
}

export function setSessionCookie(resp: ServerResponse, sessionId: string) {
  resp.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  );
}

export function clearSessionCookie(resp: ServerResponse) {
  resp.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export async function createSession(userId: string) {
  const sessionId = randomUUID();
  await db.exec`
    INSERT INTO sessions (id, user_id, expires_at, last_seen)
    VALUES (${sessionId}, ${userId}, NOW() + INTERVAL '7 days', NOW())
  `;

  return sessionId;
}

export async function upsertUserFromIdentity(identity: { externalId: string; email: string; name: string }) {
  const existingByEmail = await db.queryRow<{ id: string }>`
    SELECT id
    FROM users
    WHERE email = ${identity.email}
    LIMIT 1
  `;

  if (existingByEmail) {
    await db.exec`
      UPDATE users
      SET id = ${identity.externalId}, email = ${identity.email}, name = ${identity.name}, last_seen = NOW(), updated_at = NOW()
      WHERE id = ${existingByEmail.id}
    `;
    return identity.externalId;
  }

  const userCount = await db.queryRow<{ count: number }>`SELECT COUNT(*)::int AS count FROM users`;
  const role = (userCount?.count ?? 0) === 0 ? "admin" : "tester";

  await db.exec`
    INSERT INTO users (id, email, name, role)
    VALUES (${identity.externalId}, ${identity.email}, ${identity.name}, ${role})
    ON CONFLICT (id)
    DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      last_seen = NOW(),
      updated_at = NOW()
  `;

  return identity.externalId;
}

export async function loadUserProfile(userId: string): Promise<UserProfile> {
  const row = await db.queryRow<UserRow>`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.avatar_url,
      u.last_seen,
      COUNT(r.id)::int AS total_reports,
      COUNT(*) FILTER (WHERE r.status = 'fixed')::int AS fixed_reports
    FROM users u
    LEFT JOIN reports r ON r.author_id = u.id
    WHERE u.id = ${userId}
    GROUP BY u.id
  `;

  if (!row) {
    throw APIError.notFound("User not found.");
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    photoURL: row.avatar_url,
    lastSeen: row.last_seen.toISOString(),
    stats: {
      totalReports: row.total_reports,
      fixedReports: row.fixed_reports,
    },
  };
}

export async function loadSessionAuth(sessionId: string): Promise<SessionAuth | null> {
  const session = await db.queryRow<SessionAuth>`
    SELECT u.id AS "userID", u.email, u.name, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId}
      AND s.expires_at > NOW()
  `;

  if (!session) {
    return null;
  }

  await Promise.all([
    db.exec`UPDATE sessions SET last_seen = NOW() WHERE id = ${sessionId}`,
    db.exec`UPDATE users SET last_seen = NOW(), updated_at = NOW() WHERE id = ${session.userID}`,
  ]);

  return session;
}

async function resolveBearerToken(req: IncomingMessage) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

export async function requireClerkSession(req: IncomingMessage): Promise<SessionAuth> {
  const token = await resolveBearerToken(req);
  if (!token) {
    throw APIError.unauthenticated("Authentication required.");
  }

  const clerkSecretKey = getClerkSecretKey();
  const clerkClient = getClerkClient();
  const verified = await verifyToken(token, { secretKey: clerkSecretKey });
  const userId = verified.sub;
  if (!userId) {
    throw APIError.unauthenticated("Invalid Clerk token.");
  }

  const clerkUser = await clerkClient.users.getUser(userId);
  const primaryEmailId = clerkUser.primaryEmailAddressId;
  const primaryEmail = clerkUser.emailAddresses.find((entry) => entry.id === primaryEmailId)?.emailAddress
    ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) {
    throw APIError.failedPrecondition("Clerk user has no primary email address.");
  }

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim()
    || clerkUser.username
    || primaryEmail;

  const localUserId = await upsertUserFromIdentity({
    externalId: userId,
    email: primaryEmail,
    name,
  });

  const profile = await loadUserProfile(localUserId);
  return {
    userID: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
  };
}

export async function requireSession(req: IncomingMessage): Promise<SessionAuth> {
  if (req.headers.authorization?.startsWith("Bearer ")) {
    return requireClerkSession(req);
  }

  const sessionId = parseSessionCookie(req);
  if (!sessionId) {
    throw APIError.unauthenticated("Authentication required.");
  }

  const auth = await loadSessionAuth(sessionId);
  if (!auth) {
    throw APIError.unauthenticated("Session expired or invalid.");
  }

  return auth;
}

export async function requireAdminSession(req: IncomingMessage) {
  const auth = await requireSession(req);
  if (auth.role !== "admin") {
    throw APIError.permissionDenied("Admin access required.");
  }

  return auth;
}

export async function ensureSeedGames() {
  const existing = await db.queryRow<{ count: number }>`SELECT COUNT(*)::int AS count FROM games`;
  if ((existing?.count ?? 0) > 0) {
    return;
  }

  for (const game of seedGames) {
    await db.exec`
      INSERT INTO games (id, title, url, description)
      VALUES (${randomUUID()}, ${game.title}, ${game.url}, ${game.description})
    `;
  }
}

export async function listGamesFromDb(): Promise<GameRecord[]> {
  await ensureSeedGames();
  const rows = await db.queryAll<GameRow>`
    SELECT id, title, url, description, thumbnail, created_at
    FROM games
    ORDER BY created_at DESC
  `;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    description: row.description,
    thumbnail: row.thumbnail,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function listReportsFromDb(): Promise<ReportRecord[]> {
  const rows = await db.queryAll<ReportRow>`
    SELECT
      r.id,
      r.created_at AS timestamp,
      r.updated_at,
      r.image,
      r.annotated_image,
      r.video,
      r.title,
      r.description,
      r.status,
      r.priority,
      r.admin_notes,
      u.id AS author_uid,
      u.name AS author_name,
      r.game_title,
      r.game_url
    FROM reports r
    JOIN users u ON u.id = r.author_id
    ORDER BY r.created_at DESC
  `;

  const messagesByReportId = new Map<string, ReportMessageRecord[]>();
  for (const row of rows) {
    const messageRows = await db.queryAll<ReportMessageRow>`
      SELECT id, report_id, author_id, author_name, author_role, body, created_at
      FROM report_messages
      WHERE report_id = ${row.id}
      ORDER BY created_at ASC
    `;

    messagesByReportId.set(
      row.id,
      messageRows.map((message) => ({
        id: message.id,
        body: message.body,
        authorId: message.author_id,
        authorName: message.author_name,
        authorRole: message.author_role,
        createdAt: message.created_at.toISOString(),
      })),
    );
  }

  return rows.map((row) => {
    const messages = messagesByReportId.get(row.id) ?? [];
    const legacyMessages = messages.length > 0
      ? messages
      : [
          ...(row.description
            ? [{
                id: `${row.id}-legacy-author`,
                body: row.description,
                authorId: row.author_uid,
                authorName: row.author_name,
                authorRole: "tester" as const,
                createdAt: row.timestamp.toISOString(),
              }]
            : []),
          ...(row.admin_notes
            ? [{
                id: `${row.id}-legacy-admin`,
                body: row.admin_notes,
                authorId: "admin-summary",
                authorName: "Admin",
                authorRole: "admin" as const,
                createdAt: row.updated_at.toISOString(),
              }]
            : []),
        ];

    return {
      id: row.id,
      timestamp: row.timestamp.getTime(),
      updatedAt: row.updated_at.toISOString(),
      image: resolveImageSource(row.image),
      annotatedImage: resolveImageSource(row.annotated_image),
      video: resolveImageSource(row.video),
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      adminNotes: row.admin_notes,
      authorUid: row.author_uid,
      authorName: row.author_name,
      gameTitle: row.game_title,
      gameUrl: row.game_url,
      messages: legacyMessages,
    };
  });
}

export async function loadReportOwner(reportId: string): Promise<{ author_id: string } | null> {
  return db.queryRow<{ author_id: string }>`
    SELECT author_id
    FROM reports
    WHERE id = ${reportId}
  `;
}

export async function ensureReportWritableForRequest(req: IncomingMessage, reportId: string) {
  const auth = await requireSession(req);
  const report = await loadReportOwner(reportId);
  if (!report) {
    throw APIError.notFound("Report not found.");
  }

  if (report.author_id !== auth.userID && auth.role !== "admin") {
    throw APIError.permissionDenied("You cannot modify this report.");
  }

  return auth;
}

export async function listActiveTesters(currentUserId: string): Promise<ActiveTester[]> {
  const rows = await db.queryAll<{ id: string; name: string }>`
    SELECT DISTINCT u.id, u.name
    FROM users u
    JOIN sessions s ON s.user_id = u.id
    WHERE u.id <> ${currentUserId}
      AND s.expires_at > NOW()
      AND s.last_seen > NOW() - INTERVAL '15 minutes'
    ORDER BY u.name ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: "online",
  }));
}

export async function startGameSession(userId: string, gameId: string) {
  const game = await db.queryRow<{ id: string }>`
    SELECT id
    FROM games
    WHERE id = ${gameId}
    LIMIT 1
  `;

  if (!game) {
    throw APIError.notFound("Game not found.");
  }

  await db.exec`
    UPDATE game_sessions
    SET ended_at = NOW(), last_seen = NOW()
    WHERE user_id = ${userId}
      AND ended_at IS NULL
      AND game_id <> ${gameId}
  `;

  const existing = await db.queryRow<GameSessionRow>`
    SELECT id, game_id, started_at
    FROM game_sessions
    WHERE user_id = ${userId}
      AND game_id = ${gameId}
      AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `;

  if (existing) {
    await db.exec`
      UPDATE game_sessions
      SET last_seen = NOW()
      WHERE id = ${existing.id}
    `;

    return {
      id: existing.id,
      gameId: existing.game_id,
      startedAt: existing.started_at.toISOString(),
    };
  }

  const id = randomUUID();
  const row = await db.queryRow<GameSessionRow>`
    INSERT INTO game_sessions (id, user_id, game_id)
    VALUES (${id}, ${userId}, ${gameId})
    RETURNING id, game_id, started_at
  `;

  if (!row) {
    throw APIError.internal("Game session could not be created.");
  }

  return {
    id: row.id,
    gameId: row.game_id,
    startedAt: row.started_at.toISOString(),
  };
}

export async function heartbeatGameSession(userId: string, sessionId: string) {
  const row = await db.queryRow<{ id: string; game_id: string; started_at: Date }>`
    UPDATE game_sessions
    SET last_seen = NOW()
    WHERE id = ${sessionId}
      AND user_id = ${userId}
      AND ended_at IS NULL
    RETURNING id, game_id, started_at
  `;

  if (!row) {
    throw APIError.notFound("Game session not found.");
  }

  return {
    id: row.id,
    gameId: row.game_id,
    startedAt: row.started_at.toISOString(),
  };
}

export async function endGameSession(userId: string, sessionId: string) {
  const row = await db.queryRow<{ id: string; game_id: string; started_at: Date; ended_at: Date }>`
    UPDATE game_sessions
    SET ended_at = NOW(), last_seen = NOW()
    WHERE id = ${sessionId}
      AND user_id = ${userId}
      AND ended_at IS NULL
    RETURNING id, game_id, started_at, ended_at
  `;

  if (!row) {
    throw APIError.notFound("Game session not found.");
  }

  return {
    id: row.id,
    gameId: row.game_id,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at.toISOString(),
  };
}

export async function listTesterInsights(): Promise<TesterInsight[]> {
  const insightRows = await db.queryAll<TesterInsightRow>`
    WITH session_rollups AS (
      SELECT
        gs.user_id,
        COUNT(*)::int AS total_sessions,
        COUNT(DISTINCT gs.game_id)::int AS games_played_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(gs.ended_at, gs.last_seen) - gs.started_at))), 0)::int AS total_play_seconds,
        CASE
          WHEN COUNT(*) = 0 THEN NULL
          ELSE AVG(EXTRACT(EPOCH FROM (COALESCE(gs.ended_at, gs.last_seen) - gs.started_at)))::int
        END AS avg_session_seconds,
        MAX(COALESCE(gs.ended_at, gs.last_seen)) AS last_played_at
      FROM game_sessions gs
      GROUP BY gs.user_id
    ),
    report_rollups AS (
      SELECT
        r.author_id,
        COUNT(*)::int AS total_reports,
        COUNT(*) FILTER (WHERE r.status = 'fixed')::int AS fixed_reports,
        COUNT(*) FILTER (WHERE r.status = 'open')::int AS open_reports,
        COUNT(*) FILTER (WHERE r.status = 'pending')::int AS pending_reports,
        COUNT(*) FILTER (WHERE r.priority = 'high' AND r.status <> 'fixed')::int AS high_priority_reports
      FROM reports r
      GROUP BY r.author_id
    ),
    current_sessions AS (
      SELECT DISTINCT ON (gs.user_id)
        gs.user_id,
        g.title AS game_title,
        gs.started_at
      FROM game_sessions gs
      JOIN games g ON g.id = gs.game_id
      WHERE gs.ended_at IS NULL
        AND gs.last_seen > NOW() - INTERVAL '2 minutes'
      ORDER BY gs.user_id, gs.started_at DESC
    )
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.last_seen,
      (u.last_seen > NOW() - INTERVAL '15 minutes') AS is_online,
      COALESCE(rr.total_reports, 0) AS total_reports,
      COALESCE(rr.fixed_reports, 0) AS fixed_reports,
      COALESCE(rr.open_reports, 0) AS open_reports,
      COALESCE(rr.pending_reports, 0) AS pending_reports,
      COALESCE(rr.high_priority_reports, 0) AS high_priority_reports,
      COALESCE(sr.total_sessions, 0) AS total_sessions,
      COALESCE(sr.games_played_count, 0) AS games_played_count,
      COALESCE(sr.total_play_seconds, 0) AS total_play_seconds,
      sr.avg_session_seconds,
      sr.last_played_at,
      cs.game_title AS current_game_title,
      cs.started_at AS current_session_started_at
    FROM users u
    LEFT JOIN session_rollups sr ON sr.user_id = u.id
    LEFT JOIN report_rollups rr ON rr.author_id = u.id
    LEFT JOIN current_sessions cs ON cs.user_id = u.id
    WHERE u.role = 'tester'
    ORDER BY
      (u.last_seen > NOW() - INTERVAL '15 minutes') DESC,
      COALESCE(sr.total_play_seconds, 0) DESC,
      u.name ASC
  `;

  const gameRows = await db.queryAll<TesterGameStatRow>`
    WITH session_rollups AS (
      SELECT
        gs.user_id,
        gs.game_id,
        COUNT(*)::int AS session_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(gs.ended_at, gs.last_seen) - gs.started_at))), 0)::int AS total_play_seconds,
        MAX(COALESCE(gs.ended_at, gs.last_seen)) AS last_played_at
      FROM game_sessions gs
      GROUP BY gs.user_id, gs.game_id
    ),
    report_rollups AS (
      SELECT
        r.author_id AS user_id,
        g.id AS game_id,
        COUNT(r.id)::int AS reports_filed
      FROM reports r
      JOIN games g
        ON (r.game_url IS NOT NULL AND r.game_url = g.url)
        OR (r.game_title IS NOT NULL AND r.game_title = g.title)
      GROUP BY r.author_id, g.id
    )
    SELECT
      sr.user_id,
      g.id AS game_id,
      g.title AS game_title,
      g.url AS game_url,
      sr.session_count,
      sr.total_play_seconds,
      COALESCE(rr.reports_filed, 0) AS reports_filed,
      sr.last_played_at
    FROM session_rollups sr
    JOIN games g ON g.id = sr.game_id
    LEFT JOIN report_rollups rr ON rr.user_id = sr.user_id AND rr.game_id = sr.game_id
    ORDER BY sr.total_play_seconds DESC, sr.last_played_at DESC NULLS LAST
  `;

  const gamesByUserId = new Map<string, TesterGameStat[]>();
  for (const row of gameRows) {
    const game: TesterGameStat = {
      gameId: row.game_id,
      gameTitle: row.game_title,
      gameUrl: row.game_url,
      sessionCount: row.session_count,
      totalPlaySeconds: row.total_play_seconds,
      reportsFiled: row.reports_filed,
      lastPlayedAt: row.last_played_at?.toISOString() ?? null,
    };

    const current = gamesByUserId.get(row.user_id) ?? [];
    current.push(game);
    gamesByUserId.set(row.user_id, current);
  }

  return insightRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    lastSeen: row.last_seen.toISOString(),
    isOnline: row.is_online,
    totalReports: row.total_reports,
    fixedReports: row.fixed_reports,
    openReports: row.open_reports,
    pendingReports: row.pending_reports,
    highPriorityReports: row.high_priority_reports,
    totalSessions: row.total_sessions,
    gamesPlayedCount: row.games_played_count,
    totalPlaySeconds: row.total_play_seconds,
    avgSessionSeconds: row.avg_session_seconds,
    lastPlayedAt: row.last_played_at?.toISOString() ?? null,
    currentGameTitle: row.current_game_title,
    currentSessionStartedAt: row.current_session_started_at?.toISOString() ?? null,
    games: gamesByUserId.get(row.id) ?? [],
  }));
}

export function assertValidEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw APIError.invalidArgument("A valid email address is required.");
  }
  return normalized;
}

export function assertNonEmpty(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw APIError.invalidArgument(`${field} is required.`);
  }
  return trimmed;
}

export async function appendReportMessage(input: {
  reportId: string;
  authorId: string;
  authorName: string;
  authorRole: "admin" | "tester";
  body: string;
}) {
  const id = randomUUID();
  const trimmedBody = assertNonEmpty(input.body, "Message");
  await db.exec`
    INSERT INTO report_messages (id, report_id, author_id, author_name, author_role, body)
    VALUES (${id}, ${input.reportId}, ${input.authorId}, ${input.authorName}, ${input.authorRole}, ${trimmedBody})
  `;

  await db.exec`
    UPDATE reports
    SET updated_at = NOW(), admin_notes = CASE WHEN ${input.authorRole} = 'admin' THEN ${trimmedBody} ELSE admin_notes END
    WHERE id = ${input.reportId}
  `;

  return id;
}
