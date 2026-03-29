import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { 
  Gamepad2, 
  Bug, 
  Camera, 
  Upload, 
  ExternalLink, 
  ChevronRight, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Trash2,
  Plus,
  ArrowLeft,
  Sparkles,
  Download,
  Copy,
  Loader2,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AnnotationCanvas from './AnnotationCanvas';
import { GoogleGenAI } from "@google/genai";
import { cn } from '@/src/lib/utils';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc, updateDoc, addDoc, increment } from 'firebase/firestore';

interface BugReport {
  id: string;
  timestamp: number;
  image: string;
  annotatedImage?: string;
  title: string;
  description: string;
  status: 'open' | 'fixed' | 'pending';
  aiAnalysis?: string;
  authorUid: string;
  authorName: string;
}

interface GameTesterProps {
  initialUrl?: string;
}

export default function GameTester({ initialUrl }: GameTesterProps) {
  const [gameUrl, setGameUrl] = useState(initialUrl || 'https://www.google.com/logos/2010/pacman10-i.html');
  const [inputUrl, setInputUrl] = useState(gameUrl);

  useEffect(() => {
    if (initialUrl) {
      setGameUrl(initialUrl);
      setInputUrl(initialUrl);
    }
  }, [initialUrl]);
  const [reports, setReports] = useState<BugReport[]>([]);
  const [activeReport, setActiveReport] = useState<BugReport | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'reports' | 'settings'>('reports');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync reports from Firestore
  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const syncedReports = snapshot.docs.map(doc => ({
        ...doc.data()
      } as BugReport));
      setReports(syncedReports);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
    });

    return () => unsubscribe();
  }, []);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGameUrl(inputUrl);
    setIsMenuOpen(false);
  };

  const takeScreenshot = async () => {
    setIsCapturing(true);
    setIsMenuOpen(false);

    try {
      // Use the Screen Capture API to get a stream of the current tab/window
      // This is the only way to reliably capture cross-origin iframes (games)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          displaySurface: 'browser',
        },
        // @ts-ignore - Some browsers support this to auto-select current tab
        preferCurrentTab: true,
        audio: false
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      
      // Wait for video to be ready and playing
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve);
        };
      });

      // Create a canvas to grab the frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);

      // Stop all tracks to close the "sharing" indicator
      stream.getTracks().forEach(track => track.stop());

      const dataUrl = canvas.toDataURL('image/png');
      
      const newReport: BugReport = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        image: dataUrl,
        title: `Bug Report ${reports.length + 1}`,
        description: '',
        status: 'open',
        authorUid: auth.currentUser?.uid || 'unknown',
        authorName: auth.currentUser?.displayName || 'Anonymous'
      };
      
      setActiveReport(newReport);
      setIsAnnotating(true);
    } catch (error) {
      console.error("Screenshot failed:", error);
      if (error instanceof Error && error.name !== 'NotAllowedError') {
        alert("Screenshot failed. Please ensure you grant permission to share your screen/tab to capture the game.");
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newReport: BugReport = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          image: event.target?.result as string,
          title: 'Manual Upload Report',
          description: '',
          status: 'open',
          authorUid: auth.currentUser?.uid || 'unknown',
          authorName: auth.currentUser?.displayName || 'Anonymous'
        };
        setActiveReport(newReport);
        setIsAnnotating(true);
        setIsMenuOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveAnnotation = async (annotatedDataUrl: string) => {
    if (activeReport) {
      const updatedReport = { ...activeReport, annotatedImage: annotatedDataUrl };
      
      try {
        await setDoc(doc(db, 'reports', updatedReport.id), updatedReport);
        
        // Update user stats: increment total reports
        if (auth.currentUser) {
          const userRef = doc(db, 'users', auth.currentUser.uid);
          await updateDoc(userRef, {
            'stats.totalReports': increment(1)
          });
        }

        setActiveReport(updatedReport);
        setIsAnnotating(false);
        setIsMenuOpen(true); // Re-open menu to show the report
        analyzeBug(updatedReport);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `reports/${updatedReport.id}`);
      }
    }
  };

  const analyzeBug = async (report: BugReport) => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Analyze this annotated game screenshot. Identify the bug based on the annotations (arrows, circles, text) and provide a technical description for a developer. Keep it concise." },
            { inlineData: { mimeType: "image/png", data: report.annotatedImage!.split(',')[1] } }
          ]
        }
      });
      
      const analysis = response.text;
      const reportRef = doc(db, 'reports', report.id);
      await updateDoc(reportRef, { aiAnalysis: analysis });
      
      if (activeReport?.id === report.id) {
        setActiveReport(prev => prev ? { ...prev, aiAnalysis: analysis } : null);
      }
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteReport = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'reports', id));
      if (activeReport?.id === id) setActiveReport(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `reports/${id}`);
    }
  };

  const updateReportStatus = async (id: string, status: BugReport['status']) => {
    try {
      const reportRef = doc(db, 'reports', id);
      const oldStatus = reports.find(r => r.id === id)?.status;
      
      await updateDoc(reportRef, { status });
      
      // Update user stats: if status changed to fixed, increment fixedReports
      if (status === 'fixed' && oldStatus !== 'fixed' && auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          'stats.fixedReports': increment(1)
        });
      }

      if (activeReport?.id === id) setActiveReport(prev => prev ? { ...prev, status } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${id}`);
    }
  };

  const updateReportTitle = async (id: string, title: string) => {
    try {
      await updateDoc(doc(db, 'reports', id), { title });
      if (activeReport?.id === id) setActiveReport(prev => prev ? { ...prev, title } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${id}`);
    }
  };

  if (isAnnotating && activeReport) {
    return (
      <AnnotationCanvas 
        image={activeReport.image} 
        onSave={saveAnnotation} 
        onCancel={() => setIsAnnotating(false)} 
      />
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      {/* Fullscreen Game Viewport */}
      <iframe 
        src={gameUrl} 
        className="w-full h-full border-none"
        title="Game View"
        allow="camera; microphone; geolocation"
      />

      {/* Floating Action Button (Collapsible Icon) */}
      <motion.button
        id="tester-fab"
        layoutId="tester-fab"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={cn(
          "fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl z-50 transition-colors",
          isMenuOpen ? "bg-zinc-800 text-zinc-400" : "bg-orange-600 text-white"
        )}
        whileTap={{ scale: 0.9 }}
      >
        {isMenuOpen ? <Plus className="rotate-45" size={24} /> : <Bug size={24} />}
      </motion.button>

      {/* Capturing Overlay */}
      <AnimatePresence>
        {isCapturing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center"
          >
            <Loader2 className="text-orange-500 animate-spin mb-4" size={48} />
            <p className="text-xl font-bold text-white">Capturing Screenshot...</p>
            <p className="text-sm text-zinc-500 mt-2">Please wait while we grab the current view.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsible Tester Interface */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop for mobile focus */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />

            {/* Bottom Sheet UI */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 h-[85vh] bg-zinc-950 border-t border-zinc-800 rounded-t-[32px] z-50 flex flex-col overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
            >
              {/* Handle */}
              <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto my-4" />

              {/* Header */}
              <div className="px-6 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Bug className="text-orange-500" size={20} />
                    Tester Suite
                  </h2>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Testing Suite</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={takeScreenshot}
                    className="flex items-center gap-2 px-6 py-3 bg-orange-600 rounded-2xl text-white shadow-lg shadow-orange-900/40 active:scale-95 transition-transform font-bold text-sm"
                    title="Take System Screenshot"
                  >
                    <Camera size={20} />
                    Take Screenshot
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex px-6 border-b border-zinc-900">
                <button 
                  onClick={() => setActiveTab('reports')}
                  className={cn(
                    "flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2",
                    activeTab === 'reports' ? "text-orange-500 border-orange-500" : "text-zinc-500 border-transparent"
                  )}
                >
                  Reports ({reports.length})
                </button>
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={cn(
                    "flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2",
                    activeTab === 'settings' ? "text-orange-500 border-orange-500" : "text-zinc-500 border-transparent"
                  )}
                >
                  Game Config
                </button>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'reports' ? (
                  <div className="space-y-4">
                    {activeReport ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-6"
                      >
                        <button 
                          onClick={() => setActiveReport(null)}
                          className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase"
                        >
                          <ArrowLeft size={14} /> Back to list
                        </button>

                        <div className="aspect-video rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 relative group">
                          <img src={activeReport.annotatedImage || activeReport.image} alt="" className="w-full h-full object-contain" />
                          <button 
                            onClick={() => setIsAnnotating(true)}
                            className="absolute bottom-4 right-4 px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-[10px] font-bold uppercase"
                          >
                            Edit Annotations
                          </button>
                        </div>

                        <div className="space-y-4">
                          <input 
                            type="text" 
                            value={activeReport.title}
                            onChange={(e) => updateReportTitle(activeReport.id, e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm font-medium focus:ring-2 focus:ring-orange-600/50 outline-none"
                            placeholder="Report Title"
                          />

                          <div className={cn(
                            "p-4 rounded-2xl border text-sm leading-relaxed",
                            isAnalyzing ? "bg-zinc-900/50 border-zinc-800 italic text-zinc-500" : "bg-orange-600/5 border-orange-600/20 text-zinc-300"
                          )}>
                            {isAnalyzing ? (
                              <div className="flex items-center gap-3">
                                <Sparkles className="animate-pulse text-orange-500" size={18} />
                                Analyzing...
                              </div>
                            ) : activeReport.aiAnalysis ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-orange-400 font-bold text-[10px] uppercase tracking-widest flex items-center gap-1">
                                    <Sparkles size={12} /> Gemini Insights
                                  </span>
                                  <button onClick={() => navigator.clipboard.writeText(activeReport.aiAnalysis!)} className="text-zinc-500"><Copy size={12} /></button>
                                </div>
                                {activeReport.aiAnalysis}
                              </div>
                            ) : (
                              <button onClick={() => analyzeBug(activeReport)} className="text-orange-500 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                                <Sparkles size={14} /> Generate Analysis
                              </button>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {(['open', 'pending', 'fixed'] as const).map((s) => (
                              <button
                                key={s}
                                onClick={() => updateReportStatus(activeReport.id, s)}
                                className={cn(
                                  "flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all",
                                  activeReport.status === s 
                                    ? "bg-orange-600 border-orange-600 text-white" 
                                    : "bg-zinc-900 border-zinc-800 text-zinc-500"
                                )}
                              >
                                {s}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                              <UserIcon size={12} />
                              {activeReport.authorName}
                            </div>
                            {activeReport.authorUid === auth.currentUser?.uid && (
                              <button onClick={() => deleteReport(activeReport.id)} className="text-red-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                                <Trash2 size={12} /> Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {reports.map((report) => (
                          <motion.div
                            key={report.id}
                            layoutId={report.id}
                            onClick={() => setActiveReport(report)}
                            className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex gap-4 items-center active:scale-[0.98] transition-transform"
                          >
                            <div className="w-20 h-20 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 flex-shrink-0">
                              <img src={report.annotatedImage || report.image} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-sm truncate mb-1">{report.title}</h3>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">
                                <Clock size={10} />
                                {new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full",
                                  report.status === 'open' ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                                )}>
                                  {report.status}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="text-zinc-700" size={20} />
                          </motion.div>
                        ))}
                        {reports.length === 0 && (
                          <div className="text-center py-20">
                            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
                              <Camera className="text-zinc-700" size={24} />
                            </div>
                            <h3 className="font-bold text-zinc-400 mb-1">No reports found</h3>
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
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Game URL</label>
                        <div className="relative">
                          <Gamepad2 className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                          <input 
                            type="text" 
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-orange-600/50 outline-none"
                          />
                        </div>
                      </div>
                      <button className="w-full py-4 bg-zinc-100 text-black rounded-xl font-bold text-sm shadow-xl active:scale-95 transition-all">
                        Reload Game
                      </button>
                    </form>

                    <div className="space-y-4">
                      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Troubleshooting</h3>
                      <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
                        <div className="flex gap-3 mb-4">
                          <AlertCircle className="text-orange-500 shrink-0" size={18} />
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            <span className="text-orange-400 font-bold block mb-1 uppercase tracking-tighter">System Capture</span>
                            To capture the game and the tester UI together, use the <strong>Take Screenshot</strong> button above. It bypasses security restrictions by capturing the tab directly.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-[10px] font-bold transition-colors flex items-center justify-center gap-2 uppercase tracking-widest"
                          >
                            <Upload size={14} />
                            Manual Upload
                          </button>
                        </div>
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
