import { describe, expect, it } from 'vitest';

import { countWords, parseInline, parseRichText, plainText, truncateBlocks, typewriterMs, wordsShown } from '../lib/richText';

describe('parseInline', () => {
  it('reads **bold**', () => {
    expect(parseInline('Eat **30 g** of protein')).toEqual([
      { text: 'Eat ', bold: false },
      { text: '30 g', bold: true },
      { text: ' of protein', bold: false },
    ]);
  });
  it('leaves an unpaired ** as typed', () => {
    expect(parseInline('2 ** 3')).toEqual([{ text: '2 ** 3', bold: false }]);
  });
  it('keeps empty pairs as text', () => {
    expect(parseInline('a **** b')).toEqual([{ text: 'a **** b', bold: false }]);
  });
  it('never makes HTML or links', () => {
    const s = parseInline('<b>hi</b> [x](http://evil) <script>');
    expect(s).toEqual([{ text: '<b>hi</b> [x](http://evil) <script>', bold: false }]);
  });
});

describe('parseRichText', () => {
  it('splits paragraphs on blank lines and joins soft breaks', () => {
    expect(parseRichText('One\ntwo\n\nThree')).toEqual([
      { type: 'p', spans: [{ text: 'One two', bold: false }] },
      { type: 'p', spans: [{ text: 'Three', bold: false }] },
    ]);
  });
  it('reads "- ", "• " and "* " lists as one list', () => {
    const b = parseRichText('Try:\n- eggs\n• **labneh**\n* tuna');
    expect(b).toHaveLength(2);
    expect(b[1]).toEqual({ type: 'ul', items: [[{ text: 'eggs', bold: false }], [{ text: 'labneh', bold: true }], [{ text: 'tuna', bold: false }]] });
  });
  it('reads numbered lists and keeps their numbers', () => {
    const b = parseRichText('1. Warm up\n2) Squat\n3. Stretch');
    expect(b).toEqual([
      {
        type: 'ol',
        items: [
          { n: 1, spans: [{ text: 'Warm up', bold: false }] },
          { n: 2, spans: [{ text: 'Squat', bold: false }] },
          { n: 3, spans: [{ text: 'Stretch', bold: false }] },
        ],
      },
    ]);
  });
  it('starts a new list after a paragraph', () => {
    expect(parseRichText('- a\nText\n- b').map((x) => x.type)).toEqual(['ul', 'p', 'ul']);
  });
  it('shows headings as bold lines and ignores empty input', () => {
    expect(parseRichText('## Plan')).toEqual([{ type: 'p', spans: [{ text: 'Plan', bold: true }] }]);
    expect(parseRichText('')).toEqual([]);
    expect(parseRichText('  \n\n ')).toEqual([]);
  });
  it('does not take "-5 kg" for a list', () => {
    expect(parseRichText('-5 kg by June')[0].type).toBe('p');
  });
});

describe('plainText', () => {
  it('reads back without marks', () => {
    expect(plainText(parseRichText('**Today**\n\n- eggs\n- tuna\n\n1. walk'))).toBe('Today\n\n• eggs\n• tuna\n\n1. walk');
  });
});

describe('typewriter', () => {
  const blocks = parseRichText('Eat **more protein** today.\n\n- eggs and labneh\n- tuna');
  it('counts words across blocks', () => {
    expect(countWords(blocks)).toBe(8);
  });
  it('keeps the structure while cutting', () => {
    expect(truncateBlocks(blocks, 2)).toEqual([{ type: 'p', spans: [{ text: 'Eat ', bold: false }, { text: 'more', bold: true }] }]);
    const five = truncateBlocks(blocks, 5);
    expect(five).toHaveLength(2);
    expect(five[1]).toEqual({ type: 'ul', items: [[{ text: 'eggs', bold: false }]] });
    expect(truncateBlocks(blocks, 0)).toEqual([]);
    expect(truncateBlocks(blocks, 99)).toBe(blocks);
  });
  it('takes 0.6 to 1.2 seconds, scaled by length', () => {
    expect(typewriterMs(3)).toBe(600);
    expect(typewriterMs(20)).toBe(800);
    expect(typewriterMs(400)).toBe(1200);
  });
  it('shows every word by the end and at least one at the start', () => {
    expect(wordsShown(0, 10, 800)).toBe(1);
    expect(wordsShown(800, 10, 800)).toBe(10);
    expect(wordsShown(400, 10, 800)).toBeGreaterThan(5);
    expect(wordsShown(400, 10, 800)).toBeLessThan(10);
    expect(wordsShown(10, 10, 0)).toBe(10);
  });
});
