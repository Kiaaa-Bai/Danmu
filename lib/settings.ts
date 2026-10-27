import { storage } from 'wxt/utils/storage';

/** Whether danmaku are shown. Survives reloads. */
export const enabledSetting = storage.defineItem<boolean>('local:danmuEnabled', { fallback: true });
