# Catalog Import

## Color families

Use `group_name` and `group_attribute` on the Products sheet to link imported products into a color or shade family.

Rows with the same `group_name` become members of one product group for the vendor. `group_attribute` is the attribute slug that defines the family axis, such as `color`, and the shade for each product comes from that row's `attr.<group_attribute>` value.

The first row in the import for a group becomes the primary product. New groups use collapsed listing mode by default; adjust listing mode later in the dashboard if the family should list products individually. The grouping attribute must be marked groupable in admin and must be a select or color attribute.

```csv
external_id,name,category_slug,price,group_name,group_attribute,attr.color
LIP-RED,Velvet Lipstick Red,makeup,4900,Velvet Lipstick,color,red
LIP-PINK,Velvet Lipstick Pink,makeup,4900,Velvet Lipstick,color,pink
```
