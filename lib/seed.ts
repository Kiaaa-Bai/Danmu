import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { buildSeeds, type Seed } from './timestamps';
import { fetchComments, fetchDurationSec } from './youtube-api';

const BATCH_LIMIT = 500;

/**
 * First viewer of a video turns its timestamped comments into danmaku, once.
 * Returns how many were written, or null when skipped (no key, already seeded, API error,
 * or another viewer claimed it first). Seeds reach the screen through the live listener.
 */
export async function seedIfNeeded(videoId: string, key?: string): Promise<number | null> {
  if (!key) return null;
  const claim = doc(db, 'videos', videoId);
  if ((await getDoc(claim)).exists()) return null;

  let seeds: Seed[];
  try {
    const [duration, comments] = await Promise.all([fetchDurationSec(videoId, key), fetchComments(videoId, key)]);
    seeds = buildSeeds(comments, duration);
  } catch (err) {
    // Don't claim: the next viewer retries.
    console.warn('[danmu] seeding skipped', err);
    return null;
  }

  try {
    // Rules allow create only, so this fails if someone else claimed the video meanwhile.
    await setDoc(claim, { seededAt: serverTimestamp(), seedCount: seeds.length });
  } catch {
    return null;
  }

  for (let i = 0; i < seeds.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const s of seeds.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(db, 'danmu', s.id), {
        videoId,
        t: s.t,
        text: s.text,
        source: 'comment',
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return seeds.length;
}
