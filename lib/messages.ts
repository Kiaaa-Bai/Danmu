/** What the content script and the background script say to each other. Types and copy only. */

export type PostFailure = 'commentsDisabled' | 'quotaExceeded' | 'signedOut' | 'noChannel' | 'failed';

export type BgRequest = { type: 'signIn' } | { type: 'signOut' } | { type: 'post'; videoId: string; text: string };

export type SignInResult = { ok: true; channelTitle: string } | { ok: false; reason: 'cancelled' | 'noChannel' | 'failed' };

export type PostResult = { ok: true; commentId: string } | { ok: false; reason: PostFailure };

/** The gear panel's YouTube row: switch, signed-in channel, last problem. */
export type YouTubeState = { on: boolean; channelTitle: string | null; error: string | null };

export const FAILURE_TEXT: Record<PostFailure, string> = {
  commentsDisabled: 'Comments are off on this video',
  quotaExceeded: 'YouTube posting limit reached for today',
  signedOut: 'Signed out. Turn on to sign in again',
  noChannel: 'This Google account has no YouTube channel',
  failed: "Couldn't post to YouTube",
};
