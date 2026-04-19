import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // PayMongo API Routes
  app.post("/api/paymongo/create-link", async (req, res) => {
    try {
      const { amount, description, remarks } = req.body;
      
      const secretKey = process.env.PAYMONGO_SECRET_KEY;
      if (!secretKey) {
        console.error("❌ PayMongo Secret Key is missing in environment variables");
        return res.status(500).json({ error: "PAYMONGO_SECRET_KEY not configured on server" });
      }

      console.log(`🚀 Creating PayMongo link for amount: ${amount}`);
      
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
              amount: Math.round(amount * 100), // PayMongo expects amount in cents
              description: description || "HilotCenter Pro POS Payment",
              remarks: remarks || ""
            }
          }
        }
      };

      const response = await axios.request(options);
      console.log(`✅ PayMongo link created: ${response.data.data.id}`);
      res.json(response.data.data);
    } catch (error: any) {
      const errorData = error.response?.data || error.message;
      console.error("❌ PayMongo Error:", JSON.stringify(errorData, null, 2));
      res.status(500).json({ 
        error: "Failed to create PayMongo link", 
        details: errorData 
      });
    }
  });

  // Check Link Status
  app.get("/api/paymongo/link/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const secretKey = process.env.PAYMONGO_SECRET_KEY;
      
      if (!secretKey) {
        return res.status(500).json({ error: "PAYMONGO_SECRET_KEY not configured on server" });
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
      console.error("PayMongo Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data || "Failed to fetch PayMongo link" });
    }
  });

  // PayMongo Webhook Handler
  app.post("/api/paymongo/webhook", async (req, res) => {
    try {
      const event = req.body.data;
      const eventType = event.attributes.type;
      
      if (eventType === 'link.payment.paid') {
        const payment = event.attributes.data;
        const linkId = payment.attributes.external_reference_number || payment.attributes.reference_number;
        // Note: PayMongo Link objects have an ID. The payment object might have it in attributes.
        // For Links, the payment event usually contains the link ID in the resource's related data.
        
        const resource = event.attributes.resource;
        const link_id = resource.id; // This is the link ID

        console.log(`💰 PayMongo Webhook: Payment detected for link ${link_id}`);

        // We need to update Supabase. Since we don't have a service role key easily accessible here,
        // we'll use the environment variables if they exist.
        // However, for this to work, we'd need a supabase client on the server.
        // For now, we'll log it and suggest the user how to fully integrate.
        // Actually, I can just use a fetch to Supabase REST API if I have the keys.
        
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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
      console.error("Webhook Error:", error.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Server Time Endpoint (Source of Truth)
  // Provides the server's current UTC timestamp
  app.get("/api/time", (req, res) => {
    try {
      const now = new Date();
      res.json({
        timestamp: now.getTime(),
        iso: now.toISOString(),
        source: "SERVER_LOCAL",
        timezone: "UTC"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get server time" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*all", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
