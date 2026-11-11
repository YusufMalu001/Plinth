# Product Catalog Updates & Improvements

**Date:** October 3, 2026  
**Module:** Inventory / Product Catalog (`/products`)

---

### 1. Unified Catalog Page (Removed Separate Tabs)
- **What Changed:** Removed the top-level separate tabs that previously divided items into disconnected "Products" and "Materials" views.
- **Why:** Having separate tabs was confusing because raw materials and finished goods were split apart, and items with a "RAW MATERIAL" category could appear under the "Products" tab with 0 in the "Materials" tab.
- **Client Benefit:** All finished goods and raw materials are now managed together on a single, clean page without needing to switch tabs back and forth.

---

### 2. Card-Based Filters & Sorting (Replaced Dropdown Menus)
- **What Changed:** Replaced hidden dropdown menus with clean, clickable filter cards/pills that are always visible:
  - **Item Type:** `All Items`, `Products`, `Materials`
  - **Parent Category:** `All Categories`, `FINISHED GOODS`, `RAW MATERIAL`, etc.
  - **Sorting:** `Name (A–Z)`, `Name (Z–A)`, `Code / SKU`, `Status`
  - *(Status filter has been removed to keep the interface simple and focused).*
- **Why:** The client requested a simple, intuitive layout where all options can be seen and selected in a single click without opening multiple dropdowns.
- **Client Benefit:** Instant 1-click filtering and sorting without ambiguity or nested menus.

---

### 3. Compact Search Bar
- **What Changed:** Resized the search bar to a compact, well-proportioned width on the left with an instant clear (`X`) button.
- **Why:** The previous search bar stretched across the entire width of the page, making the layout feel cluttered and disproportionate.
- **Client Benefit:** A balanced, modern header with a focused search bar that doesn't overwhelm the screen.

---

### 4. Clear Sub-Category & Item Identification
- **What Changed:**
  - In **Sub Categories view**, each card displays a color-coded category badge (`FINISHED GOODS` vs `RAW MATERIAL`) and shows the exact count of member items based on the active filter.
  - In **Table view**, each row displays a distinct badge (`Product` or `Material`), its parent category, SKU/code, unit of measure (UOM), and current lifecycle status.
  - Clicking any product opens its product details, and clicking any material opens its material details.
- **Client Benefit:** Immediate clarity on whether an item is a finished good or raw material, with direct access to view and edit details.

---

### 5. Quick Creation Actions
- **What Changed:** Added direct **Add product** and **Add material** buttons in the header alongside the **Export** option.
- **Client Benefit:** One-click creation for either item type without needing to switch tabs first.

---

### 6. Clean Interface & Optimized Space Utilization
- **What Changed:**
  - Removed dummy placeholder texts (`Parent Category → Sub Category → Products & Materials` and `Showing X sub categories`).
  - Utilized the newly freed horizontal space by placing **Sorting cards** right beside the compact search bar.
  - Streamlined the filters to focus strictly on **Item Type** and **Parent Category**, removing redundant status filters for maximum clarity.
- **Client Benefit:** A clutter-free, tidy interface with no empty gaps or redundant labels, keeping all actions directly accessible.

---

