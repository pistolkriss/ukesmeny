// Lagring i Upstash Redis (koble til via Vercel → Storage → Upstash for Redis).
// Bruker Upstash sitt REST-API direkte, så prosjektet trenger ingen npm-pakker.
//
// GET  /api/data                 -> { settings, menus: { "2026-W44": {...}, ... } }
// PUT  /api/data  {settings}     -> lagrer innstillinger
// PUT  /api/data  {week, menu}   -> lagrer meny for en uke
// DELETE /api/data?week=2026-W44 -> sletter lagret meny
import { checkPin } from "./_auth.js";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PREFIX = "ukesmeny:";
const WEEK_RE = /^\d{4}-W\d{2}$/;

async function redis(...command) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!checkPin(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) {
    return res.status(503).json({ error: "Lagring er ikke satt opp. Koble Upstash Redis til prosjektet i Vercel." });
  }
  try {
    if (req.method === "GET") {
      const [settings, flat] = await Promise.all([
        redis("GET", PREFIX + "settings"),
        redis("HGETALL", PREFIX + "menus"),
      ]);
      const menus = {};
      for (let i = 0; i + 1 < (flat || []).length; i += 2) {
        try { menus[flat[i]] = JSON.parse(flat[i + 1]); } catch { /* hopp over ødelagt rad */ }
      }
      return res.status(200).json({ settings: settings ? JSON.parse(settings) : null, menus });
    }

    if (req.method === "PUT") {
      const body = readBody(req);
      if (body.settings) {
        await redis("SET", PREFIX + "settings", JSON.stringify(body.settings));
        return res.status(200).json({ ok: true });
      }
      if (WEEK_RE.test(body.week || "") && body.menu) {
        await redis("HSET", PREFIX + "menus", body.week, JSON.stringify(body.menu));
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "Ugyldig forespørsel" });
    }

    if (req.method === "DELETE") {
      const week = String(req.query.week || "");
      if (!WEEK_RE.test(week)) return res.status(400).json({ error: "Ugyldig uke" });
      await redis("HDEL", PREFIX + "menus", week);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: "Metoden støttes ikke" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
