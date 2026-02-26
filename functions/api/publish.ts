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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function generateSlug(): string {
  return crypto.randomUUID().slice(0, 8);
}

async function authenticate(
  request: Request,
  kv: KVNamespace
): Promise<string | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const key = auth.slice(7);
  const hash = await hashKey(key);
  const stored = await kv.get(`apikey:${hash}`);
  return stored ? hash : null;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const ownerHash = await authenticate(request, env.PAGES_META);
  if (!ownerHash) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "POST") {
    const body = await request.json<{
      slug?: string;
      content: string;
      title?: string;
      password?: string;
    }>();

    if (!body.content) {
      return Response.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    const slug =
      body.slug || (body.title ? slugify(body.title) : generateSlug());

    await env.PAGES_BUCKET.put(`pages/${slug}.html`, body.content, {
      httpMetadata: { contentType: "text/html" },
    });

    const metadata: Record<string, string> = {
      slug,
      title: body.title || slug,
      created: new Date().toISOString(),
      owner: ownerHash,
    };

    if (body.password) {
      metadata.passwordHash = await hashKey(body.password);
    }

    await env.PAGES_META.put(`page:${slug}`, JSON.stringify(metadata));

    return Response.json(
      {
        url: `https://chillai.space/p/${slug}`,
        slug,
        created: metadata.created,
      },
      {
        status: 201,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  if (request.method === "DELETE") {
    const body = await request.json<{ slug: string }>();
    if (!body.slug) {
      return Response.json({ error: "slug is required" }, { status: 400 });
    }

    const meta = await env.PAGES_META.get(`page:${body.slug}`);
    if (!meta) {
      return Response.json({ error: "Page not found" }, { status: 404 });
    }

    const parsed = JSON.parse(meta);
    if (parsed.owner !== ownerHash) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await env.PAGES_BUCKET.delete(`pages/${body.slug}.html`);
    await env.PAGES_META.delete(`page:${body.slug}`);

    return Response.json(
      { deleted: body.slug },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
};
