import { BadRequestException } from '@nestjs/common';
import { parseSagaListQuery } from './community-query';

describe('parseSagaListQuery', () => {
  it('uses safe defaults and normalizes creator handles', () => {
    expect(parseSagaListQuery({ creator: '  The-Scribe ' })).toEqual({
      cursor: undefined,
      limit: 20,
      q: undefined,
      creator: 'the-scribe',
    });
  });

  it('caps page size at 50', () => {
    expect(parseSagaListQuery({ limit: '500' }).limit).toBe(50);
  });

  it.each(['0', '-1', '1.5', 'unknown'])(
    'rejects invalid limit %s',
    (limit) => {
      expect(() => parseSagaListQuery({ limit })).toThrow(BadRequestException);
    },
  );

  it('rejects excessively long search text', () => {
    expect(() => parseSagaListQuery({ q: 'x'.repeat(101) })).toThrow(
      BadRequestException,
    );
  });
});
