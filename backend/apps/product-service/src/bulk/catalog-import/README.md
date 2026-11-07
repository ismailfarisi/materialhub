# Catalog Import

## Color families

Use `group_name` and `group_attribute` on the Products sheet to link imported products into a colour family.

Rows with the same `group_name` become members of one product group for the vendor. `group_attribute` is the attribute slug that defines the family axis, such as `color`, and the colour for each product comes from that row's `attr.<group_attribute>` value.

The first row in the import for a group becomes the primary product. New groups use collapsed listing mode by default; adjust listing mode later in the dashboard if the family should list products individually. The grouping attribute must be marked groupable in admin and must be a select or color attribute.

```csv
external_id,name,category_slug,price,group_name,group_attribute,attr.color
BC-RED,Linen Book Cloth Red,linen-book-cloth,4900,Linen Book Cloth,color,red
BC-NAVY,Linen Book Cloth Navy,linen-book-cloth,4900,Linen Book Cloth,color,navy
```
