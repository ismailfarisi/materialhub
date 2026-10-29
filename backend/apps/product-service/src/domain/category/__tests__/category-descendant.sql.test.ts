import { describe, expect, test } from "bun:test";
import { categoryDescendantPredicate } from "../category-descendant.sql.ts";

describe("categoryDescendantPredicate", () => {
  test("references the caller's placeholder twice", () => {
    const sql = categoryDescendantPredicate(":categoryId");
    expect(sql.match(/:categoryId/g)).toHaveLength(2);
  });

  test("works with a positional placeholder too", () => {
    const sql = categoryDescendantPredicate("$3");
    expect(sql.match(/\$3/g)).toHaveLength(2);
    expect(sql).not.toContain(":categoryId");
  });

  test("matches the category itself as well as its descendants", () => {
    const sql = categoryDescendantPredicate(":categoryId");
    expect(sql).toContain("p.category_id = :categoryId");
    expect(sql).toContain("c.path LIKE");
  });

  // The trailing dot is what stops a parent 'beauty' from also matching a
  // sibling 'beauty-box'; `path || '%'` (the older storefront form) does not.
  test("anchors the descendant match on a path separator", () => {
    expect(categoryDescendantPredicate(":c")).toContain("parent.path || '.%'");
  });

  test("excludes soft-deleted categories from the descendant set", () => {
    expect(categoryDescendantPredicate(":c")).toContain("c.deleted_at IS NULL");
  });

  test("honours a non-default product alias", () => {
    const sql = categoryDescendantPredicate(":c", "prod");
    expect(sql).toContain("prod.category_id = :c");
    expect(sql).not.toContain("p.category_id");
  });
});
