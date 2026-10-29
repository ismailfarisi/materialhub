/**
 * The "this category, or anything filed beneath it" predicate, in one place.
 *
 * Two call sites need it and they MUST agree: the admin product list
 * (ProductService.adminList) and the product export (buildProductWhere), because
 * the admin panel hands the list's on-screen filters straight to the export. When
 * they disagreed, filtering to a parent category showed hundreds of products and
 * downloaded a handful — the list matched descendants and the export did not.
 *
 * They can't share a parameter style: the list builds a TypeORM QueryBuilder with
 * `:named` bindings, the export assembles raw SQL with `$n` positional ones. So
 * the caller passes its own placeholder and binds the category id itself. The
 * placeholder is referenced TWICE, which matters for the positional caller — bind
 * the value once and pass the same `$n` string.
 *
 * Descendants are matched on the materialized `categories.path` (a dot-joined
 * slug chain, e.g. `beauty.skincare.serums`). The trailing `.` in `'.%'` is
 * load-bearing: a bare `path || '%'` also matches sibling categories whose slug
 * merely starts with the parent's, so `beauty` would drag in `beauty-box`.
 *
 * @param placeholder the caller's bound-parameter token, e.g. `":categoryId"` or `"$3"`
 * @param productAlias the products table alias used in the surrounding query
 */
export function categoryDescendantPredicate(placeholder: string, productAlias = "p"): string {
  return `(${productAlias}.category_id = ${placeholder} OR ${productAlias}.category_id IN (
     SELECT c.id FROM categories c
     WHERE c.deleted_at IS NULL
       AND c.path LIKE (SELECT parent.path || '.%' FROM categories parent WHERE parent.id = ${placeholder})
   ))`;
}
