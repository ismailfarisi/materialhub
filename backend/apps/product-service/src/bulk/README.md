# MaterialHub Product Service Bulk Jobs

This directory contains the bulk upload implementation for MaterialHub product management.

## Supported bulk job types

- `inventory_update` — update stock levels by SKU or external ID
- `catalog_import` — import/update products, variants, starting inventory, attributes, and images

## Supported file formats

- `csv`
- `xlsx`

## Bulk upload API overview

The product-service exposes the following bulk endpoints under `/bulk`:

- `POST /bulk/uploads/initiate` — create a bulk upload job and get an upload URL
- `POST /bulk/jobs/:id/start` — start processing an uploaded bulk file
- `POST /bulk/jobs/:id/cancel` — cancel an in-flight job
- `GET /bulk/jobs` — list bulk jobs
- `GET /bulk/jobs/:id` — bulk job status and summary
- `GET /bulk/jobs/:id/error-report` — download row-level error report
- `GET /bulk/jobs/:id/changes` — view diff log for changes made by the job

## Catalog import template: available options

The `catalog_import` job is the valid catalog bulk upload entry.
It expects an Excel workbook whose first sheet is a built-in README page, followed by:

- `README` (embedded inside the workbook)
- `Products`
- `Variants`

The generated template includes this README sheet with the following metadata and instructions:

- `Template: catalog_import`
- `Catalog import: upload products + variants + inventory seed + attributes + image URLs.`
- `Strictness: best-effort. Invalid rows are skipped; valid rows are imported. Download the error report after the job completes to see skipped rows.`
- `Upsert key: external_id (preferred) or sku (scoped per vendor). If both present, external_id wins.`
- `Variants sheet references products via product_external_id OR product_sku.`
- `Attributes: use attr.<slug> columns for non-variant attributes and option.<slug> for variant-defining ones. Value must be the attribute_value slug (case-insensitive).`
- `Images: put pipe-separated URLs in image_urls. Products land immediately; images process asynchronously.`
- `For products with variants, leave initial_quantity on the Products sheet blank — set it per variant on the Variants sheet.`

You can download the actual generated template from the running product service:

```bash
GET /bulk/templates/catalog_import?format=xlsx
```

### Products sheet

Required columns

- `name`
- `category_slug`
- `price`

Optional columns

- `external_id`
- `sku`
- `slug`
- `description`
- `brand_slug`
- `status` — one of `draft`, `pending_review`, `archived` (going live needs MaterialHub approval, then Publish in the dashboard; an import never demotes an approved or published product)
- `compare_at_price`
- `cost_price`
- `currency`
- `has_variants` — `true` / `false`
- `track_inventory` — `true` / `false`
- `allow_backorder` — `true` / `false`
- `requires_shipping` — `true` / `false`
- `weight_grams`
- `barcode`
- `mpn`
- `tags` — pipe-separated, e.g. `kraft|wrapping`
- `meta_title`
- `meta_description`
- `meta_keywords`
- `image_urls` — pipe-separated URLs
- `initial_quantity` — only for simple products (leave blank for products with variants)
- `attr.<slug>` — non-variant attribute columns, where value is the attribute_value slug

### Variants sheet

Optional columns

- `product_external_id` or `product_sku` — parent product reference
- `variant_external_id`
- `variant_sku`
- `name`
- `option.<slug>` — variant option columns; value is the attribute_value slug
- `price`
- `compare_at_price`
- `cost_price`
- `weight_grams`
- `length_cm`
- `width_cm`
- `height_cm`
- `barcode`
- `is_active`
- `sort_order`
- `initial_quantity`
- `image_urls`

### Notes

- Upsert key is `external_id` if provided, otherwise `sku` scoped to the vendor.
- For products with variants, leave `initial_quantity` on the Products sheet blank and set it per variant on the Variants sheet.
- Variant rows must reference the parent product by `product_external_id` or `product_sku`.
- `attr.<slug>` columns map to non-variant attribute values.
- `option.<slug>` columns map to variant-defining attribute values.
- Images are processed asynchronously when provided via `image_urls`.

## Example valid catalog bulk upload rows

