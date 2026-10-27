import { Bar } from './bar';
import { loadCommentDanmu } from './comments';
import { FIXED_DURATION, Overlay } from './overlay';
import { displaySetting, enabledSetting, sendStyleSetting } from './settings';
import { newDanmuId, sendDanmu, subscribeDanmu, type Danmu } from './store';
import { RESET_LOOKBACK, Timeline } from './timeline';

const BAR_UPDATE_MS = 250;
/** Seconds: a live danmu from another viewer shows at once if it was sent this close to our playback time. */
const LIVE_WINDOW = 3;

function waitFor<T>(find: () => T | null, isStopped: () => boolean): Promise<T | null> {
  return new Promise((resolve) => {
    const tryFind = () => {
      if (isStopped()) return resolve(null);
      const found = find();
      if (found) resolve(found);
      else setTimeout(tryFind, 200);
    };
    tryFind();
  });
}

/** Everything for one video: overlay, input bar, live listener, playback sync. Returns a teardown. */
export function startSession(videoId: string): () => void {
  let stopped = false;
  const cleanups: (() => void)[] = [];

  (async () => {
    const found = await waitFor(() => {
      const player = document.querySelector<HTMLElement>('#movie_player');
      const video = player?.querySelector('video');
      return player && video ? { player, video } : null;
    }, () => stopped);
    if (!found) return;
    const { player, video } = found;
    // All awaits happen before anything is built, so a teardown can't land between building and cleanup.
    let [enabled, style, display] = await Promise.all([
      enabledSetting.getValue(),
      sendStyleSetting.getValue(),
      displaySetting.getValue(),
    ]);
    if (stopped) return;

    const timeline = new Timeline<Danmu>();
    const ownIds = new Set<string>();
    /** Own danmaku already shown on send; timeline.tick would hand them out a second time. */
    const shownOnSend = new Set<string>();
    let inAd = false;
    /** The video's own time, frozen while an ad plays (the ad has its own currentTime). */
    let contentTime = video.currentTime;
    /** Clears the screen and refills it with the danmaku that should be mid-flight right now. */
    const resync = () => {
      overlay.clear();
      shownOnSend.clear();
      const now = video.currentTime;
      timeline.reset(now);
      if (inAd) return;
      const lookback = Math.max(overlay.duration, FIXED_DURATION);
      for (const d of timeline.between(now - lookback, now - RESET_LOOKBACK)) {
        overlay.show(d, d.t, video.playbackRate, ownIds.has(d.id), now - d.t);
      }
    };
    const overlay = new Overlay(player, resync);
    overlay.applySettings(display);
    overlay.setVisible(enabled);
    if (video.paused) overlay.pause();
    let fromComments = 0;

    const updateCount = () => bar.setCount(timeline.size, fromComments);
    const bar = new Bar({
      async onSend(text) {
        const d: Danmu = { id: newDanmuId(), videoId, t: contentTime, text, source: 'user', ...style };
        ownIds.add(d.id);
        timeline.add([d]);
        updateCount();
        if (!inAd && overlay.show(d, d.t, video.playbackRate, true)) shownOnSend.add(d.id);
        try {
          await sendDanmu(d);
        } catch (err) {
          // The write was rejected: take the danmu back everywhere; the bar puts the text back in the input.
          timeline.remove(d.id);
          ownIds.delete(d.id);
          shownOnSend.delete(d.id);
          overlay.removeItem(d.id);
          updateCount();
          throw err;
        }
      },
      onToggle(on) {
        enabled = on;
        overlay.setVisible(on && !inAd);
        void enabledSetting.setValue(on);
      },
      onStyle(next) {
        style = next;
        void sendStyleSetting.setValue(next);
      },
      onDisplay(settings) {
        overlay.applySettings(settings);
        void displaySetting.setValue(settings);
      },
    });
    bar.setEnabled(enabled);
    bar.setStyle(style);
    bar.setDisplay(display);
    updateCount();
    cleanups.push(() => bar.destroy(), () => overlay.destroy());

    // Feature 1: danmaku sent through the extension, live from Firestore.
    cleanups.push(
      subscribeDanmu(videoId, (items, initial) => {
        const fresh = timeline.add(items);
        updateCount();
        if (initial) return resync();
        // Someone else just sent one a moment behind us: show it now instead of on the next rewatch.
        // (One ahead of us will come out of timeline.tick when playback gets there.)
        const now = video.currentTime;
        for (const d of fresh) {
          if (!ownIds.has(d.id) && !inAd && !video.paused && d.t <= now && now - d.t <= LIVE_WINDOW) {
            overlay.show(d, now, video.playbackRate);
          }
        }
      }),
    );
    // Feature 2: timestamped YouTube comments, fetched for this viewer and never stored.
    void loadCommentDanmu(videoId, import.meta.env.WXT_YOUTUBE_API_KEY).then((items) => {
      if (stopped) return;
      fromComments += timeline.add(items).length;
      updateCount();
      resync();
    });

    const onPause = () => overlay.pause();
    const onPlay = () => overlay.resume();
    const onRate = () => overlay.setRate(video.playbackRate);
    // Buffering (`waiting`) freezes danmaku the same way a pause does.
    const videoEvents: [string, () => void][] = [
      ['pause', onPause],
      ['waiting', onPause],
      ['play', onPlay],
      ['playing', onPlay],
      ['ratechange', onRate],
      ['seeking', resync],
    ];
    for (const [type, fn] of videoEvents) video.addEventListener(type, fn);
    cleanups.push(() => {
      for (const [type, fn] of videoEvents) video.removeEventListener(type, fn);
    });

    timeline.reset(video.currentTime);
    let lastBarUpdate = 0;
    let raf = 0;
    const frame = () => {
      const adShowing = player.classList.contains('ad-showing');
      if (adShowing && !inAd) {
        inAd = true;
        overlay.setVisible(false);
      } else if (!adShowing && inAd) {
        // The ad's currentTime isn't the video's: resync instead of treating it as a seek.
        inAd = false;
        overlay.setVisible(enabled);
        resync();
      }
      if (!inAd) {
        contentTime = video.currentTime;
        if (!video.paused) {
          for (const d of timeline.tick(contentTime)) {
            if (shownOnSend.delete(d.id)) continue;
            overlay.show(d, contentTime, video.playbackRate, ownIds.has(d.id));
          }
        }
      }
      const now = performance.now();
      if (now - lastBarUpdate > BAR_UPDATE_MS) {
        lastBarUpdate = now;
        if (!bar.isMounted) bar.mount();
        bar.setTime(contentTime);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    cleanups.push(() => cancelAnimationFrame(raf));
  })();

  return () => {
    stopped = true;
    for (const fn of cleanups.splice(0).reverse()) fn();
  };
}
