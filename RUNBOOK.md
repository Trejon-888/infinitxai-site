# INFINITX site RUNBOOK

Operator runbook for `Trejon-888/infinitxai-site` — the Astro + Cloudflare Pages + beehiiv stack that replaced the morgan-vps Ghost CMS on 2026-05-08.

## Stack at a glance

| Layer | Tool | Cost |
|---|---|---|
| Static site | Astro 6 (TS strict) + Tailwind v4 | $0 |
| Hosting | Cloudflare Pages | $0 |
| Newsletter | beehiiv (Launch plan) | $0 |
| Indexing | Bing IndexNow + Google Search Console | $0 |
| CI | GitHub Actions | $0 (within free tier) |

Total recurring: **$0**.

---

## CF_CUSTOM_DOMAIN — Cloudflare Pages deploy + apex attach

### ⚠️ TOKEN DEAD AS OF 2026-05-08 EXECUTE PHASE

`wrangler whoami` with the token at `~/.finn/config/cloudflare.env` returned **Invalid access token [code: 9109]**. The token (id `ea74d61dcafe0074c0e1e8be39197520`, account `96ca3f4a4066c0e30fea9db05a8597a7` — `Trejon@aigrowthpartner.ai`) needs to be rotated before the first deploy can run.

### How to rotate the token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create a new token with template **"Edit Cloudflare Workers"** — or custom with these permissions:
   - Account › Cloudflare Pages › Edit
   - Account › Workers Scripts › Edit
   - Zone › DNS › Edit (for `infinitxai.com` zone, needed for custom-domain attach)
3. Replace `CLOUDFLARE_API_TOKEN=…` in `~/.finn/config/cloudflare.env`.
4. Verify: `source ~/.finn/config/cloudflare.env && wrangler whoami` should show the account.
5. Add to GitHub Action secrets so CI can deploy:
   ```
   gh secret set CLOUDFLARE_API_TOKEN -R Trejon-888/infinitxai-site
   gh secret set CLOUDFLARE_ACCOUNT_ID -R Trejon-888/infinitxai-site -b 96ca3f4a4066c0e30fea9db05a8597a7
   ```

### First deploy (manual, one-time)

```bash
cd ~/Projects/infinitxai-site
source ~/.finn/config/cloudflare.env
npm run build
wrangler pages project create infinitxai-site --production-branch main
wrangler pages deploy ./dist --project-name=infinitxai-site --branch=main
```

### Attach apex + www domains

```bash
# Pages dashboard → infinitxai-site → Custom domains → Add
# Apex: infinitxai.com
# www: www.infinitxai.com
```

DNS state at execute time: NS records already at Cloudflare (`carlos.ns.cloudflare.com` / `veda.ns.cloudflare.com`), apex A records pointed at CF proxy IPs but currently 404 (no Pages project attached). Once Pages project is created and apex is attached, CF auto-rewrites the A records.

After attach, validate:
```bash
curl -sf -o /dev/null -w '%{http_code}\n' https://infinitxai.com/
curl -sf -o /dev/null -w '%{http_code}\n' https://infinitxai.com/blog/
# Both must be 200
```

---

## AUTOBUILD — GitHub Actions wiring

### ⚠️ WORKFLOW SCOPE MISSING

The `gh` CLI token on Trejon's M4 lacks the `workflow` scope, so `git push` rejects any commit that touches `.github/workflows/`. Two options:

1. **Refresh the token (recommended).** Run `gh auth refresh -h github.com -s workflow` on M4 (interactive — opens browser to authorize). Once the scope is granted, `git push` will accept the workflow file.
2. **Add via web UI.** Open https://github.com/Trejon-888/infinitxai-site/actions/new and paste the contents of `.github/workflows/deploy.yml` (committed locally, not yet on remote).

### Required Action secrets

After the workflow exists on remote:

```bash
gh secret set CLOUDFLARE_API_TOKEN -R Trejon-888/infinitxai-site
gh secret set CLOUDFLARE_ACCOUNT_ID -R Trejon-888/infinitxai-site -b 96ca3f4a4066c0e30fea9db05a8597a7
gh secret set GOOGLE_SEARCH_CONSOLE_TOKEN -R Trejon-888/infinitxai-site  # optional, post-publish stub-skips if unset
gh variable set PUBLIC_BEEHIIV_PUBLICATION_ID -R Trejon-888/infinitxai-site  # optional, BeehiivForm renders mailto fallback if unset
```

### Cloudflare auto-build via GitHub integration (alternative)

Cloudflare Pages can build directly on push without GitHub Actions: in the Pages dashboard, **Settings → Builds & deployments → Connect to Git**. Authorizes via the `cloudflare/wrangler-action` install. Build command: `npm run build`, output dir: `dist`. This is the "set and forget" path — once configured, every push to `main` auto-deploys.