The actual `catalog_import` XLSX template includes the full column set shown above, with sheet names exactly `Products` and `Variants`.

### Products sheet example

```csv
external_id,sku,name,slug,description,category_slug,brand_slug,status,price,currency,has_variants,track_inventory,allow_backorder,requires_shipping,weight_grams,barcode,mpn,tags,meta_title,meta_description,meta_keywords,image_urls,initial_quantity,attr.color,attr.material
ERP-1001,BC-LIN-PARENT,Linen Book Cloth Red,linen-book-cloth-red,Paper-backed linen for case binding.,linen-book-cloth,,draft,9900,AED,true,true,false,true,180,1234567890123,BCLIN123,linen|binding,Linen Book Cloth Red,Paper-backed linen book cloth for case binding,red|linen,https://cdn.example.com/img1.jpg|https://cdn.example.com/img2.jpg,,red,linen
```

### Variants sheet example

```csv
product_external_id,product_sku,variant_external_id,variant_sku,name,option.color,option.roll-width,price,compare_at_price,cost_price,weight_grams,length_cm,width_cm,height_cm,barcode,is_active,sort_order,initial_quantity,image_urls
ERP-1001,BC-LIN-PARENT,ERP-1001-RED-100,BC-LIN-RED-100,Red / 100 cm roll,red,100cm,9900,12900,6500,180,30,25,1,1234567890124,true,1,25,https://cdn.example.com/img1.jpg
```

## Remote access

If you need to inspect a deployed MaterialHub host for bulk export or other maintenance, connect using:

```bash
ssh materialhub
```

From there, you can review bulk job state, logs, and uploaded files on the remote host.

### Google Drive folder URLs in catalog import

Vendors can paste a Drive folder share URL (e.g. `https://drive.google.com/drive/folders/ABC123`) into the `image_urls` column instead of listing individual file URLs. The importer lists folder contents via Drive API v3 and emits one image-fetch task per image file in **alphabetical filename order**.

Requirements:

- Folder must be shared as **"Anyone with the link can view"** (we use a public API key — service-account access is not supported).
- `GOOGLE_DRIVE_API_KEY` must be set on the worker. Without it, folder URLs fail with `drive_api_not_configured`.
- Only direct children are listed (no subfolder recursion). Vendors with nested layouts paste one folder URL per row.
- Folder + file URLs can be pipe-mixed: `https://drive.google.com/drive/folders/ABC|https://cdn.x/extra.jpg`.

### postimg.cc gallery URLs in catalog import

Vendors can paste a postimg gallery share URL (e.g.
`https://postimg.cc/gallery/S4qPzNn`) into the `image_urls` column. The importer
fetches the gallery page and emits one image-fetch task per image in **gallery
display order**, using each image's full-resolution direct link
(`data-pswp-src` → `https://i.postimg.cc/...`).

- No API key or account is required — postimg has no public API, so we extract
  the direct links from the gallery page HTML.
- Direct `https://i.postimg.cc/...` URLs also work and can be pipe-mixed with
  gallery, Drive, and plain URLs in one cell.
- Only images rendered on the gallery page are resolved. If postimg ever
  paginates or lazy-loads a very large gallery, later images may not resolve —
  paste direct `i.postimg.cc` links for those.
- Extraction depends on postimg's `data-pswp-src` markup; if postimg changes it,
  expansion fails loudly (fixture-tested) and direct links remain the fallback.

Failure codes (surfaced in the error report):

| Code | Cause |
|---|---|
| `drive_api_not_configured` | No `GOOGLE_DRIVE_API_KEY` set |
| `drive_folder_not_found` | Drive returned 404 (bad ID or deleted folder) |
| `drive_folder_inaccessible` | Drive returned 403 (folder not public) |
| `drive_api_error` | 429 / 5xx / network error — retry by re-uploading |
| `postimg_gallery_not_found` | postimg returned 404 (bad ID or deleted gallery) |
| `postimg_gallery_inaccessible` | postimg returned 403 (gallery not public) |
| `postimg_gallery_empty` | Gallery page fetched but contained no images |
| `postimg_fetch_error` | Timeout / network / other non-2xx — retry by re-uploading |
