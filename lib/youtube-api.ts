import type { PostFailure } from './messages';
import { parseIsoDuration, type Comment } from './timestamps';

const API = 'https://www.googleapis.com/youtube/v3';

export class YouTubeApiError extends Error {
  constructor(
    public reason: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

async function get(path: string, params: Record<string, string>, key: string): Promise<any> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', key);
  return readBody(await fetch(url));
}

async function readBody(res: Response): Promise<any> {
  const body = await res.json();
  if (!res.ok) {
    throw new YouTubeApiError(
      body.error?.errors?.[0]?.reason ?? String(res.status),
      body.error?.message ?? res.statusText,
      res.status,
    );
  }
  return body;
}

/** A call made as the signed-in person (OAuth access token instead of the API key). */
async function authed(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const res = await fetch(`${API}/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return readBody(res);
}

/** Posts a top-level comment as the signed-in channel (50 quota units). Returns the new comment's id. */
export async function postComment(token: string, videoId: string, text: string): Promise<string> {
  const body = await authed(token, 'commentThreads?part=snippet', {
    method: 'POST',
    body: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } },
  });
  return body.snippet.topLevelComment.id;
}

/** The signed-in person's channel (id and name), or null when the Google account has no YouTube channel. */
export async function fetchChannel(token: string): Promise<{ id: string; title: string } | null> {
  const body = await authed(token, 'channels?part=snippet&mine=true');
  const ch = body.items?.[0];
  return ch ? { id: ch.id, title: ch.snippet?.title ?? '' } : null;
}

const NO_CHANNEL = new Set(['ineligibleAccount', 'youtubeSignupRequired', 'channelNotFound']);
const OUT_OF_QUOTA = new Set(['quotaExceeded', 'dailyLimitExceeded']);

/** Which of the reasons the panel can explain a failed post comes down to. */
export function failureFor(err: unknown): PostFailure {
  if (!(err instanceof YouTubeApiError)) return 'failed';
  if (err.status === 401) return 'signedOut';
  if (err.reason === 'commentsDisabled') return 'commentsDisabled';
  if (OUT_OF_QUOTA.has(err.reason)) return 'quotaExceeded';
  if (NO_CHANNEL.has(err.reason)) return 'noChannel';
  return 'failed';
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
