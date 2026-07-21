const express = require("express");
const path = require("path");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// ── Fingerprint removal ───────────────────────────────────────────────────────
app.disable("x-powered-by");

// ── Compression (gzip) ────────────────────────────────────────────────────────
app.use(compression());

// ── Simple request logger ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${ms}ms ${ip}`);
  });
  next();
});

// ── Rate limiting (built-in, no extra dependency) ─────────────────────────────
const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 200;             // requests per IP per minute

setInterval(() => requestCounts.clear(), RATE_LIMIT_WINDOW_MS);

app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  const count = (requestCounts.get(ip) || 0) + 1;
  requestCounts.set(ip, count);
  if (count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too many requests" });
  }
  next();
});

// ── Security headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR, {
  maxAge: "1y",          // hashed assets cached for 1 year
  etag: false,           // disable etag (inode leakage)
  setHeaders: (res, filePath) => {
    // index.html and sw.js must never be cached
    if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
    }
  }
}));

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get("/{*path}", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, must-revalidate");
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`POS running on http://0.0.0.0:${PORT}`);
});
