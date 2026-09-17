import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createLoginRateLimiter, type LoginRateLimiter } from "./loginRateLimit.js";

const COOKIE_NAME = "pv_studio_auth";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Protection par mot de passe partagé devant toute l'appli : la fonctionnalité
 * native "Password Protection" de Vercel est réservée au plan Pro (on reste
 * sur Hobby), donc implémentée ici. Un cookie signé (HMAC dérivé du mot de
 * passe, jamais le mot de passe lui-même) remplace un vrai système de
 * sessions — suffisant pour un secret partagé, pas pour des comptes
 * individuels (hors périmètre).
 */

function signingKey(password: string): Buffer {
  return createHash("sha256").update(password).digest();
}

function signToken(expiresAt: number, key: Buffer): string {
  const mac = createHmac("sha256", key).update(String(expiresAt)).digest("base64url");
  return `${expiresAt}.${mac}`;
}

function isValidToken(token: string | undefined, key: Buffer): boolean {
  if (!token) {
    return false;
  }
  const [expiresAtRaw, mac] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !mac) {
    return false;
  }
  const expectedMac = signToken(expiresAt, key).split(".")[1];
  const actual = Buffer.from(mac);
  const expected = Buffer.from(expectedMac);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function passwordsMatch(submitted: string, expected: string): boolean {
  const a = createHash("sha256").update(submitted).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    try {
      cookies[part.slice(0, separatorIndex).trim()] = decodeURIComponent(
        part.slice(separatorIndex + 1).trim(),
      );
    } catch {
      // A malformed unrelated cookie must not prevent authentication.
    }
  }
  return cookies;
}

function loginPageHtml(error?: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PV Studio — Connexion</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; background: #0f172a; margin: 0; }
  form { background: #fff; padding: 2rem; border-radius: 12px; width: 100%; max-width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
  h1 { font-size: 1.1rem; margin: 0 0 1rem; }
  input { width: 100%; box-sizing: border-box; padding: .6rem .75rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem; }
  button { width: 100%; margin-top: .75rem; padding: .6rem .75rem; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-size: 1rem; cursor: pointer; }
  .error { color: #b91c1c; font-size: .875rem; margin: 0 0 .75rem; }
</style>
</head>
<body>
<form method="POST" action="/login">
  <h1>PV Studio</h1>
  ${error ? `<p class="error">${error}</p>` : ""}
  <input type="password" name="password" placeholder="Mot de passe" autofocus required />
  <button type="submit">Se connecter</button>
</form>
</body>
</html>`;
}

/** Middleware qui gère `/login` (GET affiche le formulaire, POST le traite) et bloque tout le reste sans cookie valide. */
export function createAuthGate(password: string, limiter?: LoginRateLimiter) {
  if (!password) {
    throw new Error(
      "APP_PASSWORD manquant : requis pour protéger l'accès à l'appli (données clients).",
    );
  }
  const key = signingKey(password);
  const secureCookie = process.env.VERCEL === "1";
  const consumeAttempt = limiter ?? createLoginRateLimiter();

  return async function authGate(req: Request, res: Response, next: NextFunction) {
    if (req.path === "/login") {
      if (req.method === "GET") {
        res.type("html").send(loginPageHtml());
        return;
      }
      if (req.method === "POST") {
        let retryAfter: number;
        try {
          retryAfter = await consumeAttempt(req);
        } catch {
          res.status(503).type("html").send(loginPageHtml("Connexion temporairement indisponible. Réessayez plus tard."));
          return;
        }
        if (retryAfter > 0) {
          res.set("Retry-After", String(retryAfter));
          res.status(429).type("html").send(loginPageHtml("Trop de tentatives. Réessayez dans quelques minutes."));
          return;
        }
        const submitted = typeof req.body?.password === "string" ? req.body.password : "";
        if (!passwordsMatch(submitted, password)) {
          res.status(401).type("html").send(loginPageHtml("Mot de passe incorrect."));
          return;
        }
        const expiresAt = Date.now() + SESSION_TTL_MS;
        res.cookie(COOKIE_NAME, signToken(expiresAt, key), {
          httpOnly: true,
          secure: secureCookie,
          sameSite: "lax",
          maxAge: SESSION_TTL_MS,
        });
        res.redirect(303, "/");
        return;
      }
    }

    const cookies = parseCookies(req.headers.cookie);
    if (isValidToken(cookies[COOKIE_NAME], key)) {
      next();
      return;
    }

    if (req.method === "GET") {
      res.status(401).type("html").send(loginPageHtml());
      return;
    }
    res.status(401).json({ error: "Authentification requise." });
  };
}
