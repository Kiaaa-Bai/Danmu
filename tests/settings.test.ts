import { expect, it } from 'vitest';
import { DEFAULT_DISPLAY } from '@/lib/settings';

it('defaults to the settings Kia picked: 100% opacity, half area, slow, 130% font, normal density', () =>
  expect(DEFAULT_DISPLAY).toEqual({ opacity: 1, area: 0.5, speed: 2, fontScale: 1.3, density: 'normal' }));
