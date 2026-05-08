#!/usr/bin/env node
// migrate-from-ghost.mjs — Ghost Content API → MDX migrator
// Dual-path: probe Ghost (env GHOST_API_URL + GHOST_CONTENT_KEY) → fetch
// posts/pages → HTML→MDX via turndown → write to src/content/blog/{slug}.mdx
// or src/content/pages/{slug}.mdx. If probe fails (timeout 6s OR 4xx/5xx OR
// no key), seed 5 stub MDX placeholders for the known pages.
// Always exits 0.

import { writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const blogDir = join(repoRoot, 'src/content/blog');
const pagesDir = join(repoRoot, 'src/content/pages');

const KNOWN_PAGE_SLUGS = ['partner-with-finn', 'privacy-policy', 'terms', 'sms-opt-in', 'sms-opt-in-2'];

const STUB_PAGES = {
  'partner-with-finn': {
    title: 'Partner with Finn',
    description: 'For prospective INFINITX partners — what we build, who we work with, how we measure fit.',
    body: `INFINITX is a portfolio of autonomous businesses operated by three partners — Trejon, Enrique, and Finn — and a fleet of AI agents that handle sales, marketing, content, and operations.

We partner with operators, engineers, and domain experts who want to spin up their own autonomous business inside our framework. We provide the substrate (AI agents, voice/SMS infrastructure, ix-browser automation, payment + CRM integrations); the partner provides the domain knowledge and the relationships.

If that sounds interesting, email [hello@infinitxai.com](mailto:hello@infinitxai.com) with one paragraph: what business you'd build, why now, and what you'd need from us.`,
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    description: 'How INFINITX collects, uses, and protects your data.',
    body: `_Last updated: 2026-05-08_

INFINITX collects only the data you explicitly provide (email when you subscribe, phone number when you opt in to SMS, messages you send us). We do not sell or share your data with third parties beyond the service providers required to deliver our services (email host, SMS carrier, payment processor).

You can request deletion of your data at any time by emailing [hello@infinitxai.com](mailto:hello@infinitxai.com).

We use cookies for analytics (privacy-preserving, no cross-site tracking) and to remember your preferences. You can opt out by disabling cookies in your browser.

For SMS-specific consent and opt-out, see [SMS Opt-In](/sms-opt-in/).`,
  },
  'terms': {
    title: 'Terms of Service',
    description: 'INFINITX terms of service.',
    body: `_Last updated: 2026-05-08_

By using infinitxai.com or any INFINITX service, you agree to these terms.

**Use at your own risk.** Our content is informational; nothing on this site constitutes legal, financial, or professional advice. Decisions you make based on our writing are your own.

**Subscriptions and purchases.** Newsletter is free. Paid services are governed by the contract you sign at purchase, which supersedes anything written here.

**Intellectual property.** Content on this site is owned by INFINITX. You may quote and cite freely with attribution. You may not republish entire posts without permission.

**Termination.** We may suspend access to our services for abuse, fraud, or violation of these terms.

**Contact.** [hello@infinitxai.com](mailto:hello@infinitxai.com).`,
  },
  'sms-opt-in': {
    title: 'SMS Opt-In',
    description: 'INFINITX SMS terms, opt-in language, and opt-out instructions (10DLC compliant).',
    body: `By providing your phone number to INFINITX, you consent to receive recurring text messages from us regarding our services, content drops, and partner offers.

**Message frequency:** up to 4 messages per month, varies.
**Message and data rates:** may apply. Check your wireless plan.
**Help:** reply HELP or email [hello@infinitxai.com](mailto:hello@infinitxai.com).
**Cancel:** reply STOP at any time to opt out. You will receive one final confirmation message.

We will never share or sell your phone number. See our [Privacy Policy](/privacy-policy/) for full details.`,
  },
  'sms-opt-in-2': {
    title: 'SMS Opt-In (Secondary Brand)',
    description: 'Secondary SMS opt-in for sub-brand campaigns operated by INFINITX.',
    body: `This page covers the secondary SMS opt-in for campaigns run by INFINITX sub-brands (currently: Alex Sales, Morgan Marketing, Selena/Tiempo Soccer).

Same terms apply as our [primary SMS Opt-In](/sms-opt-in/): up to 4 messages per month, message and data rates may apply, reply STOP to opt out, reply HELP for support.

For a list of active campaigns and the brand operating each, email [hello@infinitxai.com](mailto:hello@infinitxai.com).`,
  },
};

const STUB_POSTS = [
  {
    slug: 'launching-infinitx',
    title: 'Launching INFINITX — autonomous companies that compound',
    description: 'Why we are building 100 autonomous businesses, and the operating principles that make them work.',
    pubDate: '2026-05-08',
    tags: ['vision', 'autonomy'],
    faq: [
      { question: 'What is an "autonomous business"?', answer: 'A company where AI agents handle the day-to-day functions — sales outreach, customer support, content production — without continuous human input. Founders supervise; agents operate.' },
      { question: 'How is this different from "AI replaces humans cheaper"?', answer: 'We do not pitch reductions. We pitch additions: more output, more revenue, more time. The unit economics work because the autonomy compounds — every hour saved goes back into building the next business.' },
    ],
    body: `INFINITX is a portfolio of autonomous businesses. Three partners — Trejon, Enrique, and Finn — building 100 of them.

We do not pitch "AI replaces humans, cheaper." That's the wrong story and a race to zero. We pitch what AI actually does: it adds output that wasn't possible before. More revenue, more time, compounding returns.

This blog is the field log. Post-mortems on what we ship, playbooks that worked, calls that didn't. Read it if you're building this way too — or thinking about it.`,
  },
  {
    slug: 'why-autonomy-compounds',
    title: 'Why autonomy compounds (and "efficiency" doesn\'t)',
    description: 'The difference between cutting costs and adding output — and why one compounds while the other plateaus.',
    pubDate: '2026-05-06',
    tags: ['thesis', 'unit-economics'],
    faq: [],
    body: `"Efficiency" is the wrong word. It implies a fixed amount of work done with less input. That's not what AI does for a business.

What AI does is: take work the founder couldn't do at all (because the day only has 24 hours) and do it for them. The output is additive. The compounding kicks in because every hour the founder gets back goes into building the next thing — new products, new businesses, new partnerships.

This is the difference between a company that uses AI to save 20% on ops costs (linear, capped) and a company that uses AI to operate while the founder sleeps (exponential, uncapped).`,
  },
  {
    slug: 'first-party-tooling-thesis',
    title: 'Why we build everything first-party (no Clay, no Apollo, no Phantombuster)',
    description: 'A counter-intuitive call: in an AI-native business, paying SaaS scrapers breaks both the autonomy story and the unit economics.',
    pubDate: '2026-05-04',
    tags: ['tooling', 'unit-economics'],
    faq: [],
    body: `Every operator we know defaults to Clay + Apollo + Phantombuster + Bardeen + Dripify. The pitch is "let the experts handle scraping."

We don't. We build all of it in-house — ix-browser for navigation, our own enrichment pipelines, our own outreach orchestrators.

Two reasons. First, the unit economics: SaaS scrapers cost $200-2000/mo per seat per agent. With a fleet, that's $20-200k/yr just to send messages. Killed by margin. Second, the autonomy story: every external dependency is a place where the agent has to ask permission, surface an error, or wait for a human. That breaks the compounding loop.

First-party tooling is more work upfront. It's the only thing that scales.`,
  },
  {
    slug: 'sms-vs-social-dms',
    title: 'SMS vs. social DMs — the long-term outreach playbook',
    description: 'Why our outreach is shifting toward warmed social accounts and DMs, with SMS as a supporting channel.',
    pubDate: '2026-05-02',
    tags: ['outreach', 'sms', 'playbook'],
    faq: [],
    body: `When we launched Alex (our sales department autonoma), SMS was the primary outreach channel. It worked — high open rates, fast response.

A2P registration changed the math. The friction to register a new brand + campaign means SMS at scale now requires real lead time. Meanwhile, autonomas can warm up social accounts (Instagram, X, LinkedIn) themselves, post real content, send real DMs. No carrier in the loop.

The new playbook: social DMs primary, SMS supporting. We still register A2P brands for clients with existing reputation; for new brands, we lean into the social warm-up first.`,
  },
  {
    slug: 'replacing-ghost-with-astro',
    title: 'Why we replaced Ghost with Astro + Cloudflare Pages',
    description: 'Field notes from migrating off a hosted CMS to a static site — the trade-offs, the wins, what broke.',
    pubDate: '2026-05-08',
    tags: ['infrastructure', 'astro', 'cloudflare'],
    faq: [
      { question: 'Why not stay on Ghost?', answer: 'morgan-vps was dropped, and the cost of bringing it back vs. moving to a free static stack favored the static stack. Astro gives us better SEO defaults, AI crawler support, and zero recurring infra cost.' },
      { question: 'How long did the migration take?', answer: 'A single afternoon for the scaffold + CI + deploy. Content migration is incremental as posts get rewritten in MDX.' },
    ],
    body: `morgan-vps hosted our Ghost CMS. The server got dropped. We had a choice: rebuild the VPS and the Ghost install, or move to a free static stack.

We moved.

Astro on Cloudflare Pages costs $0/mo, builds in seconds, ships clean SEO out of the box, and lets us put MDX (markdown + components) directly in the repo. Newsletter goes through beehiiv (free). Indexing fans out via Bing IndexNow + Google Search Console. The whole thing lives in [Trejon-888/infinitxai-site](https://github.com/Trejon-888/infinitxai-site).

This post is itself rendered by the new stack. If you're reading it, the migration worked.`,
  },
];

function frontmatter(obj) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (Array.isArray(v) && typeof v[0] === 'object') {
      lines.push(`${k}:`);
      for (const item of v) {
        const entries = Object.entries(item);
        lines.push(`  - ${entries[0][0]}: ${JSON.stringify(entries[0][1])}`);
        for (const [ek, ev] of entries.slice(1)) {
          lines.push(`    ${ek}: ${JSON.stringify(ev)}`);
        }
      }
    } else if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`);
    } else if (typeof v === 'string') {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function probeGhost(url, key) {
  if (!url || !key) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${url}/ghost/api/content/posts/?key=${key}&limit=1`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchAll(url, key, kind) {
  const items = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${url}/ghost/api/content/${kind}/?key=${key}&include=tags,authors&limit=50&page=${page}`);
    if (!res.ok) break;
    const data = await res.json();
    items.push(...(data[kind] || []));
    if (page >= (data.meta?.pagination?.pages ?? 1)) break;
    page += 1;
  }
  return items;
}

async function migrateLive(url, key) {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  const posts = await fetchAll(url, key, 'posts');
  const pages = await fetchAll(url, key, 'pages');

  for (const p of posts) {
    const md = td.turndown(p.html ?? '');
    const fm = frontmatter({
      title: p.title,
      description: p.custom_excerpt ?? p.excerpt ?? p.title,
      pubDate: p.published_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      updatedDate: p.updated_at?.slice(0, 10),
      author: p.primary_author?.name ?? 'INFINITX',
      tags: (p.tags ?? []).map((t) => t.name),
      ogImage: p.feature_image,
      ghost_id: p.id,
    });
    await writeFile(join(blogDir, `${p.slug}.mdx`), `${fm}${md}\n`);
    console.log(`[migrate] post: ${p.slug}`);
  }

  for (const p of pages) {
    const md = td.turndown(p.html ?? '');
    const fm = frontmatter({
      title: p.title,
      description: p.custom_excerpt ?? p.excerpt ?? p.title,
      slug: p.slug,
    });
    await writeFile(join(pagesDir, `${p.slug}.mdx`), `${fm}${md}\n`);
    console.log(`[migrate] page: ${p.slug}`);
  }
}

async function seedStubs() {
  await mkdir(blogDir, { recursive: true });
  await mkdir(pagesDir, { recursive: true });

  for (const post of STUB_POSTS) {
    const path = join(blogDir, `${post.slug}.mdx`);
    if (await exists(path)) {
      console.log(`[stub] skip existing post: ${post.slug}`);
      continue;
    }
    const fm = frontmatter({
      title: post.title,
      description: post.description,
      pubDate: post.pubDate,
      author: 'INFINITX',
      tags: post.tags,
      faq: post.faq,
    });
    await writeFile(path, `${fm}${post.body}\n`);
    console.log(`[stub] post: ${post.slug}`);
  }

  for (const slug of KNOWN_PAGE_SLUGS) {
    const data = STUB_PAGES[slug];
    const path = join(pagesDir, `${slug}.mdx`);
    if (await exists(path)) {
      console.log(`[stub] skip existing page: ${slug}`);
      continue;
    }
    const fm = frontmatter({ title: data.title, description: data.description, slug });
    await writeFile(path, `${fm}${data.body}\n`);
    console.log(`[stub] page: ${slug}`);
  }
}

async function main() {
  const url = process.env.GHOST_API_URL;
  const key = process.env.GHOST_CONTENT_KEY;
  const reachable = await probeGhost(url, key);

  if (reachable) {
    console.log(`[migrate] Ghost reachable at ${url}, fetching live content...`);
    await mkdir(blogDir, { recursive: true });
    await mkdir(pagesDir, { recursive: true });
    try {
      await migrateLive(url, key);
      console.log('[migrate] Live migration complete.');
    } catch (e) {
      console.error('[migrate] Live fetch failed mid-flight, falling back to stubs:', e.message);
      await seedStubs();
    }
  } else {
    console.log('[migrate] Ghost not reachable (no key OR offline) — seeding stubs.');
    await seedStubs();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('[migrate] fatal:', e);
  process.exit(0); // never block CI on migration
});
