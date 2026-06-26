const express = require("express");
const https = require("https");

const app = express();
const PORT = 3001;

const EMPLOYEES_API_KEY = "da71ba8cc14981f7e803edaf98708028c424ee82100d6f7d80316a45fb0cdedf";
const SUPABASE_HOSTNAME = "db.hilotcenter.cloud";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzUwOTc3MzIsImV4cCI6MjA5MDQ1NzczMn0.unlrtyaROc5LrI5I9RRxJ3pTEybh8Q2aGje-qgUcYHQ";

app.get("/api/employees", (req, res) => {
  if (req.headers["x-api-key"] !== EMPLOYEES_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const options = {
    hostname: SUPABASE_HOSTNAME,
    path: "/rest/v1/employees?is_active=eq.true&select=id,timestamp,first_name,middle_name,last_name",
    method: "GET",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
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
        res.status(500).json({ error: "Failed to parse response" });
      }
    });
  }).on("error", (err) => {
    console.error("Supabase error:", err.message);
    res.status(500).json({ error: err.message });
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Employees API running on http://0.0.0.0:${PORT}`);
});
