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

  let html = await object.text();

  // Inject noindex so search engines don't index user-published pages
  if (html.includes("<head>")) {
    html = html.replace(
      "<head>",
      '<head>\n  <meta name="robots" content="noindex, nofollow" />'
    );
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
