"use client";

import React, { useMemo, useState, useEffect, Suspense } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
 Box,
 Plus,
 ChevronRight,
 ArrowLeft,
 FolderTree,
 List,
 Search,
 Boxes,
 ArrowUpRight,
 Trash2,
 Pencil,
 AlertTriangle,
 ArrowUpDown,
 ChevronDown,
 X,
} from "lucide-react";
import {
 Button,
 Card,
 CardContent,
 Checkbox,
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@plinth/ui";
import {
 useProducts,
 useProductFamilies,
 useCategories,
 useMaterials,
 extractProductVariants,
 extractMaterialVariants,
 ProductFamily,
 Product,
 Material,
} from "../../../hooks/useMasterData";
import { useInventoryItems } from "../../../features/inventory/hooks";
import { LoadingState } from "../../../components/LoadingState";
import { ErrorState } from "../../../components/ErrorState";
import { PaginationControls } from "../../../components/PaginationControls";
import { fetchApi } from "../../../features/api/client";
import { showToast } from "../../../components/toast-store";
import { getVariantLabel } from "../../../features/products/variant-names";

export interface CatalogItemVariant {
 id?: string;
 productRecordId?: string;
 name: string;
 sku?: string;
 measurementValue?: string;
 openingStock?: number | string;
 standardPrice?: number | string;
 minStockLevel?: number | string;
 reorderPoint?: number | string;
}

interface CatalogItem {
 id: string;
 name: string;
 code: string;
 itemType: "PRODUCT" | "MATERIAL";
 category?: { id?: string; name: string } | null;
 categoryId?: string | null;
 productFamily?: { id?: string; name: string } | null;
 productFamilyId?: string | null;
 uom?: { id?: string; name?: string; symbol?: string } | null;
 status: string;
 isVariant?: boolean;
 parentItemId?: string;
 parentItemName?: string;
 description?: string | null;
 imageUrl?: string;
 measurementValue?: string;
 materialType?: string;
 variants?: CatalogItemVariant[];
 quantity: number;
 rate: number;
 value: number;
 createdAt?: string;
 rawProduct?: Product;
 rawMaterial?: Material;
}

function getCategoryBadgeAppearance(name?: string | null, id?: string | null): { className: string; style?: React.CSSProperties } {
 const normalized = (name || '').trim().toLowerCase().replace(/[&_-]+/g, ' ').replace(/\s+/g, ' ');
 const baseClass = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border';

 // Keep the original Raw Material and Finished Goods treatments. Newer
 // categories get their own fixed colors, shared by cards and table rows.
 if (normalized.includes('raw material')) {
 return { className: `${baseClass} bg-tone-amber-bg text-tone-amber-text border-tone-amber-solid/25` };
 }
 if (/finished goods?/.test(normalized) && !/semi/.test(normalized)) {
 return { className: `${baseClass} bg-primary/10 text-primary border-primary/20` };
 }
 if (normalized.includes('semi finished')) {
 return { className: `${baseClass} bg-tone-pink-bg text-tone-pink-text border-tone-pink-solid/25` };
 }
 if (normalized.includes('packaging') || normalized.includes('consumables')) {
 return { className: `${baseClass} bg-tone-teal-bg text-tone-teal-text border-tone-teal-solid/25` };
 }

 const stableKey = id || normalized || 'general';
 const hash = Array.from(stableKey).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
 const hue = (hash * 137.508) % 360;
 return {
 className: baseClass,
 style: {
 color: `hsl(${hue} 68% 38%)`,
 backgroundColor: `hsl(${hue} 76% 95%)`,
 borderColor: `hsl(${hue} 62% 82%)`,
 },
 };
}

function ProductsPageContent() {
 const router = useRouter();
 const searchParams = useSearchParams();

 // Navigation / Drill-down State backed by URL query parameters (for browser back/forward support)
 const familyIdFromUrl = searchParams.get("familyId") || searchParams.get("subCategory") || searchParams.get("subCategoryId");
 const viewParam = searchParams.get("view");
 const viewMode: "families" | "all-items" = viewParam === "all-items" ? "all-items" : "families";

 // Filters & Search
 const [search, setSearch] = useState("");
 const typeParam = searchParams.get("type")?.toLowerCase();
 const initialType = typeParam === "material" ? "MATERIAL" : typeParam === "product" ? "PRODUCT" : "ALL";
 const [typeFilter, setTypeFilter] = useState<"ALL" | "PRODUCT" | "MATERIAL">(initialType);
 const [categoryFilter, setCategoryFilter] = useState<string>(searchParams.get("categoryId") || "ALL");
 const [sort, setSort] = useState("newest");

 // Pagination & Selection
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(100);
 const [deleteTarget, setDeleteTarget] = useState<CatalogItem[] | null>(null);
 const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
 const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());
 const [deleteError, setDeleteError] = useState<string | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);

 const toggleExpandItem = (id: string, e: React.MouseEvent) => {
 e.stopPropagation();
 setExpandedItemIds((current) => {
 const next = new Set(current);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 };

 // Queries
 const {
 data: familiesData,
 isLoading: isFamiliesLoading,
 error: familiesError,
 refetch: refetchFamilies,
 } = useProductFamilies(undefined, "ACTIVE");

 const {
 data: categoriesData,
 isLoading: isCategoriesLoading,
 refetch: refetchCategories,
 } = useCategories("ACTIVE");

 const rawFamilies = familiesData?.items ?? [];
 const rawCategories = categoriesData?.items ?? [];

 const categoryIdParam = searchParams.get("categoryId");
 useEffect(() => {
 setCategoryFilter(categoryIdParam || "ALL");
 }, [categoryIdParam]);

 // Derive selectedFamily from URL parameter so browser back/forward buttons work flawlessly
 const selectedFamily = useMemo(() => {
 if (!familyIdFromUrl) return null;
 return rawFamilies.find((f) => f.id === familyIdFromUrl || f.code === familyIdFromUrl) || null;
 }, [familyIdFromUrl, rawFamilies]);

 const handleSelectFamily = (family: ProductFamily) => {
 const params = new URLSearchParams(searchParams.toString());
 params.set("familyId", family.id);
 params.delete("view");
 setPage(1);
 setSearch("");
 router.push(`/products?${params.toString()}`);
 };

 const handleBackToFamilies = () => {
 const params = new URLSearchParams(searchParams.toString());
 params.delete("familyId");
 params.delete("subCategory");
 params.delete("subCategoryId");
 setPage(1);
 const q = params.toString();
 router.push(q ? `/products?${q}` : "/products");
 };

 const handleSetViewMode = (mode: "families" | "all-items") => {
 const params = new URLSearchParams(searchParams.toString());
 if (mode === "all-items") {
 params.set("view", "all-items");
 params.delete("familyId");
 } else {
 params.delete("view");
 }
 setPage(1);
 refetchProducts();
 refetchMaterials();
 refetchFamilies();
 refetchCategories();
 refetchInventory();
 const q = params.toString();
 router.push(q ? `/products?${q}` : "/products");
 };

 const {
 data: productsData,
 isLoading: isProductsLoading,
 error: productsError,
 refetch: refetchProducts,
 } = useProducts(undefined, 1, 5000, { excludeVariants: true });

 const {
 data: materialsData,
 isLoading: isMaterialsLoading,
 error: materialsError,
 refetch: refetchMaterials,
 } = useMaterials(undefined, 1, 5000, { excludeVariants: true });

 const {
 data: inventoryItemsData,
 isLoading: isInventoryLoading,
 refetch: refetchInventory,
 } = useInventoryItems({ limit: 5000 });

 // Automatically refetch all queries when the view or URL parameters change, or on component mount
 useEffect(() => {
 refetchProducts();
 refetchMaterials();
 refetchFamilies();
 refetchCategories();
 refetchInventory();
 }, [searchParams, viewMode]);

 // Refetch when returning to the window/tab or browser back/forward navigation
 useEffect(() => {
 const onVisibilityOrFocus = () => {
 refetchProducts();
 refetchMaterials();
 refetchFamilies();
 refetchCategories();
 refetchInventory();
 };
 window.addEventListener("focus", onVisibilityOrFocus);
 window.addEventListener("visibilitychange", onVisibilityOrFocus);
 return () => {
 window.removeEventListener("focus", onVisibilityOrFocus);
 window.removeEventListener("visibilitychange", onVisibilityOrFocus);
 };
 }, [refetchProducts, refetchMaterials, refetchFamilies, refetchCategories, refetchInventory]);

 // The catalog endpoint also returns inactive records for history workflows.
 // Keep this inventory-facing list focused on items that are still in use.
 const rawProducts = (productsData?.items ?? []).filter((product) => product.status !== "INACTIVE");
 const rawMaterials = (materialsData?.items ?? []).filter((material) => material.status !== "INACTIVE");

 // Index real live stock balances for unified product availability
 const stockMap = useMemo(() => {
 const map = new Map<string, { onHandQuantity: number; inventoryValue: number }>();
 (inventoryItemsData?.items || []).forEach((inv) => {
 const qty = Number(inv.onHandQuantity) || 0;
 const val = Number(inv.inventoryValue) || 0;
 // productId/materialId and itemId intentionally identify the same
 // catalog record. Index its balance once by identity, then separately
 // add a human-facing SKU/code alias below. Adding all three aliases to
 // this map doubles the quantity because the identity keys collide.
 const itemId = inv.itemId || inv.productId || inv.materialId;
 if (itemId) {
 const existing = map.get(itemId) || { onHandQuantity: 0, inventoryValue: 0 };
 map.set(itemId, {
 onHandQuantity: existing.onHandQuantity + qty,
 inventoryValue: existing.inventoryValue + val,
 });
 }
 if (inv.product?.sku) {
 const existing = map.get(inv.product.sku) || { onHandQuantity: 0, inventoryValue: 0 };
 map.set(inv.product.sku, {
 onHandQuantity: existing.onHandQuantity + qty,
 inventoryValue: existing.inventoryValue + val,
 });
 }
 if (inv.material?.code) {
 const existing = map.get(inv.material.code) || { onHandQuantity: 0, inventoryValue: 0 };
 map.set(inv.material.code, {
 onHandQuantity: existing.onHandQuantity + qty,
 inventoryValue: existing.inventoryValue + val,
 });
 }
 });
 return map;
 }, [inventoryItemsData]);

 // Unified catalog items with real backend quantities, rates, and values
 // Products and materials with variants remain SINGLE rows with variant metadata attached
 const allCatalogItems = useMemo<CatalogItem[]>(() => {
 const familyMap = new Map<string, ProductFamily>();
 rawFamilies.forEach((f) => familyMap.set(f.id, f));

 // Exclude any synthetic variant rows so parent items (e.g. CS-8) are single unified rows
 const nonVariantProducts = rawProducts.filter(
 (p) => !p.isVariant && !(p.metadata as any)?.isVariant && !p.parentProductId
 );

 const productItems: CatalogItem[] = nonVariantProducts.map((p) => {
 const variants: CatalogItemVariant[] = extractProductVariants(p).map((v) => ({
 id: v.id,
 productRecordId: (v.metadata as any)?.productRecordId,
 name: getVariantLabel(p.name, v.name, v.measurementValue || (v.metadata as any)?.measurementValue),
 sku: v.sku,
 measurementValue: v.measurementValue || (v.metadata as any)?.measurementValue,
 openingStock: v.openingStock,
 standardPrice: v.standardPrice,
 minStockLevel: v.minStockLevel,
 reorderPoint: v.reorderPoint,
 }));

 const rate = getItemRate("PRODUCT", p, undefined);
 const { quantity, inventoryValue } = getItemQuantity(p.id, p.sku || "", "PRODUCT", stockMap, p, undefined, variants);
 // For stocked inventory, use the ledger's weighted-average cost so the
 // displayed rate and value reconcile with the Inventory dashboard.
 const value = quantity > 0 && inventoryValue > 0 ? inventoryValue : rate > 0 ? quantity * rate : 0;
 const displayRate = quantity > 0 && inventoryValue > 0 ? inventoryValue / quantity : rate;
 const imageUrl = getItemImage("PRODUCT", p, undefined);
 const meta = (p.metadata as any) || {};
 const userSku = meta.userSku;
 const isAutoSku = Boolean(
 p.sku &&
 (/^SKU-[A-Z0-9]+-[A-Z0-9]+$/i.test(p.sku) || p.sku.startsWith("SKU-")) &&
 (meta.hasCustomSku === false || userSku === "" || (meta.hasCustomSku === undefined && userSku === undefined))
 );
 const displaySku = userSku !== undefined ? userSku : isAutoSku ? "" : (p.sku || "");

 return {
 id: p.id,
 name: p.name,
 code: displaySku,
 itemType: "PRODUCT",
 category: p.category,
 categoryId: p.categoryId,
 productFamily: p.productFamily || (p.productFamilyId ? familyMap.get(p.productFamilyId) : null),
 productFamilyId: p.productFamilyId,
 uom: p.uom,
 status: p.status || "ACTIVE",
 isVariant: false,
 description: p.description,
 imageUrl: imageUrl || undefined,
 measurementValue: p.measurementValue,
 variants,
 quantity,
 rate: displayRate,
 value,
 createdAt: p.createdAt,
 rawProduct: p,
 };
 });

 // Exclude any synthetic variant rows for materials as well
 const nonVariantMaterials = rawMaterials.filter(
 (m) => !m.isVariant && !(m.specs as any)?.isVariant && !(m as any).metadata?.isVariant && !m.parentMaterialId && !(m.specs as any)?.convertedToProductId
 );

 const materialItems: CatalogItem[] = nonVariantMaterials.map((m) => {
 const famId = (m as any).productFamilyId || (m.specs as any)?.productFamilyId;
 // A category may have several subcategories. Only display the family
 // explicitly stored on this item; never infer one from the category.
 const matchedFam = famId ? familyMap.get(famId) : undefined;
 const variants: CatalogItemVariant[] = extractMaterialVariants(m).map((v) => ({
 id: v.id,
 name: getVariantLabel(m.name, v.name, v.measurementValue || (v.specs as any)?.measurementValue),
 sku: v.code || v.sku,
 measurementValue: v.measurementValue || (v.specs as any)?.measurementValue,
 openingStock: v.openingStock,
 standardPrice: v.standardCost,
 minStockLevel: v.minStockLevel,
 reorderPoint: v.reorderPoint,
 }));

 const rate = getItemRate("MATERIAL", undefined, m);
 const { quantity, inventoryValue } = getItemQuantity(m.id, m.code || "", "MATERIAL", stockMap, undefined, m, variants);
 // Keep stocked material valuation aligned with the same ledger cost used
 // by the Inventory dashboard; use master pricing only before stock exists.
 const value = quantity > 0 && inventoryValue > 0 ? inventoryValue : rate > 0 ? quantity * rate : 0;
 const displayRate = quantity > 0 && inventoryValue > 0 ? inventoryValue / quantity : rate;
 const imageUrl = getItemImage("MATERIAL", undefined, m);
 const specs = ((m.specs as any) || (m as any).metadata) || {};
 const userCode = specs.userCode;
 const isAutoCode = Boolean(
 m.code &&
 (/^(MAT|SKU)-[A-Z0-9]+-[A-Z0-9]+$/i.test(m.code) || m.code.startsWith("SKU-") || m.code.startsWith("MAT-")) &&
 (specs.hasCustomCode === false || userCode === "" || (specs.hasCustomCode === undefined && userCode === undefined))
 );
 const displayCode = userCode !== undefined ? userCode : isAutoCode ? "" : (m.code || "");

 return {
 id: m.id,
 name: m.name,
 code: displayCode,
 itemType: "MATERIAL",
 category: m.category,
 categoryId: m.categoryId,
 productFamily: matchedFam || null,
 productFamilyId: famId || matchedFam?.id || null,
 uom: m.uom,
 status: m.status || "ACTIVE",
 isVariant: false,
 description: m.description,
 imageUrl: imageUrl || undefined,
 measurementValue: m.measurementValue,
 materialType: m.materialType,
 variants,
 quantity,
 rate: displayRate,
 value,
 createdAt: m.createdAt,
 rawMaterial: m,
 };
 });

 return [...productItems, ...materialItems];
 }, [rawProducts, rawMaterials, rawFamilies, stockMap]);

 // Count products & materials by family
 const familyItemCounts = useMemo(() => {
 const map = new Map<string, { total: number; products: number; materials: number }>();
 rawFamilies.forEach((f) => {
 map.set(f.id, { total: 0, products: 0, materials: 0 });
 });

 allCatalogItems.forEach((item) => {
 if (item.productFamilyId && map.has(item.productFamilyId)) {
 const counts = map.get(item.productFamilyId)!;
 counts.total += 1;
 if (item.itemType === "PRODUCT") counts.products += 1;
 else counts.materials += 1;
 }
 });

 return map;
 }, [rawFamilies, allCatalogItems]);

 // Filtered families list for Family View
 const filteredFamilies = useMemo(() => {
 return rawFamilies
 .filter((family) => {
 if (categoryFilter !== "ALL" && family.categoryId !== categoryFilter) return false;

 const counts = familyItemCounts.get(family.id) || { total: 0, products: 0, materials: 0 };
 const isRawCategory = family.category?.name?.toLowerCase().includes("raw");

 if (typeFilter === "PRODUCT") {
 // Exclude families with only materials and no products
 if (counts.products === 0 && (counts.materials > 0 || isRawCategory)) return false;
 } else if (typeFilter === "MATERIAL") {
 // Exclude families with only products and no materials
 if (counts.materials === 0 && (counts.products > 0 || !isRawCategory)) return false;
 }

 if (search.trim()) {
 const query = search.toLowerCase();
 const matchesName = family.name.toLowerCase().includes(query);
 const matchesCode = family.code.toLowerCase().includes(query);
 const matchesCategory = family.category?.name?.toLowerCase().includes(query);
 if (!matchesName && !matchesCode && !matchesCategory) return false;
 }
 return true;
 })
 .sort((a, b) => {
 if (sort === "newest") {
 const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
 const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
 return bTime - aTime || b.id.localeCompare(a.id);
 }
 if (sort === "name-desc") return b.name.localeCompare(a.name);
 if (sort === "status") return a.status.localeCompare(b.status);
 return a.name.localeCompare(b.name);
 });
 }, [rawFamilies, categoryFilter, typeFilter, search, sort, familyItemCounts]);

 // Single creation link dynamically targeting the right category/family context
 const createItemHref = useMemo(() => {
 if (selectedFamily) {
 const isRaw = selectedFamily.category?.name?.toLowerCase().includes("raw");
 const defaultType = isRaw ? "MATERIAL" : "PRODUCT";
 return `/products/new?type=${defaultType}&familyId=${selectedFamily.id}&categoryId=${selectedFamily.categoryId || ""}`;
 }
 if (viewMode === "all-items") {
 return "/products/new?view=all-items";
 }
 return "/products/new";
 }, [selectedFamily, viewMode]);

 // Filtered items list for Table View (Flat or in Selected Family)
 const filteredItems = useMemo(() => {
 return allCatalogItems
 .filter((item) => {
 if (selectedFamily && item.productFamilyId !== selectedFamily.id) return false;
 if (typeFilter !== "ALL" && item.itemType !== typeFilter) return false;
 if (categoryFilter !== "ALL" && item.categoryId !== categoryFilter) return false;

 if (search.trim()) {
 const query = search.toLowerCase();
 const matchesName = item.name.toLowerCase().includes(query);
 const matchesCode = item.code.toLowerCase().includes(query);
 const matchesCat = item.category?.name?.toLowerCase().includes(query);
 const matchesFam = item.productFamily?.name?.toLowerCase().includes(query);
 const matchesVal = (item.measurementValue || "").toLowerCase().includes(query);
 const matchesVariants = item.variants?.some((v) =>
 v.name.toLowerCase().includes(query) ||
 (v.sku && v.sku.toLowerCase().includes(query)) ||
 (v.measurementValue && v.measurementValue.toLowerCase().includes(query))
 );
 if (!matchesName && !matchesCode && !matchesCat && !matchesFam && !matchesVal && !matchesVariants) {
 return false;
 }
 }
 return true;
 })
 .sort((a, b) => {
 if (sort === "name-desc") return b.name.localeCompare(a.name);
 if (sort === "qty-desc") return b.quantity - a.quantity;
 if (sort === "rate-desc") return b.rate - a.rate;
 if (sort === "value-desc") return b.value - a.value;
 if (sort === "newest") {
 const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
 const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
 return bTime - aTime || a.name.localeCompare(b.name);
 }
 return a.name.localeCompare(b.name);
 });
 }, [allCatalogItems, selectedFamily, typeFilter, categoryFilter, search, sort]);

 // Paginated items slice
 const paginatedItems = useMemo(() => {
 const start = (page - 1) * pageSize;
 return filteredItems.slice(start, start + pageSize);
 }, [filteredItems, page, pageSize]);

 const isLoading = isFamiliesLoading || isProductsLoading || isCategoriesLoading || isMaterialsLoading || isInventoryLoading;
 const error = familiesError || productsError || materialsError;

 // Unified delete action
 const handleDelete = async () => {
 if (!deleteTarget?.length) return;
 setIsDeleting(true);
 setDeleteError(null);
 try {
 const productsToDelete = deleteTarget.filter((item) => item.itemType === "PRODUCT");
 const materialsToDelete = deleteTarget.filter((item) => item.itemType === "MATERIAL");

 const promises: Promise<unknown>[] = [];
 productsToDelete.forEach((p) => {
 promises.push(fetchApi(`/master-data/products/${p.id}`, { method: "DELETE" }));
 });
 materialsToDelete.forEach((m) => {
 promises.push(fetchApi(`/master-data/materials/${m.id}`, { method: "DELETE" }));
 });

 const results = await Promise.allSettled(promises);
 const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
 if (failed.length > 0) {
 const reason = failed[0].reason instanceof Error ? failed[0].reason.message : String(failed[0].reason || "Unknown server error");
 throw new Error(`${failed.length} selected item(s) could not be deleted. ${reason}`);
 }

 await Promise.all([refetchProducts(), refetchMaterials(), refetchInventory()]);
 setDeleteTarget(null);
 setSelectedItemIds(new Set());
 showToast({
 kind: "success",
 title: "Items Deactivated",
 message: `Successfully deactivated ${deleteTarget.length} item(s). BOMs, production schedules, and history were preserved.`,
 });
 } catch (err) {
 setDeleteError(err instanceof Error ? err.message : "The item(s) could not be deleted.");
 } finally {
 setIsDeleting(false);
 }
 };

 const handleItemClick = (item: CatalogItem) => {
 const targetId = item.isVariant && item.parentItemId ? item.parentItemId : item.id;
 const activeFamilyId = selectedFamily?.id || item.productFamilyId;
 const famQuery = activeFamilyId ? `?familyId=${activeFamilyId}` : "";
 if (item.itemType === "PRODUCT") {
 router.push(`/products/${targetId}${famQuery}`);
 } else {
 router.push(`/inventory/materials/${targetId}${famQuery}`);
 }
 };

 if (isLoading) {
 return <LoadingState message="Loading inventory catalog..." />;
 }

 if (error) {
 return (
 <ErrorState
 error={error as Error}
 retry={() => {
 refetchFamilies();
 refetchProducts();
 refetchMaterials();
 refetchInventory();
 }}
 />
 );
 }

 return (
 <div className="flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8">
 <div className="w-full max-w-[1780px] mx-auto space-y-6">
 {/* Header Section: Clean, Arranged & Unified with a Single Creation Action */}
 <header className="space-y-4">
 {selectedFamily ? (
 /* Sub Category (Product Family) View Header */
 <div className="space-y-4">
 {/* Top Navigation Row: Back button & Breadcrumbs */}
 <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-border-strong border-border/50">
 <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
 <button
 type="button"
 onClick={handleBackToFamilies}
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted transition-all cursor-pointer border border-border/80 shadow-2xs"
 >
 <ArrowLeft className="h-3.5 w-3.5" />
 <span>Back to Sub Categories</span>
 </button>
 <span className="text-border mx-1">|</span>
 <button
 type="button"
 onClick={handleBackToFamilies}
 className="hover:text-primary transition-colors cursor-pointer"
 >
 Inventory
 </button>
 <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
 <Link
 href={selectedFamily.categoryId ? `/products?categoryId=${encodeURIComponent(selectedFamily.categoryId)}` : "/products"}
 className="hover:text-primary hover:underline underline-offset-4 transition-colors"
 >
 {selectedFamily.category?.name || "Parent Category"}
 </Link>
 <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
 <Link
 href={`/products?familyId=${encodeURIComponent(selectedFamily.id)}`}
 className="text-foreground font-bold hover:text-primary hover:underline underline-offset-4 transition-colors"
 >
 {selectedFamily.name}
 </Link>
 </div>

 </div>

 {/* Main Info Row: Title on Left, Actions on Right */}
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
 <div className="space-y-1.5">
 <div className="flex flex-wrap items-center gap-2.5">
 <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-sans">
 {selectedFamily.name}
 </h1>
 {selectedFamily.code && (
 <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
 {selectedFamily.code}
 </span>
 )}
 <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-tone-blue-bg text-tone-blue-text border border-tone-blue-solid/25">
 {selectedFamily.category?.name || "Category"}
 </span>
 </div>
 </div>

 {/* Right: Catalog actions */}
 <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
 <Link href={createItemHref}>
 <Button size="sm" icon={Plus} className="h-10 rounded-xl px-5 font-bold text-sm bg-primary hover:bg-[color:var(--action-primary-bg-hover)] text-inverse shadow-none ring-1 ring-primary/20 transition-all hover:-translate-y-0.5">
 Add Item
 </Button>
 </Link>
 </div>
 </div>
 </div>
 ) : (
 /* Root Catalog View Header */
 <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
 <div className="shrink-0">
 <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-sans">
 Inventory
 </h1>
 </div>

 <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-end lg:flex-1">
 {rawCategories.length > 0 && (
 <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2 sm:justify-end">
 <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
 <FolderTree className="h-3.5 w-3.5 text-primary" /> Category
 </span>
 <button
 type="button"
 onClick={() => {
 setCategoryFilter("ALL");
 setPage(1);
 }}
 className={`px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === "ALL"
 ? "bg-primary text-primary-foreground font-bold shadow-xs"
 : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted font-medium"
 }`}
 >
 All Categories ({rawCategories.length})
 </button>
 {rawCategories.map((cat) => (
 <button
 key={cat.id}
 type="button"
 onClick={() => {
 setCategoryFilter(cat.id);
 setPage(1);
 }}
 className={`px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === cat.id
 ? "bg-primary text-primary-foreground font-bold shadow-xs"
 : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted font-medium"
 }`}
 >
 {cat.name}
 </button>
 ))}
 </div>
 )}
 <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
 <Link href={createItemHref}>
 <Button size="sm" icon={Plus} className="h-10 rounded-xl px-5 font-bold text-sm bg-primary hover:bg-action text-inverse shadow-none ring-1 ring-primary/20 transition-all hover:-translate-y-0.5">
 Add Item
 </Button>
 </Link>
 </div>
 </div>
 </div>
 )}
 </header>

 {/* View Mode Switcher (Sub Categories vs Flat Item List) */}
 {!selectedFamily && (
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-muted/50 border border-border">
 <button
 type="button"
 onClick={() => handleSetViewMode("families")}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
 viewMode === "families"
 ? "bg-card text-primary shadow-xs border border-border/80"
 : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
 }`}
 >
 <FolderTree className="h-3.5 w-3.5" />
 Sub Categories ({rawFamilies.length})
 </button>
 <button
 type="button"
 onClick={() => handleSetViewMode("all-items")}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
 viewMode === "all-items"
 ? "bg-card text-primary shadow-xs border border-border/80"
 : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
 }`}
 >
 <List className="h-3.5 w-3.5" />
 Flat Inventory List ({allCatalogItems.length})
 </button>
 </div>
 </div>
 )}

 {/* Unified Search, Filter, and Sort Controls in Clean Card Container */}
 <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-3.5">
 {/* Top Row: Compact Search Bar + Sort Cards Right Aligned */}
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
 {/* Compact Search Bar */}
 <div className="relative w-full sm:w-80">
 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <input
 type="text"
 placeholder={
 viewMode === "families" && !selectedFamily
 ? "Search sub categories..."
 : "Search products & materials..."
 }
 value={search}
 onChange={(e) => {
 setSearch(e.target.value);
 setPage(1);
 }}
 className="w-full h-10 pl-10 pr-9 rounded-xl border border-border bg-background text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
 />
 {search && (
 <button
 type="button"
 onClick={() => {
 setSearch("");
 setPage(1);
 }}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted cursor-pointer"
 title="Clear search"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 )}
 </div>

 {/* Sorting Controls and Clear Filter Action */}
 <div className="flex flex-wrap items-center gap-3">
 <div className="flex flex-wrap items-center gap-1.5">
 <span className="text-xs font-semibold text-muted-foreground shrink-0 flex items-center gap-1.5 mr-1">
 <ArrowUpDown className="h-3.5 w-3.5 text-primary" /> Sort:
 </span>
 {[
 { label: "Newest", value: "newest" },
 { label: "Name (A–Z)", value: "name" },
 { label: "Name (Z–A)", value: "name-desc" },
 { label: "Quantity", value: "qty-desc" },
 { label: "Value", value: "value-desc" },
 ].map((s) => (
 <button
 key={s.value}
 type="button"
 onClick={() => setSort(s.value)}
 className={`px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
 sort === s.value
 ? "bg-primary text-primary-foreground font-bold shadow-xs"
 : "bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-muted font-medium"
 }`}
 >
 {s.label}
 </button>
 ))}
 </div>

 {(typeFilter !== "ALL" || categoryFilter !== "ALL" || search) && (
 <button
 type="button"
 onClick={() => {
 setTypeFilter("ALL");
 setCategoryFilter("ALL");
 setSearch("");
 setPage(1);
 }}
 className="text-xs text-primary hover:underline font-semibold cursor-pointer ml-1"
 >
 Clear filters
 </button>
 )}
 </div>
 </div>

 </div>

 {/* ------------------------------------------------------------- */}
 {/* VIEW 1: PRODUCT FAMILIES GRID (Sub Categories Mode) */}
 {/* ------------------------------------------------------------- */}
 {!selectedFamily && viewMode === "families" && (
 <div className="space-y-4">
 {filteredFamilies.length === 0 ? (
 <Card className="p-12 text-center border-dashed">
 <FolderTree className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
 <p className="text-base font-semibold text-foreground">
 No sub categories found
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Try adjusting your search query, type filter, or category filter.
 </p>
 </Card>
 ) : (
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
 {filteredFamilies.map((family) => {
 const counts = familyItemCounts.get(family.id) || { total: 0, products: 0, materials: 0 };
 const isRawCategory = family.category?.name?.toLowerCase().includes("raw");
 const categoryBadge = getCategoryBadgeAppearance(family.category?.name, family.categoryId);

 return (
 <div
 key={family.id}
 onClick={() => handleSelectFamily(family)}
 className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-none hover:-translate-y-0.5 cursor-pointer"
 >
 <div>
 <div className="flex items-start justify-between gap-2">
 <span className={categoryBadge.className} style={categoryBadge.style}>
 {family.category?.name || "General"}
 </span>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
 <ArrowUpRight className="h-4 w-4" />
 </span>
 </div>

 <h3 className="mt-3 text-base font-bold text-foreground group-hover:text-primary transition-colors">
 {family.name}
 </h3>

 {family.description && (
 <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
 {family.description}
 </p>
 )}
 </div>

 <div className="mt-5 pt-3.5 border-t border-border/70 flex items-center justify-between">
 <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
 {isRawCategory ? (
 <Boxes className="h-3.5 w-3.5 text-tone-amber-text" />
 ) : (
 <Box className="h-3.5 w-3.5 text-primary" />
 )}
 <span>
 <strong className="text-foreground">
 {typeFilter === "PRODUCT"
 ? counts.products
 : typeFilter === "MATERIAL"
 ? counts.materials
 : counts.total}
 </strong>{" "}
 {typeFilter === "PRODUCT"
 ? (counts.products === 1 ? 'product' : 'products')
 : typeFilter === "MATERIAL"
 ? (counts.materials === 1 ? 'material' : 'materials')
 : (counts.total === 1 ? 'item' : 'items')}
 </span>
 </div>

 <span className="text-xs font-semibold text-primary group-hover:underline flex items-center gap-1">
 View List &rarr;
 </span>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 )}

 {/* ------------------------------------------------------------- */}
 {/* VIEW 2: MEMBER ITEMS TABLE (When Drilled Down OR Flat List) */}
 {/* ------------------------------------------------------------- */}
 {(selectedFamily || viewMode === "all-items") && (
 <Card className="overflow-hidden border-border/80 shadow-xs">
 <CardContent className="p-0">
 <div className="overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-10">
 {selectedItemIds.size > 0 && (
 <Checkbox
 aria-label="Select all filtered items"
 checked={filteredItems.length > 0 && filteredItems.every((item) => selectedItemIds.has(item.id))}
 onChange={(event) =>
 setSelectedItemIds((current) => {
 const next = new Set(current);
 filteredItems.forEach((item) =>
 event.target.checked ? next.add(item.id) : next.delete(item.id)
 );
 return next;
 })
 }
 />
 )}
 </TableHead>
 <TableHead className="w-16" aria-label="Product image" />
 <TableHead className="font-bold">Item Name</TableHead>
 <TableHead className="font-bold">Category</TableHead>
 <TableHead className="font-bold text-right">Quantity</TableHead>
 <TableHead className="font-bold text-right">Rate</TableHead>
 <TableHead className="font-bold text-right">Value</TableHead>
 <TableHead className="font-bold text-right">Action</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {paginatedItems.length === 0 ? (
 <TableRow>
 <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
 No items found matching your search or filters.
 </TableCell>
 </TableRow>
 ) : (
 paginatedItems.map((item) => {
 const isProduct = item.itemType === "PRODUCT";
 const hasVariants = Boolean(item.variants && item.variants.length > 0);
 const isExpanded = expandedItemIds.has(item.id);
 return (
 <React.Fragment key={item.id}>
 <TableRow
 role="link"
 tabIndex={0}
 onClick={() => handleItemClick(item)}
 onKeyDown={(event) => {
 if (event.key === "Enter" || event.key === " ") {
 event.preventDefault();
 handleItemClick(item);
 }
 }}
 className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
 >
 <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
 <Checkbox
 aria-label={`Select ${item.name}`}
 checked={selectedItemIds.has(item.id)}
 onChange={(event) =>
 setSelectedItemIds((current) => {
 const next = new Set(current);
 if (event.target.checked) next.add(item.id);
 else next.delete(item.id);
 return next;
 })
 }
 />
 </TableCell>

 {/* Column 1: Product Image */}
 <TableCell className="w-20 text-center" onClick={(event) => event.stopPropagation()}>
 <div className="flex items-center justify-center">
 {item.imageUrl ? (
 <img
 src={item.imageUrl}
 alt={item.name}
 loading="lazy"
 className="h-16 w-16 rounded-lg border border-border/70 bg-card object-contain shadow-xs shrink-0"
 />
 ) : (
 <div className="h-10 w-10 rounded-lg border border-border bg-muted/60 flex items-center justify-center shrink-0">
 {isProduct ? (
 <Box className="h-5 w-5 text-tone-blue-text" />
 ) : (
 <Boxes className="h-5 w-5 text-tone-amber-text" />
 )}
 </div>
 )}
 </div>
 </TableCell>

 {/* Column 2: Product Name & Variants */}
 <TableCell>
 <div className="flex flex-col">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-semibold text-foreground text-sm">
 {item.name}
 </span>
 {hasVariants && (
 <button
 type="button"
 onClick={(e) => toggleExpandItem(item.id, e)}
 className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors cursor-pointer"
 title="Click to view all variants"
 >
 <Boxes className="w-3 h-3 text-primary" />
 <span>{item.variants!.length} Variants</span>
 {isExpanded ? (
 <ChevronDown className="w-3 h-3 text-primary" />
 ) : (
 <ChevronRight className="w-3 h-3 text-primary" />
 )}
 </button>
 )}
 </div>

 {/* Variant Pills Preview for Fast Visual Recognition */}
 {hasVariants && (
 <div className="flex items-center gap-1.5 flex-wrap mt-1">
 {item.variants!.slice(0, 3).map((v, vIdx) => (
 <span
 key={v.id || vIdx}
 className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-muted text-foreground/90 border border-border"
 >
 <span>{getVariantLabel(item.name, v.name, v.measurementValue || `Variant ${vIdx + 1}`)}</span>
 </span>
 ))}
 {item.variants!.length > 3 && (
 <button
 type="button"
 onClick={(e) => toggleExpandItem(item.id, e)}
 className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
 >
 +{item.variants!.length - 3} more
 </button>
 )}
 </div>
 )}

 {item.description ? (
 <span className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
 {item.description}
 </span>
 ) : null}
 </div>
 </TableCell>

 {/* Column 3: Category */}
 <TableCell>
 <div className="flex flex-col items-start gap-1">
 {item.category?.name ? (
 <span
 className={getCategoryBadgeAppearance(item.category.name, item.categoryId).className}
 style={getCategoryBadgeAppearance(item.category.name, item.categoryId).style}
 >
 {item.category.name}
 </span>
 ) : (
 <span className="text-xs text-muted-foreground font-medium">—</span>
 )}
 {item.productFamily?.name && (
 <span className="text-[10px] text-muted-foreground">{item.productFamily.name}</span>
 )}
 </div>
 </TableCell>

 {/* Column 4: Quantity */}
 <TableCell className="text-right">
 <div className="inline-flex items-baseline justify-end gap-1">
 <span className="font-mono text-sm font-semibold text-foreground">
 {item.quantity.toLocaleString()}
 </span>
 <span className="text-[11px] font-medium text-muted-foreground">
 {item.uom?.symbol ?? item.uom?.name ?? "NOS"}
 </span>
 </div>
 </TableCell>

 {/* Column 5: Rate */}
 <TableCell className="text-right">
 <span className="font-mono text-sm font-semibold text-foreground">
 ₹{item.rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 </span>
 </TableCell>

 {/* Column 6: Value */}
 <TableCell className="text-right">
 <span className="font-mono text-sm font-bold text-foreground">
 ₹{item.value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 </span>
 </TableCell>

 {/* Column 7: Action */}
 <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
 <div className="flex items-center justify-end gap-1">
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer"
 onClick={() => {
 const editUrl = `/products/new?editId=${item.id}&mode=edit&type=${item.itemType}${viewMode === "all-items" ? "&view=all-items" : ""}${selectedFamily ? `&familyId=${selectedFamily.id}` : ""}`;
 router.push(editUrl);
 }}
 aria-label={`Edit ${item.name}`}
 title="Edit"
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
 onClick={() => {
 setDeleteError(null);
 setDeleteTarget([item]);
 }}
 aria-label={`Delete ${item.name}`}
 title="Delete"
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </TableCell>
 </TableRow>

 {/* Nested Expandable Variants Table */}
 {isExpanded && hasVariants && (
 <TableRow className="bg-muted/15 hover:bg-muted/20 border-border-strong border-border/80">
 <TableCell colSpan={8} className="p-0">
 <div className="py-3 px-6 pl-14 bg-muted/25 border-y border-border/50">
 <div className="overflow-hidden rounded-lg border border-border bg-card shadow-2xs">
 <table className="w-full text-left text-xs border-collapse">
 <thead className="bg-muted/50 border-border-strong border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
 <tr>
 <th className="px-3.5 py-2">Variant Name</th>
 <th className="px-3.5 py-2">Specification / Type</th>
 <th className="px-3.5 py-2 text-right">Opening Stock</th>
 <th className="px-3.5 py-2 text-right">Standard Rate</th>
 <th className="px-3.5 py-2 text-right">Safety Buffer</th>
 <th className="px-3.5 py-2 text-right">Reorder Point</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border/40 font-mono text-[11px]">
 {item.variants!.map((v, vIdx) => (
 <tr
 key={v.id || vIdx}
 onClick={(e) => {
 e.stopPropagation();
 const recordId = v.productRecordId || (item.itemType === 'MATERIAL' ? v.id : undefined);
 if (recordId && !recordId.includes('__var__')) {
 router.push(item.itemType === 'PRODUCT' ? `/products/${recordId}` : `/inventory/materials/${recordId}`);
 } else {
 handleItemClick(item);
 }
 }}
 className="hover:bg-muted/40 cursor-pointer transition-colors"
 >
 <td className="px-3.5 py-2 font-sans font-semibold text-foreground">
 {getVariantLabel(item.name, v.name, v.measurementValue || `Variant ${vIdx + 1}`)}
 </td>
 <td className="px-3.5 py-2 font-sans text-muted-foreground">
 {v.measurementValue ? (
 <span className="inline-block px-2 py-0.5 rounded bg-muted font-medium text-[11px]">
 {v.measurementValue}
 </span>
 ) : (
 "—"
 )}
 </td>
 <td className="px-3.5 py-2 text-right font-bold text-tone-green-text">
 {v.openingStock ?? 0} {item.uom?.symbol || "units"}
 </td>
 <td className="px-3.5 py-2 text-right font-bold text-foreground">
 {Number(v.standardPrice) > 0 ? `₹${Number(v.standardPrice).toLocaleString('en-IN')}` : "—"}
 </td>
 <td className="px-3.5 py-2 text-right text-muted-foreground">
 {v.minStockLevel ?? 0}
 </td>
 <td className="px-3.5 py-2 text-right text-primary">
 {v.reorderPoint ?? 0}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </TableCell>
 </TableRow>
 )}
 </React.Fragment>
 );
 })
 )}
 </TableBody>
 </Table>
 </div>

 {filteredItems.length > pageSize && (
 <PaginationControls
 page={page}
 pageSize={pageSize}
 total={filteredItems.length}
 onPageChange={setPage}
 onPageSizeChange={(nextPageSize) => {
 setPageSize(nextPageSize);
 setPage(1);
 }}
 />
 )}

 {/* Floating Bulk Action Bar */}
 {selectedItemIds.size > 0 && (
 <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-popover">
 <span className="text-sm font-semibold">{selectedItemIds.size} selected</span>
 <Button
 type="button"
 variant="destructive"
 size="sm"
 onClick={() => {
 setDeleteError(null);
 setDeleteTarget(filteredItems.filter((item) => selectedItemIds.has(item.id)));
 }}
 >
 <Trash2 className="mr-1.5 h-4 w-4" />
 {selectedItemIds.size === filteredItems.length ? "Delete all items" : "Delete selected"}
 </Button>
 </div>
 )}
 </CardContent>
 </Card>
 )}
 </div>

 {/* Confirmation Modal for Delete Action */}
 {deleteTarget && typeof document !== "undefined" && createPortal(
 <div
 className="fixed inset-0 z-[9999] flex min-h-screen min-h-[100dvh] w-screen items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]"
 role="presentation"
 onMouseDown={() => !isDeleting && setDeleteTarget(null)}
 >
 <div
 className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-modal"
 role="dialog"
 aria-modal="true"
 aria-labelledby="delete-item-title"
 onMouseDown={(event) => event.stopPropagation()}
 >
 <div className="flex items-start gap-3">
 <div className="rounded-full bg-destructive/10 p-2 text-destructive">
 <AlertTriangle className="h-5 w-5" />
 </div>
 <div>
 <h2 id="delete-item-title" className="text-base font-bold">Remove catalog item(s)?</h2>
 <p className="mt-1 text-sm text-muted-foreground">
 Deactivate{" "}
 <strong>
 {deleteTarget.length === 1
 ? `${deleteTarget[0].name} (${deleteTarget[0].code || "No Code"})`
 : `${deleteTarget.length} selected items`}
 </strong>
 ? BOMs, production schedules, and history will be preserved.
 </p>
 </div>
 </div>
 {deleteError && (
 <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
 {deleteError}
 </p>
 )}
 <div className="mt-6 flex justify-end gap-2">
 <Button
 type="button"
 variant="outline"
 disabled={isDeleting}
 onClick={() => setDeleteTarget(null)}
 >
 Cancel
 </Button>
 <Button
 type="button"
 variant="destructive"
 disabled={isDeleting}
 onClick={handleDelete}
 >
 {isDeleting ? "Deactivating…" : "Confirm"}
 </Button>
 </div>
 </div>
 </div>,
 document.body
 )}
 </div>
 );
}

export default function ProductsPage() {
 return (
 <Suspense fallback={<LoadingState message="Loading inventory catalog..." />}>
 <ProductsPageContent />
 </Suspense>
 );
}

function getItemImage(itemType: "PRODUCT" | "MATERIAL", product?: Product, material?: Material): string | null {
 if (itemType === "PRODUCT" && product) {
 const meta = (product.metadata || {}) as any;
 if (meta.images && Array.isArray(meta.images) && meta.images.length > 0) {
 const first = meta.images[0];
 if (typeof first === "string" && first.trim()) return first.trim();
 if (first && typeof first === "object" && typeof first.url === "string" && first.url.trim()) {
 return first.url.trim();
 }
 }
 if (meta.imageUrl && typeof meta.imageUrl === "string" && meta.imageUrl.trim()) {
 return meta.imageUrl.trim();
 }
 if (meta.image && typeof meta.image === "string" && meta.image.trim()) {
 return meta.image.trim();
 }
 }

 if (itemType === "MATERIAL" && material) {
 const specs = (material.specs || {}) as any;
 if (specs.images && Array.isArray(specs.images) && specs.images.length > 0) {
 const first = specs.images[0];
 if (typeof first === "string" && first.trim()) return first.trim();
 if (first && typeof first === "object" && typeof first.url === "string" && first.url.trim()) {
 return first.url.trim();
 }
 }
 if (specs.imageUrl && typeof specs.imageUrl === "string" && specs.imageUrl.trim()) {
 return specs.imageUrl.trim();
 }
 if (specs.image && typeof specs.image === "string" && specs.image.trim()) {
 return specs.image.trim();
 }
 if ((material as any).imageUrl && typeof (material as any).imageUrl === "string" && (material as any).imageUrl.trim()) {
 return (material as any).imageUrl.trim();
 }
 }

 return null;
}

function getItemRate(itemType: "PRODUCT" | "MATERIAL", product?: Product, material?: Material): number {
 if (itemType === "PRODUCT" && product) {
 if (product.standardPrice !== undefined && Number(product.standardPrice) > 0) {
 return Number(product.standardPrice);
 }
 const meta = (product.metadata || {}) as any;
 if (meta.sellingPrice !== undefined && Number(meta.sellingPrice) > 0) {
 return Number(meta.sellingPrice);
 }
 if (meta.mrp !== undefined && Number(meta.mrp) > 0) {
 return Number(meta.mrp);
 }
 if ((product as any).sellingPrice !== undefined && Number((product as any).sellingPrice) > 0) {
 return Number((product as any).sellingPrice);
 }
 if (meta.standardPrice !== undefined && Number(meta.standardPrice) > 0) {
 return Number(meta.standardPrice);
 }
 if (meta.costPrice !== undefined && Number(meta.costPrice) > 0) {
 return Number(meta.costPrice);
 }
 if ((product as any).costPrice !== undefined && Number((product as any).costPrice) > 0) {
 return Number((product as any).costPrice);
 }
 return 0;
 }

 if (itemType === "MATERIAL" && material) {
 if (material.standardPrice !== undefined && Number(material.standardPrice) > 0) {
 return Number(material.standardPrice);
 }
 if (material.standardCost !== undefined && Number(material.standardCost) > 0) {
 return Number(material.standardCost);
 }
 const specs = (material.specs || {}) as any;
 if (specs.standardCost !== undefined && Number(specs.standardCost) > 0) {
 return Number(specs.standardCost);
 }
 if (specs.rate !== undefined && Number(specs.rate) > 0) {
 return Number(specs.rate);
 }
 if (specs.mrp !== undefined && Number(specs.mrp) > 0) {
 return Number(specs.mrp);
 }
 if (specs.sellingPrice !== undefined && Number(specs.sellingPrice) > 0) {
 return Number(specs.sellingPrice);
 }
 if (specs.costPrice !== undefined && Number(specs.costPrice) > 0) {
 return Number(specs.costPrice);
 }
 if ((material as any).standardPrice !== undefined && Number((material as any).standardPrice) > 0) {
 return Number((material as any).standardPrice);
 }
 return 0;
 }

 return 0;
}

function getItemQuantity(
 itemId: string,
 itemCode: string,
 itemType: "PRODUCT" | "MATERIAL",
 stockMap: Map<string, { onHandQuantity: number; inventoryValue: number }>,
 product?: Product,
 material?: Material,
 variants?: CatalogItemVariant[]
): { quantity: number; inventoryValue: number } {
 // 1. Check live inventory balances for parent item
 const liveStock = stockMap.get(itemId) || stockMap.get(itemCode);
 const onHand = liveStock?.onHandQuantity || 0;
 const invValue = liveStock?.inventoryValue || 0;

 // 2. Also accumulate variant stock balances if any exist
 let variantStock = 0;
 let variantValue = 0;
 if (variants && variants.length > 0) {
 variants.forEach((v) => {
 const vLive = (v.id ? stockMap.get(v.id) : null) || (v.sku ? stockMap.get(v.sku) : null);
 if (vLive && vLive.onHandQuantity > 0) {
 variantStock += vLive.onHandQuantity;
 variantValue += vLive.inventoryValue;
 } else {
 const vOpen = Math.max(0, Number(v.openingStock) || 0);
 variantStock += vOpen;
 if (Number(v.standardPrice) && vOpen > 0) {
 variantValue += vOpen * Number(v.standardPrice);
 }
 }
 });
 }

 if (onHand > 0) {
 return {
 quantity: onHand + variantStock,
 inventoryValue: invValue + variantValue,
 };
 }

 // 3. Fallback to initial / opening stock recorded on entity
 let openingStock = 0;
 if (itemType === "PRODUCT" && product) {
 const meta = (product.metadata || {}) as any;
 openingStock = Number(
 product.openingStock ??
 meta.initialQuantity ??
 meta.openingStock ??
 (product as any).initialQuantity ??
 0
 );
 } else if (itemType === "MATERIAL" && material) {
 const specs = (material.specs || {}) as any;
 openingStock = Number(
 material.openingStock ??
 specs.initialQuantity ??
 specs.openingStock ??
 (material as any).initialQuantity ??
 0
 );
 }

 return {
 quantity: Math.max(0, openingStock) + variantStock,
 inventoryValue: (liveStock?.inventoryValue ?? 0) + variantValue,
 };
}
