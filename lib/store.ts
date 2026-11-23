import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Mode } from './settings';

export type Danmu = {
  id: string;
  videoId: string;
  t: number;
  text: string;
  source: 'user' | 'comment';
  color?: string; // #RRGGBB; white when missing
  mode?: Mode; // scrolling when missing
  ytCommentId?: string; // the YouTube comment this danmu was also posted as
};

/**
 * Live listener for one video's danmaku. `initial` is true for the first batch only. Modified docs come
 * through too, because `ytCommentId` is added after the YouTube post; callers ignore ids they already have.
 */
export function subscribeDanmu(videoId: string, onAdded: (items: Danmu[], initial: boolean) => void): () => void {
  let initial = true;
  return onSnapshot(
    query(collection(db, 'danmu'), where('videoId', '==', videoId)),
    (snap) => {
      const added = snap
        .docChanges()
        .filter((c) => c.type !== 'removed')
        .map((c) => {
          const d = c.doc.data();
          return {
            id: c.doc.id,
            videoId: d.videoId,
            t: d.t,
            text: d.text,
            source: d.source,
            color: d.color,
            mode: d.mode,
            ytCommentId: d.ytCommentId,
          } as Danmu;
        });
      onAdded(added, initial);
      initial = false;
    },
    (err) => console.error('[danmu] listener failed', err),
  );
}

/** A Firestore id made on the client, so a sent danmu can be shown before the write lands. */
export function newDanmuId(): string {
  return doc(collection(db, 'danmu')).id;
}

export async function sendDanmu(d: Omit<Danmu, 'source'>): Promise<void> {
  await setDoc(doc(db, 'danmu', d.id), {
    videoId: d.videoId,
    t: Math.round(d.t * 10) / 10,
    text: d.text,
    source: 'user',
    color: d.color ?? '#FFFFFF',
    mode: d.mode ?? 'scroll',
    createdAt: serverTimestamp(),
  });
}

/** Records which YouTube comment a danmu was posted as, so viewers don't see that comment a second time. */
export async function setCommentLink(danmuId: string, ytCommentId: string): Promise<void> {
  await updateDoc(doc(db, 'danmu', danmuId), { ytCommentId });
}
