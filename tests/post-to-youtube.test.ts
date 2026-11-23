import { describe, expect, it, vi } from 'vitest';
import { FAILURE_TEXT, type PostResult } from '@/lib/messages';
import { afterFailure, postDanmu, switchYouTube, YouTubeSwitch } from '@/lib/post-to-youtube';

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

describe('afterFailure when the switch was turned off elsewhere', () => {
  it('turns this tab off quietly, keeping the account', () =>
    expect(afterFailure({ on: true, channelTitle: 'Kia Bai', error: null }, 'off')).toEqual({
      on: false,
      channelTitle: 'Kia Bai',
      error: null,
    }));
});

describe('YouTubeSwitch', () => {
  function make(state = { on: false, channelTitle: null as string | null, error: null }) {
    let finishSignIn!: (r: { ok: true; channelTitle: string }) => void;
    const deps = {
      signIn: vi.fn(() => new Promise<{ ok: true; channelTitle: string }>((r) => (finishSignIn = r))),
      signOut: vi.fn(async () => {}),
      render: vi.fn(),
      save: vi.fn(),
    };
    return { sw: new YouTubeSwitch(state, deps), deps, finishSignIn: (t: string) => finishSignIn({ ok: true, channelTitle: t }) };
  }

  it('a newer Off wins over a sign-in that finishes later', async () => {
    const { sw, finishSignIn } = make();
    const signingIn = sw.flip(true);
    await sw.flip(false);
    finishSignIn('Kia Bai');
    await signingIn;
    expect(sw.current.on).toBe(false);
  });

  it('turns on after a sign-in nobody interrupted', async () => {
    const { sw, deps, finishSignIn } = make();
    const signingIn = sw.flip(true);
    finishSignIn('Kia Bai');
    await signingIn;
    expect(sw.current).toEqual({ on: true, channelTitle: 'Kia Bai', error: null });
    expect(deps.save).toHaveBeenLastCalledWith({ on: true, channelTitle: 'Kia Bai', error: null });
  });

  it('another tab turning it off turns this tab off, without saving again', () => {
    const { sw, deps } = make({ on: true, channelTitle: 'Kia Bai', error: null });
    sw.sync(false, 'Kia Bai');
    expect(sw.current.on).toBe(false);
    expect(deps.render).toHaveBeenLastCalledWith({ on: false, channelTitle: 'Kia Bai', error: null });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('signing out clears the switch and the account', async () => {
    const { sw, deps } = make({ on: true, channelTitle: 'Kia Bai', error: null });
    await sw.signOut();
    expect(deps.signOut).toHaveBeenCalledOnce();
    expect(sw.current).toEqual({ on: false, channelTitle: null, error: null });
  });
});
