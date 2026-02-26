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
