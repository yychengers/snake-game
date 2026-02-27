# Deployment Options

## Vercel
- Build command: `npm run build`
- Output directory: `dist`

## Netlify
- Config file: `netlify.toml`
- Or set in UI:
  - Build command: `npm run build`
  - Publish directory: `dist`

## Cloudflare Pages
- Config file: `wrangler.toml`
- Or set in UI:
  - Build command: `npm run build`
  - Build output directory: `dist`

## Notes
- This project is a Vite SPA. Ensure fallback routing to `index.html` is enabled.
