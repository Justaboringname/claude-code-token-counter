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
  /** Edge-lensing layer — brightens the rim so the panel reads as a
   *  thick refractive slab of glass (the macOS 26 "Liquid Glass" tell). */
  lensGrad: string;
  /** Soft specular bloom near the top-left, like light catching glass. */
  specularGrad: string;
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
  /** Stand-in panel background used ONLY in browser preview (no native
   *  glass there). In the real Tauri app the card is fully transparent. */
  previewBg: string;
}

export const lightTheme: Theme = {
  ink: '#2C1810',
  inkStrong: 'rgba(61, 36, 22, 0.88)',
  inkSoft: 'rgba(61, 36, 22, 0.76)',
  inkMute: 'rgba(61, 36, 22, 0.64)',
  inkFaint: 'rgba(61, 36, 22, 0.5)',
  glassTint: 'linear-gradient(180deg, rgba(255,250,242,0.20) 0%, rgba(255,243,229,0.34) 100%)',
  glassInsetShadow: [
    'inset 0 1.5px 0.5px rgba(255, 255, 255, 0.75)', // bright top lip
    'inset 0 0 0 0.5px rgba(255, 255, 255, 0.35)', // inner ring
    'inset 0 -14px 26px rgba(150, 90, 40, 0.10)', // bottom depth wash
    'inset 0 -1px 0 rgba(120, 70, 35, 0.12)', // bottom edge
    '0 0 0 0.5px rgba(255, 255, 255, 0.4)', // crisp outer hairline
    '0 1px 1px rgba(255,255,255,0.5)',
    '0 26px 60px rgba(60, 25, 5, 0.30)', // float shadow
    '0 6px 18px rgba(60, 25, 5, 0.14)',
  ].join(', '),
  sheenGrad:
    'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.10) 42%, transparent 100%)',
  lensGrad:
    'radial-gradient(150% 130% at 50% -14%, rgba(255,255,255,0.30) 0%, transparent 52%), linear-gradient(90deg, rgba(255,255,255,0.16) 0%, transparent 11%, transparent 89%, rgba(255,255,255,0.16) 100%)',
  specularGrad: 'radial-gradient(58% 46% at 24% 6%, rgba(255,255,255,0.5) 0%, transparent 72%)',
  hairline: 'rgba(61, 36, 22, 0.12)',
  trackBg: 'rgba(61, 36, 22, 0.1)',
  tileBg: 'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.22) 100%)',
  tileBorder: '0.5px solid rgba(255, 255, 255, 0.6)',
  tileInset: 'inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -1px 1px rgba(120,70,35,0.06), 0 1px 3px rgba(60,25,5,0.06)',
  rangeActiveBg: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.52) 100%)',
  rangeIdleBg: 'rgba(255,255,255,0.1)',
  rangeBorder: '0.5px solid rgba(255,255,255,0.5)',
  textShadow: '0 1px 0 rgba(255,255,255,0.4)',
  bottomBg: 'rgba(255, 255, 255, 0.08)',
  previewBg: 'linear-gradient(180deg, rgba(255,250,242,0.55) 0%, rgba(255,243,229,0.62) 100%)',
};