---

## BEEHIIV — newsletter wiring

### Account setup (manual, Trejon owns)

1. Go to https://app.beehiiv.com/onboarding and create a publication. Free **Launch** plan is fine (custom domain feat. requires email verification).
2. Verify domain (recommended): in beehiiv dashboard, go to **Settings → Custom Domain**, add `mail.infinitxai.com`, follow DNS instructions.
3. Generate API key: **Settings → Integrations → API → Create new key**.
4. Note the publication ID (visible in URL or API response: `pub_xxxxxxxx-xxxx-...`).

### BEEHIIV_KEYS — env wiring

Add to `~/.finn/config/beehiiv.env`:
```
BEEHIIV_API_KEY=…           # never commit
BEEHIIV_PUBLICATION_ID=…
PUBLIC_BEEHIIV_PUBLICATION_ID=…   # same value, but exposed to Astro for build-time form action
```

GitHub Actions:
```bash
gh secret set BEEHIIV_API_KEY -R Trejon-888/infinitxai-site
gh variable set PUBLIC_BEEHIIV_PUBLICATION_ID -R Trejon-888/infinitxai-site
```

The Astro `<BeehiivForm />` component reads `PUBLIC_BEEHIIV_PUBLICATION_ID` at build time. If unset, the form falls back to a `mailto:hello@infinitxai.com` link with a small note.

### Publishing posts to beehiiv from this repo

```bash
BEEHIIV_API_KEY=… BEEHIIV_PUBLICATION_ID=… node scripts/publish-to-beehiiv.mjs <slug>
```

Without env, the script logs a stub message and exits 0 (CI-safe).

---

## GSC — Google Search Console

### Setup (one-time)

1. Verify ownership of `infinitxai.com` at https://search.google.com/search-console (use the DNS TXT verification method via Cloudflare).
2. Submit sitemap: in GSC, **Sitemaps → Add a new sitemap → `https://infinitxai.com/sitemap-index.xml`**.

### Optional: API automation

To re-submit the sitemap after every deploy, OAuth a token with the `webmasters` scope:
```bash
# https://developers.google.com/webmaster-tools/v1/sitemaps/submit
# OAuth flow lands a refresh token; exchange for access token, then:
gh secret set GOOGLE_SEARCH_CONSOLE_TOKEN -R Trejon-888/infinitxai-site
```

`scripts/post-publish.mjs` uses the token to PUT the sitemap to Search Console. Without the token, the script logs a stub line and exits 0.

---

## INDEXNOW — Bing IndexNow ping

### Provisioned at execute

A 32-char IndexNow key was generated and dropped into `public/9733eccaec408f5f06caa19abe7e4c5e.txt`. Once the site deploys, the key is reachable at `https://infinitxai.com/9733eccaec408f5f06caa19abe7e4c5e.txt` and Bing accepts ping requests.

### How it fires

`scripts/post-publish.mjs` reads `dist/sitemap-index.xml`, walks the linked sub-sitemaps, and POSTs all URLs to `https://api.indexnow.org/IndexNow` with the key. Free, no per-host cap up to 10k URLs/day.

Validated at execute (12 URLs → status 202 from Bing).

### Run manually

```bash
node scripts/post-publish.mjs
```

---

## Daily ops cheat sheet

```bash
# Add a new blog post
vi src/content/blog/<slug>.mdx
npm run build
git add . && git commit -m "post: <slug>" && git push

# Push to beehiiv (after newsletter setup)
BEEHIIV_API_KEY=… BEEHIIV_PUBLICATION_ID=… node scripts/publish-to-beehiiv.mjs <slug>

# Re-fan-out indexing
node scripts/post-publish.mjs

# Deploy by hand (skip GH Action)
npm run build && wrangler pages deploy ./dist --project-name=infinitxai-site

# Re-import from Ghost (when key available)
GHOST_API_URL=… GHOST_CONTENT_KEY=… node scripts/migrate-from-ghost.mjs
```

## Open items for Trejon (priority order)

1. **Rotate Cloudflare API token** (above). Until done, nothing deploys.
2. **Refresh `gh` token with `workflow` scope** OR add `.github/workflows/deploy.yml` via web UI. Until done, no auto-build on push.
3. **Create beehiiv account** + add `BEEHIIV_API_KEY` / `PUBLIC_BEEHIIV_PUBLICATION_ID`. Until done, signup form falls back to mailto.
4. **GSC verification + (optional) API token.** Until done, sitemap is still discovered via robots.txt + IndexNow but not pushed.
5. **morgan-vps decommission** — see `.agents/reference/MORGAN_VPS_DECOMMISSION.md` for the document-only runbook.
