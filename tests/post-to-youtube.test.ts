import { describe, expect, it, vi } from 'vitest';
import { FAILURE_TEXT, type PostResult } from '@/lib/messages';
import { afterFailure, postDanmu, switchYouTube } from '@/lib/post-to-youtube';

const d = { id: 'd1', videoId: 'vid12345678', t: 369.4, text: 'stuck here too' };
const OK: PostResult = { ok: true, commentId: 'Ugx_new0001' };

function deps(over: Partial<Parameters<typeof postDanmu>[1]> = {}) {
  return {
    send: vi.fn().mockResolvedValue(OK),
    link: vi.fn().mockResolvedValue(undefined),
    onLinked: vi.fn(),
    isStopped: () => false,
    ...over,
  };
}

describe('postDanmu', () => {
  it('posts "m:ss text" once and links the returned id', async () => {
    const x = deps();
    await expect(postDanmu(d, x)).resolves.toEqual(OK);
    expect(x.send).toHaveBeenCalledOnce();
    expect(x.send).toHaveBeenCalledWith({ type: 'post', videoId: 'vid12345678', text: '6:09 stuck here too' });
    expect(x.onLinked).toHaveBeenCalledWith('Ugx_new0001');
    expect(x.link).toHaveBeenCalledWith('d1', 'Ugx_new0001');
  });

  it('links nothing when the post fails', async () => {
    const x = deps({ send: vi.fn().mockResolvedValue({ ok: false, reason: 'failed' }) });
    await expect(postDanmu(d, x)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(x.link).not.toHaveBeenCalled();
    expect(x.onLinked).not.toHaveBeenCalled();
  });

  it('still succeeds when the Firestore link write is rejected', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const x = deps({ link: vi.fn().mockRejectedValue(new Error('permission-denied')) });
    await expect(postDanmu(d, x)).resolves.toEqual(OK);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('leaves the next video alone but still links in Firestore', async () => {
    const x = deps({ isStopped: () => true });
    await postDanmu(d, x);
    expect(x.onLinked).not.toHaveBeenCalled();
    expect(x.link).toHaveBeenCalledWith('d1', 'Ugx_new0001');
  });
});

describe('switchYouTube', () => {
  it('signs in when turned on while signed out', async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: true, channelTitle: 'Kia Bai' });
    await expect(switchYouTube(true, { channelTitle: null, signIn })).resolves.toEqual({
      on: true,
      channelTitle: 'Kia Bai',
      error: null,
    });
  });

  it('goes back to Off when sign-in is cancelled', async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: false, reason: 'cancelled' });
    await expect(switchYouTube(true, { channelTitle: null, signIn })).resolves.toEqual({
      on: false,
      channelTitle: null,
      error: null,
    });
  });

  it('explains an account with no channel', async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: false, reason: 'noChannel' });
    await expect(switchYouTube(true, { channelTitle: null, signIn })).resolves.toEqual({
      on: false,
      channelTitle: null,
      error: FAILURE_TEXT.noChannel,
    });
  });

  it('turns on without signing in again when already signed in', async () => {
    const signIn = vi.fn();
    await expect(switchYouTube(true, { channelTitle: 'Kia Bai', signIn })).resolves.toEqual({
      on: true,
      channelTitle: 'Kia Bai',
      error: null,
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it('turning off keeps the account', async () => {
    await expect(switchYouTube(false, { channelTitle: 'Kia Bai', signIn: vi.fn() })).resolves.toEqual({
      on: false,
      channelTitle: 'Kia Bai',
      error: null,
    });
  });
});

describe('afterFailure', () => {
  it('a signed-out failure turns the switch off', () =>
    expect(afterFailure({ on: true, channelTitle: 'Kia Bai', error: null }, 'signedOut')).toEqual({
      on: false,
      channelTitle: null,
      error: FAILURE_TEXT.signedOut,
    }));

  it('other failures keep the switch on and show the reason', () =>
    expect(afterFailure({ on: true, channelTitle: 'Kia Bai', error: null }, 'commentsDisabled')).toEqual({
      on: true,
      channelTitle: 'Kia Bai',
      error: FAILURE_TEXT.commentsDisabled,
    }));
});
