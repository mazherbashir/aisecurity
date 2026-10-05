import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAIResponseForComment } from './aiService';

describe('getAIResponseForComment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns immediate message when comment is empty or blank', async () => {
    const res1 = await getAIResponseForComment('', 'SAST');
    expect(res1.result).toContain('No valid customer comments');

    const res2 = await getAIResponseForComment('   ', 'SCA');
    expect(res2.result).toContain('No valid customer comments');
  });

  it('returns parsed AI response on successful fetch', async () => {
    const mockData = {
      status: 'success',
      result: 'Valid mitigation provided.',
      in: 50,
      out: 25,
      engine: 'gemini'
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockData)
    } as any);

    const res = await getAIResponseForComment('Boundary validation applied', 'SAST', 'gemini', 'CWE-89');
    expect(res.result).toBe('Valid mitigation provided.');
    expect(res.inputTokens).toBe(50);
    expect(res.outputTokens).toBe(25);
    expect(res.totalTokens).toBe(75);
    expect(res.engine).toBe('gemini');
  });

  it('retries fallback endpoint when primary endpoint returns 404', async () => {
    const mockData = {
      status: 'success',
      result: 'Mitigation accepted after fallback.',
      in: 30,
      out: 15,
      engine: 'gemini'
    };

    // First call returns 404, second call returns 200
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found'
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockData)
      } as any);

    const res = await getAIResponseForComment('Mitigated by framework', 'SCA', 'gemini');
    expect(res.result).toBe('Mitigation accepted after fallback.');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('handles backend error responses gracefully without crashing', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'error', message: 'Quota exceeded' })
    } as any);

    const res = await getAIResponseForComment('Some comments', 'SAST');
    expect(res.result).toBe('AI Error: Quota exceeded');
  });
});
