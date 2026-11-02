# Storefront redesign: work plan

The design system is **Swatch Book**. Read, in this order:
1. `/PRODUCT.md`: who the users are and what must stay true.
2. `/DESIGN.md`: tokens, components and rules (normative).
3. `/.impeccable/surfaces/storefront.md`: the direction contract.
4. `apps/web/src/components/swatch/`: the components. See them live at `/en/design-system`.
5. `/.claude/skills/impeccable/SKILL.md` and its `reference/` files: the process. Read `reference/craft-floor.md` before any UI edit, and use `reference/audit.md` and `reference/polish.md` for the pass on each page.

## Shared files (owned by the design-system branch, do not edit)

- `apps/web/src/app/globals.css`, `apps/web/tailwind.config.ts`, `apps/web/src/app/[locale]/layout.tsx`
- `apps/web/src/components/swatch/**`
- `apps/web/src/components/layout/header.tsx`, `footer.tsx`, `logo.tsx`, `nav-bar.tsx`
- `apps/web/src/components/product/product-card.tsx`
- `DESIGN.md`, `PRODUCT.md`, `.impeccable/**`

If a group needs a new shared primitive, build it inside its own group's folder, and list it under "Promote to swatch" in its final report. The design-system owner moves it into `components/swatch` afterwards.

Message files (`apps/web/src/messages/*.json`): add new keys only, under the namespace named for your group, so merges stay clean.

## Groups

| # | Branch | Pages | Components owned |
|---|---|---|---|
| 1 | `design/home` | `/` (`page.tsx`), `/collection/[slug]` | `components/home/**`, `components/layout/layout-renderer.tsx`, `background-video.tsx`, `preview-banner.tsx`, `scroll-rail.tsx`, `category-bar.tsx` |
| 2 | `design/browse` | `/c/[category-slug]`, `/search`, `/brands`, `/brand/[slug]`, `/vendor/[slug]` | listing and filter components in `components/product/` (`listing-*`, `filter-*`, `active-filter*`, `sort-toolbar`, `pagination`, `product-grid`, `mobile-filter-controls`, `use-filter-draft`, `vendor-storefront`, `brands-you-follow-rail`, `rail*`), `components/vendor/**`, `components/category/**`, `components/layout/mega-menu-*`, `mobile-nav-drawer`, `mobile-tab-bar`, `mobile-search-overlay`, `search-autocomplete*`, `empty-search-state` |
| 3 | `design/product` | `/product/[slug]` | the rest of `components/product/` (PDP: `product-hero`, `purchase-panel`, `media-gallery`, `variant-selector`, `format-selector`, `group-swatches`, `spec-strip`, `details-accordions`, `product-details-block`, `seller-block`, `qa-accordion`, `photo-video-reviews`, `sticky-bottom-bar`, `bnpl-strip`, `breadcrumb`, `record-view`, and the beauty-era components listed below) |
| 4 | `design/checkout` | `/cart`, `/checkout`, `/checkout/tamara/*` | `components/cart/**`, `components/checkout/**` |
| 5 | `design/account` | `/account/**`, `/auth/login`, `/auth/register` | `components/account/**`, `components/auth/**`, `components/support/**` |
| 6 | `design/content` | `/about`, `/careers`, `/contact`, `/faq`, `/press`, `/privacy`, `/returns`, `/shipping`, `/terms`, `/sell`, `not-found`, `loading` | `components/layout/static-page-layout.tsx`, `newsletter-form.tsx`, `locale-switcher.tsx`, `currency-selector.tsx`, `components/consent/**` |

### Beauty-era components to replace (group 3)
`complete-ritual.tsx`, `ingredients-lab.tsx`, `scent-story.tsx`, `notes-ritual-craft-tabs.tsx`, `the-routine.tsx`, `the-look.tsx`, `the-verdict.tsx`, `tone-swatches.tsx`, `product-story.tsx`, `from-the-brand.tsx`. Replace each with a materials equivalent (spec table via `MillLabel`, "Pairs well with" for compatible materials, supplier block, reviews summary) or delete it if nothing on a materials PDP needs it. Delete their tests with them.

## Definition of done for every group

- Every page in the group uses Swatch Book: tokens, `components/swatch`, the rules in DESIGN.md. No `font-serif` with italics, no `tracking-[0.2em]` lowercase labels, no pill buttons, no hard-coded hex colours, no beauty-era copy.
- Works at 390px and 1440px, and in Arabic (RTL).
- States designed: loading, empty, error, out of stock, long content.
- Self-review with `reference/audit.md` then `reference/polish.md` against DESIGN.md, from screenshots. The backend is usually not running in these sessions, so if a page needs API data, render it with fixtures in a test or a temporary local mock. Don't commit mocks into pages.
- `cd apps/web && npx vitest run` passes, and `npx @biomejs/biome@1.9.4 lint <changed files>` adds no new errors.
- Commit on the group branch and push. Do not open a pull request.
