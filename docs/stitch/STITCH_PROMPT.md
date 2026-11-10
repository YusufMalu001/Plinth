# Stitch prompt: Synergy item creation and product detail

Copy the prompt below into Google Stitch. Import the companion `DESIGN.md` as the project's design system and attach the four current-page screenshots supplied with this request. The screenshots document the existing shell, data, and pain points; generate a new layout instead of tracing them.

---

Design **two connected, responsive, high-fidelity desktop web screens** for the existing **Synergy International ERP**: **Create Inventory Item** and **Product Detail**. Include responsive tablet/mobile versions or clear responsive behavior. These screens belong to the existing Inventory area of an operational platform for catalog, manufacturing, procurement, pricing, and warehouse staff. Follow the attached `DESIGN.md` exactly for brand tokens, typography, density, and component rules. The previous Stitch output felt generic, gray, and crowded with boxes. Make this a fresh design exploration with stronger visual judgment, while staying inside the real Synergy brand and preserving all functions.

**Brand fidelity is a strict requirement:** use the **same Amazon Ember font** used throughout the current Synergy platform (the correct name is *Amazon Ember*, not “Amazon Amber”). Keep Amazon Ember on headings, body text, labels, buttons, inputs, tables, and numeric data. Do not replace it with Inter, Roboto, Poppins, Manrope, or a stylized display font. The exact light-theme foundation is **white `#FFFFFF` page background and surfaces**, dark neutral charcoal text (`--foreground: oklch(0.250 0 0)`), quiet neutral borders (`--border: oklch(0.920 0 0)`), Synergy blue `#004A80` for primary actions and active states, hover blue `#003C68`, and pale blue `#F0F7FC` for sparing selected/informational surfaces. Dark-mode brand blue is `#2685C4`. Green, amber, and red appear only for semantic states. Match the supplied Synergy shell, logo, spacing, and color balance. Do not create a gray page background, gray cards, blue-gray type everywhere, gradients, unrelated accents, or a new brand identity.

## Primary design goal

Make a dense operational workflow understandable at first glance while keeping **every real field, action, data relationship, and state below**. Think creatively like an experienced product designer: find a distinctive reading rhythm with type, white space, alignment, asymmetric columns, subtle rules, and a restrained Synergy-blue accent. The page should look designed, not merely simplified. The current create page feels cluttered because it uses many heavy boxes within boxes and gives every section the same visual weight. **Do not recreate the current screenshot's nested cards or replace them with another stack of identical cards.** Also do not use a second full-height sidebar for form sections, a forced one-step-at-a-time wizard, decorative capsules, blue numbered blocks on every section, gradients, fabricated marketing copy, or fake analytics. Preserve the Synergy app's main left sidebar and top bar.

### Visual direction to explore, not a rigid wireframe

- Start with a clean white canvas. Use Synergy blue for the active Inventory state, primary Create/Edit action, selected in-page section or tab underline, focus, and a few high-value links. Use dark charcoal for content. Limit gray to borders and genuinely secondary text. When zoomed out, the screen should read as white + charcoal + purposeful blue, **not gray**.
- Give the create page an editorial form structure: a concise page header; a slim, scannable section index; then clear sections separated mainly by space and single horizontal rules. Let section headings create a left visual anchor. Use a 12-column grid or equivalent to align labels, controls, media, and tables. At wide widths, make identity fields roughly two-thirds of the first region and the media editor the remaining third. Subsequent sections should change shape according to their content: tax as one efficient row, route as an ordered workflow list, technical parameters as simple paired rows, BOM and variants as wide tables. Do not wrap each subsection in its own gray panel.
- Give the product detail page a composed hero: contain-fit image gallery on one side; name, taxonomy, price/stock context, and saved facts on the other. Present the five key metrics as a shared band or aligned typographic row with thin dividers, never as five colored metric cards. Below, use a precise tab underline and let tables, definition lists, and real imagery provide the variation.
- Use purposeful spacing rather than inflated empty boxes. Keep operational density where comparison matters. Numeric values should align, calculated values should read differently from editable inputs, and read-only detail values should look like facts rather than disabled form controls. One primary action per context. A quiet persistent save area is acceptable if it helps with the long creation form.
- Before choosing a design, make at least **two genuinely different layout explorations** using the same fields and colors. Reject any composition that looks like a generic AI admin dashboard, a stack of rounded cards, or a gray-on-gray wireframe. Choose the direction with the clearest scanning path and strongest visual hierarchy. Show the selected direction as the final high-fidelity screens.

The output is a **visual UI proposal**, not a new domain model. Do not change business rules, APIs, formulas, field names, or navigation destinations. In a mockup, represent functional controls as usable controls and include the states described below. Use labels in this brief instead of inventing text. Use `—` or an honest empty state where real record data is unavailable. Currency is Indian rupees, quantities respect UOM, and timestamps use an Indian-style date/time presentation.

