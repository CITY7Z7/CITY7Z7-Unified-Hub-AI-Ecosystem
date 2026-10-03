/**
 * @license AGPL-3.0
 * App.tsx - Главный компонент объединённой экосистемы Lab + ToolHub.
 */

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ContextSidebar } from './components/ContextSidebar';
import { SettingsModal } from './components/SettingsModal';
import { UnifiedHeader, type UnifiedTab } from './components/UnifiedHeader';
import { useChatStore } from './store/useChatStore';
import { Categories } from './admin/pages/Categories';
import { Runners } from './admin/pages/Runners';
import { Processes } from './admin/pages/Processes';
import { Logs } from './admin/pages/Logs';
import { Playground } from './admin/pages/Playground';
import { AdminSettingsModal } from './admin/components/AdminSettingsModal';
import { Toaster, toast } from 'sonner';
import { KeyRound, Lock, X } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { useI18n } from './lib/i18n';

// Перехват fetch для автоматического добавления x-admin-password
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    let [resource, config] = args;
    const url = typeof resource === 'string' ? resource : (resource instanceof URL ? resource.href : (resource as Request).url);
    if (url.includes('/admin/api/')) {
      config = config || {};
      const headers = new Headers(config.headers || {});
      const savedPass = localStorage.getItem('admin_password') || '';
      if (savedPass) {
        headers.set('x-admin-password', savedPass);
      }
      config.headers = headers;
    }
    const response = await originalFetch(resource, config);
    if (response.status === 401 && url.includes('/admin/api/') && !url.includes('/admin/api/auth/verify')) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    return response;
  };
}

export default function App() {
  const { t } = useI18n();

  const [currentTab, setCurrentTab] = useState<UnifiedTab>(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const hash = window.location.hash;
      if (pathname.startsWith('/admin') || hash.includes('admin')) {
        return 'categories';
      }
    }
    return 'lab';
  });

  const [isLabSettingsOpen, setIsLabSettingsOpen] = useState(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [isAdminAuthDialogOpen, setIsAdminAuthDialogOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? !!localStorage.getItem('admin_password') : false;
  });

  const loadProviders = useChatStore((state) => state.loadProviders);
  const theme = useChatStore((state) => state.theme);
  const isLeftSidebarOpen = useChatStore((state) => state.isLeftSidebarOpen);
  const setLeftSidebarOpen = useChatStore((state) => state.setLeftSidebarOpen);
  const isContextSidebarOpen = useChatStore((state) => state.isContextSidebarOpen);
  const setContextSidebarOpen = useChatStore((state) => state.setContextSidebarOpen);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAdminAuthenticated(false);
      toast.error(t('auth.session_expired') || 'Admin session expired. Please re-authenticate.');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [t]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/admin/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordInput })
      });
      if (res.ok) {
        localStorage.setItem('admin_password', adminPasswordInput);
        setIsAdminAuthenticated(true);
        setIsAdminAuthDialogOpen(false);
        setAdminPasswordInput('');
        toast.success(t('auth.granted') || 'Admin access granted');
      } else {
        toast.error(t('auth.invalid') || 'Invalid admin password');
      }
    } catch {
      toast.error(t('auth.network_error') || 'Network error connecting to Hub');
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('admin_password');
    setIsAdminAuthenticated(false);
    toast.info('Admin logged out');
  };

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-background text-foreground font-sans antialiased flex flex-col select-none">
      <Toaster position="top-right" richColors />

      {/* Верхнее меню переключения режимов */}
      <UnifiedHeader
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        isAdminAuthenticated={isAdminAuthenticated}
        onOpenAdminAuth={() => setIsAdminAuthDialogOpen(true)}
        onOpenSettings={() => {
          if (currentTab === 'lab') {
            setIsLabSettingsOpen(true);
          } else {
            setIsAdminSettingsOpen(true);
          }
        }}
        onLogoutAdmin={handleAdminLogout}
      />

      {/* Основная рабочая область */}
      <div className="flex-1 w-full h-[calc(100%-2.75rem)] overflow-hidden relative flex">
        {/* 1. Режим Lab AI Studio */}
        <div className={`w-full h-full flex ${currentTab === 'lab' ? 'flex' : 'hidden'}`}>
          {isLeftSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/70 md:hidden"
              onClick={() => setLeftSidebarOpen(false)}
            />
          )}

          {isContextSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/70 lg:hidden"
              onClick={() => setContextSidebarOpen(false)}
            />
          )}

          <Sidebar onOpenSettings={() => setIsLabSettingsOpen(true)} />
          <ChatArea />
          <ContextSidebar />
        </div>

        {/* 2. Режимы ToolHub Admin */}
        {currentTab !== 'lab' && (
          <main className="flex-1 w-full h-full overflow-hidden select-text flex flex-col bg-background">
            {currentTab === 'categories' && <Categories />}
            {currentTab === 'runners' && <Runners />}
            {currentTab === 'processes' && <Processes />}
            {currentTab === 'logs' && <Logs />}
            {currentTab === 'playground' && <Playground />}
          </main>
        )}
      </div>

      {/* Модальное окно авторизации администратора */}
      {isAdminAuthDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleAdminLogin}
            className="bg-card border border-border p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl relative"
          >
            <button
              type="button"
              onClick={() => setIsAdminAuthDialogOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-center space-y-1">
              <div className="inline-flex p-3 bg-muted rounded-full text-foreground mb-2">
                <Lock className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                {t('auth.title') || 'ToolHub Admin Access'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('auth.desc') || 'Enter admin password to unlock management features (default: admin)'}
              </p>
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder={t('auth.placeholder') || 'Enter admin password'}
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                className="h-9 text-center font-mono text-xs rounded-lg bg-background border-border"
                autoFocus
              />
              <Button type="submit" className="w-full h-9 font-semibold text-xs rounded-lg shadow-sm">
                <KeyRound className="h-4 w-4 mr-2" /> {t('auth.login') || 'Unlock Admin'}
              </Button>
            </div>
          </form>
        </div>
      )}

      <SettingsModal isOpen={isLabSettingsOpen} onClose={() => setIsLabSettingsOpen(false)} />
      <AdminSettingsModal isOpen={isAdminSettingsOpen} onClose={() => setIsAdminSettingsOpen(false)} />
    </div>
  );
}
