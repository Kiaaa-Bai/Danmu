import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Spike: prove Firestore and the YouTube API both work from a content script on youtube.com.
export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  main() {
    const videoId = 'PkZNo7MFNFg';
    onSnapshot(
      query(collection(db, 'danmu'), where('videoId', '==', videoId)),
      (snap) => console.log('[danmu] firestore ok', snap.size),
      (err) => console.error('[danmu] firestore failed', err),
    );
    const key = import.meta.env.WXT_YOUTUBE_API_KEY;
    fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${key}`)
      .then((r) => r.json())
      .then((d) => console.log('[danmu] api ok', d.items?.[0]?.contentDetails?.duration ?? d.error?.message))
      .catch((err) => console.error('[danmu] api failed', err));
  },
});
