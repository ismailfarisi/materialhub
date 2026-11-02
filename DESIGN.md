---
name: MaterialHub Swatch Book
description: A materials marketplace built like the swatch book a trade buyer already keeps on the desk.
colors:
  board: "hsl(60 4% 92%)"          # #ECECE9  page ground          --nl-linen
  stock: "hsl(0 0% 100%)"          # #FFFFFF  card surface         --nl-pearl
  binder-ink: "hsl(222 18% 11%)"   # #171A21  primary text, primary button  --nl-cacao
  pencil: "hsl(220 8% 36%)"        # #555B64  secondary text       --nl-russet
  cutter-orange: "hsl(16 90% 50%)" # #F24A0D  next action, active, counts  --nl-amber
  cutter-orange-text: "hsl(16 86% 38%)" # #B53A0D AA text on board/stock --nl-amber-text
  binder-black: "hsl(220 14% 9%)"  # #14161A  dark bands, footer   --nl-espresso
  status-success: "hsl(142 64% 30%)"   # state only
  status-warning: "hsl(36 92% 40%)"
  status-error: "hsl(0 72% 45%)"
  status-info: "hsl(213 15% 40%)"
  stock-paper: "hsl(213 70% 39%)"      # #1E5DA9 papers-boards
  stock-leather: "hsl(352 59% 30%)"    # #7A1F2E leather-fabrics
  stock-hardware: "hsl(40 80% 30%)"    # #8A5F0F hardware-fittings
  stock-finishing: "hsl(165 74% 25%)"  # #117058 adhesives-finishing
  stock-packaging: "hsl(24 50% 36%)"   # #8A5A2E boxes-packaging
  stock-trims: "hsl(4 66% 44%)"        # #BA2F26 ribbons-trims
  stock-craft: "hsl(256 43% 48%)"      # #6346AF decoration-craft
typography:
  display:
    fontFamily: "Archivo, Readex Pro, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 4.75rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Archivo, Readex Pro, system-ui, sans-serif"
    fontSize: "clamp(1.375rem, 2.6vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo, Readex Pro, system-ui, sans-serif"
    fontSize: "0.97rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, Readex Pro, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0em"
  label:
    fontFamily: "Archivo (font-stretch 72%), system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  spec:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  sm: "2px"
  md: "6px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.binder-ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-signal:
    backgroundColor: "{colors.cutter-orange}"
    textColor: "{colors.stock}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.binder-ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  swatch-card:
    backgroundColor: "{colors.stock}"
    rounded: "{rounded.md}"
  swatch-tab:
    height: "28px"
    textColor: "{colors.stock}"
  spec-chip:
    backgroundColor: "{colors.board}"
    textColor: "{colors.binder-ink}"
    typography: "{typography.spec}"
    rounded: "{rounded.sm}"
    height: "24px"
  search-field:
    backgroundColor: "{colors.stock}"
    rounded: "{rounded.md}"
    height: "48px"
---

# Design System: MaterialHub Swatch Book

Code lives in `apps/web/src/components/swatch/` (tokens in `apps/web/src/app/globals.css`, Tailwind names in `apps/web/tailwind.config.ts`). A live specimen renders at `/en/design-system`.

## Overview

Trade buyers choose material from swatch books, sample packs and the labels on ream wrappers. MaterialHub is built as that object: the page is the **board** a swatch book lies on, every product is a **swatch card**, every top-level category is a **stock colour**, and every spec is printed like a **mill label**.

The storefront is a Persuade surface on the home page and category landings (the world may carry the page), and an Operate surface everywhere a buyer is working: listing grids, filters, product detail, cart, checkout and account. On Operate surfaces the world contributes only type, palette, density and the swatch card; layout, navigation and controls stay standard web patterns.

Key characteristics:
- Light board-grey ground, white cards, near-black ink. No cream, no serif.
- Colour arrives as whole fields: a card's tab, a category band, a fan of stocks. Never as scattered accents.
- Specs are first-class: mono values, condensed-caps keys, always visible.
- One orange: the next action.

