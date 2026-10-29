# MaterialHub

MaterialHub is a multi-vendor ecommerce marketplace monorepo. This repository contains frontend apps, backend services, shared libs, bulk upload support, and deployment tooling.

## Documentation

- **[`docs/backend/`](docs/backend/README.md)** — backend engineering documentation: architecture,
  cross-cutting concerns, and a document per service covering every flow, the classes and files
  that implement it, and the known gaps. Start at
  [01 — Architecture](docs/backend/01-architecture.md).
- [`db-design/`](db-design/README.md) — the database schema mirror (178 tables, 87 enums).
- [`docs/runbooks/`](docs/runbooks) — operational runbooks.

## Remote access

To inspect a running MaterialHub host or perform remote maintenance, use the configured SSH alias:

```bash
ssh materialhub
```

## Bulk export / bulk upload

For bulk catalog uploads and inventory work, the product-service supports bulk jobs via `/bulk` endpoints.

Supported job types:

- `inventory_update`
- `catalog_import`
- `flash_deal_import`
- `flash_deal_delete`

Supported file formats:

- `csv`
- `xlsx`

The `catalog_import` job is the valid catalog bulk upload entry and supports product/variant import with rich fields including attributes, image URLs, inventory, and pricing.

For full details on the catalog bulk upload format, available columns, sample rows, and valid options, see:

- `backend/apps/product-service/src/bulk/README.md`
- Actual XLSX template download (includes the built-in `README` sheet): `GET /bulk/templates/catalog_import?format=xlsx`

