interface Env {
  PAGES_BUCKET: R2Bucket;
  PAGES_META: KVNamespace;
}

// Minimal chain-link favicon — neutral, like a shared doc icon (base64-encoded SVG)
const FAVICON_B64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZD0iTTEzLjUgMTguNWw1LTVtLTIuNS0ybDIuMS0yLjFhMy41NCAzLjU0IDAgMCAxIDUgNUwyMSAxNi41bS0xMCAwbC0yLjEgMi4xYTMuNTQgMy41NCAwIDAgMCA1IDVMMTYgMjEuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+";

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function passwordPage(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${FAVICON_B64}" />
  <title>Private content</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fafafa; color: #333; }
    .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 40px; max-width: 400px; width: 90%; text-align: center; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 14px; color: #666; margin-bottom: 24px; }
    .error { color: #d32f2f; font-size: 13px; margin-bottom: 16px; display: none; }
    input { width: 100%; padding: 10px 14px; font-size: 15px; border: 1px solid #ccc; border-radius: 8px; outline: none; margin-bottom: 16px; }
    input:focus { border-color: #666; }
    button { width: 100%; padding: 10px; font-size: 15px; background: #333; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
    button:hover { background: #555; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Private content</h1>
    <p>Please enter the password shared with you.</p>
    <div class="error" id="err">Incorrect password. Please try again.</div>
    <form onsubmit="go(event)">
      <input type="password" id="pw" placeholder="Password" autofocus />
      <button type="submit">Open</button>
    </form>
  </div>
  <script>
    const params = new URLSearchParams(location.search);
    if (params.get('wrong') === '1') document.getElementById('err').style.display = 'block';
    function go(e) {
      e.preventDefault();
      const pw = document.getElementById('pw').value;
      if (!pw) return;
      const url = new URL(location.href);
      url.searchParams.delete('wrong');
      url.searchParams.set('password', pw);
      location.href = url.toString();
    }
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

export const onRequest: PagesFunction<Env> = async (context) => {
  const slug = context.params.slug as string;
  const url = new URL(context.request.url);

  // Check password protection
  const metaStr = await context.env.PAGES_META.get(`page:${slug}`);
  if (metaStr) {
    const meta = JSON.parse(metaStr);
    if (meta.passwordHash) {
      const providedPassword = url.searchParams.get("password");
      if (!providedPassword) {
        return passwordPage();
      }
      const providedHash = await hashKey(providedPassword);
      if (providedHash !== meta.passwordHash) {
        // Show form with error
        const errorUrl = new URL(url);
        errorUrl.searchParams.delete("password");
        errorUrl.searchParams.set("wrong", "1");
        return new Response(null, {
          status: 302,
          headers: { Location: errorUrl.pathname + errorUrl.search },
        });
      }
    }
  }

  // Serve raw source for AI agents: ?raw or Accept: text/markdown / text/plain
  const wantsRaw = url.searchParams.has("raw") ||
    /text\/(markdown|plain)/.test(context.request.headers.get("Accept") || "");

  if (wantsRaw) {
    const srcObject = await context.env.PAGES_BUCKET.get(`pages/${slug}.src`);
    if (srcObject) {
      const contentType = srcObject.httpMetadata?.contentType || "text/plain";
      return new Response(srcObject.body, {
        headers: {
          "Content-Type": `${contentType}; charset=utf-8`,
          "Cache-Control": "public, max-age=300",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }
    // No source stored — fall through to HTML
  }

  const object = await context.env.PAGES_BUCKET.get(`pages/${slug}.html`);
  if (!object) {
    return new Response("Page not found", { status: 404 });
  }

  let html = await object.text();
  const trimmed = html.trimStart();
  const looksLikeHtml = trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<head") || trimmed.startsWith("<body");

  if (!looksLikeHtml) {
    // Content is raw text/markdown stored without HTML wrapper — render it client-side
    const escaped = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const title = metaStr ? JSON.parse(metaStr).title || slug : slug;
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${FAVICON_B64}" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6; color: #1a1a1a; background: #fff;
      max-width: 780px; margin: 0 auto; padding: 40px 24px;
    }
    h1 { font-size: 2em; margin: 1em 0 0.5em; font-weight: 700; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; margin: 1.2em 0 0.4em; font-weight: 600; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
    h3 { font-size: 1.25em; margin: 1em 0 0.3em; font-weight: 600; }
    h4, h5, h6 { font-size: 1em; margin: 1em 0 0.2em; font-weight: 600; }
    p { margin: 0 0 1em; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    strong { font-weight: 600; }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      background: #f4f4f4; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em;
    }
    pre { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 16px; overflow-x: auto; margin: 0 0 1em; }
    pre code { background: none; padding: 0; border-radius: 0; font-size: 0.85em; }
    blockquote { border-left: 4px solid #dfe2e5; padding: 0 1em; color: #555; margin: 0 0 1em; }
    ul, ol { padding-left: 2em; margin: 0 0 1em; }
    li { margin: 0.25em 0; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 1em; }
    th, td { border: 1px solid #dfe2e5; padding: 8px 12px; text-align: left; }
    th { background: #f6f8fa; font-weight: 600; }
    tr:nth-child(even) { background: #fafbfc; }
    hr { border: none; border-top: 1px solid #e5e5e5; margin: 2em 0; }
    img { max-width: 100%; height: auto; }
    #src { display: none; }
  </style>
</head>
<body>
  <article id="out"></article>
  <pre id="src">${escaped}</pre>
  <script src="https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js"><\/script>
  <script>
    var src = document.getElementById('src').textContent;
    document.getElementById('out').innerHTML = typeof marked !== 'undefined' && marked.parse
      ? marked.parse(src)
      : '<pre>' + src.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</pre>';
  </script>
</body>
</html>`;
  } else {
    // Inject noindex + favicon into <head>
    if (html.includes("<head>")) {
      html = html.replace(
        "<head>",
        `<head>\n  <meta name="robots" content="noindex, nofollow" />\n  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${FAVICON_B64}" />`
      );
    }
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
