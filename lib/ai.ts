
// AI calls are proxied through /api/ai on the server so the Gemini API key
// is never embedded in the client bundle.

export const generateAnalysis = async (systemInstruction: string, userPrompt: string, dataContext: any): Promise<string> => {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction, userPrompt, dataContext }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'AI request failed');
  }

  const data = await response.json();
  return data.text ?? '';
};
