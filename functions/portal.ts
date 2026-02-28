interface Env {
  PAGES_BUCKET: R2Bucket;
  PAGES_META: KVNamespace;
}

const FAVICON_B64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZD0iTTEzLjUgMTguNWw1LTVtLTIuNS0ybDIuMS0yLjFhMy41NCAzLjU0IDAgMCAxIDUgNUwyMSAxNi41bS0xMCAwbC0yLjEgMi4xYTMuNTQgMy41NCAwIDAgMCA1IDVMMTYgMjEuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+";

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function errorPage(title: string, message: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${FAVICON_B64}" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #faf9f6; color: #1c1917; }
    .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 40px; max-width: 420px; width: 90%; text-align: center; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 14px; color: #78716c; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: title === "Missing API key" ? 401 : 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

interface PageMeta {
  slug: string;
  title: string;
  created: string;
  owner: string;
  passwordHash?: string;
  password?: string;
}

function portalPage(pages: PageMeta[]): Response {
  const rows = pages
    .sort((a, b) => (b.created || "").localeCompare(a.created || ""))
    .map((p) => {
      const date = p.created ? new Date(p.created).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
      const title = p.title || p.slug;
      const href = p.password ? `/p/${p.slug}?password=` + encodeURIComponent(p.password) : `/p/${p.slug}`;
      return `<a class="card" href="${href}" data-search="${(title + " " + p.slug).toLowerCase()}">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-meta"><code>${escapeHtml(p.slug)}</code><span>${date}</span></div>
    </a>`;
    })
    .join("\n    ");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${FAVICON_B64}" />
  <title>Portal — chillai.space</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #faf9f6; color: #1c1917; min-height: 100vh; }
    .container { max-width: 720px; margin: 0 auto; padding: 40px 20px; }
    .header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 24px; }
    h1 { font-size: 24px; font-weight: 700; }
    .count { font-size: 14px; color: #78716c; }
    .search-wrap { margin-bottom: 24px; }
    .search-wrap input { width: 100%; padding: 10px 14px; font-size: 15px; border: 1px solid #d6d3d1; border-radius: 8px; background: #fff; outline: none; color: #1c1917; }
    .search-wrap input:focus { border-color: #16a34a; box-shadow: 0 0 0 2px rgba(22,163,74,0.15); }
    .search-wrap input::placeholder { color: #a8a29e; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .card { display: block; background: #fff; border: 1px solid #e7e5e4; border-radius: 10px; padding: 14px 18px; text-decoration: none; color: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
    .card:hover { border-color: #16a34a; box-shadow: 0 1px 4px rgba(22,163,74,0.1); }
    .card-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; color: #1c1917; }
    .card-meta { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #78716c; }
    .card-meta code { font-family: "SF Mono", SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: #f5f5f4; padding: 2px 6px; border-radius: 4px; }
    .empty { text-align: center; color: #78716c; padding: 40px 0; font-size: 15px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Portal</h1>
      <span class="count">${pages.length} pages</span>
    </div>
    <div class="search-wrap">
      <input type="text" id="q" placeholder="Search pages..." autofocus />
    </div>
    <div class="list" id="list">
    ${rows}
    </div>
    <div class="empty hidden" id="empty">No pages match your search.</div>
  </div>
  <script>
    const q = document.getElementById("q");
    const cards = document.querySelectorAll(".card");
    const empty = document.getElementById("empty");
    q.addEventListener("input", () => {
      const term = q.value.toLowerCase().trim();
      let visible = 0;
      cards.forEach(c => {
        const match = !term || c.dataset.search.includes(term);
        c.classList.toggle("hidden", !match);
        if (match) visible++;
      });
      empty.classList.toggle("hidden", visible > 0);
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const key = url.searchParams.get("key");
  if (!key) {
    return errorPage("Missing API key", "Append <code>?key=your_api_key</code> to the URL, or use <code>npx instant-publish portal</code> to open this page automatically.");
  }

  const ownerHash = await hashKey(key);
  const stored = await env.PAGES_META.get(`apikey:${ownerHash}`);
  if (!stored) {
    return errorPage("Invalid API key", "The provided API key is not recognized. Check your key and try again.");
  }

  const list = await env.PAGES_META.list({ prefix: "page:" });
  const pages: PageMeta[] = [];

  for (const k of list.keys) {
    const value = await env.PAGES_META.get(k.name);
    if (value) {
      const meta = JSON.parse(value) as PageMeta;
      if (meta.owner === ownerHash) {
        pages.push(meta);
      }
    }
  }

  return portalPage(pages);
};
