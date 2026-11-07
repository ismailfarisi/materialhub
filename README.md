# MaterialHub UAE

MaterialHub UAE is a multi-vendor marketplace for packaging and craft materials in the UAE: papers and boards, PU leather and fabrics, hinges and fittings, adhesives and foils, boxes and ribbons for trade buyers, plus decoration items, paper samples and craft supplies for retail customers.

The monorepo holds the ElysiaJS backend (one process, `backend/apps/api`, that runs every backend module), the Next.js storefront, vendor dashboard and admin panel, shared libraries and deployment tooling. See [CLAUDE.md](CLAUDE.md) for the layout, commands and rules.

## Documentation

- [`docs/backend/`](docs/backend/README.md): backend engineering documentation, one document per module.
- [`docs/runbooks/`](docs/runbooks): operational runbooks.

## Bulk catalogue upload

The product module supports bulk jobs via `/bulk` endpoints: `inventory_update` and `catalog_import`, as CSV or XLSX. For the catalogue upload format see `backend/apps/product-service/src/bulk/README.md` or download the template: `GET /bulk/templates/catalog_import?format=xlsx`.
