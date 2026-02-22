interface Env {
  PAGES_BUCKET: R2Bucket;
  PAGES_META: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const slug = context.params.slug as string;

  const object = await context.env.PAGES_BUCKET.get(`pages/${slug}.html`);
  if (!object) {
    return new Response("Page not found", { status: 404 });
  }

  const html = await object.text();
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
