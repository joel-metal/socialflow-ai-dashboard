/**
 * basic.test.ts
 * Smoke tests verifying the Jest + ts-jest setup is working correctly.
 */

describe('Jest setup', () => {
  it('runs TypeScript tests', () => {
    const add = (a: number, b: number): number => a + b;
    expect(add(2, 3)).toBe(5);
  });

  it('supports async/await', async () => {
    const result = await Promise.resolve('ok');
    expect(result).toBe('ok');
  });

  it('supports Jest matchers', () => {
    expect({ name: 'socialflow' }).toMatchObject({ name: expect.any(String) });
  });
});
