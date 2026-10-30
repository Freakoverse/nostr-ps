# Deploying

The app is a static single-page app that reads from Nostr relays. Deploying
is "build, serve `dist/`, point a domain at it". Two targets are covered:
GitHub Pages and a Linux server behind nginx.

## Make it yours

### Operator key

```ts
// src/lib/constants.ts
export const ADMIN_PUBKEY = '…'
export const ADMIN_NPUB = 'npub1…'
```

This pubkey signs the announcement banner (a NIP-78 event with d-tag
`site-announcement`) and its follow graph is the anonymous default viewpoint
of the lens (docs/CLIENT-LENS.md). Replace it with your own before deploying.
Nothing breaks if you don't; someone else just gets to configure your site.

### Relays and media servers

Defaults live in `src/lib/relays.json` and `DEFAULT_BLOSSOMS` in
`src/lib/constants.ts`. Logged-in users' own NIP-65 and kind-10063 lists are
merged in at runtime; these are what anonymous visitors use.

### Assets

Replace `public/favicon.png`. The header and login card show the text
"NIP-PS" with no image.

## Guide A: GitHub Pages

1. In the repository settings, under Pages, set the source to **GitHub
   Actions**. Do not pick "Deploy from a branch": that serves the source
   `index.html`, which references `/src/main.tsx` and 404s.
2. The workflow in `.github/workflows/pages.yml` builds on every push to
   `main` and deploys `dist/`. It sets `VITE_BASE=/<repo>/`, because a
   project site lives under `https://<user>.github.io/<repo>/`. The Vite
   `base` and the router's `basename` both read that value.
3. The build script copies `dist/index.html` to `dist/404.html`. Pages
   serves that for any unknown path, so a deep link such as
   `/<repo>/draft/naddr1…` loads the app, and the router reads the path.
4. For a custom domain at the root, add `public/CNAME` with the domain and
   change the workflow's `VITE_BASE` to `/`.

## Guide B: Linux server (nginx)

1. Build with `npm run build`.
2. Copy `dist/` to the web root.
3. Route every path to `index.html`:

```nginx
server {
  listen 443 ssl http2;
  server_name example.com;
  root /var/www/nip-ps/dist;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
```

4. On a server the GitHub Pages redirect shim in `index.html` is dead weight.
   It is harmless, but you can delete the `<script>` block marked "GitHub
   Pages SPA redirect handler".

## Serving from a subpath

Set `base` in `vite.config.ts` (e.g. `base: '/nip-ps/'`) and use
`<BrowserRouter basename="/nip-ps">` in `src/main.tsx`.
