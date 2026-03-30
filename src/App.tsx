import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Activity, BarChart3, Bug, Clock3, Gamepad2, Loader2, MessageSquareText, Plus, Trash2, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SignIn, UserButton, useAuth, useClerk, useUser } from "@clerk/clerk-react";

import GameTester from "./components/GameTester";
import Sidebar from "./components/Sidebar";
import { backend, setAuthTokenGetter, type ActiveTester, type BugReport, type Game, type ReportPriority, type TesterInsight, type UserProfile } from "./lib/api";
import { type UiPreferences, useUiPreferences } from "./lib/useUiPreferences";
import { cn } from "./lib/utils";

type View = "dashboard" | "games" | "testing" | "settings" | "admin-management" | "admin-analytics";

interface GameMetric {
  totalReports: number;
  openReports: number;
  pendingReports: number;
  fixedReports: number;
  highPriorityReports: number;
  resolutionRate: number;
  lastReportedAt: number | null;
  avgFixHours: number | null;
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const appBasePath = (import.meta.env.VITE_APP_BASE_PATH ?? "").replace(/\/$/, "");
const appHomeUrl = appBasePath ? `${appBasePath}/` : "/";

export default function App() {
  if (!clerkPublishableKey) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 p-4 text-white sm:p-6">
        <div className="w-full max-w-lg rounded-[32px] border border-zinc-800 bg-zinc-900/70 p-8 shadow-2xl">
          <h1 className="mb-4 text-3xl font-bold">Clerk is not configured</h1>
          <p className="text-sm text-zinc-400">
            Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> for the frontend and <code>CLERK_SECRET_KEY</code> for the Encore backend.
          </p>
        </div>
      </div>
    );
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { preferences, setPreferences, accentStyle, accentSoftStyle } = useUiPreferences();
  const [sessionUser, setSessionUser] = useState<UserProfile | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [reports, setReports] = useState<BugReport[]>([]);
  const [activeTesters, setActiveTesters] = useState<ActiveTester[]>([]);
  const [testerInsights, setTesterInsights] = useState<TesterInsight[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(preferences.sidebarDefaultOpen);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    setAuthTokenGetter(isSignedIn ? () => getToken() : null);
    return () => setAuthTokenGetter(null);
  }, [getToken, isLoaded, isSignedIn]);

  async function refreshSession() {
    if (!isSignedIn) {
      setSessionUser(null);
      setGames([]);
      setReports([]);
      setActiveTesters([]);
      setTesterInsights([]);
      return;
    }

    const [{ user: profile }, gamesResponse, reportsResponse] = await Promise.all([
      backend.me(),
      backend.listGames(),
      backend.listReports(),
    ]);

    setSessionUser(profile);
    setGames(gamesResponse.games);
    setReports(reportsResponse.reports);

    if (profile.role === "admin") {
      const [{ testers }, { testers: insights }] = await Promise.all([
        backend.activeTesters(),
        backend.listTesterInsights(),
      ]);
      setActiveTesters(testers);
      setTesterInsights(insights);
    } else {
      setActiveTesters([]);
      setTesterInsights([]);
    }
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }
    void refreshSession();
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!sessionUser || sessionUser.role !== "admin") {
      return;
    }

    const timer = window.setInterval(() => {
      void Promise.all([backend.activeTesters(), backend.listTesterInsights()])
        .then(([{ testers }, { testers: insights }]) => {
          setActiveTesters(testers);
          setTesterInsights(insights);
        })
        .catch(() => undefined);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [sessionUser]);

  const myReports = useMemo(() => reports.filter((report) => report.authorUid === sessionUser?.id), [reports, sessionUser?.id]);
  const recentActivity = [...myReports].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6);
  const gameMetrics = useMemo(() => buildGameMetrics(games, reports), [games, reports]);

  useEffect(() => {
    setIsSidebarOpen((current) => (current === preferences.sidebarDefaultOpen ? current : preferences.sidebarDefaultOpen));
  }, [preferences.sidebarDefaultOpen]);

  async function refreshProfile() {
    const { user: profile } = await backend.me();
    setSessionUser(profile);
  }

  async function handleAddGame(newGame: { title: string; url: string; description: string }) {
    const { game } = await backend.createGame(newGame);
    setGames((current) => [game, ...current]);
  }

  async function handleDeleteGame(id: string) {
    await backend.deleteGame(id);
    setGames((current) => current.filter((game) => game.id !== id));
    if (selectedGame?.id === id) {
      setSelectedGame(null);
      setActiveView("games");
    }
  }

  async function handleCreateReport(input: {
    image?: string | null;
    annotatedImage: string | null;
    video?: string | null;
    title: string;
    description: string;
    gameTitle?: string | null;
    gameUrl?: string | null;
  }) {
    const { report } = await backend.createReport(input);
    setReports((current) => [report, ...current]);
    await refreshProfile();
    return report;
  }

  async function handleUpdateReport(
    reportId: string,
    updates: { title?: string; description?: string; status?: "open" | "pending" | "fixed"; priority?: ReportPriority; adminNotes?: string; annotatedImage?: string | null },
  ) {
    const { report } = await backend.updateReport(reportId, updates);
    setReports((current) => current.map((entry) => (entry.id === report.id ? report : entry)));
    await refreshProfile();
    return report;
  }

  async function handleDeleteReport(reportId: string) {
    await backend.deleteReport(reportId);
    setReports((current) => current.filter((entry) => entry.id !== reportId));
    await refreshProfile();
  }

  async function handleCreateReportMessage(reportId: string, body: string) {
    const { report } = await backend.createReportMessage(reportId, { body });
    setReports((current) => current.map((entry) => (entry.id === report.id ? report : entry)));
    await refreshProfile();
    return report;
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950">
        <Loader2 className="animate-spin text-orange-500" size={48} />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 p-4 text-white sm:p-6">
        <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Tester Pro</h1>
            <p className="mt-2 text-sm text-zinc-500">Clerk now owns sign-in. Backend auth comes from verified Clerk tokens.</p>
          </div>
          <SignIn
            routing="hash"
            fallbackRedirectUrl={appHomeUrl}
            appearance={{
              variables: {
                colorPrimary: "#ea580c",
                colorBackground: "#09090b",
                colorInputBackground: "#18181b",
                colorInputText: "#fafafa",
                colorText: "#fafafa",
              },
            }}
          />
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950">
        <Loader2 className="animate-spin text-orange-500" size={48} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] w-full overflow-hidden bg-zinc-950 text-white">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((current) => !current)}
        user={{
          ...sessionUser,
          photoURL: user?.imageUrl ?? sessionUser.photoURL,
        }}
        activeTesters={activeTesters}
        onLogout={() => void signOut({ redirectUrl: appHomeUrl })}
        activeView={activeView}
        accentStyle={accentStyle}
        accentSoftStyle={accentSoftStyle}
        onViewChange={(view) => {
          setActiveView(view as View);
          if (view !== "testing") {
            setSelectedGame(null);
          }
        }}
      />

      <main className="relative flex-1 overflow-hidden">
        <div className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6">
          <UserButton afterSignOutUrl={appHomeUrl} />
        </div>
        <AnimatePresence mode="wait">
          {activeView === "dashboard" && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full overflow-y-auto p-4 pt-20 sm:p-8 sm:pt-8">
              <TesterDashboard reports={recentActivity} allReports={myReports} />
            </motion.div>
          )}
          {activeView === "admin-management" && sessionUser.role === "admin" && (
            <motion.div key="admin-management" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full overflow-y-auto p-4 pt-20 sm:p-8 sm:pt-8">
              <AdminDashboard activeTesters={activeTesters} testerInsights={testerInsights} games={games} bugs={reports} gameMetrics={gameMetrics} initialTab="management" onAddGame={handleAddGame} onDeleteGame={handleDeleteGame} onUpdateReport={handleUpdateReport} onCreateReportMessage={handleCreateReportMessage} />
            </motion.div>
          )}
          {activeView === "admin-analytics" && sessionUser.role === "admin" && (
            <motion.div key="admin-analytics" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full overflow-y-auto p-4 pt-20 sm:p-8 sm:pt-8">
              <AdminDashboard activeTesters={activeTesters} testerInsights={testerInsights} games={games} bugs={reports} gameMetrics={gameMetrics} initialTab="analytics" onAddGame={handleAddGame} onDeleteGame={handleDeleteGame} onUpdateReport={handleUpdateReport} onCreateReportMessage={handleCreateReportMessage} />
            </motion.div>
          )}
          {activeView === "games" && (
            <motion.div key="games" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full overflow-y-auto p-4 pt-20 sm:p-8 sm:pt-8">
              <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold sm:text-3xl">Available Games</h1>
                {sessionUser.role === "admin" && <button onClick={() => setActiveView("admin-management")} className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-zinc-800 sm:px-6"><Plus size={18} />Manage Games</button>}
              </div>
              <GameList games={games} gameMetrics={gameMetrics} accentSoftStyle={accentSoftStyle} onSelectGame={(game) => { setSelectedGame(game); setActiveView("testing"); setIsSidebarOpen(false); }} />
            </motion.div>
          )}
          {activeView === "testing" && selectedGame && (
            <motion.div key="testing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <GameTester currentUser={sessionUser} initialGame={selectedGame} reports={reports} onCreateReport={handleCreateReport} onDeleteReport={handleDeleteReport} onUpdateReport={handleUpdateReport} onCreateReportMessage={handleCreateReportMessage} />
            </motion.div>
          )}
          {activeView === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full overflow-y-auto p-4 pt-20 sm:p-8 sm:pt-8">
              <PersonalizationPanel user={sessionUser} preferences={preferences} setPreferences={setPreferences} accentStyle={accentStyle} accentSoftStyle={accentSoftStyle} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function GameList({ games, gameMetrics, accentSoftStyle, onSelectGame }: { games: Game[]; gameMetrics: Record<string, GameMetric>; accentSoftStyle: React.CSSProperties; onSelectGame: (game: Game) => void }) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {games.map((game) => {
        const metrics = gameMetrics[game.id] ?? emptyGameMetric();
        return (
          <motion.div key={game.id} whileHover={{ y: -5 }} onClick={() => onSelectGame(game)} className="group cursor-pointer overflow-hidden rounded-[28px] border border-zinc-800 tp-panel sm:rounded-[32px]">
            <div className="relative aspect-video bg-zinc-800">
              {game.thumbnail ? <img src={game.thumbnail} alt={game.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-zinc-700"><Gamepad2 size={48} /></div>}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"><button className="rounded-full px-5 py-2 text-sm font-bold text-white sm:px-6" style={{ backgroundColor: "var(--tp-accent-strong)" }}>Start Testing</button></div>
            </div>
            <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="mb-1 text-lg font-bold sm:text-xl">{game.title}</h3>
                  <p className="line-clamp-2 text-sm text-zinc-500">{game.description}</p>
                </div>
                <span className="w-fit rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest" style={accentSoftStyle}>
                  {metrics.totalReports} reports
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricTile label="Open" value={metrics.openReports} accent="text-red-400" />
                <MetricTile label="Pending" value={metrics.pendingReports} accent="text-amber-400" />
                <MetricTile label="Fixed" value={metrics.fixedReports} accent="text-green-500" />
                <MetricTile label="Resolve %" value={`${metrics.resolutionRate}%`} accent="text-cyan-400" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <InlineInsight label="High Priority" value={metrics.highPriorityReports} />
                <InlineInsight label="Last Activity" value={formatRelativeTimestamp(metrics.lastReportedAt)} />
                <InlineInsight label="Avg Fix Time" value={formatFixHours(metrics.avgFixHours)} />
              </div>
              <p className="truncate text-xs text-zinc-600">{game.url}</p>
            </div>
          </motion.div>
        );
      })}
      {games.length === 0 && <div className="col-span-full py-20 text-center text-zinc-600">No games available yet.</div>}
    </div>
  );
}

function TesterDashboard({ reports, allReports }: { reports: BugReport[]; allReports: BugReport[] }) {
  const openCount = allReports.filter((report) => report.status === "open").length;
  const pendingCount = allReports.filter((report) => report.status === "pending").length;
  const fixedCount = allReports.filter((report) => report.status === "fixed").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Tester Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Track what you filed, what is being worked on, and what the admin sent back.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <AnalyticsCard icon={<Bug size={20} />} label="Open Reports" value={openCount} accent="text-red-400" />
        <AnalyticsCard icon={<Clock3 size={20} />} label="In Review" value={pendingCount} accent="text-amber-400" />
        <AnalyticsCard icon={<Activity size={20} />} label="Fixed" value={fixedCount} accent="text-green-500" />
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-4 sm:rounded-[32px] sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-orange-600/10 p-3 text-orange-500"><MessageSquareText size={20} /></div>
            <div>
              <h2 className="text-xl font-bold">Feedback Loop</h2>
              <p className="text-sm text-zinc-500">Every report shows current status, priority, and admin response.</p>
            </div>
          </div>

          {reports.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/70 p-10 text-center text-zinc-500">
              No reports yet. File one from the tester flow and it will show up here.
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-bold">{report.title}</h3>
                    <StatusBadge status={report.status} />
                    <PriorityBadge priority={report.priority} />
                  </div>
                  <p className="mb-3 text-sm text-zinc-400">{report.gameTitle || "Unlinked game"}</p>
                  <p className="mb-4 text-sm leading-relaxed text-zinc-300">{report.description || "No tester description provided yet."}</p>
                  <div className="rounded-2xl border border-orange-600/20 bg-orange-600/5 p-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orange-400">Admin Response</p>
                    <p className="text-sm leading-relaxed text-zinc-300">{report.adminNotes || "No feedback from admin yet."}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                    <span>Filed {new Date(report.timestamp).toLocaleString()}</span>
                    <span>Updated {new Date(report.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-4 sm:rounded-[32px] sm:p-6">
          <h2 className="mb-6 text-xl font-bold">What Needs Your Attention</h2>
          <div className="space-y-3">
            {allReports.filter((report) => report.status !== "fixed").slice(0, 5).map((report) => (
              <div key={report.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-bold">{report.title}</p>
                  <StatusBadge status={report.status} />
                </div>
                <p className="text-xs text-zinc-500">{report.adminNotes || "Waiting for admin triage."}</p>
              </div>
            ))}
            {allReports.every((report) => report.status === "fixed") && allReports.length > 0 && (
              <div className="rounded-2xl border border-green-500/20 bg-green-500/5 px-4 py-6 text-sm text-green-300">
                Everything you filed is currently marked fixed.
              </div>
            )}
            {allReports.length === 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-6 text-sm text-zinc-500">
                Nothing here yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({ activeTesters, testerInsights, games, bugs, gameMetrics, initialTab, onAddGame, onDeleteGame, onUpdateReport, onCreateReportMessage }: { activeTesters: ActiveTester[]; testerInsights: TesterInsight[]; games: Game[]; bugs: BugReport[]; gameMetrics: Record<string, GameMetric>; initialTab: "management" | "analytics"; onAddGame: (game: { title: string; url: string; description: string }) => Promise<void>; onDeleteGame: (gameId: string) => Promise<void>; onUpdateReport: (reportId: string, updates: { title?: string; description?: string; status?: "open" | "pending" | "fixed"; priority?: ReportPriority; adminNotes?: string; annotatedImage?: string | null }) => Promise<BugReport>; onCreateReportMessage: (reportId: string, body: string) => Promise<BugReport>; }) {
  const [newGame, setNewGame] = useState({ title: "", url: "", description: "" });
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingGame, setIsSavingGame] = useState(false);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(bugs[0]?.id ?? null);
  const [selectedTesterId, setSelectedTesterId] = useState<string | null>(testerInsights[0]?.id ?? null);
  const [draftAdminNotes, setDraftAdminNotes] = useState("");
  const [draftReply, setDraftReply] = useState("");
  const [isSavingBug, setIsSavingBug] = useState(false);
  const activeTab = initialTab;
  const selectedBug = bugs.find((bug) => bug.id === selectedBugId) ?? bugs[0] ?? null;
  const selectedTester = testerInsights.find((tester) => tester.id === selectedTesterId) ?? testerInsights[0] ?? null;
  const intakeBugs = [...bugs].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const statusData = [{ name: "Open", value: bugs.filter((bug) => bug.status === "open").length, color: "#ef4444" }, { name: "Pending", value: bugs.filter((bug) => bug.status === "pending").length, color: "#f59e0b" }, { name: "Fixed", value: bugs.filter((bug) => bug.status === "fixed").length, color: "#10b981" }].filter((entry) => entry.value > 0);
  const bugsByDate = bugs.reduce<Record<string, number>>((acc, bug) => { const date = new Date(bug.timestamp).toLocaleDateString(); acc[date] = (acc[date] || 0) + 1; return acc; }, {});
  const timelineData = Object.entries(bugsByDate).map(([date, count]) => ({ date, count })).slice(-7);
  const topTestersData = testerInsights
    .map((tester) => ({ name: tester.name, count: Math.round(tester.totalPlaySeconds / 60) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const avgFixHours = average(Object.values(gameMetrics), (metric) => metric.avgFixHours ?? 0, (metric) => metric.avgFixHours !== null);
  const highPriorityOpen = bugs.filter((bug) => bug.priority === "high" && bug.status !== "fixed").length;
  const staleBacklog = bugs.filter((bug) => bug.status !== "fixed" && Date.now() - bug.timestamp > 1000 * 60 * 60 * 48).length;
  const gameHealthData = games.map((game) => ({ name: game.title, open: gameMetrics[game.id]?.openReports ?? 0, fixed: gameMetrics[game.id]?.fixedReports ?? 0, total: gameMetrics[game.id]?.totalReports ?? 0, avgFixHours: gameMetrics[game.id]?.avgFixHours ?? 0 })).sort((a, b) => b.total - a.total);
  const totalPlaySeconds = testerInsights.reduce((total, tester) => total + tester.totalPlaySeconds, 0);
  const avgSessionSeconds = average(testerInsights, (tester) => tester.avgSessionSeconds ?? 0, (tester) => tester.avgSessionSeconds !== null);
  const onlineTesterCount = testerInsights.filter((tester) => tester.isOnline).length;
  useEffect(() => {
    if (!selectedBugId && bugs[0]) {
      setSelectedBugId(bugs[0].id);
    }
  }, [bugs, selectedBugId]);
  useEffect(() => {
    if (!selectedTesterId && testerInsights[0]) {
      setSelectedTesterId(testerInsights[0].id);
    }
  }, [selectedTesterId, testerInsights]);
  useEffect(() => {
    setDraftAdminNotes(selectedBug?.adminNotes ?? "");
    setDraftReply("");
  }, [selectedBug?.adminNotes, selectedBug?.id]);
  async function submitGame(e: React.FormEvent) { e.preventDefault(); setIsSavingGame(true); try { await onAddGame(newGame); setNewGame({ title: "", url: "", description: "" }); setIsAdding(false); } finally { setIsSavingGame(false); } }
  async function saveBugUpdates(updates: { status?: "open" | "pending" | "fixed"; priority?: ReportPriority; adminNotes?: string }) {
    if (!selectedBug) {
      return;
    }
    setIsSavingBug(true);
    try {
      const report = await onUpdateReport(selectedBug.id, updates);
      setSelectedBugId(report.id);
      setDraftAdminNotes(report.adminNotes);
    } finally {
      setIsSavingBug(false);
    }
  }
  async function sendBugReply() {
    if (!selectedBug || !draftReply.trim()) {
      return;
    }
    setIsSavingBug(true);
    try {
      const report = await onCreateReportMessage(selectedBug.id, draftReply);
      setSelectedBugId(report.id);
      setDraftReply("");
      setDraftAdminNotes(report.adminNotes);
    } finally {
      setIsSavingBug(false);
    }
  }
  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-bold sm:text-3xl">{activeTab === "management" ? "Game Management" : "System Analytics"}</h1><p className="mt-1 text-sm text-zinc-500">{activeTab === "management" ? "Manage games and watch live tester activity." : "Real metrics from the Encore-backed reporting pipeline."}</p></div>
      {activeTab === "management" ? (
        <div className="space-y-12">
          <section className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold">Bug Inbox</h2>
                <p className="text-sm text-zinc-500">Triage reports, set priority, and send feedback back to the tester.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:flex">
                <AnalyticsCard icon={<Bug size={20} />} label="Open" value={bugs.filter((bug) => bug.status === "open").length} accent="text-red-400" />
                <AnalyticsCard icon={<Clock3 size={20} />} label="Pending" value={bugs.filter((bug) => bug.status === "pending").length} accent="text-amber-400" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.35fr]">
              <div className="rounded-[28px] border border-zinc-800 bg-zinc-900 p-3 sm:rounded-[32px] sm:p-4">
                <div className="mb-4 px-2">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Report Queue ({bugs.length})</h3>
                </div>
                <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
                  {intakeBugs.map((bug) => (
                    <button key={bug.id} onClick={() => setSelectedBugId(bug.id)} className={cn("w-full rounded-3xl border p-4 text-left transition-colors", selectedBugId === bug.id ? "border-orange-600 bg-orange-600/10" : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900")}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-bold">{bug.title}</span>
                        <StatusBadge status={bug.status} />
                        <PriorityBadge priority={bug.priority} />
                      </div>
                      <p className="truncate text-xs text-zinc-500">{bug.authorName} · {bug.gameTitle || "Unlinked game"}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{bug.adminNotes || bug.description || "No details yet."}</p>
                    </button>
                  ))}
                  {bugs.length === 0 && <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">No bugs filed yet.</div>}
                </div>
              </div>

              <div className="rounded-[28px] border border-zinc-800 bg-zinc-900 p-4 sm:rounded-[32px] sm:p-6">
                {selectedBug ? (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:gap-6 lg:grid-cols-[1fr_0.95fr]">
                      <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
                        {selectedBug.video ? (
                          <video src={selectedBug.video} className="aspect-video w-full object-contain" controls preload="metadata" />
                        ) : selectedBug.annotatedImage || selectedBug.image ? (
                          <img src={selectedBug.annotatedImage || selectedBug.image || ""} alt={selectedBug.title} className="aspect-video w-full object-contain" />
                        ) : (
                          <div className="flex aspect-video w-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
                            No screenshot attached.
                          </div>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div>
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <StatusBadge status={selectedBug.status} />
                            <PriorityBadge priority={selectedBug.priority} />
                          </div>
                          <h3 className="text-2xl font-bold">{selectedBug.title}</h3>
                          <p className="mt-2 text-sm text-zinc-500">{selectedBug.authorName} · {selectedBug.gameTitle || "Unlinked game"}</p>
                        </div>
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-300">
                          {selectedBug.description || "No tester description provided."}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs text-zinc-500">
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">Filed<br /><span className="mt-1 block text-sm text-zinc-200">{new Date(selectedBug.timestamp).toLocaleString()}</span></div>
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">Updated<br /><span className="mt-1 block text-sm text-zinc-200">{new Date(selectedBug.updatedAt).toLocaleString()}</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Status">
                        <select value={selectedBug.status} onChange={(e) => void saveBugUpdates({ status: e.target.value as BugReport["status"] })} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50">
                          <option value="open">Open</option>
                          <option value="pending">Pending</option>
                          <option value="fixed">Fixed</option>
                        </select>
                      </FormField>
                      <FormField label="Priority">
                        <select value={selectedBug.priority} onChange={(e) => void saveBugUpdates({ priority: e.target.value as ReportPriority })} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50">
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </FormField>
                    </div>

                    <div className="space-y-4">
                      <FormField label="Latest Admin Summary">
                        <textarea value={draftAdminNotes} onChange={(e) => setDraftAdminNotes(e.target.value)} className="h-24 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50" placeholder="Short summary shown in dashboards and queue cards." />
                      </FormField>
                      <FormField label="Conversation">
                        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                          {selectedBug.messages.length > 0 ? selectedBug.messages.map((message) => (
                            <div key={message.id} className={cn("rounded-2xl px-4 py-3 text-sm leading-relaxed", message.authorRole === "admin" ? "border border-orange-500/20 bg-orange-500/8 text-zinc-200" : "border border-zinc-800 bg-zinc-900 text-zinc-300")}>
                              <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest">
                                <span className={message.authorRole === "admin" ? "text-orange-400" : "text-zinc-400"}>{message.authorName}</span>
                                <span className="text-zinc-600">{new Date(message.createdAt).toLocaleString()}</span>
                              </div>
                              <p className="whitespace-pre-wrap">{message.body}</p>
                            </div>
                          )) : <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900 px-4 py-4 text-sm text-zinc-500">No messages yet.</div>}
                        </div>
                      </FormField>
                      <FormField label="Reply">
                        <textarea value={draftReply} onChange={(e) => setDraftReply(e.target.value)} className="h-32 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50" placeholder="Reply to the tester without overwriting the ticket." />
                      </FormField>
                      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                        <button onClick={() => void saveBugUpdates({ adminNotes: draftAdminNotes })} disabled={isSavingBug} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-3 text-sm font-bold text-zinc-300 disabled:opacity-70">
                          {isSavingBug ? "Saving..." : "Save Summary"}
                        </button>
                        <button onClick={() => void sendBugReply()} disabled={isSavingBug || !draftReply.trim()} className="rounded-2xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-orange-900/20 disabled:opacity-70">
                          {isSavingBug ? "Sending..." : "Send Reply"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 p-12 text-center text-zinc-500">Select a bug from the queue.</div>
                )}
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-bold">Game Library</h2><button onClick={() => setIsAdding(true)} className="flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-orange-900/20"><Plus size={18} />Add New Game</button></div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-12 lg:col-span-2">
              <section><h2 className="mb-6 text-sm font-bold uppercase tracking-widest text-zinc-500">Manage Games ({games.length})</h2><div className="space-y-4">{games.map((game) => { const metrics = gameMetrics[game.id] ?? emptyGameMetric(); return <div key={game.id} className="group rounded-3xl border border-zinc-800 bg-zinc-900 p-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-zinc-500"><Gamepad2 size={24} /></div><div><p className="font-bold">{game.title}</p><p className="max-w-[240px] truncate text-xs text-zinc-500">{game.url}</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricTile label="Reports" value={metrics.totalReports} accent="text-zinc-100" /><MetricTile label="Open" value={metrics.openReports} accent="text-red-400" /><MetricTile label="High" value={metrics.highPriorityReports} accent="text-orange-400" /><MetricTile label="Avg Fix" value={formatFixHours(metrics.avgFixHours)} accent="text-cyan-400" compact /></div></div></div><button onClick={() => void onDeleteGame(game.id)} className="rounded-xl p-3 text-zinc-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"><Trash2 size={18} /></button></div></div>; })}</div></section>
              <section>
                <h2 className="mb-6 text-sm font-bold uppercase tracking-widest text-zinc-500">Tester Intel ({testerInsights.length})</h2>
                <div className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
                  <div className="space-y-3">
                    {testerInsights.map((tester) => (
                      <button
                        key={tester.id}
                        type="button"
                        onClick={() => setSelectedTesterId(tester.id)}
                        className={cn(
                          "w-full rounded-3xl border p-4 text-left transition-colors",
                          selectedTester?.id === tester.id ? "border-orange-600 bg-orange-600/10" : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800/70",
                        )}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold">{tester.name}</p>
                            <p className="mt-1 text-xs text-zinc-500">{tester.email}</p>
                          </div>
                          <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest", tester.isOnline ? "bg-green-500/15 text-green-300" : "bg-zinc-800 text-zinc-400")}>
                            {tester.isOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <MetricTile label="Play Time" value={formatPlayTime(tester.totalPlaySeconds)} accent="text-cyan-400" compact />
                          <MetricTile label="Sessions" value={tester.totalSessions} accent="text-zinc-100" compact />
                          <MetricTile label="Games" value={tester.gamesPlayedCount} accent="text-violet-300" compact />
                          <MetricTile label="Reports" value={tester.totalReports} accent="text-orange-400" compact />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
                          <span>{tester.currentGameTitle ? `Playing ${tester.currentGameTitle}` : "Not currently in a game"}</span>
                          <span>{formatRelativeDate(tester.lastSeen)}</span>
                        </div>
                      </button>
                    ))}
                    {testerInsights.length === 0 && <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">No tester telemetry yet. Once testers open games, this fills in.</div>}
                  </div>
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
                    {selectedTester ? (
                      <div className="space-y-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <h3 className="text-2xl font-bold">{selectedTester.name}</h3>
                            <p className="mt-1 text-sm text-zinc-500">{selectedTester.email}</p>
                            <p className="mt-3 text-xs uppercase tracking-widest text-zinc-600">{selectedTester.currentGameTitle ? `Currently playing ${selectedTester.currentGameTitle}` : "No active game session"}</p>
                          </div>
                          <div className="text-right text-xs text-zinc-500">
                            <p>Last seen</p>
                            <p className="mt-1 text-sm text-zinc-200">{formatDateTime(selectedTester.lastSeen)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <MetricTile label="Total Play" value={formatPlayTime(selectedTester.totalPlaySeconds)} accent="text-cyan-400" compact />
                          <MetricTile label="Avg Session" value={formatPlayTime(selectedTester.avgSessionSeconds)} accent="text-blue-300" compact />
                          <MetricTile label="Open Bugs" value={selectedTester.openReports + selectedTester.pendingReports} accent="text-red-400" compact />
                          <MetricTile label="Fixed" value={selectedTester.fixedReports} accent="text-green-400" compact />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <InlineInsight label="Sessions" value={selectedTester.totalSessions} />
                          <InlineInsight label="Games Played" value={selectedTester.gamesPlayedCount} />
                          <InlineInsight label="High Priority Filed" value={selectedTester.highPriorityReports} />
                          <InlineInsight label="Last Game Activity" value={selectedTester.lastPlayedAt ? formatRelativeDate(selectedTester.lastPlayedAt) : "No play yet"} />
                        </div>
                        <div>
                          <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">Per-Game Breakdown</h4>
                          <div className="space-y-3">
                            {selectedTester.games.map((game) => (
                              <div key={game.gameId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-bold">{game.gameTitle}</p>
                                    <p className="mt-1 truncate text-xs text-zinc-500">{game.gameUrl}</p>
                                  </div>
                                  <span className="text-xs text-zinc-500">{game.lastPlayedAt ? formatRelativeDate(game.lastPlayedAt) : "Never"}</span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                  <MetricTile label="Play Time" value={formatPlayTime(game.totalPlaySeconds)} accent="text-cyan-400" compact />
                                  <MetricTile label="Sessions" value={game.sessionCount} accent="text-zinc-100" compact />
                                  <MetricTile label="Reports" value={game.reportsFiled} accent="text-orange-400" compact />
                                  <MetricTile label="Avg Session" value={formatPlayTime(game.sessionCount > 0 ? Math.round(game.totalPlaySeconds / game.sessionCount) : null)} accent="text-blue-300" compact />
                                </div>
                              </div>
                            ))}
                            {selectedTester.games.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-sm text-zinc-500">This tester has not opened any tracked games yet.</div>}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 p-12 text-center text-zinc-500">Select a tester to inspect activity.</div>
                    )}
                  </div>
                </div>
              </section>
            </div>
            <div><div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6"><h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">System Health</h2><div className="space-y-4"><HealthRow label="Total Testers" value={testerInsights.length} /><HealthRow label="Active Sessions" value={onlineTesterCount} accent="text-green-500" /><HealthRow label="Total Bugs" value={bugs.length} accent="text-orange-500" /></div></div></div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <AnalyticsCard icon={<Activity size={20} />} label="Total Reports" value={bugs.length} accent="text-orange-500" />
            <AnalyticsCard icon={<Activity size={20} />} label="Resolution Rate" value={`${bugs.length > 0 ? Math.round((bugs.filter((bug) => bug.status === "fixed").length / bugs.length) * 100) : 0}%`} accent="text-green-500" />
            <AnalyticsCard icon={<Gamepad2 size={20} />} label="Active Games" value={games.length} accent="text-blue-500" />
            <AnalyticsCard icon={<Clock3 size={20} />} label="Avg Fix Time" value={formatFixHours(avgFixHours)} accent="text-cyan-400" />
            <AnalyticsCard icon={<Bug size={20} />} label="High Priority Open" value={highPriorityOpen} accent="text-red-400" />
            <AnalyticsCard icon={<Users size={20} />} label="Online Testers" value={onlineTesterCount} accent="text-emerald-400" />
            <AnalyticsCard icon={<Clock3 size={20} />} label="Total Play Time" value={formatPlayTime(totalPlaySeconds)} accent="text-sky-400" />
            <AnalyticsCard icon={<Activity size={20} />} label="Avg Play Session" value={formatPlayTime(avgSessionSeconds)} accent="text-violet-400" />
            <AnalyticsCard icon={<MessageSquareText size={20} />} label="Stale Backlog" value={staleBacklog} accent="text-amber-400" />
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ChartCard title="Report Timeline" icon={<BarChart3 size={20} className="text-orange-500" />}><ResponsiveContainer width="100%" height="100%"><AreaChart data={timelineData}><defs><linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} /><XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} /><YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "12px" }} /><Area type="monotone" dataKey="count" stroke="#f97316" strokeWidth={3} fill="url(#colorCount)" /></AreaChart></ResponsiveContainer></ChartCard>
            <ChartCard title="Status Distribution" icon={<Bug size={20} className="text-orange-500" />}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5}>{statusData.map((entry, index) => <Cell key={`status-${index}`} fill={entry.color} />)}</Pie><Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "12px" }} /></PieChart></ResponsiveContainer></ChartCard>
            <ChartCard title="Most Engaged Testers (Minutes Played)" icon={<Users size={20} className="text-orange-500" />} className="lg:col-span-2"><ResponsiveContainer width="100%" height="100%"><BarChart data={topTestersData}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} /><XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} /><YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "12px" }} /><Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard>
            <ChartCard title="Game Health" icon={<Gamepad2 size={20} className="text-orange-500" />} className="lg:col-span-2"><ResponsiveContainer width="100%" height="100%"><BarChart data={gameHealthData}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} /><XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} /><YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "12px" }} /><Bar dataKey="open" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} /><Bar dataKey="fixed" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard>
          </div>
        </div>
      )}
      <AnimatePresence>{isAdding && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 p-0 backdrop-blur-md sm:items-center sm:p-6"><motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[32px] border border-zinc-800 bg-zinc-950 shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-[32px]"><div className="overflow-y-auto p-5 sm:p-8"><h2 className="mb-6 text-2xl font-bold">Add New Game</h2><form onSubmit={submitGame} className="space-y-4"><FormField label="Game Title"><input type="text" required value={newGame.title} onChange={(e) => setNewGame((current) => ({ ...current, title: e.target.value }))} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50" /></FormField><FormField label="Game URL"><input type="url" required value={newGame.url} onChange={(e) => setNewGame((current) => ({ ...current, url: e.target.value }))} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50" /></FormField><FormField label="Description"><textarea value={newGame.description} onChange={(e) => setNewGame((current) => ({ ...current, description: e.target.value }))} className="h-24 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50" /></FormField><div className="flex flex-col gap-3 pt-4 sm:flex-row"><button type="button" onClick={() => setIsAdding(false)} className="flex-1 rounded-xl bg-zinc-900 py-4 text-sm font-bold text-zinc-400">Cancel</button><button type="submit" disabled={isSavingGame} className="flex-1 rounded-xl bg-orange-600 py-4 text-sm font-bold text-white shadow-xl shadow-orange-900/20 disabled:opacity-70">{isSavingGame ? "Saving..." : "Save Game"}</button></div></form></div></motion.div></motion.div>}</AnimatePresence>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</label>{children}</div>; }
function HealthRow({ label, value, accent }: { label: string; value: string | number; accent?: string }) { return <div className="flex items-center justify-between gap-3"><span className="text-sm text-zinc-400">{label}</span><span className={`text-right font-bold ${accent ?? ""}`}>{value}</span></div>; }
function AnalyticsCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent: string }) { return <div className="rounded-3xl border border-zinc-800 p-4 tp-panel sm:p-6"><div className="mb-4 flex items-start gap-3"><div className={`rounded-lg bg-white/5 p-2 ${accent}`}>{icon}</div><h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 sm:text-sm">{label}</h3></div><p className={`text-3xl font-bold sm:text-4xl ${accent}`}>{value}</p></div>; }
function ChartCard({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) { return <div className={`rounded-[28px] border border-zinc-800 p-4 tp-panel sm:rounded-[32px] sm:p-8 ${className ?? ""}`}><h3 className="mb-6 flex items-center gap-2 text-base font-bold sm:mb-8 sm:text-lg">{icon}{title}</h3><div className="h-[240px] w-full sm:h-[300px]">{children}</div></div>; }
function StatusBadge({ status }: { status: BugReport["status"] }) { return <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest", status === "open" ? "bg-red-500/15 text-red-300" : status === "pending" ? "bg-amber-500/15 text-amber-300" : "bg-green-500/15 text-green-300")}>{status}</span>; }
function PriorityBadge({ priority }: { priority: ReportPriority }) { return <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest", priority === "high" ? "bg-red-500/15 text-red-300" : priority === "medium" ? "bg-orange-500/15 text-orange-300" : "bg-blue-500/15 text-blue-300")}>{priority}</span>; }
function MetricTile({ label, value, accent, compact = false }: { label: string; value: string | number; accent: string; compact?: boolean }) { return <div className={cn("rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 sm:px-4", compact && "px-3 py-2")}><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p><p className={cn("mt-2 break-words text-xl font-bold sm:text-2xl", compact && "text-base sm:text-lg", accent)}>{value}</p></div>; }
function InlineInsight({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p><p className="mt-2 break-words text-sm font-semibold text-zinc-200">{value}</p></div>; }

function PersonalizationPanel({ user, preferences, setPreferences, accentStyle, accentSoftStyle }: { user: UserProfile; preferences: UiPreferences; setPreferences: React.Dispatch<React.SetStateAction<UiPreferences>>; accentStyle: React.CSSProperties; accentSoftStyle: React.CSSProperties; }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Personalization</h1>
        <p className="mt-1 text-sm text-zinc-500">Tune the interface so it fits how you work instead of making you adapt to it.</p>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <section className="rounded-[32px] border border-zinc-800 p-6 tp-panel">
            <h2 className="mb-6 text-xl font-bold">Theme Controls</h2>
            <div className="space-y-6">
              <FormField label="Accent Color">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { key: "orange", label: "Forge" },
                    { key: "cyan", label: "Signal" },
                    { key: "rose", label: "Pulse" },
                    { key: "lime", label: "Circuit" },
                  ].map((option) => (
                    <button key={option.key} onClick={() => setPreferences((current) => ({ ...current, accent: option.key as UiPreferences["accent"] }))} className={cn("rounded-2xl border px-4 py-4 text-left transition-colors", preferences.accent === option.key ? "border-white/20 bg-zinc-950 text-white" : "border-zinc-800 bg-zinc-950 text-zinc-400")}>
                      <div className="mb-3 h-3 w-12 rounded-full" style={option.key === "orange" ? { backgroundColor: "#ea580c" } : option.key === "cyan" ? { backgroundColor: "#0891b2" } : option.key === "rose" ? { backgroundColor: "#e11d48" } : { backgroundColor: "#65a30d" }} />
                      <p className="text-sm font-bold">{option.label}</p>
                    </button>
                  ))}
                </div>
              </FormField>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField label="Density">
                  <div className="grid grid-cols-2 gap-3">
                    {(["comfortable", "compact"] as const).map((density) => (
                      <button key={density} onClick={() => setPreferences((current) => ({ ...current, density }))} className={cn("rounded-2xl border px-4 py-4 text-sm font-bold capitalize transition-colors", preferences.density === density ? "border-white/20 bg-zinc-950 text-white" : "border-zinc-800 bg-zinc-950 text-zinc-400")}>{density}</button>
                    ))}
                  </div>
                </FormField>

                <FormField label="Surface">
                  <div className="grid grid-cols-2 gap-3">
                    {(["solid", "glass"] as const).map((surface) => (
                      <button key={surface} onClick={() => setPreferences((current) => ({ ...current, surface }))} className={cn("rounded-2xl border px-4 py-4 text-sm font-bold capitalize transition-colors", preferences.surface === surface ? "border-white/20 bg-zinc-950 text-white" : "border-zinc-800 bg-zinc-950 text-zinc-400")}>{surface}</button>
                    ))}
                  </div>
                </FormField>
              </div>

              <FormField label="Sidebar Behavior">
                <label className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm text-zinc-300">
                  <span>Open the sidebar by default</span>
                  <input type="checkbox" checked={preferences.sidebarDefaultOpen} onChange={(e) => setPreferences((current) => ({ ...current, sidebarDefaultOpen: e.target.checked }))} className="h-4 w-4 accent-orange-500" />
                </label>
              </FormField>
            </div>
          </section>

          <section className="rounded-[32px] border border-zinc-800 p-6 tp-panel">
            <h2 className="mb-4 text-xl font-bold">Identity</h2>
            <p className="text-sm text-zinc-500">{user.name}</p>
            <p className="mt-1 text-xs uppercase tracking-widest text-zinc-600">{user.role}</p>
          </section>
        </div>

        <div className="rounded-[32px] border border-zinc-800 p-6 tp-panel">
          <h2 className="mb-6 text-xl font-bold">Live Preview</h2>
          <div className="space-y-4 rounded-[28px] border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">Preview Card</p>
                <p className="text-sm text-zinc-500">This updates as you change the controls.</p>
              </div>
              <span className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest" style={accentSoftStyle}>accent</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <MetricTile label="Open" value={8} accent="text-red-400" />
              <MetricTile label="Pending" value={3} accent="text-amber-400" />
              <MetricTile label="Fixed" value={19} accent="text-green-500" />
            </div>
            <button className="w-full rounded-2xl px-4 py-3 text-sm font-bold text-white" style={accentStyle}>Primary Action</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function emptyGameMetric(): GameMetric {
  return { totalReports: 0, openReports: 0, pendingReports: 0, fixedReports: 0, highPriorityReports: 0, resolutionRate: 0, lastReportedAt: null, avgFixHours: null };
}

function buildGameMetrics(games: Game[], reports: BugReport[]): Record<string, GameMetric> {
  return Object.fromEntries(games.map((game) => {
    const linkedReports = reports.filter((report) => report.gameUrl === game.url || report.gameTitle === game.title);
    const fixed = linkedReports.filter((report) => report.status === "fixed");
    const avgFixHours = fixed.length > 0 ? fixed.reduce((total, report) => total + ((Date.parse(report.updatedAt) - report.timestamp) / (1000 * 60 * 60)), 0) / fixed.length : null;
    const metric: GameMetric = {
      totalReports: linkedReports.length,
      openReports: linkedReports.filter((report) => report.status === "open").length,
      pendingReports: linkedReports.filter((report) => report.status === "pending").length,
      fixedReports: fixed.length,
      highPriorityReports: linkedReports.filter((report) => report.priority === "high" && report.status !== "fixed").length,
      resolutionRate: linkedReports.length > 0 ? Math.round((fixed.length / linkedReports.length) * 100) : 0,
      lastReportedAt: linkedReports.length > 0 ? Math.max(...linkedReports.map((report) => report.timestamp)) : null,
      avgFixHours,
    };
    return [game.id, metric];
  }));
}

function formatRelativeTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return "No activity";
  }

  const hours = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60));
  if (hours < 1) {
    return "This hour";
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatFixHours(hours: number | null) {
  if (hours === null || Number.isNaN(hours)) {
    return "n/a";
  }
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  return `${(hours / 24).toFixed(1)}d`;
}

function formatPlayTime(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds) || seconds <= 0) {
    return "0m";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (hours < 24) {
    return `${hours}h ${minutes}m`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatRelativeDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  return formatRelativeTimestamp(timestamp);
}

function average<T>(items: T[], valueOf: (item: T) => number, include: (item: T) => boolean) {
  const filtered = items.filter(include);
  if (filtered.length === 0) {
    return null;
  }
  return filtered.reduce((total, item) => total + valueOf(item), 0) / filtered.length;
}
