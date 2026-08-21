# Deploy

- **Host:** Cloudflare Pages, connected to this GitHub repo (`q2dt25dfdf-pixel/ThreeFold-Website`).
- **Previews:** every branch gets its own preview deployment on push (e.g. `feat/site-revamp` → `feat-site-revamp.<project>.pages.dev`). Find the exact URL in the Cloudflare dashboard → Workers & Pages → this Pages project → the branch's deployment.
- **Production:** deploys from `main` to `threefoldsupply.com` (DNS + proxy on Cloudflare).
- **Build:** static site, no build step — the repo root is served as-is.
- **Asset versioning:** every local CSS/JS reference carries a `?v=YYYYMMDD` query (e.g. `css/site.css?v=20260821`). Browsers cache these assets for 4 hours, so a deploy that changes CSS/JS **must bump the version** or returning visitors get new HTML with stale assets (this broke `/start` after the tap-intake merge). Bump all references in one go:

  ```sh
  sed -i '' 's/?v=[0-9]\{8\}/?v=NEWDATE/g' *.html
  ```

  HTML-only deploys don't need a bump.
