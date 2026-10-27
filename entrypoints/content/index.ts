import './style.css';
import { startSession } from '@/lib/session';

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
    ctx.onInvalidated(() => {
      document.removeEventListener('yt-navigate-finish', sync);
      teardown?.();
    });
  },
});
