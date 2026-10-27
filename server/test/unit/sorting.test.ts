import { describe, expect, it } from 'vitest';
import { likePattern, orderByClause, prefixPattern, sortFieldSchema } from '../../src/lib/sorting.js';

describe('likePattern / prefixPattern', () => {
  it('escapes LIKE wildcards so they match literally', () => {
    expect(likePattern('100%')).toBe('%100\\%%');
    expect(likePattern('a_b')).toBe('%a\\_b%');
    expect(likePattern('back\\slash')).toBe('%back\\\\slash%');
    expect(prefixPattern('50%_off')).toBe('50\\%\\_off%');
  });
});

describe('orderByClause', () => {
  it('maps whitelisted fields to fixed SQL', () => {
    expect(orderByClause('files', 'size', 'desc', 'f')).toMatch(/^ORDER BY f\.size_bytes DESC/);
    expect(orderByClause('folders', 'size', 'asc', 'f')).toMatch(/^ORDER BY lower\(f\.name\) ASC/);
  });

  it('rejects unknown sort fields at validation time', () => {
    expect(sortFieldSchema.safeParse('name; DROP TABLE users').success).toBe(false);
    expect(sortFieldSchema.parse(undefined)).toBe('name');
  });
});
