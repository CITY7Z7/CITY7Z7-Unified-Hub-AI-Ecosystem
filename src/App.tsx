/**
 * @license AGPL-3.0
 * App.tsx - Главный компонент объединённой экосистемы Lab + ToolHub.
 * Открытая программа для работы на домашнем ПК: пароли полностью вырезаны,
 * используется только светлая тема, сайдбары адаптивные и изменяемые по ширине.
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
import { Toaster } from 'sonner';

export default function App() {
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

  const loadProviders = useChatStore((state) => state.loadProviders);
  const isLeftSidebarOpen = useChatStore((state) => state.isLeftSidebarOpen);
  const setLeftSidebarOpen = useChatStore((state) => state.setLeftSidebarOpen);
  const isContextSidebarOpen = useChatStore((state) => state.isContextSidebarOpen);
  const setContextSidebarOpen = useChatStore((state) => state.setContextSidebarOpen);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Программа всегда работает в светлой теме
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-background text-foreground font-sans antialiased flex flex-col">
      <Toaster position="top-right" richColors />

      {/* Верхнее меню переключения режимов */}
      <UnifiedHeader
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        isAdminAuthenticated={true}
        onOpenAdminAuth={() => {}}
        onOpenSettings={() => {
          if (currentTab === 'lab') {
            setIsLabSettingsOpen(true);
          } else {
            setIsAdminSettingsOpen(true);
          }
        }}
        onLogoutAdmin={() => {}}
      />

      {/* Основная рабочая область */}
      <div className="flex-1 w-full h-[calc(100%-2.75rem)] overflow-hidden relative flex">
        {/* 1. Режим Lab AI Studio */}
        <div className={`w-full h-full flex ${currentTab === 'lab' ? 'flex' : 'hidden'}`}>
          {isLeftSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setLeftSidebarOpen(false)}
            />
          )}

          {isContextSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setContextSidebarOpen(false)}
            />
          )}

          <Sidebar onOpenSettings={() => setIsLabSettingsOpen(true)} />
          <ChatArea />
          <ContextSidebar />
        </div>

        {/* 2. Режимы ToolHub Admin (Все функции открыты без пароля) */}
        {currentTab !== 'lab' && (
          <main className="flex-1 w-full h-full overflow-hidden flex flex-col bg-background">
            {currentTab === 'categories' && <Categories />}
            {currentTab === 'runners' && <Runners />}
            {currentTab === 'processes' && <Processes />}
            {currentTab === 'logs' && <Logs />}
            {currentTab === 'playground' && <Playground />}
          </main>
        )}
      </div>

      <SettingsModal isOpen={isLabSettingsOpen} onClose={() => setIsLabSettingsOpen(false)} />
      <AdminSettingsModal isOpen={isAdminSettingsOpen} onClose={() => setIsAdminSettingsOpen(false)} />
    </div>
  );
}
