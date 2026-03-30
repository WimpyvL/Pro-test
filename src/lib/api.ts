export type UserRole = "admin" | "tester";
export type ReportStatus = "open" | "pending" | "fixed";
export type ReportPriority = "low" | "medium" | "high";
export type ReportMessageAuthorRole = "admin" | "tester";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  photoURL: string | null;
  lastSeen: string;
  stats: {
    totalReports: number;
    fixedReports: number;
  };
}

export interface ActiveTester {
  id: string;
  name: string;
  status: "online";
}

export interface TesterGameStat {
  gameId: string;
  gameTitle: string;
  gameUrl: string;
  sessionCount: number;
  totalPlaySeconds: number;
  reportsFiled: number;
  lastPlayedAt: string | null;
}

export interface TesterInsight {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastSeen: string;
  isOnline: boolean;
  totalReports: number;
  fixedReports: number;
  openReports: number;
  pendingReports: number;
  highPriorityReports: number;
  totalSessions: number;
  gamesPlayedCount: number;
  totalPlaySeconds: number;
  avgSessionSeconds: number | null;
  lastPlayedAt: string | null;
  currentGameTitle: string | null;
  currentSessionStartedAt: string | null;
  games: TesterGameStat[];
}

export interface GameSession {
  id: string;
  gameId: string;
  startedAt: string;
}

export interface Game {
  id: string;
  title: string;
  url: string;
  description: string;
  thumbnail: string | null;
  createdAt: string;
}

export interface ReportMessage {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  authorRole: ReportMessageAuthorRole;
  createdAt: string;
}

export interface BugReport {
  id: string;
  timestamp: number;
  updatedAt: string;
  image: string | null;
  annotatedImage: string | null;
  video: string | null;
  title: string;
  description: string;
  status: ReportStatus;
  priority: ReportPriority;
  adminNotes: string;
  authorUid: string;
  authorName: string;
  gameTitle: string | null;
  gameUrl: string | null;
  messages: ReportMessage[];
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const baseUrl = configuredBaseUrl ? configuredBaseUrl.replace(/\/$/, "") : "";
let authTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: (() => Promise<string | null>) | null) {
  authTokenGetter = getter;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authTokenGetter ? await authTokenGetter() : null;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Request failed.");
  }

  return payload as T;
}

export const backend = {
  me: () => apiFetch<{ user: UserProfile }>("/auth/me"),
  activeTesters: () => apiFetch<{ testers: ActiveTester[] }>("/admin/active-testers"),
  listTesterInsights: () => apiFetch<{ testers: TesterInsight[] }>("/admin/tester-insights"),
  listGames: () => apiFetch<{ games: Game[] }>("/games"),
  createGame: (body: { title: string; url: string; description?: string; thumbnail?: string | null }) =>
    apiFetch<{ game: Game }>("/games", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteGame: (gameId: string) =>
    apiFetch<void>(`/games/${gameId}`, {
      method: "DELETE",
    }),
  listReports: () => apiFetch<{ reports: BugReport[] }>("/reports"),
  createReport: (body: {
    image?: string | null;
    annotatedImage?: string | null;
    video?: string | null;
    title: string;
    description?: string;
    gameTitle?: string | null;
    gameUrl?: string | null;
  }) =>
    apiFetch<{ report: BugReport }>("/reports", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateReport: (
    reportId: string,
    body: {
      title?: string;
      description?: string;
      status?: ReportStatus;
      priority?: ReportPriority;
      adminNotes?: string;
      annotatedImage?: string | null;
    },
  ) =>
    apiFetch<{ report: BugReport }>(`/reports/${reportId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  createReportMessage: (reportId: string, body: { body: string }) =>
    apiFetch<{ report: BugReport }>(`/reports/${reportId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startGameSession: (body: { gameId: string }) =>
    apiFetch<{ session: GameSession }>("/game-sessions/start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  heartbeatGameSession: (sessionId: string) =>
    apiFetch<{ session: GameSession }>(`/game-sessions/${sessionId}/heartbeat`, {
      method: "POST",
    }),
  endGameSession: (sessionId: string) =>
    apiFetch<{ session: GameSession }>(`/game-sessions/${sessionId}/end`, {
      method: "POST",
    }),
  deleteReport: (reportId: string) =>
    apiFetch<void>(`/reports/${reportId}`, {
      method: "DELETE",
    }),
};