### 7. Revised Table Columns with Real Backend Values
- **What Changed:** Re-engineered the inventory catalog table (both in Flat List and Sub-Category views) to display the exact 8 columns requested:
  1. **Product Image:** Dedicated image thumbnail column displaying the actual uploaded photo for products and materials (with clean, elegant fallback icons when an image hasn't been uploaded yet).
  2. **Product Name:** Item title with variant tags (`Variant`) and parent item references (`Base Item: ...`) or description.
  3. **SKU Code:** Monospace SKU / item code with variant specifications and measurement size badges.
  4. **Type & Category:** Type identifier (`Product` or `Material` / specific material classification like `Raw Material`, `Hardware`, `Packaging`, etc.) paired with its category.
  5. **Quantity:** Real-time stock on hand fetched directly from warehouse inventory balances (`/inventory/items`) and opening/initial stock records, formatted with the unit of measure (e.g., `100 NOS`, `25 KG`).
  6. **Rate:** Real backend price/rate pulled from standard pricing, MRP, or material standard cost, formatted in Indian Rupees (`₹`).
  7. **Value:** Computed total inventory value (`Quantity × Rate` or live inventory valuation) formatted in Indian Rupees (`₹`).
  8. **Action:** 1-click delete action button with confirmation safeguards for variants and parent items.
- **Client Benefit:** Gives the management and warehouse teams an instant, complete overview of every product and material's stock level, unit rate, and total valuation in one unified table without having to open separate pages.

---

### 8. Back Button & Browser History Fix Across Product Catalog
- **What Changed:**
  - **Category List & Sub-Category Synchronization:** Fixed the navigation flow so that clicking any sub-category card updates the URL with `?familyId=...` and records the transition in browser history. Previously, selecting a sub-category only updated temporary local state, causing the browser's back button and in-app back buttons to skip the Category List completely and dump users at the top-level product category page.
  - **Context-Aware Back Buttons:** Updated the in-app "Back" buttons and breadcrumbs across:
    - **Product Detail page (`/products/[id]`):** Clicking "Back" or using the browser back button now brings you directly back to the exact Category List you came from (with URL fallback to `?familyId=...`).
    - **Material Detail page (`/inventory/materials/[id]`):** Clicking "Back" or using the browser back button returns directly to the Category List (or the Unified Catalog) instead of the old separate materials tab.
    - **Product & Material Creation (`/products/new` and `/inventory/materials/new`):** The "Back to Inventory" button, "Cancel" button, and breadcrumb links now use browser history to return to the previous page you came from, preserving your selected category and filters.
  - **Browser Key / Arrow Support:** Users can now seamlessly use their keyboard back keys, browser Back arrow (`←`), or in-app buttons interchangeably, and will always be returned to the previous page they came from.
- **Client Benefit:** Smooth, natural navigation throughout the entire product catalog without losing your place or having to re-navigate from the root categories page every time.

---

### 9. Header Redesign & Single Creation Button
- **What Changed:**
  - **Clean Header Alignment & Breadcrumbs:** Replaced the cramped, unaligned layout with a polished, horizontal navigation bar. The "Back to Sub Categories" button now sits neatly alongside breadcrumb links at the top with a subtle divider, eliminating awkward wrapped text and orphaned buttons.
  - **Compact Stat Cluster:** Replaced the 3 bulky, oversized square cards with a modern, compact stat cluster (`Total`, `Products`, `Materials`) with vibrant category icons and exact counts matching the active sub-category.
  - **Single Creation Button:** Removed the separate `+ Add product` and `+ Add material` buttons and replaced them with **one single creation button (`+ Add Item`)** as requested. It automatically passes the active sub-category context to the creation form, where the item type can still be toggled with 1 click if desired.
- **Client Benefit:** A much cleaner, professional, and uncluttered header layout that aligns perfectly with modern ERP standards and eliminates button redundancy.

---

### 10. Simplified Item Classification (Direct Dropdown Field)
- **What Changed:**
  - **Removed Bulky Card Block:** Replaced the oversized, 2-card "Item Classification" block (which had prominent badges, helper paragraphs, and multiple sub-type buttons) with a standard, clean form dropdown field.
  - **Direct Selection Options:** The dropdown directly presents `Finished Good`, `Raw Material`, `Component`, `Packaging`, and `Hardware`. Choosing any option instantly adapts the form, SKU generator, and category fields without unnecessary page clutter.
  - **Balanced 3-Column Grid:** Aligned the classification dropdown directly into the top row alongside Product Name and SKU, creating a neat, responsive, and compact layout.
- **Client Benefit:** A much cleaner, simpler item creation workflow that feels lightweight, fast, and intuitive without overwhelming the screen with oversized card buttons.

---

### 11. Streamlined Classification & Optional SKU Code (No Auto-Generation)
- **What Changed:**
  - **Two-Choice Classification Dropdown:** Restricted the `Item Classification` dropdown to strictly two clear options: **`Finished Good`** (Product) and **`Material`** (Raw Material/Material). Removed the extra granular options (`Component`, `Packaging`, `Hardware`) from the classification selector to keep selection straightforward and confusion-free.
  - **Removed SKU Auto-Generation:** Completely eliminated automatic generation of SKU codes (which previously generated random fallback codes like `SKU-MUR4...` whenever left blank).
  - **Blank SKU Code Support:** If a SKU / Material Code is not entered by the user, the field remains completely **blank**. In the product catalog table, items without an SKU code now display cleanly as blank with no auto-generated hash strings.
  - **Removed "(Optional)" Text Across All Fields:** Cleaned up the form labels by removing the word `(Optional)` from all fields throughout the creation workspace (including `Catalog SKU`, `Category`, `Sub Category`, `Maximum Retail Price (MRP)`, `Product Description & Scope`, `Production Route`, and `Bill of Materials`).
- **Client Benefit:** A completely transparent and clean creation form where SKU codes are truly optional without generating unwanted random codes, and the user interface remains clean, minimalist, and easy to use.

---

### 12. Balanced Form Layout & Minimalist Media Upload Component
- **What Changed:**
  - **Moved Description to the Left Side:** Relocated the `Product / Material Description & Scope` textarea directly beneath the Amazon ASIN and Barcode fields in the primary left column. This effectively eliminates the large blank gap on the left and logically groups all text, identification, and specification fields together.
  - **Removed Weird Bluish Background & Tinted Borders:** Replaced all tinted backgrounds and borders in the media component with crisp, standard neutral theme colors (`bg-white / dark:bg-slate-900`, `border-slate-200 / dark:border-slate-800`, `bg-slate-50 / dark:bg-slate-800`).
  - **Minimalist, Space-Efficient Media Component:**
    - **No Wasted Space / Removed Huge Empty Placeholders:** Completely removed the 3 large fake empty placeholder cards (`Primary Cover`, `Angle / Detail`, `Specs / Pack`) and wordy caption paragraphs that previously wasted excessive screen height.
    - **Compact Dropzone:** Implemented a clean, compact upload dropzone with a clean neutral upload icon, drag-and-drop support, format specs (`PNG, JPG, WEBP, SVG • Max 10MB`), and a 0/12 photo counter badge.
    - **Tight Thumbnail Gallery:** When photos are uploaded, they appear in a neat, compact 4-column thumbnail grid with a small cover tag (`COVER`) and 1-click remove/set-cover actions.
    - **Zero-Waste Empty State:** When no photos are uploaded, it displays only the compact dropzone and a subtle 1-line hint, keeping vertical height minimal (~120px) without taking over the screen.
- **Client Benefit:** A well-balanced, symmetrical form layout with no awkward empty spaces on the left, and a sleek, space-saving media upload component that fits seamlessly into the enterprise interface.

---

### 13. "Special" Configuration Presets (Theme-Aligned & Clean Design)
- **What Changed:**
  - **Relocated & Prominent Action Button (No Emoji):** 
    - Completely removed the AI sparkles emoji (`✨`) from the button.
    - Replaced with a clean, professional ERP icon (`SlidersHorizontal`) and labeled **`Special Presets`**.
    - Relocated and integrated directly into the **Section 01 Header** (`General Identity, Classification & Media`) and **Section 02 Header** (`Commercial Pricing Matrix, Customer Tiers & GST`) right beside the collapse control, where users actively configure product details.
    - Styled with distinct, theme-consistent primary accents (`border-primary/30 bg-primary/5 text-primary hover:bg-primary/10`) so it stands out clearly without being hidden or blending in with generic gray utility buttons.
  - **Removed Redundant Banner:** Removed the unnecessary `Auto-Fill with Special Preset...` banner from Section 01, keeping the form clean, uncluttered, and focused directly on product fields.
  - **Special Preset Dialog:** Designed a clean, minimalist modal dialog matching Plinth ERP's theme palette with two streamlined tabs:
    1. **Select Preset:** Displays available presets in clean, monochrome cards. Each card neatly summarizes the 5 key parameters in an organized, readable grid:
       - **HSN / SAC Code**
       - **Taxability** (`Taxable`, `Exempt`, `Nil Rated`, `Non-GST`)
       - **GST Rate** (`0%`, `5%`, `12%`, `18%`, `28%`)
       - **Unit of Measure (UOM)** (`NOS`, `BOX`, `KGS`, etc.)
       - **Opening Stock Quantity**
       - Clicking **"Apply"** instantly populates all 5 fields into the creation form with a clean confirmation toast.
    2. **Create New Preset:** A simple, structured form allowing users to create their own reusable presets with custom names, notes, and the 5 default fields. Offers both **"Save Preset"** and **"Save & Apply"** actions.
       - **Interactive HSN / SAC Searchable Selector:** Replaced the previous basic input with the full, rich `SearchableSelector` component matching the rest of Plinth ERP. Users can type to live-search across all catalog HSN codes and descriptions, with custom entry support (`allowCustom`).
       - **Real-Time HSN Category Display:** Displays both the code and the full statutory category description directly inside the selector and as an emerald subtitle underneath when an HSN is chosen.
  - **Removed AI-like & Flashy Embellishments:** Eliminated all multi-colored rainbow badges, orange banners, and wordy explanatory text. Cards now present clean, structured data that is easy for clients and warehouse managers to understand at a glance.
  - **Built-In Standard Presets:** Pre-configured standard presets (e.g., Finished Goods Standard 18% GST, Stainless Steel Raw Material, and Exempt 0% GST) ready to use right away.
  - **Persistent Storage:** Custom specials are automatically preserved in browser storage across sessions.
- **Client Benefit:** A fast, 1-click way to populate repetitive tax and inventory fields without cluttering the screen or confusing clients with unnecessary banners and bright colors.
