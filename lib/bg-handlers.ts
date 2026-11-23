import type { PostResult, SignInResult } from './messages';
import { failureFor } from './youtube-api';
import { signInToken, validToken, type TokenDeps } from './youtube-auth';

export type BgDeps = {
  tokens: TokenDeps;
  /** The id of the channel the person signed in as (public, so kept across browser restarts). */
  channel: { load(): Promise<string | null>; save(id: string | null): Promise<void> };
  /** The switch as stored. Checked on every post, so a tab that missed "Off" still can't post. */
  postingOn(): Promise<boolean>;
  postComment(token: string, videoId: string, text: string): Promise<string>;
  fetchChannel(token: string): Promise<{ id: string; title: string } | null>;
  revoke(token: string): Promise<void>;
};

/** What the background script does for the content script: sign in, post, sign out. */
export function createHandlers(deps: BgDeps) {
  const forget = async () => {
    await deps.tokens.save(null);
  };

  async function signIn(): Promise<SignInResult> {
    const t = await signInToken(deps.tokens);
    if (!t) return { ok: false, reason: 'cancelled' };
    let ch: { id: string; title: string } | null;
    try {
      ch = await deps.fetchChannel(t.token);
    } catch (err) {
      console.warn('[danmu] channel lookup failed', err);
      return { ok: false, reason: 'failed' };
    }
    if (!ch) {
      await forget();
      return { ok: false, reason: 'noChannel' };
    }
    await deps.channel.save(ch.id);
    return { ok: true, channelTitle: ch.title };
  }

  async function post(videoId: string, text: string): Promise<PostResult> {
    if (!(await deps.postingOn())) return { ok: false, reason: 'off' };
    const before = (await deps.tokens.load())?.token;
    const token = await validToken(deps.tokens);
    if (!token) return { ok: false, reason: 'signedOut' };
    if (token !== before) {
      // A silent renewal can come back as whichever Google account the browser prefers. Post only as the
      // channel the person picked; anything else counts as signed out.
      const [ch, expected] = await Promise.all([deps.fetchChannel(token).catch(() => undefined), deps.channel.load()]);
      if (ch === undefined) return { ok: false, reason: 'failed' };
      if (!ch || ch.id !== expected) {
        await forget();
        return { ok: false, reason: 'signedOut' };
      }
    }
    try {
      return { ok: true, commentId: await deps.postComment(token, videoId, text) };
    } catch (err) {
      const reason = failureFor(err);
      if (reason === 'signedOut') await forget();
      if (reason === 'failed') console.warn('[danmu] post failed', err);
      return { ok: false, reason };
    }
  }

  async function signOut(): Promise<void> {
    const t = await deps.tokens.load();
    if (t) await deps.revoke(t.token).catch(() => undefined);
    await forget();
    await deps.channel.save(null);
  }

  return { signIn, post, signOut };
}
