# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: **trade buyers** in the UAE. These are packaging, print-finishing, rigid-box, bookbinding and leather-goods workshops, plus procurement staff at manufacturers. They usually work at a desk or a workshop bench, often with physical samples beside them. Their job is to find a material that meets a spec (GSM, thickness, finish, width), compare suppliers, order a sample, and then buy at a quantity-break price or request a quote for a run. They come back for the same SKUs.

Secondary: **retail craft and decoration shoppers** buying sample packs, swatches, decorative papers, party decor, craft kits and stationery. They are well served, but when the two audiences conflict, trade comes first (confirmed with the owner, 2026-11-02).

Also: **vendors** (suppliers) running listings, inventory, orders, payouts and coupons in the vendor dashboard, and **platform admins** in the admin panel.

## Product Purpose

MaterialHub is a multi-vendor marketplace where UAE buyers source packaging, manufacturing, finishing and craft materials from verified local and international suppliers in one catalogue. Success for a buyer is finding the right material by spec, trusting the supplier, and getting it delivered at the right unit price. Success for a vendor is selling by the sheet, roll, pack or carton without running their own storefront.

## Positioning

The only UAE marketplace with one catalogue that covers the whole materials chain: papers and boards, PU and bonded leather, book cloth, hinges and magnets, adhesives, foils, rigid boxes, cartons, and ribbons and trims. Listings are by spec and unit of measure, with samples and quantity-break pricing from several competing suppliers.

## Operating Context

- Buyers compare listings by physical spec: GSM, thickness in mm, sheet size (e.g. 70×100 cm), roll width and length, finish, colour, and unit of measure (sheet, roll, metre, pack, carton).
- Physical swatch books, sample packs and mill stock labels are how this trade already chooses material.
- Payments: card via Stripe, Tabby and Tamara (BNPL), and cash on delivery. Prices are in AED and stored in fils.
- Locales: English and Arabic (RTL). Mobile traffic is significant.
- Top-level categories, in seed order: papers & boards, leather & fabrics, hardware & fittings, adhesives & finishing, boxes & packaging, ribbons & trims, decoration & craft.

## Capabilities and Constraints

- Shipping now: catalogue, search (Typesense), categories, brands, vendor storefronts, product pages with variants, cart, checkout (Stripe/Tabby/Tamara/COD), accounts (orders, returns, addresses, wishlist, wallet, support, saved searches), CMS-driven home and collection layouts.
- Roadmap, not yet built (do not show as working): trade pricing (MOQ, quantity-break tiers, unit of measure on variants), sample SKUs, request for quotation, business accounts with TRN and credit terms. Designs may reserve space for them only behind clear "coming soon" states, or leave them out.
- Stack: Next.js 16 App Router, React 19, Tailwind 3, next-intl, shared UI in `packages/ui`.

## Brand Commitments

- Name: **MaterialHub** (wordmark "Material" + "Hub"). No other brand names in copy, seed data or fixtures.
- Removed on purpose, never to return: beauty-era copy and components (rituals, routines, scent, ingredients, "maison"), reels and creators, bookings, gift boxes and gift cards, flash deals, affiliates, referrals.

## Evidence on Hand

- Real category tree in `backend/libs/database/src/seeds`.
- No customer testimonials, supplier counts, delivery-time guarantees or review counts are confirmed. Do not invent them. "Free shipping over AED 150" is in the current storefront copy.

## Product Principles

1. Spec before story: the numbers a buyer filters on are always visible, not hidden in accordions.
2. Price per unit: every price names its unit, and tiers show "from".
3. Sample, then scale: the path from one sheet to a carton is always one step away.
4. Suppliers are visible: who sells it is part of the product, not small print.
5. Works in Arabic and on a phone on a workshop floor.

## Accessibility & Inclusion

WCAG 2.2 AA. Full RTL support for Arabic. Respect `prefers-reduced-motion`.
