import { AIProvider } from '../types';
import { getEndpoint } from '../config';

export interface AIResponse {
  result: string;
}

export async function getAIResponseForComment(comment: string, type: 'SCA' | 'SAST', provider: AIProvider = 'gemini'): Promise<AIResponse> {
  if (!comment || comment.trim() === '') {
    return { result: 'No valid customer comments provided for AI analysis.' };
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

    if (!response.ok || data.status !== 'success') {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return {
      result: data.result || 'AI could not generate a response.',
    };
  } catch (error) {
    console.error('Error fetching AI response:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { result: `Error [${provider}]: ${errorMessage}` };
  }
}
