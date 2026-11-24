import { describe, expect, it, vi } from 'vitest';
import { runCleanups } from '@/lib/cleanup';

describe('runCleanups', () => {
  it('runs every cleanup, the last one added first', () => {
    const order: string[] = [];
    runCleanups([() => order.push('bar'), () => order.push('watchers')]);
    expect(order).toEqual(['watchers', 'bar']);
  });

  it('keeps going when one throws (a storage call after the extension was updated)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const removeBar = vi.fn();
    runCleanups([
      removeBar,
      () => {
        throw new Error('Extension context invalidated.');
      },
    ]);
    expect(removeBar).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('empties the list, so running it again does nothing', () => {
    const fn = vi.fn();
    const list = [fn];
    runCleanups(list);
    runCleanups(list);
    expect(fn).toHaveBeenCalledOnce();
    expect(list).toEqual([]);
  });
});
