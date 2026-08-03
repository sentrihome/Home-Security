/**
 * Unit tests for auth module (token store and middleware).
 * Run: node --test tests/auth.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createToken,
  lookupToken,
  invalidateToken,
  requireAuth,
  requireAuthOrQueryToken,
  optionalAuth,
} from "../auth.js";

describe("auth module", () => {
  describe("createToken", () => {
    it("returns a non-empty string", () => {
      const token = createToken("user@example.com");
      assert.strictEqual(typeof token, "string");
      assert(token.length > 0);
    });

    it("produces different tokens for different calls", () => {
      const t1 = createToken("a@b.com");
      const t2 = createToken("a@b.com");
      assert.notStrictEqual(t1, t2);
    });
  });

  describe("lookupToken", () => {
    it("returns { email } for valid token", () => {
      const token = createToken("  Test@Example.COM  ");
      const user = lookupToken(token);
      assert(user);
      assert.strictEqual(user.email, "test@example.com");
    });

    it("returns null for unknown token", () => {
      assert.strictEqual(lookupToken("unknown-token"), null);
    });

    it("returns null for null/empty/invalid input", () => {
      assert.strictEqual(lookupToken(null), null);
      assert.strictEqual(lookupToken(""), null);
      assert.strictEqual(lookupToken(123), null);
    });

    it("trims token when looking up", () => {
      const token = createToken("u@u.com");
      assert(lookupToken("  " + token + "  "));
    });
  });

  describe("invalidateToken", () => {
    it("removes token so lookup returns null", () => {
      const token = createToken("gone@example.com");
      assert(lookupToken(token));
      invalidateToken(token);
      assert.strictEqual(lookupToken(token), null);
    });

    it("handles null/empty without throwing", () => {
      invalidateToken(null);
      invalidateToken("");
    });
  });

  describe("requireAuth middleware", () => {
    it("calls next() and sets req.user when valid Bearer token", () => {
      const token = createToken("auth@test.com");
      const req = { headers: { authorization: "Bearer " + token } };
      const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
      let nextCalled = false;
      requireAuth(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, null);
      assert.strictEqual(req.user.email, "auth@test.com");
      assert.strictEqual(nextCalled, true);
    });

    it("returns 401 when Authorization header missing", () => {
      const req = { headers: {} };
      const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
      let nextCalled = false;
      requireAuth(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(nextCalled, false);
    });

    it("returns 401 when token is invalid", () => {
      const req = { headers: { authorization: "Bearer invalid-token" } };
      const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
      let nextCalled = false;
      requireAuth(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(nextCalled, false);
    });
  });

  describe("requireAuthOrQueryToken middleware", () => {
    it("accepts Bearer header and sets req.user", () => {
      const token = createToken("bearer@test.com");
      const req = { headers: { authorization: "Bearer " + token }, query: {} };
      const res = { statusCode: null, status(c) { this.statusCode = c; return this; }, json() { return this; } };
      let nextCalled = false;
      requireAuthOrQueryToken(req, res, () => { nextCalled = true; });
      assert.strictEqual(req.user.email, "bearer@test.com");
      assert.strictEqual(nextCalled, true);
    });

    it("accepts query.token and sets req.user", () => {
      const token = createToken("query@test.com");
      const req = { headers: {}, query: { token } };
      const res = { statusCode: null, status(c) { this.statusCode = c; return this; }, json() { return this; } };
      let nextCalled = false;
      requireAuthOrQueryToken(req, res, () => { nextCalled = true; });
      assert.strictEqual(req.user.email, "query@test.com");
      assert.strictEqual(nextCalled, true);
    });

    it("returns 401 when no valid token in header or query", () => {
      const req = { headers: {}, query: {} };
      const res = { statusCode: null, status(c) { this.statusCode = c; return this; }, json() { return this; } };
      let nextCalled = false;
      requireAuthOrQueryToken(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(nextCalled, false);
    });
  });

  describe("optionalAuth middleware", () => {
    it("sets req.user when token present", () => {
      const token = createToken("opt@test.com");
      const req = { headers: { authorization: "Bearer " + token }, query: {} };
      const res = {};
      let nextCalled = false;
      optionalAuth(req, res, () => { nextCalled = true; });
      assert.strictEqual(req.user.email, "opt@test.com");
      assert.strictEqual(nextCalled, true);
    });

    it("sets req.user to null when no token and still calls next", () => {
      const req = { headers: {}, query: {} };
      const res = {};
      let nextCalled = false;
      optionalAuth(req, res, () => { nextCalled = true; });
      assert.strictEqual(req.user, null);
      assert.strictEqual(nextCalled, true);
    });
  });
});
