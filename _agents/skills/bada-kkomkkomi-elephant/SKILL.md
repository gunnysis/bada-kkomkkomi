---
name: bada-kkomkkomi-elephant
description: >-
  Loads the architectural context, domain invariants, and living specification
  sitemap for the Bada-Kkomkkomi (바다꼼꼬미) marine spatial PWA project during
  Google EGM (/egm-brainstorm, /egm-draft, /egm-resolve, /egm-drift-report)
  sessions.
---

# Bada-Kkomkkomi (바다꼼꼬미) Elephant Context Loader

Use this skill at the start of an Elephant session to load the verified
architectural context of `bada-kkomkkomi` without scanning the entire source
tree from scratch.

## 1. Authoritative Context Entry Points

Read these files first when exploring requirements or drafting specifications:

1. [Repository Root Blueprint (`AGENTS.md`)](../../../AGENTS.md) — Global invariants, side effects, verification commands, and `.dev/docs` artifact isolation rule.
2. [Design Sitemap & Component Contracts (`docs/designs/SITEMAP.md`)](../../../docs/designs/SITEMAP.md) — Subsystem `Interface`, `Invariants`, `Side Effects`, and `Verification` matrix.
3. [Master Architecture & Implementation Specification (`docs/ARCHITECTURE_AND_DESIGN.md`)](../../../docs/ARCHITECTURE_AND_DESIGN.md) — End-to-end architecture, GIS coordinate math, route selection state machine, and legacy cleanup registry.
4. [Data & Tech Provenance Specification (`docs/DATA_AND_TECH_SOURCES.md`)](../../../docs/DATA_AND_TECH_SOURCES.md) — Offline vs. online matrix and 6-pillar data provenance.

## 2. Phase Write Boundaries & Artifact Isolation

- Scratch briefs (`concepts_brief.md`), drafts (`design_draft.md`), and Goldfish review reports (`*_report.md`) belong in `.dev/docs/` (configured via `EGM artifact directory: .dev/docs` in `AGENTS.md`).
- During EGM Phases 1–4 (`egm-brainstorm`, `egm-draft`, `egm-review`, `egm-resolve`), do not modify production TypeScript/React source files under `src/`, static datasets under `public/`, or build scripts under `scripts/`.
- In Phase 5 (Implementation), every code or documentation change must pass `npm test && npm run lint && npm run build && npm run verify`.
