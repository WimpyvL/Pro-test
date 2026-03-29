import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  ChevronRight,
  Clock,
  Copy,
  Gamepad2,
  Loader2,
  Plus,
  Trash2,
  Upload,
  User as UserIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import type { BugReport, Game, ReportStatus, UserProfile } from "../lib/api";
import { cn } from "@/src/lib/utils";
import AnnotationCanvas from "./AnnotationCanvas";
import { useFloatingPosition } from "../lib/useFloatingPosition";

interface GameTesterProps {
  currentUser: UserProfile;
  initialGame: Game;
  reports: BugReport[];
  onCreateReport: (input: {
    image: string;
    annotatedImage: string | null;
    title: string;
    description: string;
    gameTitle?: string | null;
    gameUrl?: string | null;
  }) => Promise<BugReport>;
  onUpdateReport: (
    reportId: string,
    updates: {
      title?: string;
      description?: string;
      status?: ReportStatus;
      annotatedImage?: string | null;
    },
  ) => Promise<BugReport>;
  onDeleteReport: (reportId: string) => Promise<void>;
}

export default function GameTester({
  currentUser,
  initialGame,
  reports,
  onCreateReport,
  onUpdateReport,
  onDeleteReport,
}: GameTesterProps) {
  const [gameUrl, setGameUrl] = useState(initialGame.url);
  const [inputUrl, setInputUrl] = useState(initialGame.url);
  const [activeReport, setActiveReport] = useState<BugReport | null>(null);
  const [draftReport, setDraftReport] = useState<{
    image: string;
    title: string;
    description: string;
  } | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"reports" | "settings">("reports");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const testerFab = useFloatingPosition(
    "tester-pro-bug-fab-position",
    () => ({ x: window.innerWidth - 80, y: window.innerHeight - 80 }),
    { size: 56, margin: 16 },
  );

  useEffect(() => {
    setGameUrl(initialGame.url);
    setInputUrl(initialGame.url);
    setActiveReport(null);
  }, [initialGame]);

  const gameTitle = initialGame.title;

  const canManageActiveReport =
    activeReport && (activeReport.authorUid === currentUser.id || currentUser.role === "admin");

  const gameReports = reports.filter((report) => report.gameUrl === initialGame.url || report.gameTitle === initialGame.title);

  const closeAnnotation = (keepMenuOpen = true) => {
    setIsAnnotating(false);
    setDraftReport(null);
    setIsSaving(false);
    setIsMenuOpen(keepMenuOpen);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGameUrl(inputUrl);
    setIsMenuOpen(false);
  };

  const takeScreenshot = async () => {
    setIsCapturing(true);
    setIsMenuOpen(false);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // @ts-expect-error Chromium supports these current-tab hints even though TS lags behind.
          preferCurrentTab: true,
          selfBrowserSurface: "include",
          surfaceSwitching: "exclude",
        },
        audio: false,
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => {
          void video.play().then(resolve).catch(reject);
        };
        video.onerror = () => reject(new Error("Unable to read screenshot stream."));
      });

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx || canvas.width === 0 || canvas.height === 0) {
        throw new Error("Screenshot capture returned an empty frame.");
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((track) => track.stop());

      setDraftReport({
        image: canvas.toDataURL("image/png"),
        title: `${gameTitle} bug ${gameReports.length + 1}`,
        description: "",
      });
      setIsAnnotating(true);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "NotAllowedError") {
        alert("Screenshot failed. Pick the current browser tab in the share dialog, or use manual upload.");
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setDraftReport({
        image: event.target?.result as string,
        title: `${gameTitle} upload ${gameReports.length + 1}`,
        description: "",
      });
      setIsAnnotating(true);
      setIsMenuOpen(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const saveAnnotation = async (annotatedDataUrl: string) => {
    if (!draftReport) {
      return;
    }

    setIsSaving(true);
    try {
      const report = await onCreateReport({
        image: draftReport.image,
        annotatedImage: annotatedDataUrl,
        title: draftReport.title,
        description: draftReport.description,
        gameTitle,
        gameUrl,
      });
      setActiveReport(report);
      closeAnnotation(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative h-screen w-full select-none overflow-hidden bg-black">
      <iframe src={gameUrl} className="h-full w-full border-none" title="Game View" allow="camera; microphone; geolocation" />

      <motion.button
        id="tester-fab"
        layoutId="tester-fab"
        onClick={() => {
          if (testerFab.shouldSuppressClick()) {
            return;
          }
          setIsMenuOpen((current) => !current);
        }}
        style={testerFab.floatingStyle}
        className={cn(
          "fixed z-50 flex h-14 w-14 touch-none items-center justify-center rounded-full shadow-2xl transition-colors",
          isMenuOpen ? "bg-zinc-800 text-zinc-400" : "bg-orange-600 text-white",
        )}
        {...testerFab.dragProps}
        whileTap={{ scale: 0.9 }}
      >
        {isMenuOpen ? <Plus className="rotate-45" size={24} /> : <Camera size={24} />}
      </motion.button>

      <AnimatePresence>
        {isCapturing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
            <Loader2 className="mb-4 animate-spin text-orange-500" size={48} />
            <p className="text-xl font-bold text-white">Capturing Screenshot...</p>
            <p className="mt-2 text-sm text-zinc-500">Give the browser a second to hand over the current frame.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAnnotating && draftReport && (
          <AnnotationCanvas image={draftReport.image} onSave={saveAnnotation} onCancel={() => closeAnnotation(true)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />

            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-[32px] border-t border-zinc-800 bg-zinc-950 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
            >
              <div className="mx-auto my-4 h-1.5 w-12 rounded-full bg-zinc-800" />

              <div className="flex items-center justify-between px-6 pb-4">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-bold">
                    <Gamepad2 className="text-orange-500" size={20} />
                    Tester Suite
                  </h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{gameTitle}</p>
                </div>
                <button
                  onClick={takeScreenshot}
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-2xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/40 transition-transform active:scale-95 disabled:opacity-70"
                  title="Capture the current tab"
                >
                  <Camera size={20} />
                  Take Screenshot
                </button>
              </div>

              <div className="flex border-b border-zinc-900 px-6">
                <button
                  onClick={() => setActiveTab("reports")}
                  className={cn(
                    "flex-1 border-b-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors",
                    activeTab === "reports" ? "border-orange-500 text-orange-500" : "border-transparent text-zinc-500",
                  )}
                >
                  Reports ({gameReports.length})
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className={cn(
                    "flex-1 border-b-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors",
                    activeTab === "settings" ? "border-orange-500 text-orange-500" : "border-transparent text-zinc-500",
                  )}
                >
                  Game Config
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === "reports" ? (
                  <div className="space-y-4">
                    {activeReport ? (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                        <button onClick={() => setActiveReport(null)} className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-400">
                          <ArrowLeft size={14} />
                          Back to list
                        </button>

                        <div className="group relative aspect-video overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                          <img src={activeReport.annotatedImage || activeReport.image} alt="" className="h-full w-full object-contain" />
                        </div>

                        <div className="space-y-4">
                          <div className="flex flex-wrap gap-2">
                            <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest", activeReport.priority === "high" ? "bg-red-500/15 text-red-300" : activeReport.priority === "medium" ? "bg-orange-500/15 text-orange-300" : "bg-blue-500/15 text-blue-300")}>
                              {activeReport.priority}
                            </span>
                          </div>

                          <input
                            type="text"
                            value={activeReport.title}
                            disabled={!canManageActiveReport}
                            onChange={(e) =>
                              void onUpdateReport(activeReport.id, { title: e.target.value }).then((report) => setActiveReport(report))
                            }
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-600/50 disabled:cursor-not-allowed disabled:opacity-70"
                            placeholder="Report Title"
                          />

                          <textarea
                            value={activeReport.description}
                            disabled={!canManageActiveReport}
                            onChange={(e) =>
                              void onUpdateReport(activeReport.id, { description: e.target.value }).then((report) => setActiveReport(report))
                            }
                            className="h-32 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50 disabled:cursor-not-allowed disabled:opacity-70"
                            placeholder="Technical notes for the developer. Say what broke, where, and how to reproduce it."
                          />

                          <div className="rounded-2xl border border-orange-600/20 bg-orange-600/5 p-4 text-sm leading-relaxed text-zinc-300">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">Developer Notes</span>
                              {activeReport.description && (
                                <button onClick={() => void navigator.clipboard.writeText(activeReport.description)} className="text-zinc-500">
                                  <Copy size={12} />
                                </button>
                              )}
                            </div>
                            {activeReport.description || "Add a precise description instead of asking a browser-side model to invent one."}
                          </div>

                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-300">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Admin Feedback</span>
                            </div>
                            {activeReport.adminNotes || "No admin feedback yet."}
                          </div>

                          <div className="flex gap-2">
                            {(["open", "pending", "fixed"] as const).map((status) => (
                              <button
                                key={status}
                                disabled={!canManageActiveReport}
                                onClick={() => void onUpdateReport(activeReport.id, { status }).then((report) => setActiveReport(report))}
                                className={cn(
                                  "flex-1 rounded-xl border py-3 text-[10px] font-bold uppercase tracking-widest transition-all",
                                  activeReport.status === status
                                    ? "border-orange-600 bg-orange-600 text-white"
                                    : "border-zinc-800 bg-zinc-900 text-zinc-500",
                                  !canManageActiveReport && "cursor-not-allowed opacity-70",
                                )}
                              >
                                {status}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                              <UserIcon size={12} />
                              {activeReport.authorName}
                            </div>
                            {canManageActiveReport && (
                              <button
                                onClick={async () => {
                                  await onDeleteReport(activeReport.id);
                                  setActiveReport(null);
                                }}
                                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-red-500"
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {gameReports.map((report) => (
                          <motion.div
                            key={report.id}
                            layoutId={report.id}
                            onClick={() => setActiveReport(report)}
                            className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition-transform active:scale-[0.98]"
                          >
                            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800">
                              <img src={report.annotatedImage || report.image} alt="" className="h-full w-full object-cover" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="mb-1 truncate text-sm font-bold">{report.title}</h3>
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-tighter text-zinc-500">
                                <Clock size={10} />
                                {new Date(report.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5",
                                    report.status === "open"
                                      ? "bg-red-500/20 text-red-400"
                                      : report.status === "fixed"
                                        ? "bg-green-500/20 text-green-400"
                                        : "bg-amber-500/20 text-amber-400",
                                  )}
                                >
                                  {report.status}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="text-zinc-700" size={20} />
                          </motion.div>
                        ))}
                        {gameReports.length === 0 && (
                          <div className="py-20 text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900">
                              <Camera className="text-zinc-700" size={24} />
                            </div>
                            <h3 className="mb-1 font-bold text-zinc-400">No reports found</h3>
                            <p className="text-xs text-zinc-600">Capture your first bug to get started.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <form onSubmit={handleUrlSubmit} className="space-y-4">
                      <div>
                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Game URL</label>
                        <div className="relative">
                          <Gamepad2 className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                          <input
                            type="text"
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-4 pl-12 pr-4 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-600/50"
                          />
                        </div>
                      </div>
                      <button className="w-full rounded-xl bg-zinc-100 py-4 text-sm font-bold text-black shadow-xl transition-all active:scale-95">
                        Reload Game
                      </button>
                    </form>

                    <div className="space-y-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Troubleshooting</h3>
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                        <div className="mb-4 flex gap-3">
                          <AlertCircle className="shrink-0 text-orange-500" size={18} />
                          <p className="text-xs leading-relaxed text-zinc-400">
                            <span className="mb-1 block font-bold uppercase tracking-tighter text-orange-400">System Capture</span>
                            Use <strong>Take Screenshot</strong> to capture the game and tester UI together. It works around iframe security by capturing the tab directly.
                          </p>
                        </div>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors hover:bg-zinc-700"
                        >
                          <Upload size={14} />
                          Manual Upload
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
