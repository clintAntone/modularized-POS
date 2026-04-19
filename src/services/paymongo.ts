
import { supabase } from '../../lib/supabase';

export const paymongoService = {
  async createLink(data: { amount: number, description: string, remarks: string }) {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    console.log(`💳 PayMongo: Creating link via ${apiBase || 'local server'}...`);

    try {
      // 1. Try Local Server API (server.ts)
      const response = await fetch(`${apiBase}/api/paymongo/create-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) return await response.json();
      
      const errorData = await response.json();
      console.warn("⚠️ Local PayMongo API failed:", errorData);
    } catch (e) {
      console.warn("⚠️ Local PayMongo API unreachable:", e);
    }

    // 2. Fallback to Supabase Function (if deployed)
    try {
      console.log("🔄 Trying Supabase Function fallback...");
      const { data: response, error } = await supabase.functions.invoke('paymongo-handler', {
        body: { action: 'create-link', ...data }
      });
      if (!error && response) return response;
      if (error) throw error;
    } catch (e: any) {
      console.error("❌ All PayMongo methods failed:", e.message);
      throw new Error("Payment service unavailable. Please check if PAYMONGO_SECRET_KEY is set in your environment variables.");
    }
    
    throw new Error("Payment service unavailable.");
  },

  async checkStatus(linkId: string) {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    try {
      const response = await fetch(`${apiBase}/api/paymongo/link/${linkId}`);
      if (response.ok) return await response.json();
    } catch (e) {}

    try {
      const { data: response, error } = await supabase.functions.invoke('paymongo-handler', {
        body: { action: 'check-status', id: linkId }
      });
      if (!error && response) return response;
    } catch (e) {}
    
    throw new Error("Status check unavailable.");
  }
};
