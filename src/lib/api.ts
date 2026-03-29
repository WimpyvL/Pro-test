export type UserRole = "admin" | "tester";
export type ReportStatus = "open" | "pending" | "fixed";
export type ReportPriority = "low" | "medium" | "high";

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

export interface Game {
  id: string;
  title: string;
  url: string;
  description: string;
  thumbnail: string | null;
  createdAt: string;
}

export interface BugReport {
  id: string;
  timestamp: number;
  updatedAt: string;
  image: string;
  annotatedImage: string | null;
  title: string;
  description: string;
  status: ReportStatus;
  priority: ReportPriority;
  adminNotes: string;
  authorUid: string;
  authorName: string;
  gameTitle: string | null;
  gameUrl: string | null;
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
    image: string;
    annotatedImage?: string | null;
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
  deleteReport: (reportId: string) =>
    apiFetch<void>(`/reports/${reportId}`, {
      method: "DELETE",
    }),
};
