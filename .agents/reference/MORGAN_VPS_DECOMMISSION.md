# MORGAN_VPS_DECOMMISSION

> **Status:** DOCUMENT ONLY. Trejon owns the actual server cleanup decision. Finn does not execute these commands.

## Context

morgan-vps hosted Morgan's Ghost CMS (the infinitxai.com blog) and an internal ops UI. As of 2026-05-08 the publish stack moved to Astro on Cloudflare Pages + beehiiv (this repo). The Ghost services on morgan-vps are no longer load-bearing.

**Ghost CMS replaced by:** Astro (this repo, `Trejon-888/infinitxai-site`) + beehiiv (newsletter).
**Operator dashboard fate:** Morgan operator UI was retired alongside the autonoma — see Finn skill retirement note below.

## Stop the Ghost services on morgan-vps (do not run blindly)

SSH into morgan-vps as root, then stop + disable the systemd units:

```bash
ssh -i ~/.finn/config/hetzner_provision_key root@100.125.97.80 \
  "systemctl stop ghost_infinitxai && \
   systemctl disable ghost_infinitxai && \
   systemctl stop ghost_staging-infinitxai-com && \
   systemctl disable ghost_staging-infinitxai-com"
```

Confirm Ghost is no longer running:

```bash
ssh -i ~/.finn/config/hetzner_provision_key root@100.125.97.80 \
  "systemctl list-units --type=service | grep -i ghost"
```

## Optional follow-on cleanup (Trejon's call)

1. **Database backup before drop.** Ghost stores posts in a MySQL/SQLite DB (depending on install). Snapshot it before tearing the install down — even if migration is complete, keep a 90-day archive.
   ```bash
   ssh -i ~/.finn/config/hetzner_provision_key root@100.125.97.80 \
     "tar czf /root/ghost-backup-$(date +%Y%m%d).tar.gz /var/lib/ghost /var/www/ghost 2>/dev/null"
   scp -i ~/.finn/config/hetzner_provision_key root@100.125.97.80:/root/ghost-backup-*.tar.gz ~/Backups/
   ```
2. **Caddy/nginx config.** Remove Ghost-related virtual host entries from the reverse proxy.
3. **DNS.** infinitxai.com NS already at Cloudflare; once apex points at Pages (see RUNBOOK § CF_CUSTOM_DOMAIN), morgan-vps is no longer in the path. The old A-record fallback can be removed at Trejon's discretion.
4. **morgan-ui/** — the operator dashboard at `/opt/morgan-ui/` is also retired. Safe to delete after step 1.
5. **Server itself.** If morgan-vps has no other tenants (it shouldn't — Morgan was its single autonoma), the Hetzner instance can be destroyed entirely once the backup is verified.

## Migration data

- **Live Ghost reachability check (executed 2026-05-08):** `curl -sf https://ghost-production-7506.up.railway.app/` returned HTTP 200 — Ghost was actually up on Railway, not morgan-vps. The original Ghost instance on morgan-vps may already be gone. The migration script `scripts/migrate-from-ghost.mjs` is dual-path: it probes Ghost via `GHOST_API_URL` + `GHOST_CONTENT_KEY` env, and only if that fails does it seed the 5 stub posts/pages. As of execute, no Content API key was on disk → stub branch taken. If Trejon wants the real archive, set the env vars and re-run the migration script — it's idempotent (skips files that already exist).

## Retired Finn skills

In tandem with this decommission, the following Finn skills were removed from `~/.finn/`:

- `~/.finn/skills/morgan-ops/` — health/queue/Ghost ops for Morgan
- `~/.finn/skills/deploy-morgan-ui/` — push ix-marketing-ui to morgan-vps:/opt/morgan-ui/

Their entries were also pruned from the skills tables in `~/.finn/CLAUDE.md` (which `~/.claude/CLAUDE.md` symlinks to).

## When this is fully done

- [ ] Ghost services stopped + disabled on morgan-vps
- [ ] Ghost DB backed up (archived to Trejon's local Backups/)
- [ ] Caddy/nginx config cleaned up
- [ ] morgan-ui/ directory removed
- [ ] morgan-vps Hetzner instance destroyed (if no other use)
- [ ] DNS A-record fallback removed (apex points only at CF Pages)
