/**
 * @license AGPL-3.0
 * useTheme.ts - Хук темы интерфейса.
 * По требованиям системы экосистема работает исключительно в светлой теме (Light Mode).
 */

export function useTheme() {
  return {
    theme: "light" as const,
    monacoTheme: "light" as const
  };
}
