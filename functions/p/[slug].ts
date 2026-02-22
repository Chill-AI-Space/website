interface Env {
  PAGES_BUCKET: R2Bucket;
  PAGES_META: KVNamespace;
}

// Minimal chain-link favicon — neutral, like a shared doc icon (base64-encoded SVG)
const FAVICON_B64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZD0iTTEzLjUgMTguNWw1LTVtLTIuNS0ybDIuMS0yLjFhMy41NCAzLjU0IDAgMCAxIDUgNUwyMSAxNi41bS0xMCAwbC0yLjEgMi4xYTMuNTQgMy41NCAwIDAgMCA1IDVMMTYgMjEuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+";

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
      `<head>\n  <meta name="robots" content="noindex, nofollow" />\n  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${FAVICON_B64}" />`
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
