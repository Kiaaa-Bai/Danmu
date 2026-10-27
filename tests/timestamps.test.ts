import { describe, expect, it } from 'vitest';
import { buildSeeds, commentToDanmu, MAX_SEEDS, parseIsoDuration, parseTimestamps } from '@/lib/timestamps';

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
  it('drops a leading or trailing timestamp from a single remark', () => {
    expect(commentToDanmu('3:24 the way the laptop runs 😭', 600)).toEqual([{ t: 204, text: 'the way the laptop runs 😭' }]);
    expect(commentToDanmu('this part is so good (5:10)', 600)).toEqual([{ t: 310, text: 'this part is so good' }]);
  });
  it('skips a remark that is only a timestamp', () => expect(commentToDanmu('7:50', 600)).toEqual([]));
  it('drops timestamps past the end of the video', () =>
    expect(commentToDanmu('at 5:00 it breaks', 200)).toEqual([]));
  it('drops zero-width characters', () =>
    expect(commentToDanmu('0:10 \u200b intro\n0:20 setup', 600)[0]!.text).toBe('intro'));
  it('truncates long text to 60 chars with an ellipsis', () => {
    const d = commentToDanmu('1:00 ' + 'x'.repeat(80), 600)[0]!;
    expect(d.text).toHaveLength(60);
    expect(d.text.endsWith('…')).toBe(true);
  });
});

describe('buildSeeds', () => {
  it('turns comments into seed danmu with stable ids', () =>
    expect(
      buildSeeds(
        [
          { id: 'A', text: 'see 1:00 here' },
          { id: 'B', text: '0:10 intro\n0:20 setup' },
          { id: 'C', text: 'no timestamp' },
        ],
        600,
      ),
    ).toEqual([
      { id: 'c_A_0', t: 60, text: 'see 1:00 here' },
      { id: 'c_B_0', t: 10, text: 'intro' },
      { id: 'c_B_1', t: 20, text: 'setup' },
    ]));
  it('caps a video at 300 seed danmu', () =>
    expect(buildSeeds(Array.from({ length: 400 }, (_, i) => ({ id: `x${i}`, text: '0:05 hi' })), 600)).toHaveLength(
      MAX_SEEDS,
    ));
  it('keeps one chapter per moment across chapter lists, single remarks first', () =>
    expect(
      buildSeeds(
        [
          { id: 'L1', text: '0:10 intro\n5:58 data types' },
          { id: 'L2', text: '0:11 Intro\n5:58 Data Types\n9:00 arrays' },
          { id: 'S', text: 'at 5:58 he forgot a semicolon' },
        ],
        600,
      ),
    ).toEqual([
      { id: 'c_S_0', t: 358, text: 'at 5:58 he forgot a semicolon' },
      { id: 'c_L1_0', t: 10, text: 'intro' },
      { id: 'c_L1_1', t: 358, text: 'data types' },
      { id: 'c_L2_2', t: 540, text: 'arrays' },
    ]));
});

