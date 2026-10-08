import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  FolderTree, Cpu, Layers, PlaySquare, Activity, Settings as SettingsIcon
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import settings from '@/App.json';
import packageJson from '@/../package.json';

interface SidebarProps {
  onLogout: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onLogout, onOpenSettings }) => {
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const [totalTools, setTotalTools] = useState<number>(0);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(true);

  // Светлая тема гарантирована во всей экосистеме
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  const banners = settings.banners || [];
  const displayBanners = banners.length > 1 ? [...banners, banners[0]] : banners;

  // Подсчёт инструментов
  useEffect(() => {
    fetch('/admin/api/tools')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setTotalTools(data.length);
      })
      .catch(() => {});
  }, []);

  // Таймер карусели
  useEffect(() => {
    if (banners.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setCurrentBannerIndex((prev) => (prev >= banners.length ? 1 : prev + 1));
    }, 11000);
    return () => clearInterval(interval);
  }, [banners.length, isPaused]);

  // Бесшовный сброс слайдов
  useEffect(() => {
    if (currentBannerIndex === banners.length) {
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setCurrentBannerIndex(0);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentBannerIndex, banners.length]);

  const links = [
    { path: "/", label: t("nav.skills"), icon: FolderTree },
    { path: "/runners", label: t("nav.runners"), icon: Cpu },
    { path: "/processes", label: t("nav.processes"), icon: Layers },
    { path: "/playground", label: t("nav.playground"), icon: PlaySquare },
    { path: "/logs", label: t("nav.logs"), icon: Activity },
  ];

  return (
    <div className="w-80 bg-white border-r border-slate-300 flex flex-col h-full text-slate-800 select-none shrink-0 transition-all duration-200 relative">
      {/* Шапка боковой панели */}
      <div className="h-12 px-4 border-b border-slate-300 flex items-center justify-between shrink-0 bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-xs uppercase tracking-wider text-slate-700">
            🛠️ TOOLHUB SKILLS
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Кнопка открытия модалки настроек */}
          <button
            onClick={onOpenSettings}
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 border border-transparent hover:border-slate-300 transition-all cursor-pointer"
            title={t('nav.settings')}
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Список разделов навигации */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 min-w-[320px]">
        {links.map((l) => {
          const isActive = location.pathname === l.path || (l.path === "/" && location.pathname === "/categories");
          return (
            <Link
              key={l.path}
              to={l.path}
              className={`group flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-all border ${
                isActive
                  ? 'bg-blue-50 border-blue-400 text-blue-900 font-semibold shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-200'
              }`}
            >
              <l.icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'
                }`}
              />
              <span className="text-xs truncate font-medium">{l.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Футер боковой панели */}
      <div className="p-3 border-t border-slate-300 bg-slate-50 text-[11px] text-slate-600 flex justify-between items-center shrink-0">
        <span className="font-mono text-[11px]">{t('sidebar.total_tools', { count: totalTools })}</span>
        <span 
          className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-white text-slate-800 border border-slate-300 shadow-2xs tracking-tight"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          v{packageJson.version}
        </span>
      </div>
    </div>
  );
};