## Colors

### Primary
- **Binder ink** `--nl-cacao`: all primary text, the default strong button, selected states on neutral UI.
- **Cutter orange** `--nl-amber`: the one next step on a screen (Add to cart, Pay, Place order), cart count, active focus ring. Text in orange uses `--nl-amber-text`.

### Category stocks
One per top-level category (`stockFor(slugOrName)` resolves them):

| Stock | Token | Category |
|---|---|---|
| Paper blue | `--stock-paper` | papers-boards |
| Oxblood | `--stock-leather` | leather-fabrics |
| Brass | `--stock-hardware` | hardware-fittings |
| Laminate green | `--stock-finishing` | adhesives-finishing |
| Kraft | `--stock-packaging` | boxes-packaging |
| Grosgrain red | `--stock-trims` | ribbons-trims |
| Tissue violet | `--stock-craft` | decoration-craft |

All seven carry white text at ≥4.5:1.

### Neutral
- **Board** `--nl-linen`: page ground and recessed areas (image wells, inputs inside cards).
- **Stock** `--nl-pearl`: card and panel surface (white).
- **Pencil** `--nl-russet`: secondary text, metadata, supplier names.
- **Binder black** `--nl-espresso`: footer, utility bar, dark feature bands.

### Named Rules
- **The Field Rule.** A stock colour fills a shape (tab, band, chip, blade) or it is not used. No coloured text, borders or icons in stock colours.
- **The One Orange Rule.** At most one cutter-orange filled button per viewport.
- **No stock without a category.** A stock colour always means its category. Never use one decoratively or for status.
- **Status colours** `--status-success`, `--status-warning`, `--status-error`, `--status-info` (Tailwind `status-*`) are separate from the stocks and only used for state: order and return timelines, stock levels, form results. Success green is deliberately darker and yellower than laminate green.

## Typography

**Display:** Archivo, a grotesk with a width axis. Headlines run at normal or expanded width (`font-stretch: 112%`, class `font-expanded`).
**Label:** the same Archivo at condensed width (`font-stretch: 72%`), semibold caps, `+0.06em` tracking. Use the `mill-label` utility.
**Body:** Geist, for interface and running text.
**Spec:** Geist Mono, for every measured value: GSM, mm, cm, metres, SKU, quantities.
**Arabic:** Readex Pro is the fallback in every stack.

### Hierarchy
- Display (700, clamp 36–76px, lh 1.0): hero and page-landing headlines only.
- Headline (600, clamp 22–32px): section titles via `SectionHead`.
- Title (600, 15.5px): card and panel titles.
- Body (400, 15px, lh 1.6): running text, max 65–75ch.
- Label (600 condensed caps, 12px): spec keys, tab text, table headers, badges. Never full sentences, and never as a kicker above a heading.
- Spec (mono 12–14px, tabular-nums): values only.

### Named Rules
- **Sentence case everywhere** except `mill-label` text.
- **No letter-spaced lowercase**, no italics for emphasis, no serif.
- **Numbers line up.** Prices, quantities and specs use `tabular-nums`.

## Layout

- Container: `max-w-[1400px] mx-auto px-4 md:px-8`.
- Product grids: 2 columns on mobile, 3 at `md`, 4 at `lg` (5 at `2xl` on search only). Gap 12px mobile, 16px desktop.
- Sections: 64px apart on desktop, 40px on mobile. More space above a heading than below it.
- Listing pages: filter rail 264px at `lg` and up; filters in a bottom sheet below that.
- Product detail: media and purchase panel side by side at `lg`; the mill label (spec table) sits directly under the price, never in a collapsed accordion.
- All layouts mirror correctly in RTL (`start`/`end`, `ps`/`pe`, `rtl:` modifiers for arrows).

## Elevation & Depth

