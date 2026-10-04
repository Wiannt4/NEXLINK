"use strict";

require("dotenv").config();

const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const { rateLimit } = require("express-rate-limit");

const app = express();
const port = Number(process.env.PORT || 3000);
const sessionCookie = "nexlink_session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;
const maxAvatarLength = 2_800_000;
const root = __dirname;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL wajib diisi.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});
pool.on("error", error => console.error("Koneksi PostgreSQL idle bermasalah.", error));

if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "3mb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }
});
app.use("/api/profiles", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function sessionTokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function setSessionCookie(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
    [sessionTokenHash(token), userId]
  );
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"),
    sameSite: "lax",
    path: "/",
    maxAge: sessionLifetimeSeconds * 1000
  });
}

function cookieParser(req, res, next) {
  const cookies = Object.create(null);
  for (const part of (req.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    try {
      cookies[key] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      cookies[key] = "";
    }
  }
  req.cookies = cookies;
  next();
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[sessionCookie];
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    return res.status(401).json({ error: "Silakan login untuk melanjutkan." });
  }
  pool.query(
    "SELECT user_id FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()",
    [sessionTokenHash(token)]
  ).then(result => {
    if (!result.rowCount) return res.status(401).json({ error: "Sesi sudah tidak berlaku." });
    req.userId = result.rows[0].user_id;
    req.sessionToken = token;
    next();
  }).catch(next);
}

function checkSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next();
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: "Origin tidak valid." });
  }
  if (originHost !== req.get("host")) return res.status(403).json({ error: "Permintaan lintas origin ditolak." });
  next();
}

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().replace(/^@/, "").toLowerCase() : "";
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function profileForClient(row, clicks = {}) {
  return {
    name: row.display_name,
    username: row.username,
    bio: row.bio,
    avatar: row.avatar,
    background: row.background,
    customBackgroundColor: row.custom_background_color,
    profileTheme: row.profile_theme,
    pinnedLinkId: row.pinned_link_id,
    links: row.links,
    analytics: {
      views: Number(row.views),
      clicks
    }
  };
}

async function fetchOwnedProfile(userId) {
  const result = await pool.query(
    `SELECT user_id, username, display_name, bio, avatar, background,
            custom_background_color, profile_theme, pinned_link_id, links, views
       FROM profiles WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

app.use(cookieParser);
app.use("/api", checkSameOrigin);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.get("/api/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
}));

app.post("/api/auth/register", authLimiter, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    return res.status(400).json({ error: "Username harus 3–24 karakter: huruf, angka, titik, _ atau -." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Alamat email tidak valid." });
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 72 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "Password harus berisi 10–72 karakter." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [email, passwordHash]
    );
    const userId = userResult.rows[0].id;
    await client.query(
      `INSERT INTO profiles (user_id, username, display_name)
       VALUES ($1, $2, $3)`,
      [userId, username, username]
    );
    await client.query("COMMIT");
    await setSessionCookie(res, userId);
    res.status(201).json({ user: { email, username } });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email atau username sudah digunakan." });
    }
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/auth/login", authLimiter, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!email || typeof password !== "string") {
    return res.status(400).json({ error: "Email dan password wajib diisi." });
  }
  const result = await pool.query(
    `SELECT users.id, users.email, users.password_hash, profiles.username
       FROM users JOIN profiles ON profiles.user_id = users.id
      WHERE users.email = $1`,
    [email]
  );
  const user = result.rows[0];
  const matches = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!matches) return res.status(401).json({ error: "Email atau password tidak cocok." });
  await setSessionCookie(res, user.id);
  res.json({ user: { email: user.email, username: user.username } });
}));

app.post("/api/auth/logout", requireAuth, (req, res) => {
  pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [sessionTokenHash(req.sessionToken)])
    .then(() => {
      res.clearCookie(sessionCookie, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"),
        sameSite: "lax",
        path: "/"
      });
      res.status(204).end();
    })
    .catch(error => {
      console.error("Gagal mengakhiri sesi.", error);
      res.status(500).json({ error: "Sesi tidak dapat diakhiri. Coba lagi." });
    });
});

app.get("/api/auth/me", requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT users.email, profiles.username
       FROM users JOIN profiles ON profiles.user_id = users.id
      WHERE users.id = $1`,
    [req.userId]
  );
  if (!result.rowCount) return res.status(401).json({ error: "Sesi sudah tidak berlaku." });
  res.json({ user: result.rows[0] });
}));

app.get("/api/profile", requireAuth, asyncRoute(async (req, res) => {
  const row = await fetchOwnedProfile(req.userId);
  if (!row) return res.status(404).json({ error: "Profil tidak ditemukan." });
  const clicksResult = await pool.query(
    "SELECT link_id, clicks FROM link_clicks WHERE profile_user_id = $1",
    [req.userId]
  );
  const clicks = Object.fromEntries(clicksResult.rows.map(item => [item.link_id, Number(item.clicks)]));
  res.json({ profile: profileForClient(row, clicks) });
}));

