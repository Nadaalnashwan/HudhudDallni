// Proxies Google Places photos so the server API key never reaches the browser.
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name");
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!name || !key || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return new Response("bad request", { status: 400 });
  const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=480&key=${key}`);
  if (!res.ok) return new Response("not found", { status: 404 });
  return new Response(res.body, {
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "public, max-age=86400" },
  });
}
