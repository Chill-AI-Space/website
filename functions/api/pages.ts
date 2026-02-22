interface Env {
  PAGES_BUCKET: R2Bucket;
  PAGES_META: KVNamespace;
}

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = auth.slice(7);
  const ownerHash = await hashKey(key);
  const stored = await env.PAGES_META.get(`apikey:${ownerHash}`);
  if (!stored) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const list = await env.PAGES_META.list({ prefix: "page:" });
  const pages = [];

  for (const key of list.keys) {
    const value = await env.PAGES_META.get(key.name);
    if (value) {
      const meta = JSON.parse(value);
      if (meta.owner === ownerHash) {
        pages.push(meta);
      }
    }
  }

  return Response.json(
    { pages },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
};
