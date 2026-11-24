// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldShowUpdateNotice, showUpdateNotice, UPDATE_TEXT } from '@/lib/update-notice';

function setFullscreen(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => el });
  document.dispatchEvent(new Event('fullscreenchange'));
}

describe('shouldShowUpdateNotice', () => {
  it('shows when the extension is gone and the tab is on a video', () => {
    expect(shouldShowUpdateNotice(true, undefined)).toBe(true);
  });

  it('stays quiet when the extension is still there (a newer copy of the script took over)', () => {
    expect(shouldShowUpdateNotice(true, 'gacaaegfhljciojlicadennhmfkeklld')).toBe(false);
  });

  it('stays quiet off a watch page, where there was no bar to replace', () => {
    expect(shouldShowUpdateNotice(false, undefined)).toBe(false);
  });
});

describe('showUpdateNotice', () => {
  let reload: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="movie_player"></div><ytd-watch-flexy><div id="below"><div id="info"></div></div></ytd-watch-flexy>';
    setFullscreen(null);
    reload = vi.fn<() => void>();
  });

  afterEach(() => {
    document.querySelector('.dm-update-notice')?.remove();
  });

  it('takes the bar\'s place under the player, with the text and a Reload button', () => {
    const notice = showUpdateNotice(reload);
    const below = document.querySelector('#below')!;
    expect(below.firstElementChild).toBe(notice);
    expect(notice.textContent).toContain(UPDATE_TEXT);
    const button = notice.querySelector('button')!;
    expect(button.textContent).toBe('Reload');
    button.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('shows only one notice when called again', () => {
    const first = showUpdateNotice(reload);
    const second = showUpdateNotice(reload);
    expect(second).toBe(first);
    expect(document.querySelectorAll('.dm-update-notice')).toHaveLength(1);
  });

  it('keeps a click on Reload from reaching the player (a click there pauses the video)', () => {
    const player = document.querySelector('#movie_player')!;
    setFullscreen(player);
    const notice = showUpdateNotice(reload);
    const onPlayerClick = vi.fn();
    player.addEventListener('click', onPlayerClick);
    notice.querySelector('button')!.click();
    expect(reload).toHaveBeenCalledOnce();
    expect(onPlayerClick).not.toHaveBeenCalled();
  });

  it('floats inside the player in fullscreen and goes back under it afterwards', () => {
    const player = document.querySelector('#movie_player')!;
    setFullscreen(player);
    const notice = showUpdateNotice(reload);
    expect(notice.parentElement).toBe(player);
    setFullscreen(null);
    expect(notice.parentElement).toBe(document.querySelector('#below'));
  });

  it('falls back to the page corner when YouTube has no spot under the player', () => {
    document.body.innerHTML = '<div id="movie_player"></div>';
    const notice = showUpdateNotice(reload);
    expect(notice.parentElement).toBe(document.body);
    expect(notice.style.position).toBe('fixed');
  });
});
