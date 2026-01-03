# Vault Permalink Kit

Attach stable IDs to notes and reopen them via vault-aware protocol URLs (with optional public redirectors).

## Development

1. Install dependencies: `npm install`
2. Start watch mode: `npm run dev`
3. Production build: `npm run build`
4. Copy `manifest.json`, `main.js`, and `styles.css` into your vault's `.obsidian/plugins/vault-permalink-kit/` folder for manual testing.

## Usage

- Right-click a markdown file in the file explorer and choose **Copy Persistent URL**.
- The plugin stores the UUID inside the note's frontmatter (creates it if missing) under the `permalink` key (matching Obsidian Publish) and copies `obsidian://open-document?vault=<name>&id=<uuid>` to the clipboard.
- Opening that URL triggers the plugin's protocol handler, shows a compact spinner modal, and scans the vault for the matching note. If the note is found it opens automatically; otherwise a notice explains that nothing matched.
- Configure **Frontmatter key** if you want to store the UUID elsewhere. Switching keys after generating links requires re-copying URLs because older notes keep the previous key.
- Configure **Public share base URL** inside the plugin settings if you prefer HTTP links. When this value is set the copied link points to that base instead of the `obsidian://` protocol.

Obsidian Publish already treats `permalink` as the canonical slug for a document, so this plugin defaults to the same field for a more native feel. Changing the field name is supported but proceed carefully.

## Redirector service

The public share URL must accept `vault` and `id` query parameters, then redirect to the Obsidian protocol. The service can be extremely small; for example, an Express server:

```ts
import express from "express";

const app = express();
app.get("/", (req, res) => {
  const vault = encodeURIComponent(req.query.vault as string);
  const id = encodeURIComponent(req.query.id as string);
  res.redirect(302, `obsidian://open-document?vault=${vault}&id=${id}`);
});

app.listen(3000);
```

Or deploy a Cloudflare Worker:

```ts
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const vault = encodeURIComponent(url.searchParams.get("vault") ?? "");
    const id = encodeURIComponent(url.searchParams.get("id") ?? "");
    return Response.redirect(
      `obsidian://open-document?vault=${vault}&id=${id}`,
      302
    );
  },
};
```

You can host the same logic in Cloudflare Workers, Netlify Functions, or any CDN edge worker. As long as the handler issues a redirect to `obsidian://open-document` using the received `vault` and `id` values, the plugin-generated links will behave identically to the built-in URLs while remaining public-share friendly.
