
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const MODELS = {
  text: 'gemini-3-flash-preview',
  image: 'gemini-2.5-flash-image'
};

export const generateAnalysis = async (systemInstruction: string, userPrompt: string, dataContext: any) => {
  try {
    const response = await ai.models.generateContent({
      model: MODELS.text,
      contents: `CONTEXT DATA: ${JSON.stringify(dataContext)}\n\nUSER REQUEST: ${userPrompt}`,
      config: {
        systemInstruction,
        temperature: 0.2, // Keep it grounded for data analysis
        topP: 0.8,
        topK: 40
      },
    });
    return response.text;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw error;
  }
};
