/**
 * @license AGPL-3.0
 * UnifiedHeader - Верхняя навигационная панель единой экосистемы Lab + ToolHub.
 */

import React from 'react';
import { 
  Bot, 
  FolderTree, 
  Zap, 
  Cpu, 
  FileText, 
  PlayCircle, 
  Settings, 
  Lock, 
  Unlock, 
  Globe,
  Radio
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export type UnifiedTab = 'lab' | 'categories' | 'runners' | 'processes' | 'logs' | 'playground';

interface UnifiedHeaderProps {
  currentTab: UnifiedTab;
  onSelectTab: (tab: UnifiedTab) => void;
  isAdminAuthenticated: boolean;
  onOpenAdminAuth: () => void;
  onOpenSettings: () => void;
  onLogoutAdmin: () => void;
}

export const UnifiedHeader: React.FC<UnifiedHeaderProps> = ({
  currentTab,
  onSelectTab,
  isAdminAuthenticated,
  onOpenAdminAuth,
  onOpenSettings,
  onLogoutAdmin
}) => {
  const { t, lang, setLang } = useI18n();

  return (
    <header className="h-11 border-b border-border bg-card/90 backdrop-blur-md px-3 flex items-center justify-between z-30 select-none shrink-0">
      {/* Логотип и брендинг */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 font-bold text-xs tracking-wide">
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            🧪 <span className="hidden sm:inline">Lab</span>
          </span>
          <span className="text-muted-foreground font-mono">+</span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
            🛠️ <span className="hidden sm:inline">ToolHub</span>
          </span>
        </div>

        {/* Статус-индикатор Хаба */}
        <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
          <Radio className="w-2.5 h-2.5 animate-pulse" />
          <span>Hub Online :3000</span>
        </div>
      </div>

      {/* Центральное меню переключения режимов */}
      <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
        <button
          type="button"
          onClick={() => onSelectTab('lab')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'lab'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
          title="Lab AI Chat Studio"
        >
          <Bot className="w-3.5 h-3.5" />
          <span>{t('header.ai_studio') || 'AI Studio'}</span>
        </button>

        <div className="h-4 w-px bg-border mx-1" />

        <button
          type="button"
          onClick={() => onSelectTab('categories')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'categories'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
          title="ToolHub Skills & Categories"
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>{t('header.skills') || 'Skills'}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('runners')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'runners'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
          title="Runners Studio"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{t('header.runners') || 'Runners'}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('processes')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'processes'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
          title="MCP Processes Pool"
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{t('header.processes') || 'MCP Pool'}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('logs')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'logs'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
          title="Audit & Execution Logs"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{t('header.logs') || 'Logs'}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('playground')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'playground'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
          title="Agent Playground"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          <span>{t('header.playground') || 'Playground'}</span>
        </button>
      </nav>

      {/* Правая панель действий */}
      <div className="flex items-center gap-1.5">
        {/* Переключатель языка */}
        <div className="flex items-center border border-border rounded-md bg-muted/30 p-0.5 text-[11px]">
          <Globe className="w-3 h-3 text-muted-foreground ml-1 mr-0.5" />
          {(['en', 'ru', 'zh'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold transition-all ${
                lang === l
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Кнопка настроек */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          title={t('settings.title') || 'Settings'}
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Индикатор/кнопка админа */}
        {isAdminAuthenticated ? (
          <button
            type="button"
            onClick={onLogoutAdmin}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
            title="Admin Authenticated (Click to lock)"
          >
            <Unlock className="w-3 h-3" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAdminAuth}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border transition-colors"
            title="Unlock Admin Tools"
          >
            <Lock className="w-3 h-3" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        )}
      </div>
    </header>
  );
};
