/**
 * @license AGPL-3.0
 * UnifiedHeader - Верхняя навигационная панель единой экосистемы Lab + ToolHub.
 * Стильный светлый дизайн с четкими границами и тенями, без паролей и прозрачных подложек.
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
  Globe,
  Radio
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export type UnifiedTab = 'lab' | 'categories' | 'runners' | 'processes' | 'logs' | 'playground';

interface UnifiedHeaderProps {
  currentTab: UnifiedTab;
  onSelectTab: (tab: UnifiedTab) => void;
  isAdminAuthenticated?: boolean;
  onOpenAdminAuth?: () => void;
  onOpenSettings: () => void;
  onLogoutAdmin?: () => void;
}

export const UnifiedHeader: React.FC<UnifiedHeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenSettings,
}) => {
  const { t, lang, setLang } = useI18n();

  return (
    <header className="h-11 border-b border-slate-200 bg-white px-3 flex items-center justify-between z-30 select-none shrink-0 shadow-xs">
      {/* Логотип и статус */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 font-bold text-xs tracking-wide">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-semibold shadow-2xs">
            🧪 <span className="hidden sm:inline">Lab</span>
          </span>
          <span className="text-slate-400 font-mono">+</span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-semibold shadow-2xs">
            🛠️ <span className="hidden sm:inline">ToolHub</span>
          </span>
        </div>

        {/* Статус-индикатор работы */}
        <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Radio className="w-2.5 h-2.5 text-emerald-600 animate-pulse" />
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
              ? 'bg-blue-600 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Lab AI Chat Studio"
        >
          <Bot className="w-3.5 h-3.5" />
          <span>{t('header.ai_studio') || 'AI Studio'}</span>
        </button>

        <div className="h-4 w-px bg-slate-200 mx-1" />

        <button
          type="button"
          onClick={() => onSelectTab('categories')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'categories'
              ? 'bg-blue-600 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
              ? 'bg-blue-600 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
              ? 'bg-blue-600 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
              ? 'bg-blue-600 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
              ? 'bg-blue-600 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Agent Playground"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          <span>{t('header.playground') || 'Playground'}</span>
        </button>
      </nav>

      {/* Правая панель действий */}
      <div className="flex items-center gap-2">
        {/* Переключатель языка (Русский / Английский) */}
        <div className="flex items-center border border-slate-200 rounded-md bg-slate-50 p-0.5 text-[11px]">
          <Globe className="w-3 h-3 text-slate-500 ml-1 mr-0.5" />
          {(['en', 'ru'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold transition-all cursor-pointer ${
                lang === l
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
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
          className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors"
          title={t('settings.title') || 'Settings'}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
