import { storage } from 'wxt/utils/storage';

/** Whether danmaku are shown. Survives reloads. */
export const enabledSetting = storage.defineItem<boolean>('local:danmuEnabled', { fallback: true });

export type Mode = 'scroll' | 'top' | 'bottom';
export type Density = 'low' | 'normal' | 'high';

/** How this viewer sees danmaku (Bilibili's 弹幕设置). Local to this browser. */
export type DisplaySettings = {
  opacity: number; // 0.1 … 1
  area: number; // share of the player scrolling danmaku may use: 0.25, 0.5, 0.75, 1
  speed: number; // 1 (slowest) … 5 (fastest)
  fontScale: number; // 0.5 … 2
  density: Density;
};

/** Kia's picks (2026-10-26): 100% opacity, half the player, Slow, 130% font, Normal density. */
export const DEFAULT_DISPLAY: DisplaySettings = { opacity: 1, area: 0.5, speed: 2, fontScale: 1.3, density: 'normal' };

/** Media seconds to cross the player at each speed step (Bilibili's 极慢 … 极快). */
export const SPEED_DURATIONS = [12, 10, 8, 6, 4] as const;
export const SPEED_LABELS = ['Slowest', 'Slow', 'Normal', 'Fast', 'Fastest'] as const;
export const AREA_STEPS = [0.25, 0.5, 0.75, 1] as const;
export const AREA_LABELS = ['1/4', '1/2', '3/4', 'Full'] as const;

/** Most danmaku on screen at once per density; `high` also lets scrolling danmaku overlap instead of dropping. */
export const DENSITY_LIMITS: Record<Density, number> = { low: 15, normal: 40, high: Infinity };

export const displaySetting = storage.defineItem<DisplaySettings>('local:display', { fallback: DEFAULT_DISPLAY });

/** How this viewer's own danmaku look to everyone (stored with each danmu). */
export type SendStyle = { color: string; mode: Mode };

/** Bilibili's sender palette. */
export const PALETTE = [
  '#FFFFFF',
  '#FE0302',
  '#FF7204',
  '#FFAA02',
  '#FFD302',
  '#A0EE00',
  '#00CD00',
  '#019899',
  '#4266BE',
  '#89D5FF',
  '#CC0273',
  '#222222',
] as const;

export const sendStyleSetting = storage.defineItem<SendStyle>('local:sendStyle', {
  fallback: { color: '#FFFFFF', mode: 'scroll' },
});
