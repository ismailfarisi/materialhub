# @materialhub/ui

The official component library for the MaterialHub ecommerce platform. Built with React, Tailwind CSS, and TypeScript following the MaterialHub UAE design system with warm earth tones and elegant typography.

## Design Philosophy

MaterialHub UAE embraces warmth, elegance, and cultural resonance through:

- **Warm Earth Tones**: Rich ambers, terracottas, and warm stones instead of cool grays
- **Elegant Typography**: GF Alada Arabic font for authentic Middle Eastern typography
- **Purposeful Color**: Semantic colors for status, actions, and feedback
- **Refined Interactions**: Smooth transitions and meaningful hover states

## Installation

```bash
bun add @materialhub/ui
```

### Peer Dependencies

```json
{
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "tailwindcss": "^3.4.0",
  "@phosphor-icons/react": "^2.1.0"
}
```

## Tailwind Configuration

Add the MaterialHub UAE color palette to your `tailwind.config.js`:

```js
import { fontFamily } from "tailwindcss/defaultTheme";

module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef7e0',
          100: '#fdeeca',
          200: '#f9dfa0',
          300: '#f3cf6c',
          400: '#eebd35',
          500: '#e8b11a',
          600: '#e2a70d',
          700: '#da8f12',
          800: '#d27815',
          900: '#c45b15',
          950: '#873d0d',
        },
        stone: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
          950: '#0c0a09',
        },
      },
      fontFamily: {
        sans: ['var(--font-ge-droid-arabic)', ...fontFamily.sans],
      },
    },
  },
};
```

## Component Categories

### Dashboard Components

#### DataTable
Responsive data tables with sorting, filtering, and pagination.

```tsx
import { DataTable } from "@materialhub/ui";

const columns = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span>{row.original.name}</span>,
  },
];

<DataTable columns={columns} data={items} isLoading={false} />
```

#### StatusBadge
Semantic status indicators with appropriate colors.

```tsx
<StatusBadge status="active" />  // Green for active
<StatusBadge status="pending" /> // Amber for pending
<StatusBadge status="rejected" /> // Red for rejected
```

#### StatCard
Display key metrics with trend indicators.

```tsx
<StatCard
  title="Total Orders"
  value="1,234"
  change="+12.5%"
  trend="up"
  icon={ShoppingCart}
/>
```

#### EmptyState
Consistent empty states with optional actions.

```tsx
<EmptyState
  icon={Package}
  title="No products found"
  description="Get started by creating your first product."
  action={{ label: "Add Product", onClick: handleClick }}
/>
```

### Form Components

#### Input
Enhanced input with focus states using MaterialHub UAE primary color.

```tsx
<Input
  placeholder="Enter product name"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

#### RichEditor
WYSIWYG editor with toolbar for rich text content.

```tsx
<RichEditor
  content={html}
  onChange={setHtml}
  placeholder="Write product description..."
/>
```

#### ImageUploader
Multi-image upload with drag-to-reorder functionality.

```tsx
<ImageUploader
  images={images}
  onUpload={handleUpload}
  onRemove={handleRemove}
  onReorder={handleReorder}
  maxImages={10}
  isUploading={false}
/>
```

### Filter Components

#### CheckboxFilter
Multi-select filter with checkboxes.

```tsx
<CheckboxFilter
  label="Categories"
  options={categories}
  selected={selected}
  onChange={setSelected}
/>
```

#### RangeFilter
Price range slider filter.

```tsx
<RangeFilter
  label="Price Range"
  min={0}
  max={1000}
  value={[100, 500]}
  onChange={setValue}
/>
```

#### ColorSwatchFilter
Visual color selection filter.

```tsx
<ColorSwatchFilter
  label="Color"
  options={colors}
  selected={selected}
  onChange={setSelected}
/>
```

### UI Primitives

#### Button
Primary action button with variants.

```tsx
<Button variant="default" size="md">
  Save Changes
</Button>

<Button variant="outline" size="sm">
  Cancel
</Button>

<Button variant="ghost" size="icon">
  <X size={16} />
</Button>
```

#### Dialog
Modal dialogs for focused interactions.

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Action</DialogTitle>
    </DialogHeader>
    <p>Are you sure you want to proceed?</p>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleConfirm}>
        Confirm
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Color Usage Guidelines

### Primary Actions
Use `bg-primary` for primary actions and CTAs.

```tsx
<button className="bg-primary text-primary-foreground hover:bg-primary/90">
  Add to Cart
</button>
```

### Interactive States
Use `amber-50/amber-700` for hover and active states.

```tsx
<div className="hover:bg-amber-50 hover:text-amber-700 transition-colors">
  Interactive Item
</div>
```

### Neutral Text
Use `stone-*` for neutral text instead of `gray-*`.

```tsx
<h1 className="text-stone-900">Heading</h1>
<p className="text-stone-600">Body text</p>
<span className="text-stone-400">Muted text</span>
```

### Semantic Colors
- **Success**: `green-*` for success states
- **Warning**: `amber-*` for warnings and pending states
- **Error**: `red-*` for errors and destructive actions
- **Info**: `stone-*` for neutral information

## Icons

We use [Phosphor Icons](https://phosphoricons.com/) throughout the component library.

```tsx
import { ShoppingCart, MagnifyingGlass, X } from "@phosphor-icons/react";

<ShoppingCart size={20} weight="regular" />
<MagnifyingGlass size={16} weight="bold" />
<X size={14} weight="fill" />
```

## Accessibility

All components follow WCAG 2.1 AA standards:

- Keyboard navigation support
- Proper ARIA labels and roles
- Focus indicators with primary color
- Sufficient color contrast ratios
- Screen reader friendly markup

## TypeScript Support

Full TypeScript support with exported types:

```tsx
import type { DataTableColumn, FilterOption, UploadedImage } from "@materialhub/ui";
```

## Storybook

Explore components interactively (coming soon):

```bash
bun run storybook
```

## Contributing

When adding new components:

1. Follow the MaterialHub UAE color palette
2. Use stone colors for neutrals
3. Add warm tones for interactive states
4. Include TypeScript types
5. Export from `src/components/index.ts`
6. Add usage examples to this README

## License

MIT © materialhub