## Shared platform shell and visual identity

- Keep the Synergy logo/wordmark at the top of the existing **white left navigation sidebar**. The Inventory navigation group is active, with Inventory Items, Pricing Masters, Categories, Units of Measure, and BOM visible under it. Other platform navigation may be represented more quietly. Keep the thin top bar with notifications and an Admin account control. The existing desktop screenshots are about 1920 × 1080 with the sidebar around 248 px wide.
- Existing light theme: primary brand blue **`#004A80`**, primary hover **`#003C68`**, **white page background and content surfaces**, pale brand accent **`#F0F7FC`** for selected areas only, neutral charcoal text, and fine neutral borders. Existing dark mode uses dark neutral surfaces and primary **`#2685C4`**. **Amazon Ember is the platform font for all UI and data text.** Preserve it in the design specification and exported code even if Stitch needs a temporary preview fallback.
- Visual emphasis comes from content, not from decoration. One strong page title, smaller section titles, persistent field labels, one primary action per context. Clear 40–44 px inputs and restrained 4–8 px corners. Avoid heavy shadows, repeated outlined cards, unnecessary icons, faux status badges, and unsupported prose.
- Make keyboard focus, invalid fields, disabled selectors, loading, empty tables, image preview, and successful draft-save states apparent. Do not rely on color alone for a status.

## Screen 1: Create Inventory Item

### Entry, header, and page-level controls

Route context is `/products/new`. Show breadcrumb **Inventory → Create Inventory**; a category/subcategory breadcrumb can appear if creation began from a filtered catalog. Header title is **Create Inventory**. Preserve **Back to Inventory** and **Reset** actions. When a user has typed a custom SKU, it may be shown in header metadata. When local auto-save has occurred, show a quiet **Draft auto-saved** status. If a prior draft is restored, show a concise notice with the saved date/time and **Discard Draft** and **Dismiss** actions. Reset and discard are separate actions.

The current page has **All Sections** and seven section filters. A redesigned compact section navigation may jump/filter without hiding discoverability or implying a mandatory wizard. The default experience should let a user see the form structure. Each section may collapse/expand. Keep the final **Cancel** and **Create Inventory** actions clear; on edit the same workspace uses **Edit Inventory**, **Update Inventory**, and edit-specific values.

### 1. Identity, classification, description, media

Group the core fields first. Preserve:

- **Product Name / Material Name** (required; label depends on category/item classification), free text.
- **Material Code / SKU**, free text; auto-generated codes may exist, custom codes are possible. Preserve validation/error space.
- **Category** (required), selector with `+ New` to create a category inline.
- **Sub Category** (required after a category is selected), dependent selector with `+ New`; before category selection it must have a disabled/choose-category-first state.
- **Amazon ASIN**, optional uppercase text, and **Global EAN-13 Barcode**, optional text.
- **Product Description & Scope / Material Description & Scope**, multiline textarea. Existing quick insertion actions are **+ Dimensions**, **+ Material Grade**, and **+ Key Features**; keep them unobtrusive and clearly attached to the textarea.
- **Commercial Codes & Custom Marketplace Tags**, repeatable name/value pairs; **Add Identifier** and remove-row controls. Typical identifiers include marketplace FSN or color code, but use neutral placeholders rather than populated fake records.
- **Special Presets** opens an existing preset dialog. Treat it as a secondary contextual action, not the main purpose of the page.

Place **Product Media** beside identity fields on roomy desktop widths and in reading order on narrow widths. Preserve click/drag-drop upload, PNG/JPG/WEBP/SVG guidance, **10 MB per file**, **12 photos maximum**, current saved images in edit mode, newly selected thumbnails, remove image, set a photo as cover, and first-uploaded-cover behavior. Show a compact empty upload state and a distinct selected-cover state. Do not make the upload region a stack of decorative frames.

### 2. Pricing, customer tiers, tax

Preserve the existing **Base Catalog Pricing** field: label is **Cost Price** for a raw-material context, otherwise **Maximum Retail Price (MRP)**. This is the item's overall base value, separate from pricing-master tiers. Keep the **Customer Pricing Tiers Matrix** with a **Choose Pricing Master** selector and **Open pricing master setup** link. It supports an empty state and **Add Tier**. Columns: **Customer Tier**, **Price (₹)**, **Tier Discount (%)**, **Applied Price (₹)**, and a remove action. Applied Price is calculated from that row's Price minus that row's discount, not from the overall Cost Price/MRP. There is no per-tier Default Cost field. Distinguish calculated values visually from editable fields. If a pricing master has custom fields, show its repeatable **Pricing column / Pricing value** rows without hiding them.

