// Valgfri PIN-beskyttelse. Settes miljøvariabelen APP_PIN i Vercel, må
// nettleseren sende samme PIN i headeren x-app-pin. Uten APP_PIN er siden åpen.
export function checkPin(req, res) {
  const pin = process.env.APP_PIN;
  if (!pin) return true;
  if (req.headers["x-app-pin"] === pin) return true;
  res.status(401).json({ error: "Feil eller manglende PIN" });
  return false;
}
