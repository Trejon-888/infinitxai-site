# MORGAN_VPS_DECOMMISSION — PLACEHOLDER

Filled in execute Wave 6. Will document (NOT execute) the Ghost-on-morgan-vps
shutdown sequence:

```
ssh -i ~/.finn/config/hetzner_provision_key root@100.125.97.80 \
  "systemctl stop ghost_infinitxai && \
   systemctl disable ghost_infinitxai && \
   systemctl stop ghost_staging-infinitxai-com && \
   systemctl disable ghost_staging-infinitxai-com"
```

Trejon owns the actual server cleanup decision.
