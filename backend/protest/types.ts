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

export interface GameRecord {
  id: string;
  title: string;
  url: string;
  description: string;
  thumbnail: string | null;
  createdAt: string;
}

export interface ReportRecord {
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