export const darkTheme: Theme = {
  ink: '#F6F3EE',
  inkStrong: 'rgba(245, 242, 236, 0.94)',
  inkSoft: 'rgba(245, 242, 236, 0.82)',
  inkMute: 'rgba(245, 242, 236, 0.64)',
  inkFaint: 'rgba(245, 242, 236, 0.46)',
  glassTint: 'linear-gradient(180deg, rgba(48,46,44,0.08) 0%, rgba(18,17,16,0.20) 100%)',
  glassInsetShadow: [
    'inset 0 1.5px 0.5px rgba(255, 255, 255, 0.32)', // bright top lip
    'inset 0 0 0 0.5px rgba(255, 255, 255, 0.18)', // lit perimeter ring
    'inset 0 -16px 30px rgba(0, 0, 0, 0.20)', // bottom depth wash
    'inset 0 -1px 0 rgba(0, 0, 0, 0.4)', // bottom edge
    '0 0 0 0.5px rgba(255, 255, 255, 0.08)', // outer hairline
    '0 26px 64px rgba(0, 0, 0, 0.58)', // float shadow
    '0 6px 18px rgba(0, 0, 0, 0.34)',
  ].join(', '),
  sheenGrad:
    'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 42%, transparent 100%)',
  lensGrad:
    'radial-gradient(150% 135% at 50% -16%, rgba(255,255,255,0.17) 0%, transparent 50%), linear-gradient(90deg, rgba(255,255,255,0.11) 0%, transparent 10%, transparent 90%, rgba(255,255,255,0.11) 100%)',
  specularGrad: 'radial-gradient(56% 44% at 24% 4%, rgba(255,255,255,0.20) 0%, transparent 70%)',
  hairline: 'rgba(245, 242, 236, 0.1)',
  trackBg: 'rgba(245, 242, 236, 0.12)',
  tileBg: 'linear-gradient(180deg, rgba(72,70,68,0.55) 0%, rgba(44,42,40,0.45) 100%)',
  tileBorder: '0.5px solid rgba(255, 255, 255, 0.12)',
  tileInset: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 1px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.22)',
  rangeActiveBg: 'linear-gradient(180deg, rgba(98,95,93,0.72) 0%, rgba(70,67,65,0.6) 100%)',
  rangeIdleBg: 'rgba(40, 38, 36, 0.36)',
  rangeBorder: '0.5px solid rgba(255, 255, 255, 0.1)',
  textShadow: '0 1px 0 rgba(0,0,0,0.35)',
  bottomBg: 'rgba(0, 0, 0, 0.18)',
  previewBg: 'linear-gradient(180deg, rgba(46,44,42,0.55) 0%, rgba(20,19,18,0.62) 100%)',
};

export type ThemeMode = 'auto' | 'light' | 'dark';

// Local-clock schedule for `auto` mode. Daytime is [DAY_START_HOUR,
// NIGHT_START_HOUR); everything else is night. Adjust these two to taste
// (or swap isNightNow for a sunrise/sunset calc if you want it geo-accurate).
const DAY_START_HOUR = 7; // 07:00 → switch to light
const NIGHT_START_HOUR = 19; // 19:00 → switch to dark
const AUTO_TICK_MS = 60_000; // re-check the clock once a minute

function isNightNow(): boolean {
  const h = new Date().getHours();
  return h < DAY_START_HOUR || h >= NIGHT_START_HOUR;
}

function readMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  const stored = window.localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored;
  // No stored choice → follow the day/night schedule by default.
  return 'auto';
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return isNightNow();
}

// Theme controller. `mode` is the user's choice (auto/light/dark, persisted);
// `isDark` is the resolved appearance actually in effect. In `auto` mode the
// clock is polled so the theme flips at the day↔night boundary while the app
// stays open. `cycleMode` rotates Auto → Light → Dark → Auto.
export function useDarkMode(): { isDark: boolean; mode: ThemeMode; cycleMode: () => void } {
  const [mode, setMode] = useState<ThemeMode>(() => readMode());
  const [isDark, setIsDark] = useState<boolean>(() => resolveDark(readMode()));

  useEffect(() => {
    // Resolve immediately for the selected mode.
    setIsDark(resolveDark(mode));
    if (mode !== 'auto') return;
    // Auto: keep re-resolving so it crosses the day/night line on its own.
    // setState with an unchanged primitive is a no-op, so this is cheap.
    const id = window.setInterval(() => setIsDark(resolveDark('auto')), AUTO_TICK_MS);
    return () => window.clearInterval(id);
  }, [mode]);

  // Drive the native NSGlassEffectView backdrop (see lib.rs): dark theme =
  // dark glass + light text, light theme = light glass + dark text.
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (isTauri) {
      invoke('set_theme', { theme: isDark ? 'dark' : 'light' }).catch(() => {});
    }
  }, [isDark]);

  const cycleMode = () => {
    setMode((m) => {
      const next: ThemeMode = m === 'auto' ? 'light' : m === 'light' ? 'dark' : 'auto';
      window.localStorage.setItem('theme', next);
      return next;
    });
  };

  return { isDark, mode, cycleMode };
}
