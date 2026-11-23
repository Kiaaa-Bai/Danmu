import { browser } from 'wxt/browser';
import {
  FAILURE_TEXT,
  type BgRequest,
  type PostFailure,
  type PostResult,
  type SignInResult,
  type YouTubeState,
} from './messages';
import type { Danmu } from './store';
import { formatStamp } from './timestamps';

/** Asks the background script (the only place chrome.identity works). Callers name the answer's type. */
export function ask<R>(req: BgRequest): Promise<R> {
  return browser.runtime.sendMessage(req) as Promise<R>;
}

export type PostDeps = {
  send(req: BgRequest): Promise<PostResult>;
  /** Writes the YouTube comment id onto the Firestore danmu. */
  link(danmuId: string, commentId: string): Promise<void>;
  /** Hides that comment in this tab right away. */
  onLinked(commentId: string): void;
  /** True once the person has moved to another video. */
  isStopped(): boolean;
};

/**
 * Posts one sent danmu as the YouTube comment "6:09 stuck here too", then links the two so the comment
 * isn't shown a second time. A failed link write is only logged: the comment is already up.
 */
export async function postDanmu(d: Pick<Danmu, 'id' | 'videoId' | 't' | 'text'>, deps: PostDeps): Promise<PostResult> {
  const result = await deps.send({ type: 'post', videoId: d.videoId, text: `${formatStamp(d.t)} ${d.text}` });
  if (!result.ok) return result;
  if (!deps.isStopped()) deps.onLinked(result.commentId);
  await deps.link(d.id, result.commentId).catch((err) => console.warn('[danmu] link failed', err));
  return result;
}

/** The YouTube switch was flipped. Turning it on while signed out opens Google sign-in first. */
export async function switchYouTube(
  on: boolean,
  deps: { channelTitle: string | null; signIn(): Promise<SignInResult> },
): Promise<YouTubeState> {
  if (!on) return { on: false, channelTitle: deps.channelTitle, error: null };
  if (deps.channelTitle) return { on: true, channelTitle: deps.channelTitle, error: null };
  const r = await deps.signIn();
  if (r.ok) return { on: true, channelTitle: r.channelTitle, error: null };
  return { on: false, channelTitle: null, error: r.reason === 'cancelled' ? null : FAILURE_TEXT[r.reason] };
}

/** A post failed: say why. Signed out turns the switch off, so nothing is posted until they sign in again. */
export function afterFailure(state: YouTubeState, reason: PostFailure): YouTubeState {
  if (reason === 'signedOut') return { on: false, channelTitle: null, error: FAILURE_TEXT.signedOut };
  return { ...state, error: FAILURE_TEXT[reason] };
}
