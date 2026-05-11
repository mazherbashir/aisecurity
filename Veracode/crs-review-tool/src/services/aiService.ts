import { AIProvider } from '../types';
import { getEndpoint } from '../config';

export async function getAIResponseForComment(comment: string, type: 'SCA' | 'SAST', provider: AIProvider = 'gemini'): Promise<string> {
  if (!comment || comment.trim() === '') {
    return 'No valid customer comments provided for AI analysis.';
  }

  try {
    const response = await fetch(getEndpoint('aiAnalyze'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        engine: provider, 
        prompt: comment,
        type: type
      }),
    });

    const data = await response.json();

    if (!response.ok || data.status !== 'success') {
      throw new Error(data.error || 'Server error or failed status');
    }

    return data.result || 'AI could not generate a response.';
  } catch (error) {
    console.error('Error fetching AI response:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error [${provider}]: ${errorMessage}`;
  }
}
