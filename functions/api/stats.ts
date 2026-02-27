interface Env {
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

  // Auth required
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

  // Collect all API keys
  const apiKeys: { hash: string; created: string }[] = [];
  let cursor: string | undefined;
  do {
    const list = await env.PAGES_META.list({
      prefix: "apikey:",
      cursor,
    });
    for (const k of list.keys) {
      const val = await env.PAGES_META.get(k.name);
      const meta = val ? JSON.parse(val) : {};
      apiKeys.push({
        hash: k.name.replace("apikey:", "").slice(0, 8),
        created: meta.created || "unknown",
      });
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  // Collect all pages
  const owners: Record<string, { pages: number; slugs: string[] }> = {};
  let pageCursor: string | undefined;
  let totalPages = 0;
  do {
    const list = await env.PAGES_META.list({
      prefix: "page:",
      cursor: pageCursor,
    });
    for (const k of list.keys) {
      const val = await env.PAGES_META.get(k.name);
      if (val) {
        const meta = JSON.parse(val);
        totalPages++;
        const ownerShort = (meta.owner || "unknown").slice(0, 8);
        if (!owners[ownerShort]) {
          owners[ownerShort] = { pages: 0, slugs: [] };
        }
        owners[ownerShort].pages++;
        if (owners[ownerShort].slugs.length < 5) {
          owners[ownerShort].slugs.push(meta.slug);
        }
      }
    }
    pageCursor = list.list_complete ? undefined : list.cursor;
  } while (pageCursor);

  return Response.json(
    {
      apiKeys: { total: apiKeys.length, keys: apiKeys },
      pages: { total: totalPages },
      owners: Object.entries(owners).map(([hash, data]) => ({
        hash,
        pages: data.pages,
        sample: data.slugs,
      })),
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
};
