import { parseIsoDuration, type Comment } from './timestamps';

const API = 'https://www.googleapis.com/youtube/v3';

export class YouTubeApiError extends Error {
  constructor(
    public reason: string,
    message: string,
  ) {
    super(message);
  }
}

async function get(path: string, params: Record<string, string>, key: string): Promise<any> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', key);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new YouTubeApiError(body.error?.errors?.[0]?.reason ?? String(res.status), body.error?.message ?? res.statusText);
  }
  return body;
}

/** The video's real length. Not `<video>.duration`, which is the ad's length while a pre-roll plays. */
export async function fetchDurationSec(videoId: string, key: string): Promise<number> {
  const body = await get('videos', { part: 'contentDetails', id: videoId }, key);
  const iso = body.items?.[0]?.contentDetails?.duration;
  if (!iso) throw new YouTubeApiError('notFound', `No video ${videoId}`);
  return parseIsoDuration(iso);
}

/** Top-level comments, most relevant first, up to 100 per page. Comments turned off → []. */
export async function fetchComments(videoId: string, key: string, maxPages = 5): Promise<Comment[]> {
  const comments: Comment[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    let body;
    try {
      body = await get(
        'commentThreads',
        {
          part: 'snippet',
          videoId,
          order: 'relevance',
          maxResults: '100',
          textFormat: 'plainText',
          ...(pageToken ? { pageToken } : {}),
        },
        key,
      );
    } catch (err) {
      if (err instanceof YouTubeApiError && err.reason === 'commentsDisabled') return comments;
      throw err;
    }
    for (const thread of body.items ?? []) {
      const top = thread.snippet.topLevelComment;
      comments.push({ id: top.id ?? thread.id, text: top.snippet.textOriginal ?? top.snippet.textDisplay ?? '' });
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return comments;
}
