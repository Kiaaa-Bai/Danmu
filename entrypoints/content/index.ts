import './style.css';
import { browser } from 'wxt/browser';
import { startSession } from '@/lib/session';
import { shouldShowUpdateNotice, showUpdateNotice } from '@/lib/update-notice';

function currentVideoId(): string | null {
  return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  main(ctx) {
    let videoId: string | null = null;
    let teardown: (() => void) | null = null;

    // YouTube is a single-page app: moving to another video fires yt-navigate-finish, not a page load.
    const sync = () => {
      const next = currentVideoId();
      if (next === videoId) return;
      teardown?.();
      teardown = null;
      videoId = next;
      if (next) teardown = startSession(next);
    };

    sync();
    document.addEventListener('yt-navigate-finish', sync);
    // Chrome never tells a content script that its extension was updated or reloaded. ctx.setInterval checks
    // the extension is still there on every tick, and fires onInvalidated within a second once it isn't.
    ctx.setInterval(() => {}, 1000);
    ctx.onInvalidated(() => {
      document.removeEventListener('yt-navigate-finish', sync);
      teardown?.();
      teardown = null;
      if (shouldShowUpdateNotice(videoId !== null, browser.runtime?.id)) showUpdateNotice(() => location.reload());
    });
  },
});
