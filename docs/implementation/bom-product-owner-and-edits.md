# Product BOM ownership and edits

## Implemented behavior

The standalone Create BOM form requires an explicit product selection. BOM Name
appears first, Product for this BOM second, followed by Clone Existing Recipe
and Engineering Change Order / Revision Scope. The selected product ID is sent
with the new BOM request. The form no longer silently assigns the first product
in the catalog. A product passed through the page URL can preselect the field.

In the product and material editor, a saved BOM keeps its ID and name when its
quantity or component lines change. Both the BOM toolbar's Save Changes action
and the parent item Save action use `PATCH /api/v1/bom-versions/:id` for saved
BOMs. New recipes use `POST /api/v1/bom-versions`. Appending lines from another
BOM while editing a saved BOM updates the selected BOM; the source remains
unchanged. A successful product-side update shows a BOM Updated toast.

The client checks that the selected BOM belongs to the item before submitting
an update. The API continues to validate lines, name conflicts, permissions,
and BOM lifecycle state. Existing database relationships require no migration.

The BOM registry is ordered by last update time, newest first, including
edits to its name or recipe. Create and edit forms check BOM name availability
while the admin types. The check is case insensitive across BOM records; the
API also rejects a conflicting name during save. Historical duplicate names
remain unchanged until explicitly edited.

The detail page's Attached Product summary comes from the BOM's direct
`productId` relationship. It does not count other products whose recipes use
that product as a component. A BOM record has one direct parent product,
while that product may own multiple BOMs.

## Manual checks

1. Edit an existing product BOM's quantity, save, and confirm its ID and name
   stay the same and its line quantity changes.
2. Add a material, remove a material, and append lines from a different BOM
   while editing an existing BOM. Confirm the selected BOM updates in place,
   its source BOM is unchanged, and the success toast appears.
3. Save product details with an unsaved BOM line change. Confirm the same BOM
   ID is updated and the BOM Updated toast appears.
4. Choose New Blank BOM, save a recipe, and confirm a distinct BOM ID is
   created for that product.
5. Open Create BOM without a product and try to save. Confirm the Product
   field shows an error. Choose a product, save, and confirm the new BOM is
   listed for that product.
6. Enter the name of another BOM in Create BOM and Edit Formula. Confirm the
   inline error appears before saving, including when only letter case differs.
   Try saving anyway and confirm the duplicate is rejected.
7. Edit an older BOM and return to the registry. Confirm it appears first and
   its Last Updated value reflects the edit.
8. Open a BOM whose target product is also used as a component in another
   product's recipe. Confirm Attached Product shows only the direct owner.
