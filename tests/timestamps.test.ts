import { describe, expect, it } from 'vitest';
import { commentToDanmu, parseIsoDuration, parseTimestamps } from '@/lib/timestamps';

describe('parseTimestamps', () => {
  it('reads m:ss', () => expect(parseTimestamps('data types and variables 5:58')).toEqual([358]));
  it('reads h:mm:ss', () => expect(parseTimestamps('0:01:24 Running JavaScript')).toEqual([84]));
  it('reads a timestamp mid-sentence', () => expect(parseTimestamps('near the 2:45:00 mark')).toEqual([9900]));
  it('allows minutes above 59 without hours', () => expect(parseTimestamps('at 75:30 we')).toEqual([4530]));
  it('ignores ratios, versions and longer numbers', () =>
    expect(parseTimestamps('ratio 16:9, 3:2, v1.2:30, 12:345')).toEqual([]));
});

describe('parseIsoDuration', () => {
  it('reads hours, minutes, seconds', () => expect(parseIsoDuration('PT3H26M43S')).toBe(12403));
  it('reads seconds only', () => expect(parseIsoDuration('PT45S')).toBe(45));
});

describe('commentToDanmu', () => {
  it('uses the whole comment when it has one timestamp', () =>
    expect(commentToDanmu('Until that arrow\nfunction near the 2:45:00 mark', 12403)).toEqual([
      { t: 9900, text: 'Until that arrow function near the 2:45:00 mark' },
    ]));
  it('splits a chapter list into one danmu per line', () =>
    expect(commentToDanmu('Contents\n0:00:00 Introduction\n0:01:24 - Running JavaScript\n2:00', 12403)).toEqual([
      { t: 0, text: 'Introduction' },
      { t: 84, text: 'Running JavaScript' },
    ]));
  it('strips trailing timestamps', () =>
    expect(commentToDanmu('comment your code 4:22\ndata types 5:58', 12403)).toEqual([
      { t: 262, text: 'comment your code' },
      { t: 358, text: 'data types' },
    ]));
  it('drops timestamps past the end of the video', () =>
    expect(commentToDanmu('at 5:00 it breaks', 200)).toEqual([]));
  it('truncates long text to 60 chars with an ellipsis', () => {
    const [d] = commentToDanmu('1:00 ' + 'x'.repeat(80), 600);
    expect(d.text).toHaveLength(60);
    expect(d.text.endsWith('…')).toBe(true);
  });
});
