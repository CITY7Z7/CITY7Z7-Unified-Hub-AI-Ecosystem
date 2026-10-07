import React, { createContext, useContext, useEffect, useState } from 'react';
import ruFallback from '../../public/langs/ru.json';
import enFallback from '../../public/langs/en.json';

type Translations = Record<string, any>;

interface I18nContextType {
  t: (key: string, params?: Record<string, string | number>) => string;
  isLoading: boolean;
  lang: string;
  setLang: (lang: string) => Promise<void>;
}

const I18nContext = createContext<I18nContextType | null>(null);

// Поддерживаемые языки: Русский и Английский (китайский язык исключён)
const SUPPORTED_LANGS = ['ru', 'en'];
const DEFAULT_LANG = 'ru';

const FALLBACKS: Record<string, Translations> = {
  ru: ruFallback as unknown as Translations,
  en: enFallback as unknown as Translations,
};

/**
 * Рекурсивное получение значения по точечному пути (например, "logs.err_fetch" -> translations.logs.err_fetch)
 */
const getNestedValue = (obj: any, path: string): string | undefined => {
  if (!obj || typeof obj !== 'object') return undefined;
  if (typeof obj[path] === 'string') return obj[path];
  
  const keys = path.split('.');
  let current: any = obj;
  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = current[k];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
};

const getInitialLang = () => {
  const saved = localStorage.getItem('lab-lang');
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved;

  const browserLang = navigator.language.split('-')[0];
  return SUPPORTED_LANGS.includes(browserLang) ? browserLang : DEFAULT_LANG;
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setActiveLang] = useState(getInitialLang());
  const [translations, setTranslations] = useState<Translations>(FALLBACKS[getInitialLang()] || FALLBACKS.ru);
  const [isLoading, setIsLoading] = useState(false);

  const loadTranslations = async (targetLang: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/langs/${targetLang}.json`);
      if (res.ok) {
        const data = await res.json();
        setTranslations(data);
        setActiveLang(targetLang);
        localStorage.setItem('lab-lang', targetLang);
      } else {
        console.warn(`Failed to fetch /langs/${targetLang}.json, using imported fallback`);
        setTranslations(FALLBACKS[targetLang] || FALLBACKS.ru);
        setActiveLang(targetLang);
      }
    } catch (e) {
      console.warn('Error fetching translations, using imported fallback', e);
      setTranslations(FALLBACKS[targetLang] || FALLBACKS.ru);
      setActiveLang(targetLang);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTranslations(lang);
  }, []);

  const t = (key: string, params?: Record<string, string | number>) => {
    let text = getNestedValue(translations, key) 
      || getNestedValue(FALLBACKS[lang], key)
      || getNestedValue(FALLBACKS.en, key)
      || getNestedValue(FALLBACKS.ru, key)
      || key;

    if (params && typeof text === 'string') {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        text = text.replace(new RegExp(`\\{\\{?${paramKey}\\}?\\}`, 'g'), String(paramValue));
      });
    }
    return text;
  };

  const setLang = async (newLang: string) => {
    if (SUPPORTED_LANGS.includes(newLang)) {
      await loadTranslations(newLang);
    }
  };

  return (
    <I18nContext.Provider value={{ t, isLoading, lang, setLang }}>
      {children}
    </I18nContext.Provider>
  );
};

export const translate = (key: string, params?: Record<string, string | number>): string => {
  const currentLang = getInitialLang();
  const dict = FALLBACKS[currentLang] || FALLBACKS.ru;
  let text = getNestedValue(dict, key) || getNestedValue(FALLBACKS.en, key) || key;
  if (params && typeof text === 'string') {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      text = text.replace(new RegExp(`\\{\\{?${paramKey}\\}?\\}`, 'g'), String(paramValue));
    });
  }
  return text;
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation must be used within I18nProvider');
  return context;
};
export const useI18n = useTranslation;

