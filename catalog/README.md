# Adding a catalog item

Add one `.ts` definition file under `catalog/furniture/` or `catalog/objects/`.
The registry discovers these files automatically; no central list or scene
switch needs updating.

Each file exports a `definition` satisfying `CatalogItemDefinition`. It holds
the English and German label, catalog icon and dimensions, its 2D SVG shapes,
and a `createScene` function for the 3D model. Keep 2D shape coordinates centered around `(0, 0)`;
the planner positions and rotates the group. 3D dimensions passed to
`createScene` are in meters. Use the shared `box` and `addLegs` helpers where
useful.

The filename becomes the item kind, and the parent folder determines whether
it is furniture or an object. Set `section` to `catalog` or `wall-details`.
Wall details also set `wallDetailCategory` and `wallMounted`.
Definitions can customize wall placement, default floor height, wall-snap side,
and saved-plan migration when needed. See `chair.ts` for a furniture example
and `window.ts` for a wall-detail example.

Floor materials are discovered from `catalog/floormaterials/*.json`. Each JSON
file defines a material type, its English and German label, a render pattern,
its default tile size in centimeters, row offset percentage, seam width, and
available named tints. Room-specific tile size and row offset are saved with
the plan. Both plan and 3D views use the same generated geometry and repeat size.
