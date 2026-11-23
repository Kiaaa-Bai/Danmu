import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { failureFor, fetchChannelTitle, postComment, YouTubeApiError } from '@/lib/youtube-api';

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('postComment', () => {
  it('posts the comment and returns the top-level comment id', async () => {
    fetchMock.mockResolvedValue(json({ id: 'thr1', snippet: { topLevelComment: { id: 'Ugx_new0001' } } }));
    await expect(postComment('tok', 'vid12345678', '6:09 hi')).resolves.toBe('Ugx_new0001');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({
      snippet: { videoId: 'vid12345678', topLevelComment: { snippet: { textOriginal: '6:09 hi' } } },
    });
  });

  it('throws a YouTubeApiError with status and reason', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'off', errors: [{ reason: 'commentsDisabled' }] } }, 403));
    await expect(postComment('tok', 'vid12345678', '6:09 hi')).rejects.toMatchObject({ status: 403, reason: 'commentsDisabled' });
  });
});

describe('fetchChannelTitle', () => {
  it('returns the channel title', async () => {
    fetchMock.mockResolvedValue(json({ items: [{ snippet: { title: 'Kia Bai' } }] }));
    await expect(fetchChannelTitle('tok')).resolves.toBe('Kia Bai');
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true');
  });

  it('is null for an account with no channel', async () => {
    fetchMock.mockResolvedValue(json({ items: [] }));
    await expect(fetchChannelTitle('tok')).resolves.toBeNull();
  });
});

describe('failureFor', () => {
  it.each([
    [401, 'authError', 'signedOut'],
    [403, 'commentsDisabled', 'commentsDisabled'],
    [403, 'quotaExceeded', 'quotaExceeded'],
    [403, 'ineligibleAccount', 'noChannel'],
    [403, 'youtubeSignupRequired', 'noChannel'],
    [500, 'backendError', 'failed'],
  ])('%s %s → %s', (status, reason, out) => expect(failureFor(new YouTubeApiError(reason, 'x', status))).toBe(out));

  it('a network error → failed', () => expect(failureFor(new TypeError('Failed to fetch'))).toBe('failed'));
});
