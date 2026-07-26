// Shared CORS helper. The store is called from the browser (runthe.gg and, in
// dev, localhost), sending the user's Supabase access token as a Bearer header —
// no cookies — so reflecting the request Origin is safe.
const ALLOWED = [
  "https://runthe.gg",
  "https://www.runthe.gg",
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow =
    ALLOWED.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)
      ? origin
      : "https://runthe.gg";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
