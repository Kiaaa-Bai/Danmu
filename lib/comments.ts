import type { Danmu } from './store';
import { buildSeeds } from './timestamps';
import { fetchComments, fetchDurationSec } from './youtube-api';

const cache = new Map<string, Promise<Danmu[]>>();

/**
 * Timestamped YouTube comments as danmaku, fetched live for each viewer and never written to
 * Firestore (YouTube's API policy limits how long API data may be kept; only danmaku sent through
 * the extension are stored). Kept in memory for this tab, so going back to a video is free.
 */
export function loadCommentDanmu(videoId: string, key?: string): Promise<Danmu[]> {
  if (!key) return Promise.resolve([]);
  let pending = cache.get(videoId);
  if (!pending) {
    pending = Promise.all([fetchDurationSec(videoId, key), fetchComments(videoId, key)])
      .then(([duration, comments]) =>
        buildSeeds(comments, duration).map((s) => ({ ...s, videoId, source: 'comment' as const })),
      )
      .catch((err) => {
        cache.delete(videoId); // let the next visit retry
        console.warn('[danmu] comments unavailable', err);
        return [];
      });
    cache.set(videoId, pending);
  }
  return pending;
}