app.put("/api/profile", requireAuth, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const username = normalizeUsername(body.username);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const bio = typeof body.bio === "string" ? body.bio : "";
  const avatar = typeof body.avatar === "string" ? body.avatar : "";
  const background = body.background;
  const customColor = body.customBackgroundColor;
  const profileTheme = body.profileTheme;
  const pinnedLinkId = typeof body.pinnedLinkId === "string" ? body.pinnedLinkId : "";
  const links = body.links;

  if (!/^[a-z0-9._-]{3,24}$/.test(username)) return res.status(400).json({ error: "Format username tidak valid." });
  if (!name || name.length > 40) return res.status(400).json({ error: "Nama harus diisi dan maksimal 40 karakter." });
  if (bio.length > 160) return res.status(400).json({ error: "Bio maksimal 160 karakter." });
  if (avatar.length > maxAvatarLength || (avatar && !/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(avatar))) {
    return res.status(400).json({ error: "Foto profil tidak valid atau terlalu besar." });
  }
  if (!["dark", "violet", "sunset", "light", "custom"].includes(background)) return res.status(400).json({ error: "Background tidak valid." });
  if (typeof customColor !== "string" || !/^#[0-9a-f]{6}$/i.test(customColor)) return res.status(400).json({ error: "Warna background tidak valid." });
  if (!["orchid", "ocean", "rose", "mint"].includes(profileTheme)) return res.status(400).json({ error: "Tema profil tidak valid." });
  if (!Array.isArray(links) || links.length > 50) return res.status(400).json({ error: "Jumlah link tidak valid (maksimal 50)." });
  const seenIds = new Set();
  for (const link of links) {
    if (!link || typeof link.id !== "string" || link.id.length > 80 || seenIds.has(link.id) ||
        typeof link.title !== "string" || !link.title.trim() || link.title.length > 50 ||
        !validUrl(link.url) || typeof link.active !== "boolean") {
      return res.status(400).json({ error: "Salah satu link tidak valid." });
    }
    seenIds.add(link.id);
  }
  if (pinnedLinkId && !seenIds.has(pinnedLinkId)) return res.status(400).json({ error: "Link pin tidak ditemukan." });

  const result = await pool.query(
    `UPDATE profiles
        SET username = $2, display_name = $3, bio = $4, avatar = $5,
            background = $6, custom_background_color = $7, profile_theme = $8,
            pinned_link_id = $9, links = $10::jsonb, updated_at = NOW()
      WHERE user_id = $1
      RETURNING user_id, username, display_name, bio, avatar, background,
                custom_background_color, profile_theme, pinned_link_id, links, views`,
    [req.userId, username, name, bio, avatar, background, customColor, profileTheme, pinnedLinkId, JSON.stringify(links)]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Profil tidak ditemukan." });
  await pool.query(
    "DELETE FROM link_clicks WHERE profile_user_id = $1 AND NOT (link_id = ANY($2::text[]))",
    [req.userId, links.map(link => link.id)]
  );
  const clicksResult = await pool.query(
    "SELECT link_id, clicks FROM link_clicks WHERE profile_user_id = $1",
    [req.userId]
  );
  const clicks = Object.fromEntries(clicksResult.rows.map(item => [item.link_id, Number(item.clicks)]));
  res.json({ profile: profileForClient(result.rows[0], clicks) });
}));

app.get("/api/profiles/:username", asyncRoute(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const result = await pool.query(
    `UPDATE profiles SET views = views + 1
      WHERE username = $1
      RETURNING user_id, username, display_name, bio, avatar, background,
                custom_background_color, profile_theme, pinned_link_id, links, views`,
    [username]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: "Profil tidak ditemukan." });
  res.json({ profile: profileForClient(row) });
}));

app.post("/api/profiles/:username/links/:linkId/click", asyncRoute(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const result = await pool.query(
    `SELECT user_id, links FROM profiles WHERE username = $1`,
    [username]
  );
  const row = result.rows[0];
  const link = row?.links.find(entry => entry.id === req.params.linkId && entry.active);
  if (!link) return res.status(404).json({ error: "Link tidak ditemukan." });
  await pool.query(
    `INSERT INTO link_clicks (profile_user_id, link_id, clicks)
     VALUES ($1, $2, 1)
     ON CONFLICT (profile_user_id, link_id)
     DO UPDATE SET clicks = link_clicks.clicks + 1`,
    [row.user_id, req.params.linkId]
  );
  res.status(204).end();
}));

const pages = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/login.html", "login.html"],
  ["/register.html", "register.html"],
  ["/dashboard.html", "dashboard.html"],
  ["/profile.html", "profile.html"],
  ["/style.css", "style.css"],
  ["/script.js", "script.js"]
]);

for (const [route, file] of pages) {
  app.get(route, (_req, res) => res.sendFile(path.join(root, file)));
}

app.get("/u/:username", (req, res) => {
  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(req.params.username)) return res.status(404).send("Profil tidak ditemukan.");
  res.sendFile(path.join(root, "profile.html"));
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Endpoint tidak ditemukan." });
  res.status(404).send("Halaman tidak ditemukan.");
});

app.use((error, _req, res, _next) => {
  if (error.type === "entity.too.large") return res.status(413).json({ error: "Data yang dikirim terlalu besar." });
  if (error instanceof SyntaxError && "body" in error) return res.status(400).json({ error: "Format JSON tidak valid." });
  if (error.code === "23505") return res.status(409).json({ error: "Username atau email sudah digunakan." });
  if (error.code === "23514") return res.status(400).json({ error: "Data profil tidak valid." });
  console.error("Request gagal:", error);
  res.status(500).json({ error: "Terjadi kesalahan server. Coba lagi nanti." });
});

async function start() {
  await pool.query("SELECT 1");
  setInterval(() => {
    pool.query("DELETE FROM user_sessions WHERE expires_at <= NOW()")
      .catch(error => console.error("Pembersihan sesi kadaluarsa gagal.", error));
  }, 60 * 60 * 1000).unref();
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`NEXLINK listening on port ${port}`);
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      server.close(() => {
        pool.end().then(() => process.exit(0)).catch(error => {
          console.error("Gagal menutup koneksi database.", error);
          process.exit(1);
        });
      });
    });
  }
}

start().catch(error => {
  console.error("NEXLINK tidak dapat terhubung ke PostgreSQL:", error);
  process.exitCode = 1;
});