Cards sit on the board, so depth is physical and small.
- `shadow-card` (`--shadow-card`): resting card. A 1px edge plus a short soft shadow.
- `shadow-lift` (`--shadow-lift`): a card picked up on hover, popovers, menus, the fan deck.
- Nothing else casts a shadow. No glows, no coloured shadows, no glass panels.

## Shapes

- Cards and buttons: `rounded-md` (6px), like a die-cut card corner.
- Chips and small tags: `rounded-sm` (2px).
- Fully round only for avatars-as-photos and radio controls. No pill buttons, no pill search.
- The punched hole on a swatch tab is the only circle used as ornament.

## Components

### Buttons (`Button`, `buttonVariants`)
`primary` (ink), `signal` (cutter orange, one per viewport), `outline`, `ghost`, `inverse` (on dark bands). Sizes `sm` 36px, `md` 44px, `lg` 48px, `icon` 40px. Hover darkens; active nudges down 1px; focus shows a 2px orange outline.

### Swatch card (`SwatchCard`) — signature
White card, 28px stock-colour tab on top with an optional condensed-caps label and a punched hole at the end. Lifts on hover. Used for products (`ProductCard`), categories, collections, vendors and brands. A card's stock is its category's stock; vendor or brand cards use the stock of their main category.

### Mill label (`MillLabel`)
`table`: 2px ink top rule, condensed-caps keys, mono values right-aligned, hairline rows. Product detail, comparison, order lines. `inline`: compact mono chips for cards and lists. Values are wrapped in `<bdi dir="ltr">` so measurements read correctly in Arabic.

### Price tag (`PriceTag`)
Currency, amount in Archivo semibold, then `/ unit`. `from` for the lowest tier or variant (pass `fromLabel={t("from")}`). Struck-through compare-at price after. Every price names its unit when the product has one. The whole tag is bidi-isolated.

### Section head (`SectionHead`)
Archivo headline, optional one-line description below it, optional "View all" link with arrow at the end. No kicker or eyebrow above the heading: Impeccable's craft floor bans it outright.

### Stock chip (`StockChip`)
2px-radius square in a stock colour plus optional label. Category nav tabs, filters, breadcrumbs.

### Fan deck (`FanDeck`) — signature motion
The seven stocks fanned from one rivet; spreads on hover. Decorative. Use once per page at most: home hero, a category landing or an empty state.

### Inputs
Stock-white field, 1px ink border at 15% (35% on hover, 100% on focus), `rounded-md`, 44–48px tall. Labels above in body 13px medium, not placeholders. Errors in red text below with an icon.

### Navigation
Utility bar in binder black. Header on board with a white search field. Category tabs: text with a stock chip, a 2px stock-colour underline on hover and when active. Footer starts with the book's edge: a 6px strip of all seven stocks.

## Do's and Don'ts

### Do:
- Do put specs (GSM, thickness, size, width, length, finish) on cards and above the fold on product pages.
- Do show the supplier on every product card and product page.
- Do write prices with units: "AED 4.80 / sheet".
- Do use one stock colour per category consistently, everywhere.
- Do theme browser surfaces: selection, caret, focus ring and scrollbars come from the palette.
- Do respect `prefers-reduced-motion`; the fan and card lift turn off.

### Don't:
- Don't bring back beauty-era patterns: rituals, routines, scent stories, ingredients, "the look", "the verdict", "maison" styling, letter-spaced lowercase labels, serif display, cream grounds.
- Don't use pill-shaped buttons or search fields.
- Don't put a kicker, eyebrow or small caps label above a heading.
- Don't use gradients, glass or glows as decoration. The one exception is a dark scrim over photography for text legibility.
- Don't colour text, borders or icons in stock colours.
- Don't invent supplier counts, delivery times, ratings or testimonials.
- Don't show roadmap features (quantity tiers, sample SKUs, RFQ, business accounts) as working. Leave them out or mark them clearly as coming soon.
