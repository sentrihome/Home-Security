/**
 * Auth module: Bearer token store and requireAuth middleware.
 * Kept separate so other features can reuse or replace (e.g. Redis/DB store).
 */

import crypto from "crypto";

/** In-memory token store: tokenId -> { email, createdAt }. Replace with Redis/DB for multi-instance. */
const tokenStore = new Map();

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Create a new auth token for the given email. Returns the token string.
 */
export function createToken(email) {
  const token = crypto.randomBytes(32).toString("hex");
  tokenStore.set(token, {
    email: String(email).toLowerCase().trim(),
    createdAt: Date.now(),
  });
  return token;
}

/**
 * Look up user by token. Returns { email } or null.
 */
export function lookupToken(token) {
  if (!token || typeof token !== "string") return null;
  const entry = tokenStore.get(token.trim());
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    tokenStore.delete(token.trim());
    return null;
  }
  return { email: entry.email };
}

/**
 * Invalidate a token (e.g. on logout).
 */
export function invalidateToken(token) {
  if (token && typeof token === "string") tokenStore.delete(token.trim());
}

/**
 * Express middleware: require Authorization: Bearer <token>.
 * Sets req.user = { email }. If missing/invalid, sends 401.
 */
export function requireAuth(req, res, next) {
  const raw = req.headers.authorization;
  const token = raw && raw.startsWith("Bearer ") ? raw.slice(7).trim() : null;
  const user = lookupToken(token);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized", message: "Valid token required" });
  }
  req.user = user;
  next();
}

/**
 * Optional auth: set req.user if token present, don't reject if missing.
 * Useful for endpoints that behave differently when logged in.
 */
function getTokenFromRequest(req) {
  const raw = req.headers.authorization;
  if (raw && raw.startsWith("Bearer ")) return raw.slice(7).trim();
  const q = req.query?.token;
  return (Array.isArray(q) ? q[0] : q)?.trim?.() ?? null;
}

export function optionalAuth(req, res, next) {
  req.user = lookupToken(getTokenFromRequest(req)) || null;
  next();
}

/**
 * Require auth via Authorization: Bearer <token> OR query param ?token= (e.g. for opening clip URL in external player).
 */
export function requireAuthOrQueryToken(req, res, next) {
  const token = getTokenFromRequest(req);
  const user = lookupToken(token);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized", message: "Valid token required" });
  }
  req.user = user;
  next();
}
