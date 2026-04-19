import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Theme {
  ink: string;
  inkStrong: string;
  inkSoft: string;
  inkMute: string;
  inkFaint: string;
  glassTint: string;
  glassInsetShadow: string;
  sheenGrad: string;
  hairline: string;
  trackBg: string;
  tileBg: string;
  tileBorder: string;
  tileInset: string;
  rangeActiveBg: string;
  rangeIdleBg: string;
  rangeBorder: string;
  textShadow: string;
  bottomBg: string;
}

export const lightTheme: Theme = {
  ink: '#2C1810',
  inkStrong: 'rgba(61, 36, 22, 0.88)',
  inkSoft: 'rgba(61, 36, 22, 0.76)',
  inkMute: 'rgba(61, 36, 22, 0.64)',
  inkFaint: 'rgba(61, 36, 22, 0.5)',
  glassTint: 'rgba(255, 248, 235, 0.12)',
  glassInsetShadow: [
    'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
    'inset 0 -1px 0 rgba(255, 255, 255, 0.15)',
    'inset 1px 0 0 rgba(255, 255, 255, 0.25)',
    'inset -1px 0 0 rgba(255, 255, 255, 0.15)',
    '0 2px 0 rgba(255,255,255,0.2)',
    '0 24px 60px rgba(60, 25, 5, 0.3)',
    '0 0 0 0.5px rgba(255, 255, 255, 0.25)',
  ].join(', '),
  sheenGrad: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)',
  hairline: 'rgba(61, 36, 22, 0.12)',
  trackBg: 'rgba(61, 36, 22, 0.1)',
  tileBg: 'rgba(255, 255, 255, 0.28)',
  tileBorder: '0.5px solid rgba(255, 255, 255, 0.5)',
  tileInset: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.04)',
  rangeActiveBg: 'rgba(255,255,255,0.5)',
  rangeIdleBg: 'rgba(255,255,255,0.12)',
  rangeBorder: '0.5px solid rgba(255,255,255,0.45)',
  textShadow: '0 1px 0 rgba(255,255,255,0.4)',
  bottomBg: 'rgba(255, 255, 255, 0.08)',
};

export const darkTheme: Theme = {
  ink: '#F5F2EC',
  inkStrong: 'rgba(245, 242, 236, 0.94)',
  inkSoft: 'rgba(245, 242, 236, 0.82)',
  inkMute: 'rgba(245, 242, 236, 0.64)',
  inkFaint: 'rgba(245, 242, 236, 0.46)',
  glassTint: 'rgba(30, 29, 28, 0.12)',
  glassInsetShadow: [
    'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    'inset 0 -1px 0 rgba(0, 0, 0, 0.35)',
    'inset 1px 0 0 rgba(255, 255, 255, 0.05)',
    'inset -1px 0 0 rgba(0, 0, 0, 0.2)',
    '0 2px 0 rgba(0,0,0,0.2)',
    '0 24px 60px rgba(0, 0, 0, 0.55)',
    '0 0 0 0.5px rgba(255, 255, 255, 0.08)',
  ].join(', '),
  sheenGrad: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)',
  hairline: 'rgba(245, 242, 236, 0.1)',
  trackBg: 'rgba(245, 242, 236, 0.12)',
  tileBg: 'rgba(50, 48, 46, 0.5)',
  tileBorder: '0.5px solid rgba(255, 255, 255, 0.08)',
  tileInset: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.2)',
  rangeActiveBg: 'rgba(75, 72, 70, 0.6)',
  rangeIdleBg: 'rgba(40, 38, 36, 0.4)',
  rangeBorder: '0.5px solid rgba(255, 255, 255, 0.08)',
  textShadow: '0 1px 0 rgba(0,0,0,0.35)',
  bottomBg: 'rgba(0, 0, 0, 0.18)',
};

export function useDarkMode(): { isDark: boolean; toggle: () => void } {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem('theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (isTauri) {
      invoke('set_theme', { theme: isDark ? 'dark' : 'light' }).catch(() => {});
    }
  }, [isDark]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('theme')) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggle = () => {
    setIsDark((v) => {
      const next = !v;
      window.localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return { isDark, toggle };
}
