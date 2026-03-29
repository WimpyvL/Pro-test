import { randomUUID } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";

import { createClerkClient, verifyToken } from "@clerk/backend";
import { APIError } from "encore.dev/api";

import { db } from "./db";
import { resolveImageSource } from "./storage";
import type {
  ActiveTester,
  GameRecord,
  ReportPriority,
  ReportRecord,
  UserProfile,
  UserRole,
} from "./types";

const SESSION_COOKIE_NAME = "protest_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

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
  image: string;
  annotated_image: string | null;
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

export interface SessionAuth {
  userID: string;
  email: string;
  name: string;
  role: "admin" | "tester";
}

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkClient = clerkSecretKey ? createClerkClient({ secretKey: clerkSecretKey }) : null;

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

function resolveCorsOrigin(origin: string | undefined) {
  if (!origin || corsAllowedOrigins.length === 0) {
    return null;
  }

  if (corsAllowedOrigins.includes("*")) {
    return "*";
  }

  return corsAllowedOrigins.includes(origin) ? origin : null;
}

export function applyCorsHeaders(req: IncomingMessage, resp: ServerResponse) {
  const originHeader = req.headers.origin;
  const allowedOrigin = resolveCorsOrigin(Array.isArray(originHeader) ? originHeader[0] : originHeader);
  if (!allowedOrigin) {
    return false;
  }

  resp.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  resp.setHeader("Vary", "Origin");
  resp.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  resp.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  resp.setHeader("Access-Control-Max-Age", "86400");
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
  if (!clerkSecretKey || !clerkClient) {
    throw APIError.failedPrecondition("CLERK_SECRET_KEY is not configured.");
  }

  const token = await resolveBearerToken(req);
  if (!token) {
    throw APIError.unauthenticated("Authentication required.");
  }

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

  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp.getTime(),
    updatedAt: row.updated_at.toISOString(),
    image: resolveImageSource(row.image) ?? "",
    annotatedImage: resolveImageSource(row.annotated_image),
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    adminNotes: row.admin_notes,
    authorUid: row.author_uid,
    authorName: row.author_name,
    gameTitle: row.game_title,
    gameUrl: row.game_url,
  }));
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
