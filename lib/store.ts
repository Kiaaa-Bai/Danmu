import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';

export type Danmu = { id: string; videoId: string; t: number; text: string; source: 'user' | 'comment' };

/** Live listener for one video's danmaku. `initial` is true for the first batch only. */
export function subscribeDanmu(videoId: string, onAdded: (items: Danmu[], initial: boolean) => void): () => void {
  let initial = true;
  return onSnapshot(
    query(collection(db, 'danmu'), where('videoId', '==', videoId)),
    (snap) => {
      const added = snap
        .docChanges()
        .filter((c) => c.type === 'added')
        .map((c) => {
          const d = c.doc.data();
          return { id: c.doc.id, videoId: d.videoId, t: d.t, text: d.text, source: d.source } as Danmu;
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
    createdAt: serverTimestamp(),
  });
}
