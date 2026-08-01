# Deploy

- **Host:** Cloudflare Pages, connected to this GitHub repo (`q2dt25dfdf-pixel/ThreeFold-Website`).
- **Previews:** every branch gets its own preview deployment on push (e.g. `feat/site-revamp` → `feat-site-revamp.<project>.pages.dev`). Find the exact URL in the Cloudflare dashboard → Workers & Pages → this Pages project → the branch's deployment.
- **Production:** deploys from `main` to `threefoldsupply.com` (DNS + proxy on Cloudflare).
- **Build:** static site, no build step — the repo root is served as-is.
