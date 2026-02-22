interface Env {
  PAGES_BUCKET: R2Bucket;
  PAGES_META: KVNamespace;
}

// Minimal chain-link favicon — neutral, like a shared doc icon
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M13.5 18.5l5-5m-2.5-2l2.1-2.1a3.54 3.54 0 0 1 5 5L21 16.5m-10 0l-2.1 2.1a3.54 3.54 0 0 0 5 5L16 21.5" fill="none" stroke="%23999" stroke-width="2.5" stroke-linecap="round"/></svg>`;

export const onRequest: PagesFunction<Env> = async (context) => {
  const slug = context.params.slug as string;

  const object = await context.env.PAGES_BUCKET.get(`pages/${slug}.html`);
  if (!object) {
    return new Response("Page not found", { status: 404 });
  }

  let html = await object.text();

  // Inject noindex + favicon into <head>
  if (html.includes("<head>")) {
    html = html.replace(
      "<head>",
      `<head>\n  <meta name="robots" content="noindex, nofollow" />\n  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${FAVICON_SVG}" />`
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
