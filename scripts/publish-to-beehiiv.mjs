#!/usr/bin/env node
// publish-to-beehiiv.mjs — push a blog post to beehiiv as a newsletter draft
// (or queued/scheduled, depending on env BEEHIIV_PUBLISH_MODE).
//
// Usage: node scripts/publish-to-beehiiv.mjs <slug>
//   Reads src/content/blog/<slug>.mdx, transforms frontmatter + body,
//   POSTs to https://api.beehiiv.com/v2/publications/{pub_id}/posts.
//
// Required env: BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID
// Optional env: BEEHIIV_PUBLISH_MODE=draft|confirmed|scheduled (default draft)
//
// If env vars missing, exits 0 with a stub log — never blocks CI.

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const blogDir = join(__dirname, '..', 'src/content/blog');

function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return { data: fm, body: m[2] };
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    const all = await readdir(blogDir);
    console.log('Available slugs:');
    for (const f of all) console.log(`  ${f.replace(/\.mdx?$/, '')}`);
    console.log('\nUsage: node scripts/publish-to-beehiiv.mjs <slug>');
    process.exit(0);
  }

  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;

  if (!apiKey || !pubId) {
    console.log('[beehiiv] BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID not set — stub mode.');
    console.log('[beehiiv] Would publish slug:', slug);
    console.log('[beehiiv] See RUNBOOK § BEEHIIV_KEYS for setup.');
    process.exit(0);
  }

  const src = await readFile(join(blogDir, `${slug}.mdx`), 'utf8');
  const { data, body } = parseFrontmatter(src);

  const mode = process.env.BEEHIIV_PUBLISH_MODE || 'draft';
  const payload = {
    title: data.title ? JSON.parse(data.title) : 'Untitled',
    subtitle: data.description ? JSON.parse(data.description) : '',
    body_content: body,
    status: mode,
  };

  const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`[beehiiv] API error ${res.status}:`, await res.text());
    process.exit(1);
  }
  const json = await res.json();
  console.log(`[beehiiv] ${mode}: ${json.data?.id ?? '(no id)'}`);
}

main().catch((e) => {
  console.error('[beehiiv] fatal:', e);
  process.exit(0);
});
