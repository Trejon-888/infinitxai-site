#!/usr/bin/env node
// post-publish.mjs — fan out to search engines after a deploy.
//
// 1. Bing IndexNow — submit URLs from sitemap to api.indexnow.org (free).
//    Key lives at /public/{KEY}.txt. No env required.
// 2. Google Search Console — re-submit sitemap via Search Console API.
//    Requires GOOGLE_SEARCH_CONSOLE_TOKEN (OAuth bearer); stubs if missing.
//
// Always exits 0 — informational, never blocks CI.

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const publicDir = join(repoRoot, 'public');
const distDir = join(repoRoot, 'dist');
const SITE = 'https://infinitxai.com';

async function findIndexNowKey() {
  const files = await readdir(publicDir).catch(() => []);
  const keyFile = files.find((f) => /^[a-f0-9]{16,}\.txt$/.test(f));
  if (!keyFile) return null;
  const key = (await readFile(join(publicDir, keyFile), 'utf8')).trim();
  return { key, keyLocation: `${SITE}/${keyFile}` };
}

async function urlsFromSitemap() {
  // Read dist/sitemap-index.xml then dist/sitemap-0.xml for actual URLs.
  try {
    const idx = await readFile(join(distDir, 'sitemap-index.xml'), 'utf8');
    const subs = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const urls = [];
    for (const sub of subs) {
      const path = sub.replace(SITE, '').replace(/^\//, '');
      const xml = await readFile(join(distDir, path), 'utf8').catch(() => null);
      if (!xml) continue;
      urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    }
    return urls;
  } catch {
    return [];
  }
}

async function indexNow() {
  const k = await findIndexNowKey();
  if (!k) { console.log('[indexnow] no key file in public/, skipping.'); return; }
  const urls = await urlsFromSitemap();
  if (urls.length === 0) { console.log('[indexnow] no URLs in sitemap, skipping.'); return; }

  const body = JSON.stringify({
    host: 'infinitxai.com',
    key: k.key,
    keyLocation: k.keyLocation,
    urlList: urls,
  });
  const res = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  console.log(`[indexnow] submitted ${urls.length} URLs → status ${res.status}`);
}

async function googleSearchConsole() {
  const token = process.env.GOOGLE_SEARCH_CONSOLE_TOKEN;
  if (!token) {
    console.log('[gsc] GOOGLE_SEARCH_CONSOLE_TOKEN not set — stub mode. See RUNBOOK § GSC.');
    return;
  }
  const sitemap = `${SITE}/sitemap-index.xml`;
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE + '/')}/sitemaps/${encodeURIComponent(sitemap)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`[gsc] sitemap submit → status ${res.status}`);
}

async function main() {
  await indexNow().catch((e) => console.error('[indexnow] error:', e.message));
  await googleSearchConsole().catch((e) => console.error('[gsc] error:', e.message));
}

main().then(() => process.exit(0));
