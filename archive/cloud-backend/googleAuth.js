import fs from "fs";
import path from "path";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

/** Directory for per-user token files. Each file: tokens/<safe-email>.json */
const TOKENS_DIR = "tokens";
const LEGACY_TOKEN_PATH = "token.json";

function ensureTokensDir() {
  if (!fs.existsSync(TOKENS_DIR)) fs.mkdirSync(TOKENS_DIR, { recursive: true });
}

/** Safe filename from email (one file per user). */
function tokenPathForEmail(email) {
  if (!email || typeof email !== "string") throw new Error("email required");
  const safe = String(email).toLowerCase().trim().replace(/[^a-z0-9._-]/g, "_");
  ensureTokensDir();
  return path.join(TOKENS_DIR, `${safe}.json`);
}

export function createOAuthClient() {
  const creds = JSON.parse(fs.readFileSync("credentials.json", "utf8"));
  const config = creds.web || creds.installed;
  if (!config) throw new Error("Invalid OAuth credentials file");
  const { client_id, client_secret, redirect_uris } = config;
  if (!redirect_uris || redirect_uris.length === 0) throw new Error("OAuth config missing redirect_uris");
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

export function getAuthUrl(oauth2Client) {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

/**
 * Exchange code for tokens. Does NOT save to disk; returns tokens so caller can save per user.
 */
export async function handleOAuthCallback(oauth2Client, code) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

/**
 * Save Google tokens for a user (call after OAuth callback when you have the email).
 */
export function saveTokensForUser(email, tokens) {
  const filePath = tokenPathForEmail(email);
  fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2));
}

/**
 * Get an OAuth2 client authorized for the given user's Drive. Use for per-request Drive access.
 */
export function getAuthorizedClientForUser(email) {
  const filePath = tokenPathForEmail(email);
  if (!fs.existsSync(filePath)) {
    throw new Error(`User not authenticated with Google: ${email}`);
  }
  const oauth2Client = createOAuthClient();
  const tokens = JSON.parse(fs.readFileSync(filePath, "utf8"));
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

/** Get the signed-in user's email from an OAuth2 client (with credentials set). */
export async function getDriveUserEmail(oauth2Client) {
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  return data?.email || null;
}

/**
 * Legacy: single global token (token.json). Prefer getAuthorizedClientForUser(email) for multi-user.
 */
export function getAuthorizedClient() {
  if (fs.existsSync(LEGACY_TOKEN_PATH)) {
    const oauth2Client = createOAuthClient();
    const tokens = JSON.parse(fs.readFileSync(LEGACY_TOKEN_PATH, "utf8"));
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
  }
  throw new Error("User not authenticated with Google");
}

/**
 * Remove stored Google tokens for one user (e.g. "sign out from this device").
 */
export function logoutUserGoogle(email) {
  if (!email) return;
  const filePath = tokenPathForEmail(email);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

/** Legacy: remove global token.json. */
export function logout() {
  if (fs.existsSync(LEGACY_TOKEN_PATH)) fs.unlinkSync(LEGACY_TOKEN_PATH);
}
