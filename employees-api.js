require("dotenv").config({ path: "/root/backend/.env" });
const express = require("express");
const https = require("https");
const crypto = require("crypto");

const app = express();
const PORT = 3001;

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

app.get("/api/employees", (req, res) => {
  const apiKey = process.env.EMPLOYEES_API_KEY;
  const reqKey = req.headers["x-api-key"] || "";
  if (!apiKey || !safeEqual(apiKey, reqKey)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const options = {
    hostname: process.env.SUPABASE_HOSTNAME,
    path: "/rest/v1/employees?is_active=eq.true&select=id,timestamp,first_name,middle_name,last_name",
    method: "GET",
    headers: {
      "apikey": process.env.SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      "Accept": "application/json",
    }
  };

  https.get(options, (supaRes) => {
    let data = "";
    supaRes.on("data", chunk => data += chunk);
    supaRes.on("end", () => {
      try {
        const employees = JSON.parse(data);
        const formatted = employees.map(emp => {
          let employeeId = emp.id;
          if (emp.timestamp) {
            const d = new Date(emp.timestamp);
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            employeeId = `EMP-${mm}-${dd}-${emp.id}`.toUpperCase();
          }
          return {
            employee_id: employeeId,
            first_name: emp.first_name,
            middle_name: emp.middle_name,
            last_name: emp.last_name,
          };
        });
        res.json(formatted);
      } catch {
        res.status(500).json({ error: "Failed to process response" });
      }
    });
  }).on("error", (err) => {
    console.error("Supabase error:", err.message);
    res.status(500).json({ error: "Failed to fetch employees" });
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Employees API running on http://0.0.0.0:${PORT}`);
});
