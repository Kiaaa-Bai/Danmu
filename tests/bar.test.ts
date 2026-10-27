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
  it('shows only the total number of danmu', () => {
    bar.setCount(267);
    expect(document.querySelector('.dm-count')!.textContent).toBe('267 danmu');
  });
});

describe('Bar settings button', () => {
  it('uses an SVG gear rather than a text glyph', () => {
    const button = document.querySelector('button[title="Danmu settings"]')!;
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.textContent).toBe('');
  });
});
