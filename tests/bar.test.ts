// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Bar } from '@/lib/bar';
import { DEFAULT_DISPLAY } from '@/lib/settings';

let bar: Bar;
let seen: string[];
const record = (e: KeyboardEvent) => seen.push(e.key);

function press(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '<ytd-watch-flexy><div id="below"></div></ytd-watch-flexy>';
  bar = new Bar({ onSend: async () => {}, onToggle() {}, onStyle() {}, onDisplay() {} });
  bar.setDisplay(DEFAULT_DISPLAY);
  bar.mount();
  seen = [];
  document.addEventListener('keydown', record);
});

afterEach(() => {
  document.removeEventListener('keydown', record);
  bar.destroy();
});

describe('Bar keyboard', () => {
  it('keeps keys typed in the input away from YouTube', () => {
    press(document.querySelector('.dm-input')!, 'k');
    expect(seen).toEqual([]);
  });

  it('keeps arrow keys on a slider away from YouTube', () => {
    press(document.querySelector('.dm-range')!, 'ArrowRight');
    expect(seen).toEqual([]);
  });

  it('lets YouTube shortcuts through when a button has focus', () => {
    press(document.querySelector('.dm-toggle')!, 'k');
    press(document.querySelector('.dm-send')!, 'f');
    expect(seen).toEqual(['k', 'f']);
  });

  it('stops buttons from taking focus on click', () => {
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    document.querySelector('.dm-toggle')!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });
});

describe('Bar sending', () => {
  it('puts the text back in the input when sending fails', async () => {
    bar.destroy();
    bar = new Bar({
      onSend: async () => {
        throw new Error('permission-denied');
      },
      onToggle() {},
      onStyle() {},
      onDisplay() {},
    });
    bar.setDisplay(DEFAULT_DISPLAY);
    bar.mount();
    const input = document.querySelector<HTMLInputElement>('.dm-input')!;
    input.value = 'hello';
    document.querySelector<HTMLButtonElement>('.dm-send')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(input.value).toBe('hello');
  });
});

describe('Bar count', () => {
  it('shows the number of danmu in the toggle pill, next to the icon', () => {
    bar.setCount(267);
    expect(document.querySelector('.dm-toggle .dm-toggle-count')!.textContent).toBe('267');
    expect(document.querySelector('.dm-count')).toBeNull();
  });
  it('shortens big counts so they fit the bubble', () => {
    bar.setCount(1234);
    expect(document.querySelector('.dm-toggle-count')!.textContent).toBe('1.2k');
  });
});

describe('Bar in fullscreen', () => {
  it('moves into the player when the player goes fullscreen, and back after', () => {
    const player = document.createElement('div');
    document.body.append(player);
    bar.mount(player);
    expect(player.querySelector('.dm-bar.dm-bar-fs')).not.toBeNull();
    bar.mount();
    expect(document.querySelector('#below .dm-bar')).not.toBeNull();
    expect(document.querySelector('.dm-bar-fs')).toBeNull();
  });
  it('keeps clicks inside the bar from reaching the player (no pause, no fullscreen toggle)', () => {
    const player = document.createElement('div');
    document.body.append(player);
    bar.mount(player);
    const seen: string[] = [];
    for (const type of ['click', 'dblclick', 'mousedown']) player.addEventListener(type, () => seen.push(type));
    const input = document.querySelector('.dm-input')!;
    for (const type of ['click', 'dblclick', 'mousedown']) input.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    expect(seen).toEqual([]);
  });
});

describe('Bar settings button', () => {
  it('uses an SVG gear rather than a text glyph', () => {
    const button = document.querySelector('button[title="Danmu settings"]')!;
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.textContent).toBe('');
  });
});

describe('Bar for an English-speaking audience', () => {
  it('shows no Chinese characters anywhere in the bar', () => {
    expect(document.querySelector('.dm-bar')!.textContent).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('uses an icon for the on/off toggle, slashed when off', () => {
    const toggle = document.querySelector('.dm-toggle')!;
    expect(toggle.querySelector('svg')).not.toBeNull();
    expect(toggle.querySelector('.dm-slash')).not.toBeNull();
  });
});
