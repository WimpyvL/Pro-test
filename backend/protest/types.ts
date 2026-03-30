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

export interface GameRecord {
  id: string;
  title: string;
  url: string;
  description: string;
  thumbnail: string | null;
  createdAt: string;
}

export interface ReportMessageRecord {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  authorRole: ReportMessageAuthorRole;
  createdAt: string;
}

export interface ReportRecord {
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
  messages: ReportMessageRecord[];
}
