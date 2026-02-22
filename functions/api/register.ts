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
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json<{ api_key: string }>();

  if (!body.api_key || body.api_key.length < 8) {
    return Response.json(
      { error: "api_key is required (min 8 characters)" },
      { status: 400 }
    );
  }

  const hash = await hashKey(body.api_key);

  const existing = await env.PAGES_META.get(`apikey:${hash}`);
  if (existing) {
    return Response.json(
      { ok: true, message: "Key already registered" },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  await env.PAGES_META.put(
    `apikey:${hash}`,
    JSON.stringify({ created: new Date().toISOString() })
  );

  return Response.json(
    { ok: true, message: "API key registered" },
    {
      status: 201,
      headers: { "Access-Control-Allow-Origin": "*" },
    }
  );
};