Tax row fields are **HSN / SAC Code** (required searchable selector with code/description), **Taxability** (required: Taxable, Exempt, Nil Rated, Non-GST), **GST Rate (%)** (required when taxable; current choices 18%, 12%, 28%, 5%), and **Product Type** (required: Goods or Services). A selected HSN description may appear as supporting text. Dependent tax states must look deliberate, with fields disabled/hidden as appropriate. Do not alter the existing tax choices in the visual specification.

### 3. Production routing and schedule

Preserve **search existing route**, **Open production route setup**, and, when applicable, **Production Route Name**. The user can add, reorder, and remove route steps. Each step has a visible **sequence**, **Operation / Step Name**, **Assigned Department**, **standard duration in minutes**, and a remove control. Include **Add Step** and **Clear All**. Existing keyboard shortcuts are Ctrl/Cmd+Alt+R for route and Ctrl/Cmd+Alt+Enter for adding a step; if shown, use subtle help text. Show a simple empty state instead of a large blank outlined box.

### 4. Technical specifications

Preserve **Custom Technical Parameters** as repeatable **attribute name / parameter value** rows, with **Add Attribute** and remove. Examples in placeholders may include steel grade, pipe diameter, load capacity, AISI grade, or dimensions, but do not populate fabricated product claims. Some product metadata also contains physical dimensions, folded profile, weights, surface finish, and related specifications; the detail view must display available saved values. Design this as a readable label/value area, not mini-cards for every attribute.

### 5. Inventory and stock planning

Preserve **Unit of Measure** (required searchable multi-select, where the first selection is the base UOM and later selections are additional UOMs), `+ New` inline UOM creation, **Opening Stock**, and **Safety Buffer (Min)**. Quantity inputs use decimal precision only when the selected UOM permits fractions; whole-number UOMs must reject fractional values. Leave room for inline validation. The internal form model also stores reorder point, target maximum stock, and lead time, but the present create UI visibly exposes only the fields named above; **do not fabricate extra visible inputs** unless marked as an optional design extension.

### 6. Bill of materials (BOM formulation)

Preserve an existing-BOM selector/auto-feed control, **Open BOM setup**, optional **BOM Name** (auto-generated when blank), the saved BOM list, editing/switching a saved BOM, and **Save & Add Another BOM**. One item may have multiple BOM recipes. The current recipe editor shows a clear count of lines and a table with **sequence/reorder handle**, **Item**, **Required Qty**, **Unit of Measure**, **Avg Rate (₹)**, **Engineering Notes**, and remove action. Support item search across categories and variant selection. Preserve **Add Item Line**, **Clear All**, and calculated **Total Cost**. Distinguish unsaved lines, linked existing BOMs, and the currently edited saved BOM. Quantity, UOM compatibility, and valid item selection can show inline errors. Make the table usable at desktop width and horizontally scrollable on mobile.

### 7. Measurement variants

Preserve **Add Variant** and **Clear All**. The editable matrix has **Variant Name** (required for a nonblank row), **Specification / Type**, **SKU Code** (optional), **Opening Stock** in the item's UOM, **Min Stock**, **Rate / MRP (₹)**, and remove. Variants may have additional stored UOM/reorder/custom data even if not all are exposed in this matrix. Show a genuinely blank state and a realistic one-row editable state without invented commercial values.

### Create behavior and states to represent

Draft auto-save/restoration, create/edit modes, category-dependent subtype, inline creation dialogs for category/subcategory/UOM, dynamic repeated rows, media previews and cover, pricing master import, route selection and step ordering, BOM auto-feed and multiple recipes, variant rows, field errors with focus/scroll to the relevant section, submit progress, and success/error feedback. Create and edit already connect to real backend data; the design must accommodate those behaviors rather than replacing them with new ones. Do not add a new approval process.

## Screen 2: Product Detail

Route context is `/products/[id]`. The product detail page uses the same platform shell and currently shares a workspace with material details; the requested mockup should depict a **product** record. Show breadcrumb **Inventory → Category → Sub Category → Product Name**, omitting missing category levels. Header controls: **Back**, **Barcode**, and primary **Edit Item**. `Submit for Review` exists only for a draft **material** record; do not show it in the standard product mockup. Barcode opens a **Code-128 warehouse/bin label** modal with print behavior.

### Product identity and hero

Show the real item name as the primary heading. A quiet metadata line includes item classification/category, sub-family when present, base UOM with symbol, and HSN/SAC code when present. Do not create an oversized SKU or ACTIVE capsule; the current detail page deliberately avoids that. Use a product image gallery on the left or in an equivalent strong visual position: one contain-fit main image, previous/next when multiple images, thumbnail strip, zoom on click, image count, and a clean no-image state. Keep images fully visible instead of cropping product diagrams.

