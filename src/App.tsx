import React, { useState, useEffect } from 'react';
import GameTester from './components/GameTester';
import Sidebar from './components/Sidebar';
import { auth, loginWithGoogle, logout, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, query, where, getDoc, addDoc, orderBy, deleteDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Bug, LogIn, Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTesters, setActiveTesters] = useState<Array<{ id: string; name: string; status: 'online' | 'offline' }>>([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedGame, setSelectedGame] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);

      if (currentUser) {
        // Update user profile in Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          // Check if user exists first to preserve role if already set
          const docSnap = await getDoc(userRef);
          const existingData = docSnap.exists() ? docSnap.data() : {};
          
          const role = existingData.role || (currentUser.email === 'wimpievanloggenberg@gmail.com' ? 'admin' : 'tester');
          
          // Force admin role for Wimpie if it was accidentally changed or not set correctly
          if (currentUser.email === 'wimpievanloggenberg@gmail.com' && existingData.role !== 'admin') {
            await setDoc(userRef, { role: 'admin' }, { merge: true });
          }
          const stats = existingData.stats || { totalReports: 0, fixedReports: 0 };

          const initialData = {
            uid: currentUser.uid,
            name: currentUser.displayName || 'Anonymous Tester',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || '',
            status: 'online',
            lastSeen: new Date().toISOString(),
            role: role,
            stats: stats
          };
          await setDoc(userRef, initialData, { merge: true });
          
          // Listen to user profile changes
          onSnapshot(userRef, (doc) => {
            setUserProfile(doc.data());
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen for active testers (Admin only)
  useEffect(() => {
    if (!user || userProfile?.role !== 'admin') {
      setActiveTesters([]);
      return;
    }

    // Bootstrap initial games if none exist
    const bootstrapGames = async () => {
      try {
        const gamesSnap = await getDoc(doc(db, 'system', 'bootstrap'));
        if (!gamesSnap.exists()) {
          const initialGames = [
            { title: 'Eco Dominion', url: 'https://aureus-eco-dominion.vercel.app/', description: 'A strategy game focused on ecological balance and dominion.' },
            { title: 'Bureaucracy', url: 'https://aureus-bureaucracy.vercel.app/', description: 'Navigate the complex world of administrative hurdles.' }
          ];
          
          for (const game of initialGames) {
            await addDoc(collection(db, 'games'), {
              ...game,
              createdAt: Date.now()
            });
          }
          await setDoc(doc(db, 'system', 'bootstrap'), { completed: true });
        }
      } catch (error) {
        console.error("Bootstrap failed:", error);
      }
    };
    bootstrapGames();

    const q = query(collection(db, 'users'), where('status', '==', 'online'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const testers = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        status: doc.data().status as 'online' | 'offline'
      }));
      setActiveTesters(testers.filter(t => t.id !== user.uid));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [user, userProfile?.role]);

  if (!isAuthReady) {
    return (
      <div className="w-full h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="text-orange-500 animate-spin" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-full h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-orange-900/40">
          <Bug size={40} className="text-white" />
        </div>
        <h1 className="text-4xl font-bold mb-4 tracking-tight">Game Tester Pro</h1>
        <p className="text-zinc-500 max-w-xs mb-12 leading-relaxed">
          The professional suite for collaborative game testing and bug reporting.
        </p>
        <button 
          onClick={loginWithGoogle}
          className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-2xl font-bold text-lg shadow-xl hover:bg-zinc-200 transition-all active:scale-95"
        >
          <LogIn size={20} />
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex bg-zinc-950 text-white overflow-hidden">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)} 
        user={userProfile}
        activeTesters={activeTesters}
        onLogout={logout}
        activeView={activeView}
        onViewChange={(view) => {
          setActiveView(view);
          if (view !== 'testing') setSelectedGame(null);
        }}
      />
      
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeView === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 h-full overflow-y-auto"
            >
              <h1 className="text-3xl font-bold mb-8">Tester Dashboard</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
                  <p className="text-zinc-500 text-sm uppercase tracking-widest font-bold mb-2">Total Reports</p>
                  <p className="text-5xl font-bold text-orange-500">{userProfile?.stats?.totalReports || 0}</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
                  <p className="text-zinc-500 text-sm uppercase tracking-widest font-bold mb-2">Fixed Bugs</p>
                  <p className="text-5xl font-bold text-green-500">{userProfile?.stats?.fixedReports || 0}</p>
                </div>
              </div>
              
              <h2 className="text-xl font-bold mb-6">Recent Activity</h2>
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 text-center text-zinc-500">
                No recent activity to show. Start testing to see your progress!
              </div>
            </motion.div>
          )}

          {activeView === 'admin-management' && userProfile?.role === 'admin' && (
            <motion.div
              key="admin-management"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 h-full overflow-y-auto"
            >
              <AdminDashboard activeTesters={activeTesters} initialTab="management" />
            </motion.div>
          )}

          {activeView === 'admin-analytics' && userProfile?.role === 'admin' && (
            <motion.div
              key="admin-analytics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 h-full overflow-y-auto"
            >
              <AdminDashboard activeTesters={activeTesters} initialTab="analytics" />
            </motion.div>
          )}

          {activeView === 'games' && (
            <motion.div
              key="games"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 h-full overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">Available Games</h1>
                {userProfile?.role === 'admin' && (
                  <button 
                    onClick={() => {
                      setActiveView('admin-management');
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-zinc-900 border border-zinc-800 text-white rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-colors"
                  >
                    <Plus size={18} /> Manage Games
                  </button>
                )}
              </div>
              <GameList onSelectGame={(game) => {
                setSelectedGame(game);
                setActiveView('testing');
                setIsSidebarOpen(false);
              }} />
            </motion.div>
          )}

          {activeView === 'testing' && selectedGame && (
            <motion.div
              key="testing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <GameTester initialUrl={selectedGame.url} />
            </motion.div>
          )}

          {activeView === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="p-8 h-full overflow-y-auto"
            >
              <h1 className="text-3xl font-bold mb-8">Personalization</h1>
              <div className="space-y-8 max-w-2xl">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Interface Settings</h3>
                  <div className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
                    <div>
                      <p className="font-bold">Dark Mode</p>
                      <p className="text-xs text-zinc-500">Always on for professional testing.</p>
                    </div>
                    <div className="w-12 h-6 bg-orange-600 rounded-full relative">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Notification Preferences</h3>
                  <div className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
                    <div>
                      <p className="font-bold">Bug Fix Alerts</p>
                      <p className="text-xs text-zinc-500">Get notified when your reported bugs are fixed.</p>
                    </div>
                    <div className="w-12 h-6 bg-zinc-800 rounded-full relative">
                      <div className="absolute left-1 top-1 w-4 h-4 bg-zinc-600 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// Helper Components
function GameList({ onSelectGame }: { onSelectGame: (game: any) => void }) {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGames(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <Loader2 className="animate-spin text-orange-500 mx-auto mt-20" />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {games.map(game => (
        <motion.div
          key={game.id}
          whileHover={{ y: -5 }}
          onClick={() => onSelectGame(game)}
          className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden cursor-pointer group"
        >
          <div className="aspect-video bg-zinc-800 relative">
            {game.thumbnail ? (
              <img src={game.thumbnail} alt={game.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-700">
                <Gamepad2 size={48} />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button className="px-6 py-2 bg-orange-600 text-white rounded-full font-bold text-sm">Start Testing</button>
            </div>
          </div>
          <div className="p-6">
            <h3 className="font-bold text-lg mb-1">{game.title}</h3>
            <p className="text-xs text-zinc-500 line-clamp-2">{game.description}</p>
          </div>
        </motion.div>
      ))}
      {games.length === 0 && (
        <div className="col-span-full text-center py-20 text-zinc-600">
          No games available for testing yet.
        </div>
      )}
    </div>
  );
}

import { Gamepad2, Users, Plus, Trash2, Globe, BarChart3, PieChart as PieChartIcon, Activity } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';

function AdminDashboard({ 
  activeTesters, 
  initialTab = 'management'
}: { 
  activeTesters: any[], 
  initialTab?: 'management' | 'analytics'
}) {
  const [newGame, setNewGame] = useState({ title: '', url: '', description: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [games, setGames] = useState<any[]>([]);
  const [bugs, setBugs] = useState<any[]>([]);
  const activeTab = initialTab;

  useEffect(() => {
    const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGames(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBugs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGame.title || !newGame.url) return;
    
    try {
      await addDoc(collection(db, 'games'), {
        ...newGame,
        createdAt: Date.now()
      });
      setNewGame({ title: '', url: '', description: '' });
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'games');
    }
  };

  const handleDeleteGame = async (id: string) => {
    if (!confirm('Are you sure you want to remove this game?')) return;
    try {
      await deleteDoc(doc(db, 'games', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `games/${id}`);
    }
  };

  // Analytics Data Processing
  const statusData = [
    { name: 'Open', value: bugs.filter(b => b.status === 'open').length, color: '#ef4444' },
    { name: 'In Progress', value: bugs.filter(b => b.status === 'in-progress').length, color: '#f59e0b' },
    { name: 'Fixed', value: bugs.filter(b => b.status === 'fixed').length, color: '#10b981' },
  ].filter(d => d.value > 0);

  const bugsByDate = bugs.reduce((acc: any, bug) => {
    const date = new Date(bug.timestamp).toLocaleDateString();
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  const timelineData = Object.entries(bugsByDate).map(([date, count]) => ({
    date,
    count
  })).slice(-7);

  const testerStats = bugs.reduce((acc: any, bug) => {
    const name = bug.authorName || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const topTestersData = Object.entries(testerStats).map(([name, count]) => ({
    name,
    count
  })).sort((a: any, b: any) => b.count - a.count).slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {activeTab === 'management' ? 'Game Management' : 'System Analytics'}
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            {activeTab === 'management' ? 'Manage your game library and active testers' : 'Real-time system insights and metrics'}
          </p>
        </div>
      </div>

      {activeTab === 'management' ? (
        <div className="space-y-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Game Library</h2>
            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-orange-900/20"
            >
              <Plus size={18} /> Add New Game
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-12">
              <section>
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Manage Games ({games.length})</h2>
                <div className="space-y-4">
                  {games.map(game => (
                    <div key={game.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500">
                          <Gamepad2 size={24} />
                        </div>
                        <div>
                          <p className="font-bold">{game.title}</p>
                          <p className="text-xs text-zinc-500 truncate max-w-[200px]">{game.url}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteGame(game.id)}
                        className="p-3 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  {games.length === 0 && (
                    <div className="text-center py-12 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl text-zinc-600">
                      No games added yet.
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Active Testers ({activeTesters.length})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeTesters.map(tester => (
                    <div key={tester.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex items-center gap-4">
                      <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center">
                        <Users size={20} className="text-zinc-500" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{tester.name}</p>
                        <p className="text-[10px] text-green-500 uppercase font-bold">Online</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-8">
              <section>
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">System Health</h2>
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400 text-sm">Total Testers</span>
                    <span className="font-bold">{activeTesters.length + 1}</span>
                  </div>
                  <div className="h-px bg-zinc-800" />
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400 text-sm">Active Sessions</span>
                    <span className="font-bold text-green-500">Live</span>
                  </div>
                  <div className="h-px bg-zinc-800" />
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400 text-sm">Total Bugs</span>
                    <span className="font-bold text-orange-500">{bugs.length}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg">
                  <Activity size={20} />
                </div>
                <h3 className="font-bold text-zinc-400 text-sm uppercase tracking-widest">Total Reports</h3>
              </div>
              <p className="text-4xl font-bold">{bugs.length}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-500/10 text-green-500 rounded-lg">
                  <Activity size={20} />
                </div>
                <h3 className="font-bold text-zinc-400 text-sm uppercase tracking-widest">Resolution Rate</h3>
              </div>
              <p className="text-4xl font-bold">
                {bugs.length > 0 ? Math.round((bugs.filter(b => b.status === 'fixed').length / bugs.length) * 100) : 0}%
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                  <Activity size={20} />
                </div>
                <h3 className="font-bold text-zinc-400 text-sm uppercase tracking-widest">Active Games</h3>
              </div>
              <p className="text-4xl font-bold">{games.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[32px]">
              <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
                <BarChart3 size={20} className="text-orange-500" />
                Report Timeline
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                      itemStyle={{ color: '#f97316' }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[32px]">
              <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
                <PieChartIcon size={20} className="text-orange-500" />
                Status Distribution
              </h3>
              <div className="h-[300px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-4 ml-4">
                  {statusData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-xs text-zinc-400">{d.name}: {d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[32px] lg:col-span-2">
              <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
                <BarChart3 size={20} className="text-orange-500" />
                Top Performing Testers
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topTestersData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} width={100} />
                    <Tooltip 
                      cursor={{ fill: '#27272a' }}
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    />
                    <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <h2 className="text-2xl font-bold mb-6">Add New Game</h2>
                <form onSubmit={handleAddGame} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Game Title</label>
                    <input 
                      type="text" 
                      required
                      value={newGame.title}
                      onChange={(e) => setNewGame({ ...newGame, title: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Game URL</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input 
                        type="url" 
                        required
                        value={newGame.url}
                        onChange={(e) => setNewGame({ ...newGame, url: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-12 pr-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Description</label>
                    <textarea 
                      value={newGame.description}
                      onChange={(e) => setNewGame({ ...newGame, description: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-orange-600/50 h-24 resize-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="flex-1 py-4 bg-zinc-900 text-zinc-400 rounded-xl font-bold text-sm"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-4 bg-orange-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-orange-900/20"
                    >
                      Save Game
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
