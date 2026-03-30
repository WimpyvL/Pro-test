import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  ImagePlus,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  User as UserIcon,
  Video,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { backend, type BugReport, type Game, type ReportStatus, type UserProfile } from "../lib/api";
import { cn } from "@/src/lib/utils";
import AnnotationCanvas from "./AnnotationCanvas";
import { useFloatingPosition } from "../lib/useFloatingPosition";

interface GameTesterProps {
  currentUser: UserProfile;
  initialGame: Game;
  reports: BugReport[];
  onCreateReport: (input: {
    image?: string | null;
    annotatedImage: string | null;
    video?: string | null;
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
  onCreateReportMessage: (reportId: string, body: string) => Promise<BugReport>;
  onDeleteReport: (reportId: string) => Promise<void>;
}

interface ReportComposerDraft {
  title: string;
  summary: string;
  steps: string;
  expected: string;
  image: string | null;
  annotatedImage: string | null;
  video: string | null;
  attachmentSource: "capture" | "upload" | null;
}

interface ReportEditorDraft {
  title: string;
  description: string;
}

const emptyComposerDraft = (): ReportComposerDraft => ({
  title: "",
  summary: "",
  steps: "",
  expected: "",
  image: null,
  annotatedImage: null,
  video: null,
  attachmentSource: null,
});

export default function GameTester({
  currentUser,
  initialGame,
  reports,
  onCreateReport,
  onUpdateReport,
  onCreateReportMessage,
  onDeleteReport,
}: GameTesterProps) {
  const [gameUrl, setGameUrl] = useState(initialGame.url);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [composerDraft, setComposerDraft] = useState<ReportComposerDraft>(emptyComposerDraft);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<ReportEditorDraft | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [draftReply, setDraftReply] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trackedSessionIdRef = useRef<string | null>(null);
  const testerFab = useFloatingPosition(
    "tester-pro-bug-fab-position",
    () => ({ x: window.innerWidth - 80, y: window.innerHeight - 80 }),
    { size: 56, margin: 16 },
  );

  useEffect(() => {
    setGameUrl(initialGame.url);
    setIsComposerOpen(false);
    setIsHistoryOpen(false);
    setComposerDraft(emptyComposerDraft());
    setActiveReportId(null);
    setEditorDraft(null);
  }, [initialGame]);

  useEffect(() => {
    let cancelled = false;
    let heartbeatTimer: number | null = null;
    let activeSessionId: string | null = null;

    const clearHeartbeat = () => {
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const flushHeartbeat = () => {
      if (!activeSessionId) {
        return;
      }

      void backend.heartbeatGameSession(activeSessionId).catch(() => undefined);
    };

    const bootSession = async () => {
      try {
        const { session } = await backend.startGameSession({ gameId: initialGame.id });
        if (cancelled) {
          await backend.endGameSession(session.id).catch(() => undefined);
          return;
        }

        activeSessionId = session.id;
        trackedSessionIdRef.current = session.id;
        heartbeatTimer = window.setInterval(flushHeartbeat, 20000);
      } catch {
        trackedSessionIdRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        flushHeartbeat();
      }
    };

    const handlePageHide = () => {
      flushHeartbeat();
    };

    void bootSession();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      clearHeartbeat();

      if (activeSessionId) {
        void backend.endGameSession(activeSessionId).catch(() => undefined);
      }

      if (trackedSessionIdRef.current === activeSessionId) {
        trackedSessionIdRef.current = null;
      }
    };
  }, [initialGame.id]);

  const gameTitle = initialGame.title;
  const gameReports = useMemo(
    () => reports.filter((report) => report.gameUrl === initialGame.url || report.gameTitle === initialGame.title),
    [initialGame.title, initialGame.url, reports],
  );
  const activeReport = gameReports.find((report) => report.id === activeReportId) ?? null;
  const activeReportPreview = activeReport?.annotatedImage || activeReport?.image || null;
  const canEditActiveReport = Boolean(activeReport && (activeReport.authorUid === currentUser.id || currentUser.role === "admin"));
  const canChangeStatus = currentUser.role === "admin" && Boolean(activeReport);
  const canAnnotateUploadedImage = Boolean(composerDraft.image && composerDraft.attachmentSource === "upload");

  useEffect(() => {
    if (!activeReport) {
      setEditorDraft(null);
      setDraftReply("");
      return;
    }

    setEditorDraft({
      title: activeReport.title,
      description: activeReport.description,
    });
    setDraftReply("");
  }, [activeReport?.description, activeReport?.id, activeReport?.title]);

  function openComposer() {
    setIsHistoryOpen(false);
    setIsComposerOpen(true);
  }

  function openHistory(reportId?: string) {
    setActiveReportId(reportId ?? gameReports[0]?.id ?? null);
    setIsComposerOpen(false);
    setIsHistoryOpen(true);
  }

  function closeOverlays() {
    setIsComposerOpen(false);
    setIsHistoryOpen(false);
  }

  function updateComposerDraft(patch: Partial<ReportComposerDraft>) {
    setComposerDraft((current) => ({ ...current, ...patch }));
  }

  function buildReportDescription() {
    const sections = [
      composerDraft.summary.trim() ? `What happened\n${composerDraft.summary.trim()}` : "",
      composerDraft.steps.trim() ? `How to reproduce\n${composerDraft.steps.trim()}` : "",
      composerDraft.expected.trim() ? `Expected behavior\n${composerDraft.expected.trim()}` : "",
    ].filter(Boolean);

    return sections.join("\n\n");
  }

  async function takeRecording() {
    setIsCapturing(true);

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

      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];

      const clip = await new Promise<Blob>((resolve, reject) => {
        const stopTimer = window.setTimeout(() => recorder.stop(), 8000);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onerror = () => {
          window.clearTimeout(stopTimer);
          reject(new Error("Unable to record capture clip."));
        };
        recorder.onstop = () => {
          window.clearTimeout(stopTimer);
          stream.getTracks().forEach((track) => track.stop());
          const recordedBlob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
          if (recordedBlob.size === 0) {
            reject(new Error("Screen recording produced an empty clip."));
            return;
          }
          resolve(recordedBlob);
        };
        recorder.start();
      });

      const dataUrl = await blobToDataUrl(clip);
      updateComposerDraft({
        image: null,
        annotatedImage: null,
        video: dataUrl,
        attachmentSource: "capture",
      });
      openComposer();
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "NotAllowedError") {
        alert("Clip capture failed. Pick the current browser tab in the share dialog, or use manual upload.");
      }
    } finally {
      setIsCapturing(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const isVideo = file.type.startsWith("video/");
      updateComposerDraft({
        image: isVideo ? null : result,
        annotatedImage: null,
        video: isVideo ? result : null,
        attachmentSource: "upload",
      });
      openComposer();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function submitQuickReport(e: React.FormEvent) {
    e.preventDefault();

    const title = composerDraft.title.trim();
    const summary = composerDraft.summary.trim();
    if (!title || !summary) {
      return;
    }

    setIsSubmitting(true);
    try {
      const report = await onCreateReport({
        image: composerDraft.image,
        annotatedImage: composerDraft.annotatedImage,
        video: composerDraft.video,
        title,
        description: buildReportDescription(),
        gameTitle,
        gameUrl,
      });

      setComposerDraft(emptyComposerDraft());
      setIsComposerOpen(false);
      openHistory(report.id);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveReportEdits() {
    if (!activeReport || !editorDraft || !canEditActiveReport) {
      return;
    }

    setIsSavingReport(true);
    try {
      const updated = await onUpdateReport(activeReport.id, {
        title: editorDraft.title,
        description: editorDraft.description,
      });
      setActiveReportId(updated.id);
    } finally {
      setIsSavingReport(false);
    }
  }

  async function handleStatusChange(status: ReportStatus) {
    if (!activeReport || !canChangeStatus) {
      return;
    }

    setIsSavingReport(true);
    try {
      const updated = await onUpdateReport(activeReport.id, { status });
      setActiveReportId(updated.id);
    } finally {
      setIsSavingReport(false);
    }
  }

  async function sendReply() {
    if (!activeReport || !draftReply.trim()) {
      return;
    }

    setIsSavingReport(true);
    try {
      const updated = await onCreateReportMessage(activeReport.id, draftReply);
      setActiveReportId(updated.id);
      setDraftReply("");
    } finally {
      setIsSavingReport(false);
    }
  }

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
          openComposer();
        }}
        style={testerFab.floatingStyle}
        className="fixed z-50 flex h-14 w-14 touch-none items-center justify-center rounded-full bg-orange-600 text-white shadow-2xl transition-colors"
        {...testerFab.dragProps}
        whileTap={{ scale: 0.9 }}
      >
        <Camera size={24} />
      </motion.button>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*" />

      <AnimatePresence>
        {isCapturing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
            <Loader2 className="mb-4 animate-spin text-orange-500" size={48} />
            <p className="text-xl font-bold text-white">Recording Clip...</p>
            <p className="mt-2 text-sm text-zinc-500">Recording the current tab for up to 8 seconds.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAnnotating && composerDraft.image && (
          <AnnotationCanvas
            image={composerDraft.image}
            onSave={(annotatedDataUrl) => {
              updateComposerDraft({ annotatedImage: annotatedDataUrl });
              setIsAnnotating(false);
              setIsComposerOpen(true);
            }}
            onCancel={() => {
              setIsAnnotating(false);
              setIsComposerOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isComposerOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeOverlays} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }} className="fixed inset-x-4 bottom-4 z-50 mx-auto w-full max-w-2xl overflow-hidden rounded-[32px] border border-zinc-800 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
              <form onSubmit={submitQuickReport} className="flex max-h-[88vh] flex-col">
                <div className="flex items-start justify-between border-b border-zinc-900 px-6 py-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-orange-400">Quick Report</p>
                    <h2 className="mt-2 text-2xl font-bold">Report a bug without leaving the game</h2>
                    <p className="mt-1 text-sm text-zinc-500">{gameTitle}</p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <button type="button" onClick={() => openHistory()} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
                      My Reports
                    </button>
                    <button type="button" onClick={closeOverlays} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                      Close
                    </button>
                  </div>
                </div>

                <div className="space-y-6 overflow-y-auto px-6 py-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormSection label="Short title" hint="Keep it human. One line is enough.">
                      <input
                        type="text"
                        value={composerDraft.title}
                        onChange={(e) => updateComposerDraft({ title: e.target.value })}
                        placeholder="Shop button freezes after second click"
                        className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/40"
                      />
                    </FormSection>
                    <FormSection label="Capture" hint="Screen capture records a short clip. Manual upload supports image or video.">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => void takeRecording()} className="flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-4 py-4 text-sm font-bold text-white shadow-lg shadow-orange-950/30">
                          <Video size={16} />
                          Record Clip
                        </button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm font-bold text-zinc-300">
                          <Upload size={16} />
                          Upload Media
                        </button>
                      </div>
                    </FormSection>
                  </div>

                  <FormSection label="What happened" hint="Required. Just describe the failure plainly.">
                    <textarea
                      value={composerDraft.summary}
                      onChange={(e) => updateComposerDraft({ summary: e.target.value })}
                      placeholder="After opening inventory and dragging an item, the UI stops responding and the cursor gets stuck."
                      className="h-28 w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/40"
                    />
                  </FormSection>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormSection label="How to reproduce" hint="Optional but useful.">
                      <textarea
                        value={composerDraft.steps}
                        onChange={(e) => updateComposerDraft({ steps: e.target.value })}
                        placeholder={"1. Open inventory\n2. Drag any item\n3. Click outside the panel"}
                        className="h-28 w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/40"
                      />
                    </FormSection>
                    <FormSection label="Expected behavior" hint="Optional. Say what should have happened.">
                      <textarea
                        value={composerDraft.expected}
                        onChange={(e) => updateComposerDraft({ expected: e.target.value })}
                        placeholder="Dragging should end cleanly and input should remain responsive."
                        className="h-28 w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/40"
                      />
                    </FormSection>
                  </div>

                  <div className="rounded-[28px] border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-500">Attachment</p>
                        <p className="mt-1 text-sm text-zinc-400">Captured clips are great for movement bugs. Uploaded stills can be annotated.</p>
                      </div>
                      {canAnnotateUploadedImage && (
                        <button type="button" onClick={() => { setIsComposerOpen(false); setIsAnnotating(true); }} className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-200">
                          {composerDraft.annotatedImage ? "Edit Annotation" : "Annotate"}
                        </button>
                      )}
                    </div>
                    {composerDraft.video ? (
                      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                        <VideoCard video={composerDraft.video} label={composerDraft.attachmentSource === "capture" ? "Recorded clip" : "Uploaded video"} />
                        <div className="flex flex-col gap-2">
                          <button type="button" onClick={() => updateComposerDraft({ image: null, annotatedImage: null, video: null, attachmentSource: null })} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">
                            Remove
                          </button>
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">
                            Replace
                          </button>
                        </div>
                      </div>
                    ) : composerDraft.image ? (
                      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                        <ScreenshotCard image={composerDraft.annotatedImage || composerDraft.image} label={composerDraft.annotatedImage ? "Annotated preview" : "Screenshot preview"} />
                        <div className="flex flex-col gap-2">
                          <button type="button" onClick={() => updateComposerDraft({ image: null, annotatedImage: null, video: null, attachmentSource: null })} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">
                            Remove
                          </button>
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">
                            Replace
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/80 p-4 text-sm text-zinc-500">
                        <AlertCircle className="mt-0.5 shrink-0 text-orange-500" size={16} />
                        <p>Skip attachments if the bug is obvious from the description. Fast signal still beats abandoned ceremony.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-zinc-900 px-6 py-5">
                  <p className="text-xs text-zinc-500">Required fields: title and what happened.</p>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setComposerDraft(emptyComposerDraft())} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-400">
                      Reset
                    </button>
                    <button type="submit" disabled={isSubmitting || !composerDraft.title.trim() || !composerDraft.summary.trim()} className="flex items-center gap-2 rounded-2xl bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-orange-950/30 disabled:cursor-not-allowed disabled:opacity-60">
                      {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      {isSubmitting ? "Submitting..." : "Submit Report"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isHistoryOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeOverlays} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }} className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-zinc-800 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
              <div className="flex items-center justify-between border-b border-zinc-900 px-6 py-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-orange-400">My Reports</p>
                  <h2 className="mt-2 text-2xl font-bold">{gameTitle}</h2>
                  <p className="mt-1 text-sm text-zinc-500">Browse what you already filed without polluting the report flow.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={openComposer} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
                    New Report
                  </button>
                  <button type="button" onClick={closeOverlays} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Close
                  </button>
                </div>
              </div>

              <div className="grid flex-1 overflow-hidden xl:grid-cols-[360px_1fr]">
                <div className="overflow-y-auto border-b border-zinc-900 p-4 xl:border-b-0 xl:border-r">
                  <div className="space-y-3">
                    {gameReports.map((report) => {
                      const preview = report.annotatedImage || report.image;
                      return (
                        <button
                          key={report.id}
                          type="button"
                          onClick={() => setActiveReportId(report.id)}
                          className={cn(
                            "flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition-colors",
                            activeReportId === report.id ? "border-orange-600 bg-orange-600/10" : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900",
                          )}
                        >
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                            {report.video ? (
                              <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-500">
                                <Video size={22} />
                              </div>
                            ) : preview ? (
                              <img src={preview} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ClipboardList className="text-zinc-600" size={24} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-bold">{report.title}</span>
                              <StatusPill status={report.status} />
                            </div>
                            <p className="line-clamp-2 text-xs text-zinc-500">{report.description || "No extra detail yet."}</p>
                          </div>
                          <ChevronRight className="shrink-0 text-zinc-700" size={18} />
                        </button>
                      );
                    })}
                    {gameReports.length === 0 && (
                      <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 p-8 text-center text-sm text-zinc-500">
                        No reports for this game yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-y-auto p-6">
                  {activeReport && editorDraft ? (
                    <div className="space-y-6">
                      <button type="button" onClick={() => setActiveReportId(null)} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500 xl:hidden">
                        <ArrowLeft size={14} />
                        Back to list
                      </button>

                      <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
                        <ReportPreview image={activeReportPreview} video={activeReport.video} />
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill status={activeReport.status} />
                            <PriorityPill priority={activeReport.priority} />
                          </div>
                          <div className="grid gap-4">
                            <ReportField label="Title">
                              <input type="text" value={editorDraft.title} disabled={!canEditActiveReport} onChange={(e) => setEditorDraft((current) => current ? { ...current, title: e.target.value } : current)} className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/40 disabled:cursor-not-allowed disabled:opacity-70" />
                            </ReportField>
                            <ReportField label="Description">
                              <textarea value={editorDraft.description} disabled={!canEditActiveReport} onChange={(e) => setEditorDraft((current) => current ? { ...current, description: e.target.value } : current)} className="h-40 w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/40 disabled:cursor-not-allowed disabled:opacity-70" />
                            </ReportField>
                          </div>

                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-500">Conversation</p>
                            <div className="space-y-3">
                              {activeReport.messages.length > 0 ? activeReport.messages.map((message) => (
                                <div key={message.id} className={cn("rounded-2xl px-4 py-3 text-sm leading-relaxed", message.authorRole === "admin" ? "border border-orange-500/20 bg-orange-500/8 text-zinc-200" : "border border-zinc-800 bg-zinc-900 text-zinc-300")}>
                                  <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest">
                                    <span className={message.authorRole === "admin" ? "text-orange-400" : "text-zinc-400"}>{message.authorName}</span>
                                    <span className="text-zinc-600">{new Date(message.createdAt).toLocaleString()}</span>
                                  </div>
                                  <p className="whitespace-pre-wrap">{message.body}</p>
                                </div>
                              )) : <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900 px-4 py-4 text-sm text-zinc-500">No messages yet.</div>}
                            </div>
                            <div className="mt-4 space-y-3">
                              <textarea value={draftReply} onChange={(e) => setDraftReply(e.target.value)} className="h-28 w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/40" placeholder="Reply to the other side without overwriting the report." />
                              <div className="flex justify-end">
                                <button type="button" onClick={() => void sendReply()} disabled={isSavingReport || !draftReply.trim()} className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-950/30 disabled:opacity-60">
                                  {isSavingReport ? "Sending..." : "Send Reply"}
                                </button>
                              </div>
                            </div>
                          </div>

                          {canChangeStatus && (
                            <div className="grid grid-cols-3 gap-2">
                              {(["open", "pending", "fixed"] as const).map((status) => (
                                <button key={status} type="button" disabled={isSavingReport} onClick={() => void handleStatusChange(status)} className={cn("rounded-2xl border px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors", activeReport.status === status ? "border-orange-600 bg-orange-600 text-white" : "border-zinc-800 bg-zinc-900 text-zinc-400")}>
                                  {status}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                            <div className="flex items-center gap-2">
                              <UserIcon size={12} />
                              {activeReport.authorName}
                            </div>
                            <div>Updated {new Date(activeReport.updatedAt).toLocaleString()}</div>
                          </div>

                          <div className="flex flex-wrap justify-between gap-3">
                            {canEditActiveReport ? (
                              <button type="button" onClick={() => void saveReportEdits()} disabled={isSavingReport} className="flex items-center gap-2 rounded-2xl bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-950/30 disabled:opacity-60">
                                {isSavingReport ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                                {isSavingReport ? "Saving..." : "Save Changes"}
                              </button>
                            ) : (
                              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
                                Testers cannot change workflow state.
                              </div>
                            )}

                            {canEditActiveReport && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDeleteReport(activeReport.id);
                                  setActiveReportId(gameReports.find((report) => report.id !== activeReport.id)?.id ?? null);
                                }}
                                className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-300"
                              >
                                <Trash2 size={16} />
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 text-sm text-zinc-500">
                      Select a report to inspect it.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function FormSection({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <div><div className="mb-2"><p className="text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-500">{label}</p><p className="mt-1 text-sm text-zinc-500">{hint}</p></div>{children}</div>;
}

function ReportField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-500">{label}</p>{children}</div>;
}

function ScreenshotCard({ image, label }: { image: string; label: string }) {
  return <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"><img src={image} alt={label} className="aspect-video w-full object-cover" /><div className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500">{label}</div></div>;
}

function VideoCard({ video, label }: { video: string; label: string }) {
  return <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"><video src={video} className="aspect-video w-full object-cover" controls preload="metadata" /><div className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500">{label}</div></div>;
}

function ReportPreview({ image, video }: { image: string | null; video: string | null }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
      {video ? (
        <video src={video} className="aspect-video w-full object-contain" controls preload="metadata" />
      ) : image ? (
        <img src={image} alt="" className="aspect-video w-full object-contain" />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 text-zinc-500"><ImagePlus size={28} /><p className="text-sm">This report has no attachment.</p></div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: BugReport["status"] }) {
  return <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest", status === "open" ? "bg-red-500/15 text-red-300" : status === "pending" ? "bg-amber-500/15 text-amber-300" : "bg-green-500/15 text-green-300")}>{status}</span>;
}

function PriorityPill({ priority }: { priority: BugReport["priority"] }) {
  return <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest", priority === "high" ? "bg-red-500/15 text-red-300" : priority === "medium" ? "bg-orange-500/15 text-orange-300" : "bg-blue-500/15 text-blue-300")}>{priority}</span>;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Unable to read captured clip."));
    reader.readAsDataURL(blob);
  });
}