Adjacent or immediately below, present the five existing key metrics: **Valuation Rate / Selling Rate / Standard Rate** according to available data, **Available Stock** (with on-hand and reserved context), **Safety & Reorder** (min and optional max), **HSN / SAC Code**, and **GST / Tax Slab**. Numbers use Indian currency formatting and the item UOM. Include **Description & Scope** when present and a compact **Physical & Engineering Attributes** list when present: material grade/steel grade, dimensions, pipe diameter, thickness, load capacity, surface finish, net weight, gross weight, packaging type, units per carton, and procurement lead time. Do not show an attribute with no saved value.

### Five existing detail tabs

1. **Overview & Specifications:** a **Configured Variants Matrix** with Variant Name, Measurement / Spec, Opening Stock, Safety Buffer, and Standard Rate. Then saved **Technical Parameters & Metallurgy** name/value pairs and **Commercial & Custom Business Identifiers** name/value pairs, only when present. Include a clear no-variants state.
2. **Manufacturing & BOM:** show linked BOM recipes/versions, switch between them when more than one exists, **View BOM details**, and the BOM lines table: Item Name, Required Qty, UOM, Unit Rate (₹), Line Total (₹), plus total BOM cost. Under it, show **Production Route Operations**: route name, **View route details**, ordered steps with department and duration. Include honest empty states if no BOM or route is configured.
3. **Inventory & Ledger:** summary values **Total On-Hand**, **Allocated / Reserved**, **Available to Pick**, and **Total Stock Valuation** when meaningful. **Stock Balances** table has Item, On Hand, Reserved, Available, including item variants when present. **Stock Movement Audit Trail** table has Timestamp, Item, Movement Type, Reference Document, Quantity Delta, and Balance After; documents can link to their source. Keep the **Parent Ledger** link. The ledger is read-only transaction history.
4. **Pricing Master:** show Benchmark Selling Rate, Assigned Pricing Master, and GST & Tariff Slab. **Customer Pricing Tiers Matrix** columns: Customer Tier, Tier Benchmark Price (₹), Tier Discount (%), Applied Price (₹), Benchmark Realization, Status. Applied Price uses each tier's own benchmark price and discount. Do not show a per-tier Default Cost column. Keep **Edit Tiers** where a master is linked and show saved custom pricing rules/attributes when present. Use an empty tiers state when no tiers exist.
5. **Sourcing & Vendors:** summary **Valuation Rate**, **Approved Vendors**, **lowest supply rate** when vendors exist, and **Procurement Lead Time**. **Approved Sourcing Vendors** table has optional Item / Category, Vendor Code, Vendor Name, Supply Rate (₹), Lead Time, Payment Terms, and Action. Vendor names can open vendor records. Include loading and no-vendor states.

### Detail behavior and responsive design

The detail page is mostly read-only; edit goes to the existing item edit workspace. Switching tabs must retain the hero/context. Preserve image controls, BOM version selection, document/vendor links, barcode modal, and loading/empty conditions. On wide screens, avoid rows of tiny cards inside larger cards; use a stable hero grid, a concise metric band, readable definition lists, and tables only for tabular data. On mobile, stack hero media and metrics, keep header actions accessible, and allow wide tables to scroll horizontally. Do not hide crucial stock or price context behind a decorative visual.

## Deliverables and quality check

Create a coordinated **Create Inventory Item** screen and **Product Detail** screen in light theme, plus dark-theme treatment or clear dark-theme tokens and responsive mobile behavior. Include at least one realistic **blank creation state**, one **partially filled creation state** showing pricing/BOM/variant controls, and one **populated product detail state**; use neutral labels and placeholders rather than fictional business claims. Show at least one validation state and one empty table/media state. All exact labels, columns, actions, conditional states, and relationships above must be represented somewhere in the designs. Evaluate whether a warehouse or catalog employee could find a field, understand what is required, and distinguish editable values from calculated or read-only values without instruction. Then perform a visual critique: if the result is mostly gray, relies on repeated cards, or could belong to any SaaS product after swapping the logo, revise it before presenting.

---

## Source-of-truth mapping for implementation handoff

- Creation UI: `apps/web/src/features/products/components/ProductCreationWorkspace.tsx`.
- Product detail UI: `apps/web/src/features/master-data/MaterialDetailWorkspace.tsx` (the `/products/[id]` route passes `entityType="product"`).
- Platform tokens: `apps/web/src/app/globals.css`.
- Main shell: `apps/web/src/components/Sidebar.tsx` and `apps/web/src/components/AppLayout.tsx`.
- Existing screenshots: the four images supplied with the original item creation request.

Stitch output is a visual design proposal. Before implementation, compare its field list and behavior to these source files; source code remains authoritative where a screenshot or mockup differs.
