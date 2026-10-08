/**
 * @license AGPL-3.0
 * UnifiedHeader - Верхняя навигационная панель единой экосистемы Lab + ToolHub.
 * Индустриальный щит оператора: чёткие модульные блоки, сигнальная лампа статуса, 1px границы.
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
  Globe
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
    <header className="h-12 border-b border-slate-300 bg-white px-3 flex items-center justify-between z-30 select-none shrink-0 shadow-2xs">
      {/* Логотип и статус щита управления */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-bold text-xs tracking-wider">
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-800 border border-slate-300 font-mono font-bold text-[11px] uppercase">
            🧪 <span>LAB</span>
          </span>
          <span className="text-slate-400 font-mono font-bold">+</span>
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-800 border border-slate-300 font-mono font-bold text-[11px] uppercase">
            🛠️ <span>TOOLHUB</span>
          </span>
        </div>

        {/* Сигнальная лампа статуса (HUB ONLINE) */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 text-slate-700 border border-slate-300 font-mono text-[10px] font-bold tracking-tight">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block ring-2 ring-emerald-200 shrink-0" />
          <span>{t('header.online')}</span>
        </div>
      </div>

      {/* Центральное меню переключения режимов щита */}
      <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <button
          type="button"
          onClick={() => onSelectTab('lab')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all border ${
            currentTab === 'lab'
              ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
          }`}
          title="Lab AI Chat Studio"
        >
          <Bot className="w-3.5 h-3.5" />
          <span>{t('header.ai_studio')}</span>
        </button>

        <div className="h-4 w-px bg-slate-300 mx-0.5" />

        <button
          type="button"
          onClick={() => onSelectTab('categories')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all border ${
            currentTab === 'categories'
              ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
          }`}
          title="ToolHub Skills & Categories"
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>{t('header.skills')}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('runners')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all border ${
            currentTab === 'runners'
              ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
          }`}
          title="Runners Studio"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{t('header.runners')}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('processes')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all border ${
            currentTab === 'processes'
              ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
          }`}
          title="MCP Processes Pool"
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{t('header.processes')}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('logs')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all border ${
            currentTab === 'logs'
              ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
          }`}
          title="Audit & Execution Logs"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{t('header.logs')}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('playground')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all border ${
            currentTab === 'playground'
              ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
          }`}
          title="Agent Playground"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          <span>{t('header.playground')}</span>
        </button>
      </nav>

      {/* Правая панель действий оператора */}
      <div className="flex items-center gap-2">
        {/* Переключатель языка (Русский / Английский) */}
        <div className="flex items-center border border-slate-300 rounded bg-slate-50 p-0.5 text-[11px]">
          <Globe className="w-3 h-3 text-slate-500 ml-1 mr-0.5" />
          {(['en', 'ru'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold transition-all cursor-pointer ${
                lang === l
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-300'
                  : 'text-slate-500 hover:text-slate-900 border border-transparent'
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
          className="h-8 px-2.5 rounded bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 hover:border-slate-400 transition-colors flex items-center justify-center cursor-pointer"
          title={t('settings.title')}
        >
          <Settings className="w-4 h-4 text-slate-600" />
        </button>
      </div>
    </header>
  );
};
