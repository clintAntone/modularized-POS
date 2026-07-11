import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";

dotenv.config();

// Timing-safe string comparison to prevent timing attacks on key checks
function safeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Restrict CORS to the production domain only
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
  app.use(cors({ origin: allowedOrigin }));

  // Raw body parser for webhook signature verification — must come before express.json()
  app.use('/api/paymongo/webhook', express.raw({ type: 'application/json' }));

  // JSON parser for all other routes
  app.use(express.json());

  // ── PayMongo: Create Link ────────────────────────────────────────────────────
  app.post("/api/paymongo/create-link", async (req, res) => {
    try {
      const { amount, description, remarks } = req.body;

      const secretKey = process.env.PAYMONGO_SECRET_KEY;
      if (!secretKey) {
        console.error("❌ PayMongo Secret Key is missing");
        return res.status(500).json({ error: "Payment service not configured" });
      }

      const options = {
        method: 'POST',
        url: 'https://api.paymongo.com/v1/links',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Basic ${Buffer.from(secretKey + ':').toString('base64')}`
        },
        data: {
          data: {
            attributes: {
              amount: Math.round(amount * 100),
              description: description || "HilotCenter Pro POS Payment",
              remarks: remarks || ""
            }
          }
        }
      };

      const response = await axios.request(options);
      res.json(response.data.data);
    } catch (error: any) {
      console.error("❌ PayMongo create-link error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to create payment link" });
    }
  });

  // ── PayMongo: Check Link Status ───────────────────────────────────────────────
  app.get("/api/paymongo/link/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const secretKey = process.env.PAYMONGO_SECRET_KEY;

      if (!secretKey) {
        return res.status(500).json({ error: "Payment service not configured" });
      }

      const options = {
        method: 'GET',
        url: `https://api.paymongo.com/v1/links/${id}`,
        headers: {
          accept: 'application/json',
          authorization: `Basic ${Buffer.from(secretKey + ':').toString('base64')}`
        }
      };

      const response = await axios.request(options);
      res.json(response.data.data);
    } catch (error: any) {
      console.error("PayMongo link-status error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch payment status" });
    }
  });

  // ── PayMongo: Webhook Handler ─────────────────────────────────────────────────
  app.post("/api/paymongo/webhook", async (req, res) => {
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

    // Verify signature if a webhook secret is configured
    if (webhookSecret) {
      const signature = req.headers['x-paymongo-signature'] as string;
      if (!signature) {
        console.warn("⚠️  Webhook received without signature — rejected");
        return res.status(401).json({ error: "Missing signature" });
      }

      const rawBody = req.body as Buffer;
      const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (!safeEqual(signature, expected)) {
        console.warn("⚠️  Webhook signature mismatch — rejected");
        return res.status(401).json({ error: "Invalid signature" });
      }
    } else {
      console.warn("⚠️  PAYMONGO_WEBHOOK_SECRET not set — skipping signature check");
    }

    try {
      const body = JSON.parse((req.body as Buffer).toString());
      const event = body.data;
      const eventType = event.attributes.type;

      if (eventType === 'link.payment.paid') {
        const resource = event.attributes.resource;
        const link_id = resource.id;

        console.log(`💰 PayMongo Webhook: Payment for link ${link_id}`);

        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (supabaseUrl && supabaseKey) {
          await axios.patch(
            `${supabaseUrl}/rest/v1/transactions?paymongo_link_id=eq.${link_id}`,
            { payment_status: 'PAID' },
            {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              }
            }
          );
          console.log(`✅ Supabase updated for link ${link_id}`);
        }
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("Webhook processing error:", error.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ── Employees API ─────────────────────────────────────────────────────────────
  app.get("/api/employees", async (req, res) => {
    const apiKey = process.env.EMPLOYEES_API_KEY;
    const reqKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey || !reqKey || !safeEqual(apiKey, reqKey)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Supabase not configured" });
    }

    try {
      const response = await axios.get(
        `${supabaseUrl}/rest/v1/employees?is_active=eq.true&select=id,first_name,middle_name,last_name`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Accept': 'application/json',
          }
        }
      );
      res.json(response.data);
    } catch (error: any) {
      console.error("Employees API error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // ── AI Proxy — keeps Gemini API key server-side ───────────────────────────────
  app.post("/api/ai", async (req, res) => {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(500).json({ error: "AI service not configured" });
    }

    const { systemInstruction, userPrompt, dataContext } = req.body;
    if (!userPrompt) {
      return res.status(400).json({ error: "userPrompt is required" });
    }

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          system_instruction: { parts: [{ text: systemInstruction || '' }] },
          contents: [{
            parts: [{
              text: `CONTEXT DATA: ${JSON.stringify(dataContext)}\n\nUSER REQUEST: ${userPrompt}`
            }]
          }],
          generationConfig: { temperature: 0.2, topP: 0.8, topK: 40 }
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      res.json({ text });
    } catch (error: any) {
      console.error("AI proxy error:", error.response?.data || error.message);
      res.status(500).json({ error: "AI request failed" });
    }
  });

  // ── Server Time ───────────────────────────────────────────────────────────────
  app.get("/api/time", (_req, res) => {
    const now = new Date();
    res.json({
      timestamp: now.getTime(),
      iso: now.toISOString(),
      source: "SERVER_LOCAL",
      timezone: "UTC"
    });
  });

  // ── Vite / Static ─────────────────────────────────────────────────────────────
  // Static file serving and SPA routing is handled by Apache.
  // The Node server only needs to expose the /api/* routes.
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
