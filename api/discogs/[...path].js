const DISCOGS_API_ROOT = "https://api.discogs.com";

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.status(204).end();
    return;
  }

  const pathParts = Array.isArray(request.query.path)
    ? request.query.path
    : [request.query.path].filter(Boolean);
  const path = pathParts.map(encodeURIComponent).join("/");
  const incomingUrl = new URL(request.url, `https://${request.headers.host}`);
  const targetUrl = `${DISCOGS_API_ROOT}/${path}${incomingUrl.search}`;

  try {
    const discogsResponse = await fetch(targetUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "VinylDatabase/0.1 +https://vinyl-database-zeta.vercel.app",
      },
    });
    const body = await discogsResponse.text();
    const contentType = discogsResponse.headers.get("content-type") || "application/json";

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    response.setHeader("Content-Type", contentType);
    response.status(discogsResponse.status).send(body);
  } catch {
    response.status(502).json({ error: "Discogs lookup failed" });
  }
}
