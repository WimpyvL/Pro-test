import React from 'react';
import { 
  Users, 
  Settings, 
  BarChart3, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  User,
  Bug,
  Gamepad2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useFloatingPosition } from '../lib/useFloatingPosition';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  user?: {
    name: string;
    email: string;
    photoURL?: string;
    role?: string;
  } | null;
  activeTesters: Array<{
    id: string;
    name: string;
    status: 'online' | 'offline';
  }>;
  onLogout?: () => void;
  activeView: string;
  accentStyle?: React.CSSProperties;
  accentSoftStyle?: React.CSSProperties;
  onViewChange: (view: string) => void;
}

export default function Sidebar({ 
  isOpen, 
  onToggle, 
  user, 
  activeTesters,
  onLogout,
  activeView,
  accentStyle,
  accentSoftStyle,
  onViewChange
}: SidebarProps) {
  const isAdmin = user?.role === 'admin';
  const collapsedToggle = useFloatingPosition(
    'tester-pro-sidebar-toggle-position',
    () => ({ x: 24, y: 24 }),
    { size: 52, margin: 16 },
  );

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Container */}
      <motion.aside
        initial={false}
        animate={{ 
          x: isOpen ? 0 : -280
        }}
        style={{ width: isOpen ? "min(280px, calc(100vw - 24px))" : 0 }}
        className={cn(
          "fixed top-0 left-0 h-[100dvh] bg-zinc-950 border-r border-zinc-800 z-50 flex flex-col overflow-hidden shadow-2xl transition-all lg:relative lg:translate-x-0",
          !isOpen && "lg:w-0 lg:border-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-900 p-4 shrink-0 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={accentStyle}>
              <Bug size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Tester Pro</span>
          </div>
          <button 
            onClick={onToggle}
            className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-500"
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* User Profile / Account Space */}
        <div className="border-b border-zinc-900 p-4 shrink-0 sm:p-6">
          {user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 overflow-hidden shadow-inner">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                      <User size={24} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{user.name}</p>
                  <p className="text-[10px] text-zinc-500 truncate uppercase tracking-widest font-bold">{user.role || 'Tester'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-center">
              <p className="text-xs text-zinc-500 mb-2">Not signed in</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 sm:p-4">
          <div className="px-3 py-2">
            <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4">Account Space</h3>
            <div className="space-y-1">
              <button 
                onClick={() => onViewChange('dashboard')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all",
                  activeView === 'dashboard' ? "bg-orange-600 text-white shadow-lg shadow-orange-900/20" : "text-zinc-400 hover:bg-zinc-900"
                )}
                style={activeView === 'dashboard' ? accentStyle : undefined}
              >
                <BarChart3 size={18} />
                My Dashboard
              </button>
              <button 
                onClick={() => onViewChange('games')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all",
                  activeView === 'games' ? "bg-orange-600 text-white shadow-lg shadow-orange-900/20" : "text-zinc-400 hover:bg-zinc-900"
                )}
                style={activeView === 'games' ? accentStyle : undefined}
              >
                <Gamepad2 size={18} />
                Available Games
              </button>
              <button 
                onClick={() => onViewChange('settings')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all",
                  activeView === 'settings' ? "bg-orange-600 text-white shadow-lg shadow-orange-900/20" : "text-zinc-400 hover:bg-zinc-900"
                )}
                style={activeView === 'settings' ? accentStyle : undefined}
              >
                <Settings size={18} />
                Personalization
              </button>
            </div>
          </div>

          {isAdmin && (
            <div className="mt-4 border-t border-zinc-900 px-3 py-6">
              <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--tp-accent)" }}>Admin Console</h3>
              
              <div className="space-y-1 mb-6">
                <button 
                  onClick={() => onViewChange('admin-management')}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all",
                    activeView === 'admin-management' ? "bg-zinc-100 text-black shadow-lg" : "text-zinc-400 hover:bg-zinc-900"
                  )}
                  style={activeView === 'admin-management' ? accentSoftStyle : undefined}
                >
                  <Gamepad2 size={18} />
                  Game Management
                </button>
                <button 
                  onClick={() => onViewChange('admin-analytics')}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all",
                    activeView === 'admin-analytics' ? "bg-zinc-100 text-black shadow-lg" : "text-zinc-400 hover:bg-zinc-900"
                  )}
                  style={activeView === 'admin-analytics' ? accentSoftStyle : undefined}
                >
                  <BarChart3 size={18} />
                  System Analytics
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-3">Active Testers</h4>
                {activeTesters.map(tester => (
                  <div key={tester.id} className="flex items-center justify-between px-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        tester.status === 'online' ? "bg-green-500" : "bg-zinc-700"
                      )} />
                      <span className="text-xs text-zinc-400 truncate max-w-[120px]">{tester.name}</span>
                    </div>
                  </div>
                ))}
                {activeTesters.length === 0 && (
                  <p className="text-[10px] text-zinc-600 italic px-3">No other testers online</p>
                )}
              </div>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-zinc-900 p-3 shrink-0 sm:p-4">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 font-medium text-sm transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </motion.aside>

      {/* Desktop Toggle Button (when closed) */}
      {!isOpen && (
        <button
          onClick={() => {
            if (collapsedToggle.shouldSuppressClick()) {
              return;
            }
            onToggle();
          }}
          style={collapsedToggle.floatingStyle}
          className="fixed z-40 hidden rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-400 shadow-xl transition-colors hover:text-white lg:flex touch-none"
          {...collapsedToggle.dragProps}
        >
          <ChevronRight size={20} />
        </button>
      )}
    </>
  );
}
