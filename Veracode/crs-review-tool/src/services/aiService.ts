import { AIProvider } from '../types';
import { getEndpoint } from '../config';

export interface AIResponse {
  result: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  engine?: string;
}

export async function getAIResponseForComment(
  comment: string,
  type: 'SCA' | 'SAST',
  provider: AIProvider = 'gemini',
  flawId?: string,
  flawSummary?: string
): Promise<AIResponse> {
  if (!comment || comment.trim() === '') {
    return { result: 'No valid customer comments provided for AI analysis.' };
  }

  try {
    const bodyArgs: any = { 
      engine: provider,
      provider: provider, // keeping both for compat
      prompt: comment,
      comment: comment,   // keeping both for compat
      type: type 
    };
    if (flawId) bodyArgs.flawId = flawId;
    if (flawSummary) bodyArgs.flawSummary = flawSummary;

    const response = await fetch(getEndpoint('aiAnalyze'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyArgs),
    });

    const text = await response.text();
    let data;
    
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${text}`);
      }
      throw new Error(`Invalid JSON response: ${text.substring(0, 100)}...`);
    }

    if (!response.ok || data.status !== 'success' && data.status !== 'error') {
      if (data.status === 'error') {
         return { result: `AI Error: ${data.message || data.error || 'Unknown error'}` };
      }
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    const inTokens = data.in || 0;
    const outTokens = data.out || 0;

    return {
      result: data.result || 'AI could not generate a response.',
      inputTokens: inTokens,
      outputTokens: outTokens,
      totalTokens: inTokens + outTokens,
      engine: data.engine
    };
  } catch (error) {
    console.error('Error fetching AI response:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { result: `Error [${provider}]: ${errorMessage}` };
  }
}
