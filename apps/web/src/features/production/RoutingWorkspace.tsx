'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
 ArrowLeft,
 Boxes,
 CornerDownRight,
 Factory,
 PackageCheck,
 Save,
 Trash2,
 Workflow,
 X,
 ArrowDown,
 GripVertical,
 ChevronUp,
 ChevronDown,
 Search,
 Plus
} from 'lucide-react';
import {
 Input,
 Checkbox
} from '@plinth/ui';
import { fetchApi } from '../api/client';
import {
 expandProductsWithVariants,
 useProducts,
 useMaterials,
 useDepartments,
 useUoms
} from '@/hooks/useMasterData';
import { useBomVersions, useBomVersion } from '@/features/bom/hooks';
import { showToast } from '@/components/toast-store';
import { isProductionExecutionDepartment, resolveAssemblyDepartment, isAssemblyDepartment } from '@/features/production/types';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import { getVariantLabel } from '@/features/products/variant-names';
import { DepartmentDialog } from '@/components/DepartmentDialog';
import { ReturnToProductDraftBanner } from '@/components/ReturnToProductDraftBanner';

interface AllocatedItem {
 bomLineId: string;
 itemName: string;
 quantity: number | string;
 maxQuantity: number;
 uom: string;
}

interface DepartmentStep {
 key: string;
 departmentId: string;
 stepName: string;
 standardDurationMinutes: number | null;
 isQcRequired: boolean;
 isSubDepartment: boolean;
 parentKey: string | null;
 subDepartments: DepartmentStep[];
 allocatedItems: AllocatedItem[];
 outputItemType?: 'MATERIAL' | 'PRODUCT';
 outputItemId?: string;
 outputQuantityPerUnit?: number | string;
 outputUomId?: string;
 nextDepartmentId?: string;
}

interface RouteStepDetail {
 id: string;
 sequenceNumber: number;
 branchKey?: string | null;
 stepOrder?: number | null;
 stepName: string;
 departmentId: string;
 standardDurationMinutes?: number | null;
 isQcRequired: boolean;
 parentStepId?: string | null;
 nextDepartmentId?: string | null;
 outputItemType?: 'MATERIAL' | 'PRODUCT' | null;
 outputItemId?: string | null;
 outputUomId?: string | null;
 outputQuantityPerUnit?: number | string | null;
}

interface RouteDetail {
 id: string;
 code: string;
 name: string;
 status: string;
 version: number;
 productId?: string | null;
 bomVersionId?: string | null;
 assemblyDepartmentId?: string | null;
 effectiveFrom: string;
 steps: RouteStepDetail[];
 materialAllocations?: Array<{
 id: string;
 routeStepId: string | null;
 bomLineId: string;
 quantity: number | string;
 }>;
}

const newKey = () => `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function RoutingWorkspace() {
 const router = useRouter();
 const params = useParams();
 const pathname = usePathname();
 const queryClient = useQueryClient();
 const routeIdParam = (params?.id as string) || '';
 const isNew = !routeIdParam || routeIdParam === 'new';
 const routingBase = pathname?.startsWith('/manufacturing')
 ? '/manufacturing/routing'
 : '/inventory/routing';

 // Master data queries
 const { data: products, isLoading: isLoadingProducts } = useProducts('ACTIVE', 1, 500);
 const { data: materials } = useMaterials('ACTIVE', 1, 500);
 const { data: departments, isLoading: isLoadingDepartments } = useDepartments('ACTIVE');
 const { data: uoms } = useUoms('ACTIVE');
 const assemblyDepartment = useMemo(
 () => resolveAssemblyDepartment(departments?.items || []),
 [departments?.items]
 );
 const allAssemblyDepartments = useMemo(() => {
 return (departments?.items || []).filter(
 (dept) => Boolean((dept as any).isAssembly) || isAssemblyDepartment(dept)
 );
 }, [departments?.items]);
 const [selectedAssemblyDeptId, setSelectedAssemblyDeptId] = useState<string>('');

 // Existing route data
 const { data: route, isLoading: isLoadingRoute } = useQuery<RouteDetail>({
 queryKey: ['routing-route', routeIdParam],
 enabled: !isNew,
 queryFn: () => fetchApi(`/master-data/routing/routes/${routeIdParam}`)
 });

 useEffect(() => {
 if (route?.assemblyDepartmentId) {
 setSelectedAssemblyDeptId(route.assemblyDepartmentId);
 } else if (assemblyDepartment?.id && !selectedAssemblyDeptId) {
 setSelectedAssemblyDeptId(assemblyDepartment.id);
 }
 }, [route?.assemblyDepartmentId, assemblyDepartment?.id, selectedAssemblyDeptId]);

 // Route identity state
 const [name, setName] = useState('');
 const routeNameDefaultedForProductRef = useRef<string | null>(null);
 const [productId, setProductId] = useState('');
 const [bomVersionId, setBomVersionId] = useState('');
 const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
 const [departmentsList, setDepartmentsList] = useState<DepartmentStep[]>([]);
 const [saving, setSaving] = useState(false);
 const [hydrated, setHydrated] = useState(false);

 // Dynamically detect which Assembly Department is targeted by the steps' handoffs
 const detectedAssemblyDeptId = useMemo(() => {
 const assemblyIds = new Set(allAssemblyDepartments.map((d) => d.id));
 for (let i = departmentsList.length - 1; i >= 0; i--) {
 const step = departmentsList[i];
 if (step.nextDepartmentId && assemblyIds.has(step.nextDepartmentId)) {
 return step.nextDepartmentId;
 }
 for (let j = step.subDepartments.length - 1; j >= 0; j--) {
 const sub = step.subDepartments[j];
 if (sub.nextDepartmentId && assemblyIds.has(sub.nextDepartmentId)) {
 return sub.nextDepartmentId;
 }
 }
 }
 return selectedAssemblyDeptId || route?.assemblyDepartmentId || allAssemblyDepartments[0]?.id || assemblyDepartment?.id || '';
 }, [departmentsList, allAssemblyDepartments, selectedAssemblyDeptId, route?.assemblyDepartmentId, assemblyDepartment?.id]);

 const effectiveAssemblyDept = useMemo(() => {
 const targetId = detectedAssemblyDeptId || selectedAssemblyDeptId || route?.assemblyDepartmentId || assemblyDepartment?.id;
 return (departments?.items || []).find((d) => d.id === targetId) || assemblyDepartment;
 }, [detectedAssemblyDeptId, selectedAssemblyDeptId, route?.assemblyDepartmentId, departments?.items, assemblyDepartment]);

 // The Assembly convergence gate is a valid destination even though it is
 // intentionally excluded from the list of production operation stages.
 // A handoff destination must reference a real Department row. Do not use a
 // synthetic UI sentinel because the API validates UUIDs and persists a FK.
 const assemblyDestinationId = effectiveAssemblyDept?.id || detectedAssemblyDeptId || assemblyDepartment?.id || '';

 // Department creation dialog
 const [createDeptOpen, setCreateDeptOpen] = useState(false);
 const [targetStepKey, setTargetStepKey] = useState<string | null>(null);

 // Right sidebar department search & drag state
 const [deptSearch, setDeptSearch] = useState('');
 const [draggedSidebarDeptId, setDraggedSidebarDeptId] = useState<string | null>(null);
 const [draggedStageKey, setDraggedStageKey] = useState<string | null>(null);
 const [draggedSubStageInfo, setDraggedSubStageInfo] = useState<{
 parentKey: string;
 key: string;
 } | null>(null);
 const [activeSubDropZone, setActiveSubDropZone] = useState<string | null>(null);
 const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
 const [isDragOverAddStage, setIsDragOverAddStage] = useState(false);
 const [dragOverSubBtnKey, setDragOverSubBtnKey] = useState<string | null>(null);

 useEffect(() => {
 setHydrated(false);
 setDepartmentsList([]);
 }, [routeIdParam]);

 // Routes created before Assembly was backed by a Department row stored this
 // UI-only sentinel. Replace it as soon as the real Assembly department is
 // available so stale form state cannot survive a reload or a selection.
 useEffect(() => {
 if (!assemblyDestinationId) return;
 const replaceLegacyAssemblyId = (steps: DepartmentStep[]): DepartmentStep[] => steps.map((step) => {
 const subDepartments = replaceLegacyAssemblyId(step.subDepartments);
 if (step.nextDepartmentId === 'ASSEMBLY_FINAL' || subDepartments !== step.subDepartments) {
 return {
 ...step,
 ...(step.nextDepartmentId === 'ASSEMBLY_FINAL' ? { nextDepartmentId: assemblyDestinationId } : {}),
 subDepartments
 };
 }
 return step;
 });
 setDepartmentsList((current) => replaceLegacyAssemblyId(current));
 }, [assemblyDestinationId]);

 // Target Product options with full variant hierarchy
 const productOptions = useMemo(() => {
 const rawList = products?.items || [];
 const expanded = expandProductsWithVariants(rawList);
 return expanded.map((p) => {
 const isVar = Boolean(
 p.isVariant ||
 (p.metadata as any)?.isVariant ||
 p.parentOptionId ||
 p.parentProductId
 );
 return {
 id: p.id,
 name: p.name,
 code: p.sku || (p as any).code || '',
 sku: p.sku || '',
 isVariant: isVar,
 parentOptionId:
 p.parentOptionId ||
 p.parentProductId ||
 (p.metadata as any)?.parentProductId ||
 undefined,
 parentItemName: p.parentItemName || (p as any).parentProductName || undefined,
 status: p.status || 'ACTIVE'
 };
 });
 }, [products?.items]);

 // Selected option from dropdown (handles variants)
 const selectedProductOption = useMemo(() => {
 return productOptions.find((p) => p.id === productId);
 }, [productOptions, productId]);

 // Selected product object from master data
 const selectedProduct = useMemo(() => {
 return (products?.items || []).find((p) => p.id === productId);
 }, [products?.items, productId]);

 // If a variant is selected, resolve its parent product ID because variants share the parent product's BOM
 const effectiveProductId = useMemo(() => {
 if (!productId) return '';
 const parentId =
 selectedProductOption?.parentOptionId ||
 (selectedProductOption as any)?.parentProductId ||
 (selectedProduct as any)?.parentProductId ||
 (selectedProduct as any)?.parentOptionId ||
 (selectedProduct?.metadata as any)?.parentProductId;
 if (parentId) return parentId;
 if (productId.includes('__var__')) {
 return productId.split('__var__')[0];
 }
 return productId;
 }, [productId, selectedProductOption, selectedProduct]);

 // Fetch ALL BOM versions of the selected product or variant's parent product
 const { data: boms, isLoading: isLoadingBoms } = useBomVersions(
 { productId: effectiveProductId, limit: 100 },
 { enabled: !!effectiveProductId }
 );
 const { data: bom } = useBomVersion(bomVersionId);

 // All BOM versions of the product with version indicator
 const bomOptions = useMemo(() => {
 const options = (boms?.items || []).map((b) => ({
 id: b.id,
 name: b.bomNumber
 ? `${b.bomNumber} (v${b.version})`
 : `BOM Version ${b.version}`,
 code: b.status ? `[${b.status}]` : `v${b.version}`,
 status: b.status
 }));
 if (bom && !options.some((option) => option.id === bom.id)) {
 options.unshift({
 id: bom.id,
 name: bom.bomNumber ? `${bom.bomNumber} (v${bom.version})` : `BOM Version ${bom.version}`,
 code: bom.status ? `[${bom.status}]` : `v${bom.version}`,
 status: bom.status
 });
 }
 return options;
 }, [boms?.items, bom]);

 // Department options for selection
 const departmentOptions = useMemo(() => {
 return (departments?.items || [])
 .filter((department) =>
 department.id !== assemblyDepartment?.id &&
 department.id !== effectiveAssemblyDept?.id &&
 !(department as any).isAssembly &&
 Boolean(department.name?.trim()) &&
 Boolean(department.code?.trim()) &&
 isProductionExecutionDepartment(department)
 )
 .map((d) => ({
 id: d.id,
 name: `${d.name} (${d.code})`,
 code: d.code
 }));
 }, [departments?.items, assemblyDepartment?.id, effectiveAssemblyDept?.id]);

 const defaultUomId = useMemo(() => {
 return selectedProduct?.uomId || (uoms?.items?.[0]?.id ?? '');
 }, [selectedProduct?.uomId, uoms?.items]);

 // Combined searchable catalog options for department output items (Products & Materials)
 const outputCatalogOptions = useMemo(() => {
 const prodItems = (products?.items || []).map((p) => {
 const uomLabel = p.uom?.symbol || p.uom?.name || 'units';
 const product = p as any;
 return {
 id: p.id,
 name: `${p.name} (${uomLabel})`,
 code: p.sku || (p as any).code || 'Product',
 type: 'PRODUCT' as const,
 uomId: p.uomId,
 uomSymbol: uomLabel,
 isVariant: Boolean(product.isVariant || product.metadata?.isVariant || product.parentOptionId || product.parentProductId),
 parentOptionId: product.parentOptionId || product.parentProductId || undefined,
 parentItemName: product.parentItemName || product.parentProduct?.name || product.parentName || undefined,
 category: product.category
 };
 });
 const matItems = (materials?.items || []).map((m) => {
 const uomLabel = m.uom?.symbol || m.uom?.name || 'units';
 const material = m as any;
 return {
 id: m.id,
 name: `${m.name} (${uomLabel})`,
 code: m.code || 'Material',
 type: 'MATERIAL' as const,
 uomId: m.uomId,
 uomSymbol: uomLabel,
 isVariant: Boolean(material.isVariant || material.parentOptionId || material.parentMaterialId),
 parentOptionId: material.parentOptionId || material.parentMaterialId || undefined,
 parentItemName: material.parentItemName || material.parentMaterial?.name || material.parentName || undefined,
 category: material.category
 };
 });
 return [...prodItems, ...matItems];
 }, [products?.items, materials?.items]);

 // Match the BOM picker: show the item name, variant hierarchy and category,
 // without the SKU/code line used by the generic selector renderer.
 const renderOutputCatalogOption = (item: (typeof outputCatalogOptions)[number]) => (
 <div className={`flex min-w-0 items-center gap-2 ${item.parentOptionId ? 'ml-3 border-l-2 border-tone-purple-solid/25 pl-3 ' : ''}`}>
 <div className="min-w-0 flex-1">
 <div className="flex min-w-0 items-center gap-2">
 <span className={`truncate ${item.isVariant ? 'text-xs font-medium text-foreground/80' : 'text-xs font-bold text-foreground'}`}>
 {item.parentOptionId ? '↳ ' : ''}{item.isVariant ? getVariantLabel(item.parentItemName, item.name) : item.name}
 </span>
 {item.isVariant && (
 <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
 Variant
 </span>
 )}
 </div>
 {item.category?.name && <span className="block truncate text-[10px] text-muted-foreground">{item.category.name}</span>}
 </div>
 </div>
 );

 const uomOptions = useMemo(() => {
 return (uoms?.items || []).map((u) => ({
 id: u.id,
 name: `${u.name} (${u.symbol || u.code || ''})`,
 code: u.symbol || u.code || u.name
 }));
 }, [uoms?.items]);

 const nextDepartmentOptions = useMemo(() => {
 const all = departments?.items || [];
 const assemblyIds = new Set(allAssemblyDepartments.map((d) => d.id));
 const options = all.map((d) => {
 const isAssemblyDept = Boolean((d as any).isAssembly) || isAssemblyDepartment(d) || assemblyIds.has(d.id) || d.id === effectiveAssemblyDept?.id || d.id === assemblyDepartment?.id;
 return {
 id: d.id,
 name: isAssemblyDept ? `${d.name} [Assembly Gate]` : `${d.name} (${d.code})`,
 code: d.code,
 isAssembly: isAssemblyDept
 };
 });
 for (const ad of allAssemblyDepartments) {
 if (!options.some((option) => option.id === ad.id)) {
 options.push({
 id: ad.id,
 name: `${ad.name} [Assembly Gate]`,
 code: ad.code,
 isAssembly: true
 });
 }
 }
 return options;
 }, [departments?.items, allAssemblyDepartments, effectiveAssemblyDept?.id, assemblyDepartment?.id]);

 // Filtered departments for right panel
 const filteredDepartments = useMemo(() => {
 const selectedDepartmentIds = new Set<string>();
 const collectSelectedDepartments = (steps: DepartmentStep[]) => steps.forEach((step) => {
 if (step.departmentId) selectedDepartmentIds.add(step.departmentId);
 collectSelectedDepartments(step.subDepartments);
 });
 collectSelectedDepartments(departmentsList);
 const list = (departments?.items || []).filter((department) =>
 department.id !== assemblyDepartment?.id &&
 department.id !== effectiveAssemblyDept?.id &&
 !(department as any).isAssembly &&
 Boolean(department.name?.trim()) &&
 Boolean(department.code?.trim()) &&
 isProductionExecutionDepartment(department) &&
 !selectedDepartmentIds.has(department.id)
 );
 const q = deptSearch.trim().toLowerCase();
 if (!q) return list;
 return list.filter(
 (d) =>
 d.name.toLowerCase().includes(q) ||
 (d.code && d.code.toLowerCase().includes(q))
 );
 }, [departments?.items, deptSearch, assemblyDepartment?.id, effectiveAssemblyDept?.id, departmentsList]);

 // Auto-select first BOM when product/variant changes if no BOM selected
 useEffect(() => {
 // On edit, the saved BOM is authoritative. The product BOM list can load
 // with placeholder data first and must not replace that route selection.
 if (!isNew) return;
 if (boms?.items?.length) {
 if (!bomVersionId || !boms.items.some((b) => b.id === bomVersionId)) {
 const approvedBom = boms.items.find(
 (b) => b.status === 'APPROVED' || (b.status as string) === 'ACTIVE'
 );
 setBomVersionId(approvedBom ? approvedBom.id : boms.items[0].id);
 }
 } else if (!boms?.items?.length && effectiveProductId) {
 setBomVersionId('');
 }
 }, [isNew, boms?.items, bomVersionId, effectiveProductId]);

 // Set the suggested route name once per product selection. Watching `name`
 // here would refill the field immediately after the user clears it.
 useEffect(() => {
 const displayName = selectedProductOption?.name || selectedProduct?.name;
 if (!productId) {
 routeNameDefaultedForProductRef.current = null;
 return;
 }
 if (displayName && routeNameDefaultedForProductRef.current !== productId) {
 setName(`${displayName} Production Route`);
 routeNameDefaultedForProductRef.current = productId;
 }
 }, [productId, selectedProductOption?.name, selectedProduct?.name]);

 // Available BOM lines map with 1-based line index
 const bomLinesMap = useMemo(() => {
 const map = new Map<
 string,
 { id: string; name: string; quantity: number; uom: string; lineIndex: number }
 >();
 (bom?.lines || []).forEach((line, idx) => {
 const itemName = line.material?.name || line.componentProduct?.name || 'Material Item';
 const uomLabel = line.uom?.symbol || line.uom?.name || 'units';
 map.set(line.id, {
 id: line.id,
 name: itemName,
 quantity: Number(line.quantity) || 1,
 uom: uomLabel,
 lineIndex: idx + 1
 });
 });
 return map;
 }, [bom?.lines]);

 // Flatten all department steps (including sub-departments)
 const allStepsFlat = useMemo(() => {
 const list: DepartmentStep[] = [];
 const traverse = (step: DepartmentStep) => {
 list.push(step);
 step.subDepartments.forEach(traverse);
 };
 departmentsList.forEach(traverse);
 return list;
 }, [departmentsList]);

 // Map each BOM line ID to every stage receiving part of its quantity
 const allocationByBomLineId = useMemo(() => {
 const map = new Map<string, Array<{ stepKey: string; stepTitle: string; stepNumber: string; quantity: number }>>();
 const visit = (step: DepartmentStep, stepNumber: string) => {
 const deptName = departmentOptions.find((d) => d.id === step.departmentId)?.name.split(' (')[0] || '';
 const title = step.stepName.trim() || deptName || `Stage ${stepNumber}`;
 step.allocatedItems.forEach((item) => {
 const destinations = map.get(item.bomLineId) || [];
 destinations.push({
 stepKey: step.key,
 stepTitle: `Stage ${stepNumber}: ${title}`,
 stepNumber,
 quantity: Number(item.quantity) || 0
 });
 map.set(item.bomLineId, destinations);
 });
 step.subDepartments.forEach((child, index) => visit(child, `${stepNumber}.${index + 1}`));
 };
 departmentsList.forEach((step, index) => visit(step, `${index + 1}`));
 return map;
 }, [departmentsList, departmentOptions]);

 const allocatedQuantityByBomLineId = useMemo(() => {
 const totals = new Map<string, number>();
 allocationByBomLineId.forEach((destinations, bomLineId) => {
 totals.set(
 bomLineId,
 Number(destinations.reduce((sum, destination) => sum + destination.quantity, 0).toFixed(6))
 );
 });
 return totals;
 }, [allocationByBomLineId]);

 const allocatedBomLineIds = useMemo(() => {
 return new Set([...allocatedQuantityByBomLineId]
 .filter(([, quantity]) => quantity > 0.000001)
 .map(([bomLineId]) => bomLineId));
 }, [allocatedQuantityByBomLineId]);

 // Keep every BOM line visible in each selector. A partially allocated line
 // remains selectable, while an exhausted line stays visible but disabled.
 const availableBomItems = useMemo(() => {
 return Array.from(bomLinesMap.values())
 .map((line) => ({
 line,
 remaining: Number(Math.max(0, line.quantity - (allocatedQuantityByBomLineId.get(line.id) || 0)).toFixed(6))
 }))
 .map((line) => ({
 id: line.line.id,
 name: `#${line.line.lineIndex} · ${line.line.name} (${line.remaining} ${line.line.uom} remaining)`,
 code: line.remaining > 0.000001 ? `${line.remaining} ${line.line.uom} remaining` : 'Fully allocated',
 remaining: line.remaining
 }));
 }, [bomLinesMap, allocatedQuantityByBomLineId]);

 const getAvailableBomItemsForStep = (_stepKey: string) =>
 availableBomItems.map((item) => {
 return {
 ...item,
 disabled: item.remaining <= 0.000001,
 code: item.remaining <= 0.000001 ? 'Fully allocated' : `${item.remaining} ${bomLinesMap.get(item.id)?.uom || ''} remaining`
 };
 });

 const getAvailableQuantityForStep = (stepKey: string, bomLineId: string) => {
 const line = bomLinesMap.get(bomLineId);
 if (!line) return 0;
 const assignedElsewhere = (allocationByBomLineId.get(bomLineId) || [])
 .filter((allocation) => allocation.stepKey !== stepKey)
 .reduce((sum, allocation) => sum + allocation.quantity, 0);
 return Number(Math.max(0, line.quantity - assignedElsewhere).toFixed(6));
 };

 // Load route identity first so the product/BOM queries can resolve before
 // the route's department allocations are hydrated.
 useEffect(() => {
 if (!route) return;
 setName(route.name);
 setProductId(route.productId || '');
 setBomVersionId(route.bomVersionId || '');
 setEffectiveFrom(route.effectiveFrom?.slice(0, 10) || new Date().toISOString().slice(0, 10));
 }, [route]);

 // Hydrate from existing route after its BOM lines are available.
 useEffect(() => {
 if (!route || hydrated || !bom?.lines?.length) return;

 // Reconstruct departments and sub-departments hierarchy
 const allocationByStep = new Map<string, AllocatedItem[]>();
 (route.materialAllocations || []).forEach((alloc: any) => {
 if (alloc.routeStepId && bomLinesMap.has(alloc.bomLineId)) {
 const line = bomLinesMap.get(alloc.bomLineId)!;
 const current = allocationByStep.get(alloc.routeStepId) || [];
 current.push({
 bomLineId: line.id,
 itemName: line.name,
 quantity: Number(alloc.quantity) || line.quantity,
 maxQuantity: line.quantity,
 uom: line.uom
 });
 allocationByStep.set(alloc.routeStepId, current);
 }
 });

 const rootSteps: DepartmentStep[] = [];

 const sortedSteps = [...route.steps].sort(
 (a, b) => (a.branchKey || '').localeCompare(b.branchKey || '') ||
 (a.stepOrder || a.sequenceNumber) - (b.stepOrder || b.sequenceNumber)
 );

 const stepsByBranch = new Map<string, typeof sortedSteps>();
 sortedSteps.forEach((step) => {
 const branchKey = step.branchKey || 'Legacy route';
 stepsByBranch.set(branchKey, [...(stepsByBranch.get(branchKey) || []), step]);
 });
 const orderedRouteBranches = Array.from(stepsByBranch.values());
 orderedRouteBranches.forEach((branchSteps, branchIndex) => {
 const branch = branchSteps.map((step, index): DepartmentStep => {
 const nextStepCandidate = branchSteps[index + 1];
 const nextPrimaryStage = orderedRouteBranches[branchIndex + 1]?.[0];
 const nextDept = step.nextDepartmentId || nextStepCandidate?.departmentId || nextPrimaryStage?.departmentId || assemblyDestinationId;
 return {
 key: step.id,
 departmentId: step.departmentId,
 stepName: step.stepName,
 standardDurationMinutes: step.standardDurationMinutes ?? null,
 isQcRequired: Boolean(step.isQcRequired),
 isSubDepartment: index > 0,
 parentKey: index > 0 ? branchSteps[0].id : null,
 subDepartments: [],
 allocatedItems: allocationByStep.get(step.id) || [],
 outputItemType: (step.outputItemType as any) || 'PRODUCT',
 outputItemId: step.outputItemId || route.productId || '',
 outputQuantityPerUnit: step.outputQuantityPerUnit ? Number(step.outputQuantityPerUnit) : 1,
 outputUomId: step.outputUomId || '',
 nextDepartmentId: nextDept
 };
 });
 if (branch.length > 0) {
 branch[0].subDepartments = branch.slice(1);
 rootSteps.push(branch[0]);
 }
 });

 setDepartmentsList(rootSteps.length > 0 ? rootSteps : []);
 setHydrated(true);
 }, [route, hydrated, bom?.lines, bomLinesMap, assemblyDestinationId]);

 const isDepartmentUsedByAnotherStep = (departmentId: string, exceptStepKey?: string) => {
 if (!departmentId) return false;
 let alreadyUsed = false;
 const visit = (steps: DepartmentStep[]) => steps.forEach((step) => {
 if (step.key !== exceptStepKey && step.departmentId === departmentId) alreadyUsed = true;
 visit(step.subDepartments);
 });
 visit(departmentsList);
 return alreadyUsed;
 };

 // Add primary department (Operation name NOT auto-filled)
 const addDepartment = (departmentId = '', atIndex?: number) => {
 if (isDepartmentUsedByAnotherStep(departmentId)) return;
 const newStep: DepartmentStep = {
 key: newKey(),
 departmentId,
 stepName: '',
 standardDurationMinutes: null,
 isQcRequired: false,
 isSubDepartment: false,
 parentKey: null,
 subDepartments: [],
 allocatedItems: [],
 outputItemType: 'PRODUCT',
 outputItemId: effectiveProductId || productId || '',
 outputQuantityPerUnit: 1,
 outputUomId: defaultUomId,
 nextDepartmentId: assemblyDestinationId
 };
 setDepartmentsList((prev) => {
 if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= prev.length) {
 const next = [...prev];
 next.splice(atIndex, 0, newStep);
 return next;
 }
 return [...prev, newStep];
 });
 };

 // Add sub-department under a parent department (Operation name NOT auto-filled)
 const addSubDepartment = (parentKey: string, departmentId = '', atIndex?: number) => {
 if (isDepartmentUsedByAnotherStep(departmentId)) return;
 const updateRecursive = (list: DepartmentStep[]): DepartmentStep[] => {
 return list.map((step) => {
 if (step.key === parentKey) {
 const subStep: DepartmentStep = {
 key: newKey(),
 departmentId,
 stepName: '',
 standardDurationMinutes: null,
 isQcRequired: false,
 isSubDepartment: true,
 parentKey: step.key,
 subDepartments: [],
 allocatedItems: [],
 outputItemType: 'PRODUCT',
 outputItemId: effectiveProductId || productId || '',
 outputQuantityPerUnit: 1,
 outputUomId: defaultUomId,
 nextDepartmentId: assemblyDestinationId
 };
 const nextSubs = [...step.subDepartments];
 if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= nextSubs.length) {
 nextSubs.splice(atIndex, 0, subStep);
 } else {
 nextSubs.push(subStep);
 }
 return {
 ...step,
 subDepartments: nextSubs
 };
 }
 return {
 ...step,
 subDepartments: updateRecursive(step.subDepartments)
 };
 });
 };
 setDepartmentsList((prev) => updateRecursive(prev));
 };

 // Move a primary stage up or down
 const moveStage = (fromIndex: number, toIndex: number) => {
 if (toIndex < 0 || toIndex >= departmentsList.length) return;
 setDepartmentsList((prev) => {
 const next = [...prev];
 const [moved] = next.splice(fromIndex, 1);
 next.splice(toIndex, 0, moved);
 return next;
 });
 };

 // Move a sub-department up or down within its parent
 const moveSubStage = (parentKey: string, fromIndex: number, toIndex: number) => {
 const updateRecursive = (list: DepartmentStep[]): DepartmentStep[] => {
 return list.map((step) => {
 if (step.key === parentKey) {
 if (toIndex < 0 || toIndex >= step.subDepartments.length) return step;
 const nextSubs = [...step.subDepartments];
 const [moved] = nextSubs.splice(fromIndex, 1);
 nextSubs.splice(toIndex, 0, moved);
 return { ...step, subDepartments: nextSubs };
 }
 return { ...step, subDepartments: updateRecursive(step.subDepartments) };
 });
 };
 setDepartmentsList((prev) => updateRecursive(prev));
 };

 // Promote a sub-stage to become a primary stage
 const promoteSubToPrimary = (subStageKey: string, targetIndex?: number) => {
 setDepartmentsList((prev) => {
 let extractedSub: DepartmentStep | null = null;
 const cleaned = prev.map((root) => {
 const remainingSubs = root.subDepartments.filter((sub) => {
 if (sub.key === subStageKey) {
 extractedSub = sub;
 return false;
 }
 return true;
 });
 return { ...root, subDepartments: remainingSubs };
 });

 if (!extractedSub) return prev;
 const foundSub: DepartmentStep = extractedSub;

 const promoted: DepartmentStep = {
 ...foundSub,
 isSubDepartment: false,
 parentKey: null,
 subDepartments: foundSub.subDepartments || []
 };

 const next = [...cleaned];
 if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= next.length) {
 next.splice(targetIndex, 0, promoted);
 } else {
 next.push(promoted);
 }
 return next;
 });
 };

 // Move a sub-stage from its current parent to another stage as a sub-stage
 const moveSubStageToParent = (
 subStageKey: string,
 targetParentKey: string,
 targetIndex?: number,
 targetBeforeKey?: string
 ) => {
 setDepartmentsList((prev) => {
 let extractedSub: DepartmentStep | null = null;
 const cleaned = prev.map((root) => {
 const remainingSubs = root.subDepartments.filter((sub) => {
 if (sub.key === subStageKey) {
 extractedSub = sub;
 return false;
 }
 return true;
 });
 return { ...root, subDepartments: remainingSubs };
 });

 if (!extractedSub) return prev;

 const updatedSub: DepartmentStep = {
 ...(extractedSub as DepartmentStep),
 isSubDepartment: true,
 parentKey: targetParentKey
 };

 return cleaned.map((root) => {
 if (root.key === targetParentKey) {
 const nextSubs = [...root.subDepartments];
 if (targetBeforeKey) {
 const beforeIdx = nextSubs.findIndex((s) => s.key === targetBeforeKey);
 if (beforeIdx !== -1) {
 nextSubs.splice(beforeIdx, 0, updatedSub);
 return { ...root, subDepartments: nextSubs };
 }
 }
 if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= nextSubs.length) {
 nextSubs.splice(targetIndex, 0, updatedSub);
 } else {
 nextSubs.push(updatedSub);
 }
 return { ...root, subDepartments: nextSubs };
 }
 return root;
 });
 });
 };

 // Demote a primary stage to become a sub-stage of another stage
 const demotePrimaryToSub = (
 primaryStageKey: string,
 targetParentKey: string,
 targetIndex?: number
 ) => {
 if (primaryStageKey === targetParentKey) return;

 setDepartmentsList((prev) => {
 const fromIdx = prev.findIndex((s) => s.key === primaryStageKey);
 if (fromIdx === -1) return prev;

 const extracted = prev[fromIdx];
 const remainingRoots = prev.filter((s) => s.key !== primaryStageKey);

 const convertedSub: DepartmentStep = {
 ...extracted,
 isSubDepartment: true,
 parentKey: targetParentKey,
 subDepartments: []
 };

 const childSubs = (extracted.subDepartments || []).map((cs) => ({
 ...cs,
 parentKey: targetParentKey
 }));

 return remainingRoots.map((root) => {
 if (root.key === targetParentKey) {
 const nextSubs = [...root.subDepartments];
 if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= nextSubs.length) {
 nextSubs.splice(targetIndex, 0, convertedSub, ...childSubs);
 } else {
 nextSubs.push(convertedSub, ...childSubs);
 }
 return { ...root, subDepartments: nextSubs };
 }
 return root;
 });
 });
 };

 // Drop on "+ Add Stage" button, empty area, or bottom append target
 const handleDropOnAddStage = (event: React.DragEvent, targetIndex?: number) => {
 event.preventDefault();
 event.stopPropagation();
 setDropTargetIndex(null);
 setIsDragOverAddStage(false);

 const sidebarDeptId =
 event.dataTransfer.getData('text/sidebar-department-id') || draggedSidebarDeptId;
 const stageKey = event.dataTransfer.getData('text/stage-key') || draggedStageKey;
 const subStageKey =
 event.dataTransfer.getData('text/sub-stage-key') || draggedSubStageInfo?.key;

 if (sidebarDeptId) {
 addDepartment(sidebarDeptId, targetIndex);
 setDraggedSidebarDeptId(null);
 return;
 }

 if (subStageKey) {
 promoteSubToPrimary(subStageKey, targetIndex);
 setDraggedSubStageInfo(null);
 return;
 }

 if (stageKey) {
 const fromIdx = departmentsList.findIndex((s) => s.key === stageKey);
 if (fromIdx !== -1) {
 const toIdx = typeof targetIndex === 'number' ? targetIndex : departmentsList.length - 1;
 moveStage(fromIdx, toIdx);
 }
 setDraggedStageKey(null);
 }
 };

 // Drop on "+ Add Sub-Department" button or stage sub-drop zone
 const handleDropOnAddSubDepartment = (
 event: React.DragEvent,
 targetParentKey: string,
 targetIndex?: number
 ) => {
 event.preventDefault();
 event.stopPropagation();
 setActiveSubDropZone(null);
 setDragOverSubBtnKey(null);

 const sidebarDeptId =
 event.dataTransfer.getData('text/sidebar-department-id') || draggedSidebarDeptId;
 const stageKey = event.dataTransfer.getData('text/stage-key') || draggedStageKey;
 const subStageKey =
 event.dataTransfer.getData('text/sub-stage-key') || draggedSubStageInfo?.key;

 if (sidebarDeptId) {
 addSubDepartment(targetParentKey, sidebarDeptId, targetIndex);
 setDraggedSidebarDeptId(null);
 return;
 }

 if (subStageKey) {
 moveSubStageToParent(subStageKey, targetParentKey, targetIndex);
 setDraggedSubStageInfo(null);
 return;
 }

 if (stageKey && stageKey !== targetParentKey) {
 demotePrimaryToSub(stageKey, targetParentKey, targetIndex);
 setDraggedStageKey(null);
 }
 };

 // Drop on a primary stage card
 const handleDropOnStage = (
 event: React.DragEvent<HTMLDivElement>,
 targetIndex: number,
 targetKey: string
 ) => {
 event.preventDefault();
 event.stopPropagation();
 setDropTargetIndex(null);

 const sidebarDeptId =
 event.dataTransfer.getData('text/sidebar-department-id') || draggedSidebarDeptId;
 const stageKey = event.dataTransfer.getData('text/stage-key') || draggedStageKey;
 const subStageKey =
 event.dataTransfer.getData('text/sub-stage-key') || draggedSubStageInfo?.key;

 if (sidebarDeptId) {
 addDepartment(sidebarDeptId, targetIndex + 1);
 setDraggedSidebarDeptId(null);
 return;
 }

 if (subStageKey) {
 promoteSubToPrimary(subStageKey, targetIndex + 1);
 setDraggedSubStageInfo(null);
 return;
 }

 if (stageKey && stageKey !== targetKey) {
 const fromIdx = departmentsList.findIndex((s) => s.key === stageKey);
 if (fromIdx !== -1) {
 moveStage(fromIdx, targetIndex);
 }
 setDraggedStageKey(null);
 }
 };

 // Drop on a sub-stage card
 const handleDropOnSubStage = (
 event: React.DragEvent<HTMLDivElement>,
 parentKey: string,
 targetSubIndex: number,
 targetSubKey: string
 ) => {
 event.preventDefault();
 event.stopPropagation();

 const sidebarDeptId =
 event.dataTransfer.getData('text/sidebar-department-id') || draggedSidebarDeptId;
 const stageKey = event.dataTransfer.getData('text/stage-key') || draggedStageKey;
 const subStageKey =
 event.dataTransfer.getData('text/sub-stage-key') || draggedSubStageInfo?.key;

 if (sidebarDeptId) {
 addSubDepartment(parentKey, sidebarDeptId, targetSubIndex);
 setDraggedSidebarDeptId(null);
 return;
 }

 if (subStageKey && subStageKey !== targetSubKey) {
 moveSubStageToParent(subStageKey, parentKey, targetSubIndex, targetSubKey);
 setDraggedSubStageInfo(null);
 return;
 }

 if (stageKey && stageKey !== parentKey) {
 demotePrimaryToSub(stageKey, parentKey, targetSubIndex);
 setDraggedStageKey(null);
 }
 };

 // Update a step
 const updateStep = (key: string, patch: Partial<DepartmentStep>) => {
 if (patch.departmentId && isDepartmentUsedByAnotherStep(patch.departmentId, key)) {
 showToast({
 kind: 'error',
 title: 'Department already used',
 message: 'Each department can appear only once in a production route.'
 });
 return;
 }
 const updateRecursive = (list: DepartmentStep[]): DepartmentStep[] => {
 return list.map((step) => {
 if (step.key === key) {
 return { ...step, ...patch };
 }
 return {
 ...step,
 subDepartments: updateRecursive(step.subDepartments)
 };
 });
 };
 setDepartmentsList((prev) => updateRecursive(prev));
 };

 // Remove a step
 const removeStep = (key: string) => {
 const removeRecursive = (list: DepartmentStep[]): DepartmentStep[] => {
 return list
 .filter((step) => step.key !== key)
 .map((step) => ({
 ...step,
 subDepartments: removeRecursive(step.subDepartments)
 }));
 };
 setDepartmentsList((prev) => removeRecursive(prev));
 };

 // Assign BOM item to a department step
 const assignBomItemToStep = (stepKey: string, bomLineId: string) => {
 if (!bomLinesMap.has(bomLineId)) return;
 const line = bomLinesMap.get(bomLineId)!;
 const destinations = allocationByBomLineId.get(bomLineId) || [];
 const existingAllocation = destinations.find((allocation) => allocation.stepKey === stepKey);
 if (existingAllocation) {
 const maxForThisStep = getAvailableQuantityForStep(stepKey, bomLineId);
 const updateExistingRecursive = (list: DepartmentStep[]): DepartmentStep[] => list.map((step) => {
 if (step.key === stepKey) {
 return {
 ...step,
 allocatedItems: step.allocatedItems.map((item) =>
 item.bomLineId === bomLineId ? { ...item, quantity: maxForThisStep } : item
 ),
 subDepartments: updateExistingRecursive(step.subDepartments)
 };
 }
 return { ...step, subDepartments: updateExistingRecursive(step.subDepartments) };
 });
 setDepartmentsList((prev) => updateExistingRecursive(prev));
 return;
 }
 const remainingQuantity = Math.max(
 0,
 line.quantity - (allocatedQuantityByBomLineId.get(bomLineId) || 0)
 );
 if (remainingQuantity <= 0.000001) return;

 const updateRecursive = (list: DepartmentStep[]): DepartmentStep[] => {
 return list.map((step) => {
 if (step.key === stepKey) {
 return {
 ...step,
 allocatedItems: [
 ...step.allocatedItems,
 {
 bomLineId: line.id,
 itemName: line.name,
 quantity: remainingQuantity,
 maxQuantity: line.quantity,
 uom: line.uom
 }
 ],
 subDepartments: updateRecursive(step.subDepartments)
 };
 }
 return {
 ...step,
 subDepartments: updateRecursive(step.subDepartments)
 };
 });
 };
 setDepartmentsList((prev) => updateRecursive(prev));
 };

 // Update allocated quantity safely without breaking backspace/editing or snapping to 0.001
 const updateAllocatedQuantity = (stepKey: string, bomLineId: string, rawVal: string) => {
 const line = bomLinesMap.get(bomLineId);
 if (!line) return;

 // Allow user to clear with backspace/delete so they can type freely!
 let nextVal: number | string = rawVal;
 if (rawVal !== '') {
 const parsed = parseFloat(rawVal);
 if (!isNaN(parsed)) {
 // Quantities assigned to every stage together cannot exceed the BOM total.
 nextVal = Number(Math.min(
 Math.max(0, parsed),
 getAvailableQuantityForStep(stepKey, bomLineId)
 ).toFixed(6));
 }
 }

 const updateRecursive = (list: DepartmentStep[]): DepartmentStep[] => {
 return list.map((step) => {
 if (step.key === stepKey) {
 return {
 ...step,
 allocatedItems: step.allocatedItems.map((item) =>
 item.bomLineId === bomLineId ? { ...item, quantity: nextVal } : item
 ),
 subDepartments: updateRecursive(step.subDepartments)
 };
 }
 return {
 ...step,
 subDepartments: updateRecursive(step.subDepartments)
 };
 });
 };
 setDepartmentsList((prev) => updateRecursive(prev));
 };

 // When user finishes typing or leaves the field, ensure quantity is at least valid
 const handleQuantityBlur = (stepKey: string, bomLineId: string, currentQty: number | string, maxQty: number) => {
 const parsed = typeof currentQty === 'string' ? parseFloat(currentQty) : currentQty;
 if (isNaN(parsed) || parsed <= 0) {
 updateAllocatedQuantity(stepKey, bomLineId, String(maxQty));
 }
 };

 // Remove BOM item from a department step
 const removeBomItemFromStep = (stepKey: string, bomLineId: string) => {
 const updateRecursive = (list: DepartmentStep[]): DepartmentStep[] => {
 return list.map((step) => {
 if (step.key === stepKey) {
 return {
 ...step,
 allocatedItems: step.allocatedItems.filter((item) => item.bomLineId !== bomLineId),
 subDepartments: updateRecursive(step.subDepartments)
 };
 }
 return {
 ...step,
 subDepartments: updateRecursive(step.subDepartments)
 };
 });
 };
 setDepartmentsList((prev) => updateRecursive(prev));
 };

 // Save Route
 const save = async (e: React.FormEvent) => {
 e.preventDefault();

 if (!name.trim() || !productId || !bomVersionId) {
 showToast({
 kind: 'error',
 title: 'Missing information',
 message: 'Please provide Route Name, Target Product, and BOM Version.'
 });
 return;
 }

 if (departmentsList.length === 0) {
 showToast({
 kind: 'error',
 title: 'Add at least one department',
 message: 'Add at least one department step in the routing flow.'
 });
 return;
 }

 // Check that every step has a department selected
 const missingDept = allStepsFlat.some((s) => !s.departmentId);
 if (missingDept) {
 showToast({
 kind: 'error',
 title: 'Select department',
 message: 'Please ensure every department and sub-department stage has a department selected.'
 });
 return;
 }

 const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
 if (!assemblyDestinationId || !isUuid(assemblyDestinationId)) {
 showToast({
 kind: 'error',
 title: 'Assembly department required',
 message: 'Configure an active Assembly department before saving this production route.'
 });
 return;
 }
 if (allStepsFlat.some((step) => step.nextDepartmentId && step.nextDepartmentId !== 'ASSEMBLY_FINAL' && !isUuid(step.nextDepartmentId))) {
 showToast({
 kind: 'error',
 title: 'Invalid next department',
 message: 'Select an active department for every route handoff, including Assembly.'
 });
 return;
 }

 const selectedDepartmentIds = allStepsFlat.map((step) => step.departmentId);
 if (new Set(selectedDepartmentIds).size !== selectedDepartmentIds.length) {
 showToast({
 kind: 'error',
 title: 'Department selected more than once',
 message: 'Each department can appear only once in a production route. Remove or change the duplicate stage before saving.'
 });
 return;
 }

 // Check that initial department steps have at least one allocated BOM item
 const initialStepsWithoutItems = departmentsList.filter((s) => s.allocatedItems.length === 0);
 if (initialStepsWithoutItems.length > 0) {
 const stepLabel =
 initialStepsWithoutItems[0].stepName.trim() ||
 departmentOptions.find((d) => d.id === initialStepsWithoutItems[0].departmentId)?.name ||
 'the starting stage';
 showToast({
 kind: 'error',
 title: 'BOM materials required',
 message: `Please allot at least one BOM item to ${stepLabel}.`
 });
 return;
 }

 // Convert UI tree to backend graph payload
 const backendSteps: Array<{
 key: string;
 branchKey: string;
 stepOrder: number;
 parentKey: string | null;
 stepName: string;
 departmentId: string;
 workCenterId: string | null;
 standardDurationMinutes: number | null;
 isQcRequired: boolean;
 outputItemType: 'PRODUCT' | 'MATERIAL';
 outputItemId: string;
 outputUomId: string;
 outputQuantityPerUnit: number;
 nextDepartmentId: string;
 }> = [];

 const defaultUomId = selectedProduct?.uomId || (uoms?.items?.[0]?.id ?? '');

 departmentsList.forEach((rootStep, rootIdx) => {
 const branchKey = `Branch ${rootIdx + 1}`;
 let order = 1;
 let previousStepKey: string | null = null;

 const nextRootDepartmentId = departmentsList[rootIdx + 1]?.departmentId || assemblyDestinationId;
 const appendStep = (step: DepartmentStep, fallbackNextDepartmentId: string) => {
 const fallbackName =
 departmentOptions.find((d) => d.id === step.departmentId)?.name.split(' (')[0] ||
 `Stage ${order}`;
 const outputType = step.outputItemType || 'PRODUCT';
 const outputId = step.outputItemId || effectiveProductId || productId;
 const outputUom = step.outputUomId || defaultUomId;
 const outputQty = Math.max(0.000001, Number(step.outputQuantityPerUnit) || 1);

 backendSteps.push({
 key: step.key,
 branchKey,
 stepOrder: order++,
 parentKey: previousStepKey,
 stepName: step.stepName.trim() || fallbackName,
 departmentId: step.departmentId,
 workCenterId: null,
 standardDurationMinutes: step.standardDurationMinutes,
 isQcRequired: step.isQcRequired,
 outputItemType: outputType,
 outputItemId: outputId,
 outputUomId: outputUom,
 outputQuantityPerUnit: outputQty,
 nextDepartmentId: step.nextDepartmentId === 'ASSEMBLY_FINAL'
 ? assemblyDestinationId
 : step.nextDepartmentId || fallbackNextDepartmentId
 });
 previousStepKey = step.key;

 step.subDepartments.forEach((child, childIndex) => {
 appendStep(child, step.subDepartments[childIndex + 1]?.departmentId || nextRootDepartmentId);
 });
 };

 appendStep(rootStep, rootStep.subDepartments[0]?.departmentId || nextRootDepartmentId);
 });

 // Material allocations
 const allocations: Array<{
 bomLineId: string;
 stepKey: string | null;
 quantity: number;
 }> = [];

 allStepsFlat.forEach((step) => {
 step.allocatedItems.forEach((item) => {
 const quantity = Number(Number(item.quantity).toFixed(6));
 if (Number.isFinite(quantity) && quantity > 0.000001) {
 allocations.push({ bomLineId: item.bomLineId, stepKey: step.key, quantity });
 }
 });
 });

 // Any remaining part of a BOM line flows directly to Assembly.
 (bom?.lines || []).forEach((line) => {
 const remainingQuantity = Number(Math.max(
 0,
 Number(line.quantity) - (allocatedQuantityByBomLineId.get(line.id) || 0)
 ).toFixed(6));
 if (remainingQuantity > 0.000001) {
 allocations.push({ bomLineId: line.id, stepKey: null, quantity: remainingQuantity });
 }
 });

 const routePrefix = (selectedProductOption?.name || selectedProduct?.name || 'PROD')
 .slice(0, 6)
 .toUpperCase()
 .replace(/[^A-Z0-9]/g, '');

 const routeCode =
 route?.code ||
 `ROUTE-${routePrefix || 'PROD'}-${Date.now().toString().slice(-4)}`;

 setSaving(true);
 try {
 const endpoint = isNew ? '/master-data/routing/graphs' : `/master-data/routing/graphs/${routeIdParam}`;
 const method = isNew ? 'POST' : 'PUT';

 await fetchApi(endpoint, {
 method,
 body: JSON.stringify({
 code: routeCode,
 name: name.trim(),
 productId: effectiveProductId || productId,
 bomVersionId,
 assemblyDepartmentId: detectedAssemblyDeptId || selectedAssemblyDeptId || effectiveAssemblyDept?.id || route?.assemblyDepartmentId || assemblyDepartment?.id || undefined,
 effectiveFrom: new Date(effectiveFrom).toISOString(),
 steps: backendSteps,
 allocations
 })
 });

 await Promise.all([
 queryClient.invalidateQueries({ queryKey: ['routing-route'] }),
 queryClient.invalidateQueries({ queryKey: ['product-routes'] })
 ]);

 showToast({
 kind: 'success',
 title: isNew ? 'Production Route Created' : 'Production Route Updated',
 message: `Successfully saved "${name.trim()}".`
 });

 router.push(routingBase);
 } catch (err: any) {
 showToast({
 kind: 'error',
 title: 'Failed to Save Route',
 message: err?.message || 'Could not save the production route graph.'
 });
 } finally {
 setSaving(false);
 }
 };

 if (!isNew && isLoadingRoute) {
 return (
 <div className="flex-1 w-full p-8 flex items-center justify-center min-h-[500px]">
 <div className="text-center space-y-3">
 <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
 <p className="text-sm font-semibold text-muted-foreground">Loading production route...</p>
 </div>
 </div>
 );
 }

 return (
 <div className="flex-1 w-full overflow-y-auto bg-background p-4 sm:p-6 lg:p-8 space-y-6">
 <form onSubmit={save} className="w-full space-y-6">
 <ReturnToProductDraftBanner currentFlowName="Floor Route" />

 {/* Top Header */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
 <div>
 <button
 type="button"
 onClick={() => router.push(routingBase)}
 className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-1 cursor-pointer"
 >
 <ArrowLeft className="w-3.5 h-3.5" />
 <span>Back to Production Routes</span>
 </button>
 <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
 {isNew ? 'Create Production Route' : `Edit Route · ${name || route?.code || ''}`}
 </h1>
 <p className="text-xs text-muted-foreground mt-0.5">
 Select product and BOM, allot required materials to departments, and pass work to Assembly
 </p>
 </div>

 <div className="flex items-center gap-2 shrink-0">
 <button
 type="button"
 onClick={() => router.push(routingBase)}
 className="h-8 px-3 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold shadow-none transition-colors cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={saving}
 className="h-8 px-3.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-none flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
 >
 <Save className="w-3.5 h-3.5" />
 <span>{saving ? 'Saving Route...' : 'Save Production Route'}</span>
 </button>
 </div>
 </div>

 {/* SECTION 1: Product & BOM Selection - CLEAN BORDERLESS SECTION */}
 <div className="space-y-4">
 <div className="flex items-center justify-between pb-2 border-b border-border/70">
 <div className="flex items-center gap-2">
 <Boxes className="w-4 h-4 text-primary" />
 <h2 className="text-sm font-bold text-foreground">Target Product & BOM Specification</h2>
 </div>
 {bom?.lines && bom.lines.length > 0 && (
 <span className="text-xs font-medium text-muted-foreground">
 {bom.lines.length} recipe materials
 </span>
 )}
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
 {/* Target Product: Hierarchical variant dropdown */}
 <div className="space-y-1">
 <label className="text-xs font-semibold text-foreground/90 flex items-center gap-1">
 Target Product <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={productOptions}
 value={productId}
 onChange={(val) => {
 setProductId(val);
 setBomVersionId('');
 }}
 isLoading={isLoadingProducts}
 placeholder="Select target product or variant..."
 className="w-full text-xs font-normal"
 />
 </div>

 {/* BOM Specification */}
 <div className="space-y-1">
 <label className="text-xs font-semibold text-foreground/90 flex items-center gap-1">
 BOM Specification <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={bomOptions}
 value={bomVersionId}
 onChange={(val) => setBomVersionId(val)}
 disabled={!productId}
 isLoading={isLoadingBoms}
 placeholder={productId ? 'Select BOM version...' : 'Select product first'}
 className="w-full text-xs font-normal"
 />
 </div>

 {/* Route Name */}
 <div className="space-y-1">
 <label className="text-xs font-semibold text-foreground/90 flex items-center gap-1">
 Route Name <span className="text-destructive">*</span>
 </label>
 <Input
 required
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="e.g. LHS Production Route"
 className="bg-background text-xs h-8 shadow-none"
 />
 </div>
 </div>

 {/* BOM Recipe Items Table */}
 {bom?.lines && bom.lines.length > 0 && (
 <div className="pt-2 space-y-2">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <PackageCheck className="w-3.5 h-3.5 text-primary" />
 <span className="text-xs font-bold text-foreground">
 BOM Recipe Items ({bom.lines.length})
 </span>
 </div>
 <span className="text-[11px] font-semibold text-muted-foreground">
 <strong className="text-foreground">{allocatedBomLineIds.size}</strong> of {bom.lines.length} allotted to stages
 </span>
 </div>

 <div className="rounded-lg border border-border/70 overflow-hidden bg-card">
 <table className="w-full text-left text-xs border-collapse">
 <thead>
 <tr className="bg-muted/40 border-b border-border/70 text-muted-foreground font-semibold">
 <th className="py-2 px-3 w-12 text-center font-mono">#</th>
 <th className="py-2 px-3">BOM Material / Item</th>
 <th className="py-2 px-3 w-36">Required Qty</th>
 <th className="py-2 px-3 w-64">Route Destination</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border/50">
 {bom.lines.map((line, idx) => {
 const item = bomLinesMap.get(line.id);
 if (!item) return null;
 const allocations = allocationByBomLineId.get(line.id) || [];
 const allocatedQuantity = allocatedQuantityByBomLineId.get(line.id) || 0;
 const assemblyQuantity = Math.max(0, item.quantity - allocatedQuantity);

 return (
 <tr key={line.id} className="hover:bg-muted/20 transition-colors">
 <td className="py-2 px-3 text-center font-mono text-muted-foreground">
 {idx + 1}
 </td>
 <td className="py-2 px-3 font-medium text-foreground">
 {item.name}
 </td>
 <td className="py-2 px-3 font-semibold text-foreground">
 {item.quantity} <span className="font-normal text-muted-foreground">{item.uom}</span>
 </td>
 <td className="py-2 px-3">
 <div className="space-y-0.5 text-[11px]">
 {allocations.map((allocation) => (
 <div key={allocation.stepKey} className="font-medium text-primary">
 ↳ {allocation.stepTitle} ({allocation.quantity} {item.uom})
 </div>
 ))}
 {assemblyQuantity > 0.000001 && (
 <div className="text-muted-foreground">
 Assembly (Direct) ({assemblyQuantity} {item.uom})
 </div>
 )}
 {allocations.length === 0 && assemblyQuantity <= 0.000001 && (
 <div className="text-muted-foreground">No destination assigned</div>
 )}
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </div>

 {/* SECTION 2: Department Execution Sequence & Material Allotment - CLEAN BORDERLESS SECTION */}
 <div className="space-y-4 pt-2">
 <div className="flex items-center justify-between pb-2 border-b border-border/70">
 <div className="flex items-center gap-2">
 <Factory className="w-4 h-4 text-primary" />
 <h2 className="text-sm font-bold text-foreground">
 Department Execution Sequence & Material Allotment
 </h2>
 </div>
 <button
 type="button"
 onClick={() => addDepartment()}
 onDragOver={(e) => {
 e.preventDefault();
 e.dataTransfer.dropEffect = 'copy';
 setIsDragOverAddStage(true);
 }}
 onDragLeave={() => setIsDragOverAddStage(false)}
 onDrop={(e) => {
 setIsDragOverAddStage(false);
 handleDropOnAddStage(e);
 }}
 className={`h-7 px-2.5 rounded-lg border text-xs font-semibold shadow-none flex items-center gap-1.5 transition-colors cursor-pointer ${
 isDragOverAddStage
 ? 'border-primary bg-primary/15 text-primary ring-1 ring-primary/30'
 : 'border-border bg-background hover:bg-muted text-foreground'
 }`}
 >
 <Plus className="w-3.5 h-3.5 text-primary" />
 <span>Add Stage</span>
 </button>
 </div>

 <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
 {/* Main Stages Column */}
 <div className="min-w-0 space-y-3">
 {departmentsList.length === 0 ? (
 <div
 onDragOver={(e) => e.preventDefault()}
 onDrop={(e) => handleDropOnAddStage(e, 0)}
 className="min-h-[220px] rounded-xl border border-dashed border-border/80 bg-muted/10 p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/20 transition-colors"
 onClick={() => addDepartment()}
 >
 <Workflow className="w-6 h-6 text-primary mb-2" />
 <p className="font-semibold text-xs text-foreground">No production stages defined</p>
 <p className="text-[11px] text-muted-foreground mt-0.5 max-w-sm">
 Drag a department from the catalog on the right, or click here to add the first stage.
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 {departmentsList.map((dept, deptIdx) => {
 const deptOption = departmentOptions.find((d) => d.id === dept.departmentId);
 const isDraggingThis = draggedStageKey === dept.key;
 const isSubDropActive = activeSubDropZone === dept.key;

 return (
 <div key={dept.key} className="space-y-2.5">
 {/* Primary Stage Card: Clean, Unified, No Outer-Box-in-Box, No Blue Strip */}
 <div
 draggable
 onDragStart={(e) => {
 const target = e.target as HTMLElement;
 if (target.closest('input, button, select, [role="combobox"]')) {
 e.preventDefault();
 return;
 }
 e.dataTransfer.setData('text/stage-key', dept.key);
 e.dataTransfer.setData('text/plain', dept.key);
 e.dataTransfer.effectAllowed = 'move';
 setDraggedStageKey(dept.key);
 }}
 onDragEnd={() => setDraggedStageKey(null)}
 onDragOver={(e) => e.preventDefault()}
 onDrop={(e) => handleDropOnStage(e, deptIdx, dept.key)}
 className={`rounded-xl border border-border/80 bg-card shadow-none transition-all ${
 isDraggingThis ? 'opacity-40 border-dashed border-primary' : ''
 }`}
 >
 {/* Stage Header */}
 <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-muted/20">
 <div className="flex items-center gap-2.5">
 <span
 className="text-muted-foreground cursor-grab active:cursor-grabbing hover:text-foreground"
 title="Drag to reorder stage"
 >
 <GripVertical className="w-3.5 h-3.5" />
 </span>
 <span className="flex h-5 w-5 items-center justify-center rounded-md bg-foreground/10 text-[11px] font-bold text-foreground font-mono">
 {deptIdx + 1}
 </span>
 <span className="font-semibold text-xs text-foreground">
 {dept.stepName.trim() || deptOption?.name.split(' (')[0] || `Department ${deptIdx + 1}`}
 </span>
 <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border/50">
 Primary Stage
 </span>
 </div>

 <div className="flex items-center gap-1">
 <button
 type="button"
 disabled={deptIdx === 0}
 onClick={() => moveStage(deptIdx, deptIdx - 1)}
 className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed shadow-none"
 title="Move Up"
 >
 <ChevronUp className="w-3.5 h-3.5" />
 </button>
 <button
 type="button"
 disabled={deptIdx === departmentsList.length - 1}
 onClick={() => moveStage(deptIdx, deptIdx + 1)}
 className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed shadow-none"
 title="Move Down"
 >
 <ChevronDown className="w-3.5 h-3.5" />
 </button>
 <button
 type="button"
 onClick={() => addSubDepartment(dept.key)}
 onDragOver={(e) => {
 e.preventDefault();
 e.stopPropagation();
 e.dataTransfer.dropEffect = 'copy';
 setDragOverSubBtnKey(dept.key);
 }}
 onDragLeave={() => setDragOverSubBtnKey(null)}
 onDrop={(e) => {
 setDragOverSubBtnKey(null);
 handleDropOnAddSubDepartment(e, dept.key);
 }}
 className={`h-6 px-2 rounded border text-[11px] font-medium shadow-none flex items-center gap-1 transition-colors cursor-pointer ml-1 ${
 dragOverSubBtnKey === dept.key
 ? 'border-primary bg-primary/15 text-primary font-semibold ring-1 ring-primary/30'
 : 'border-border bg-background hover:bg-muted text-foreground'
 }`}
 >
 <CornerDownRight className="w-3 h-3 text-primary" />
 <span>Add Sub-Department</span>
 </button>
 <button
 type="button"
 onClick={() => removeStep(dept.key)}
 className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors ml-1 shadow-none"
 title="Remove Stage"
 >
 <Trash2 className="w-3.5 h-3.5" />
 </button>
 </div>
 </div>

 {/* Stage Inputs */}
 <div className="p-4 bg-card">
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
 {/* Department Selector */}
 <div className="lg:col-span-4 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Department <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={departmentOptions.map((option) => ({
 ...option,
 disabled: option.id !== dept.departmentId && isDepartmentUsedByAnotherStep(option.id, dept.key)
 }))}
 value={dept.departmentId}
 onChange={(val) => {
 updateStep(dept.key, { departmentId: val });
 }}
 isLoading={isLoadingDepartments}
 placeholder="Select department..."
 onAddNew={() => {
 setTargetStepKey(dept.key);
 setCreateDeptOpen(true);
 }}
 addNewText="department"
 className="w-full text-xs font-normal"
 />
 </div>

 {/* Operation Name */}
 <div className="lg:col-span-4 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Operation Name <span className="text-destructive">*</span>
 </label>
 <Input
 value={dept.stepName}
 onChange={(e) => updateStep(dept.key, { stepName: e.target.value })}
 placeholder="e.g. Sheet Laser Cutting"
 className="bg-background text-xs h-8 shadow-none"
 />
 </div>

 {/* Duration */}
 <div className="lg:col-span-2 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Est. Duration (Min)
 </label>
 <Input
 type="number"
 min="0"
 value={dept.standardDurationMinutes ?? ''}
 onChange={(e) =>
 updateStep(dept.key, {
 standardDurationMinutes: e.target.value
 ? Number(e.target.value)
 : null
 })
 }
 placeholder="e.g. 60"
 className="bg-background text-xs h-8 shadow-none"
 />
 </div>

 {/* QC Gate Checkbox */}
 <div className="lg:col-span-2 flex items-center gap-2 h-8">
 <Checkbox
 id={`qc-${dept.key}`}
 checked={dept.isQcRequired}
 onChange={(e) =>
 updateStep(dept.key, { isQcRequired: e.target.checked })
 }
 />
 <label
 htmlFor={`qc-${dept.key}`}
 className="text-xs font-medium text-foreground cursor-pointer select-none"
 >
 Requires QC Gate
 </label>
 </div>
 </div>
 </div>

 {/* Materials Allocation Table */}
 <div className="border-t border-border/60 p-4 bg-muted/10 space-y-2.5">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <PackageCheck className="w-3.5 h-3.5 text-primary" />
 <span className="text-xs font-bold text-foreground">
 Allocated BOM Materials
 </span>
 <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.2 rounded-full border border-border/50">
 {dept.allocatedItems.length}
 </span>
 </div>

 <div className="w-full sm:w-64">
 <SearchableSelector
 size="sm"
 placeholder={
 getAvailableBomItemsForStep(dept.key).every((item) => item.disabled)
 ? 'No additional BOM quantity available here'
 : '+ Allot Item from BOM...'
 }
 options={getAvailableBomItemsForStep(dept.key)}
 value=""
 onChange={(bomLineId) => assignBomItemToStep(dept.key, bomLineId)}
 disabled={!bom?.lines?.length || getAvailableBomItemsForStep(dept.key).length === 0}
 className="w-full text-xs font-normal"
 />
 </div>
 </div>

 {dept.allocatedItems.length === 0 ? (
 <p className="text-[11px] text-muted-foreground italic py-1">
 No raw materials allocated to this stage. Unallotted items pass directly to Final Assembly.
 </p>
 ) : (
 <div className="rounded-lg border border-border/70 overflow-hidden bg-background">
 <table className="w-full text-left text-xs border-collapse">
 <thead>
 <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
 <th className="py-1.5 px-3">BOM Material</th>
 <th className="py-1.5 px-3 w-28">BOM Total</th>
 <th className="py-1.5 px-3 w-44">Allotted Qty</th>
 <th className="py-1.5 px-2 w-10 text-center">Action</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border/40">
 {dept.allocatedItems.map((item) => {
 const isWhole = ['pcs', 'pc', 'units', 'nos', 'pieces'].includes(
 item.uom?.toLowerCase()
 );

 return (
 <tr key={item.bomLineId} className="hover:bg-muted/10 transition-colors">
 <td className="py-1.5 px-3 font-medium text-foreground">
 {item.itemName}
 </td>
 <td className="py-1.5 px-3 text-muted-foreground font-mono">
 {item.maxQuantity} {item.uom}
 </td>
 <td className="py-1.5 px-3">
 <div className="flex items-center gap-1.5">
 <input
 type="number"
 step={isWhole ? '1' : '0.1'}
 min="0"
 max={getAvailableQuantityForStep(dept.key, item.bomLineId)}
 value={item.quantity}
 onChange={(e) =>
 updateAllocatedQuantity(
 dept.key,
 item.bomLineId,
 e.target.value
 )
 }
 onBlur={() =>
 handleQuantityBlur(
 dept.key,
 item.bomLineId,
 item.quantity,
 getAvailableQuantityForStep(dept.key, item.bomLineId)
 )
 }
 className="w-20 h-7 px-2 text-xs font-semibold bg-background border border-input rounded text-foreground focus:outline-none focus:border-primary transition-colors"
 />
 <span className="text-[11px] text-muted-foreground font-medium">
 {item.uom}
 </span>
 </div>
 </td>
 <td className="py-1.5 px-2 text-center">
 <button
 type="button"
 onClick={() =>
 removeBomItemFromStep(dept.key, item.bomLineId)
 }
 className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-colors shadow-none cursor-pointer"
 title="Remove allotment"
 >
 <X className="w-3.5 h-3.5" />
 </button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {/* Stage Output & Next Department Handover */}
 <div className="border-t border-border/60 p-4 bg-muted/5 space-y-3">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
 <div className="flex items-center gap-2">
 <Boxes className="w-3.5 h-3.5 text-primary" />
 <span className="text-xs font-bold text-foreground">
 Department Output &amp; Next Destination
 </span>
 </div>
 <span className="text-[11px] text-muted-foreground font-medium">
 What this department yields &amp; to whom it handovers
 </span>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
 {/* Output Item Selector */}
 <div className="lg:col-span-5 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Output Item (Searchable) <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={outputCatalogOptions}
 showOptionCode={false}
 renderOption={renderOutputCatalogOption}
 value={dept.outputItemId || effectiveProductId || productId}
 onChange={(val) => {
 const item = outputCatalogOptions.find((o) => o.id === val);
 updateStep(dept.key, {
 outputItemId: val,
 outputItemType: item?.type || 'PRODUCT',
 outputUomId: item?.uomId || dept.outputUomId || defaultUomId
 });
 }}
 placeholder="Search product or material..."
 className="w-full text-xs font-normal"
 />
 </div>

 {/* Output Quantity */}
 <div className="lg:col-span-2 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Qty / Unit <span className="text-destructive">*</span>
 </label>
 <Input
 type="number"
 min="0.000001"
 step="any"
 value={dept.outputQuantityPerUnit ?? 1}
 onChange={(e) => updateStep(dept.key, { outputQuantityPerUnit: e.target.value })}
 placeholder="1"
 className="bg-background text-xs h-8 shadow-none"
 />
 </div>

 {/* Output UOM */}
 <div className="lg:col-span-2 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Output UOM <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={uomOptions}
 value={dept.outputUomId || defaultUomId}
 onChange={(val) => updateStep(dept.key, { outputUomId: val })}
 placeholder="Select UOM..."
 className="w-full text-xs font-normal"
 />
 </div>

 {/* Next Department Selector */}
 <div className="lg:col-span-3 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Next Department <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={nextDepartmentOptions.filter((option) => allStepsFlat.some((candidate) => candidate.departmentId === option.id) || option.id === assemblyDestinationId)}
 value={dept.nextDepartmentId || (dept.subDepartments.length > 0 ? dept.subDepartments[0].departmentId : (departmentsList[deptIdx + 1]?.departmentId || assemblyDestinationId))}
 onChange={(val) => updateStep(dept.key, { nextDepartmentId: val })}
 placeholder="Select next department..."
 className="w-full text-xs font-normal"
 />
 </div>
 </div>
 </div>
 </div>

 {/* SUB-DEPARTMENTS FLOW */}
 <div className="ml-6 space-y-2.5">
 {dept.subDepartments.length > 0 && (
 <div className="border-l-2 border-border/80 pl-4 space-y-2.5">
 {dept.subDepartments.map((subDept, subIdx) => {
 const subDeptOption = departmentOptions.find(
 (d) => d.id === subDept.departmentId
 );
 const isDraggingSub =
 draggedSubStageInfo?.key === subDept.key;

 return (
 <div
 key={subDept.key}
 draggable
 onDragStart={(e) => {
 const target = e.target as HTMLElement;
 if (target.closest('input, button, select, [role="combobox"]')) {
 e.preventDefault();
 return;
 }
 e.stopPropagation();
 e.dataTransfer.setData(
 'text/sub-stage-key',
 subDept.key
 );
 e.dataTransfer.setData(
 'text/sub-parent-key',
 dept.key
 );
 e.dataTransfer.setData('text/plain', subDept.key);
 e.dataTransfer.effectAllowed = 'move';
 setDraggedSubStageInfo({
 parentKey: dept.key,
 key: subDept.key
 });
 }}
 onDragEnd={() => setDraggedSubStageInfo(null)}
 onDragOver={(e) => {
 e.preventDefault();
 e.stopPropagation();
 }}
 onDrop={(e) =>
 handleDropOnSubStage(e, dept.key, subIdx, subDept.key)
 }
 className={`rounded-xl border border-border/80 bg-card shadow-none transition-all ${
 isDraggingSub ? 'opacity-40 border-dashed border-primary' : ''
 }`}
 >
 {/* Sub-department Header */}
 <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-border/60 bg-muted/20">
 <div className="flex items-center gap-2">
 <span
 className="text-muted-foreground cursor-grab active:cursor-grabbing hover:text-foreground"
 title="Drag to reorder sub-stage"
 >
 <GripVertical className="w-3.5 h-3.5" />
 </span>
 <span className="flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] font-mono font-bold text-foreground">
 {deptIdx + 1}.{subIdx + 1}
 </span>
 <span className="text-xs font-semibold text-foreground">
 {subDept.stepName.trim() || subDeptOption?.name.split(' (')[0] || `Sub-Department ${subIdx + 1}`}
 </span>
 <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded-full border border-border/50">
 Sub-stage
 </span>
 </div>

 <div className="flex items-center gap-1">
 <button
 type="button"
 disabled={subIdx === 0}
 onClick={() => moveSubStage(dept.key, subIdx, subIdx - 1)}
 className="h-5 w-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed shadow-none"
 title="Move Up"
 >
 <ChevronUp className="w-3 h-3" />
 </button>
 <button
 type="button"
 disabled={subIdx === dept.subDepartments.length - 1}
 onClick={() => moveSubStage(dept.key, subIdx, subIdx + 1)}
 className="h-5 w-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed shadow-none"
 title="Move Down"
 >
 <ChevronDown className="w-3 h-3" />
 </button>
 <button
 type="button"
 onClick={() => removeStep(subDept.key)}
 className="h-5 w-5 inline-flex items-center justify-center text-muted-foreground hover:text-destructive ml-1 shadow-none"
 title="Remove Sub-department"
 >
 <Trash2 className="w-3 h-3" />
 </button>
 </div>
 </div>

 {/* Sub-department Inputs */}
 <div className="p-3 bg-card">
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
 {/* Sub-Department Selector */}
 <div className="lg:col-span-4 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Sub-Department <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={departmentOptions.map((option) => ({
 ...option,
 disabled: option.id !== subDept.departmentId && isDepartmentUsedByAnotherStep(option.id, subDept.key)
 }))}
 value={subDept.departmentId}
 onChange={(val) => {
 updateStep(subDept.key, { departmentId: val });
 }}
 isLoading={isLoadingDepartments}
 placeholder="Select sub-department..."
 onAddNew={() => {
 setTargetStepKey(subDept.key);
 setCreateDeptOpen(true);
 }}
 addNewText="department"
 className="w-full text-xs font-normal"
 />
 </div>

 {/* Operation Name */}
 <div className="lg:col-span-4 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Operation Name <span className="text-destructive">*</span>
 </label>
 <Input
 value={subDept.stepName}
 onChange={(e) =>
 updateStep(subDept.key, { stepName: e.target.value })
 }
 placeholder="e.g. Deburring & Polish"
 className="bg-background text-xs h-8 shadow-none"
 />
 </div>

 {/* Duration */}
 <div className="lg:col-span-2 space-y-1">
 <label className="text-[11px] font-semibold text-muted-foreground block">
 Est. Duration (Min)
 </label>
 <Input
 type="number"
 min="0"
 value={subDept.standardDurationMinutes ?? ''}
 onChange={(e) =>
 updateStep(subDept.key, {
 standardDurationMinutes: e.target.value
 ? Number(e.target.value)
 : null
 })
 }
 placeholder="e.g. 30"
 className="bg-background text-xs h-8 shadow-none"
 />
 </div>

 {/* QC Gate */}
 <div className="lg:col-span-2 flex items-center gap-2 h-8">
 <Checkbox
 id={`qc-${subDept.key}`}
 checked={subDept.isQcRequired}
 onChange={(e) =>
 updateStep(subDept.key, {
 isQcRequired: e.target.checked
 })
 }
 />
 <label
 htmlFor={`qc-${subDept.key}`}
 className="text-xs font-medium text-foreground cursor-pointer select-none"
 >
 Requires QC Gate
 </label>
 </div>
 </div>
 </div>

 {/* Sub-department Materials Table */}
 <div className="border-t border-border/60 p-3 bg-muted/10 space-y-2">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <PackageCheck className="w-3.5 h-3.5 text-primary" />
 <span className="text-xs font-bold text-foreground">
 Allocated BOM Materials
 </span>
 <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.2 rounded-full border border-border/50">
 {subDept.allocatedItems.length}
 </span>
 </div>

 <div className="w-full sm:w-60">
 <SearchableSelector
 size="sm"
 placeholder={
 getAvailableBomItemsForStep(subDept.key).every((item) => item.disabled)
 ? 'No additional BOM quantity available here'
 : '+ Allot Item from BOM...'
 }
 options={getAvailableBomItemsForStep(subDept.key)}
 value=""
 onChange={(bomLineId) =>
 assignBomItemToStep(subDept.key, bomLineId)
 }
 disabled={!bom?.lines?.length || getAvailableBomItemsForStep(subDept.key).length === 0}
 className="w-full text-xs font-normal"
 />
 </div>
 </div>

 {subDept.allocatedItems.length === 0 ? (
 <p className="text-[11px] text-muted-foreground italic py-0.5">
 No additional materials allocated to this sub-stage.
 </p>
 ) : (
 <div className="rounded-lg border border-border/70 overflow-hidden bg-background">
 <table className="w-full text-left text-xs border-collapse">
 <thead>
 <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
 <th className="py-1.5 px-3">BOM Material</th>
 <th className="py-1.5 px-3 w-28">BOM Total</th>
 <th className="py-1.5 px-3 w-44">Allotted Qty</th>
 <th className="py-1.5 px-2 w-10 text-center">Action</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border/40">
 {subDept.allocatedItems.map((item) => {
 const isWhole = ['pcs', 'pc', 'units', 'nos', 'pieces'].includes(
 item.uom?.toLowerCase()
 );

 return (
 <tr
 key={item.bomLineId}
 className="hover:bg-muted/10 transition-colors"
 >
 <td className="py-1.5 px-3 font-medium text-foreground">
 {item.itemName}
 </td>
 <td className="py-1.5 px-3 text-muted-foreground font-mono">
 {item.maxQuantity} {item.uom}
 </td>
 <td className="py-1.5 px-3">
 <div className="flex items-center gap-1.5">
 <input
 type="number"
 step={isWhole ? '1' : '0.1'}
 min="0"
 max={getAvailableQuantityForStep(subDept.key, item.bomLineId)}
 value={item.quantity}
 onChange={(e) =>
 updateAllocatedQuantity(
 subDept.key,
 item.bomLineId,
 e.target.value
 )
 }
 onBlur={() =>
 handleQuantityBlur(
 subDept.key,
 item.bomLineId,
 item.quantity,
 getAvailableQuantityForStep(subDept.key, item.bomLineId)
 )
 }
 className="w-20 h-7 px-2 text-xs font-semibold bg-background border border-input rounded text-foreground focus:outline-none focus:border-primary transition-colors"
 />
 <span className="text-[11px] text-muted-foreground font-medium">
 {item.uom}
 </span>
 </div>
 </td>
 <td className="py-1.5 px-2 text-center">
 <button
 type="button"
 onClick={() =>
 removeBomItemFromStep(
 subDept.key,
 item.bomLineId
 )
 }
 className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-colors shadow-none cursor-pointer"
 title="Remove allotment"
 >
 <X className="w-3.5 h-3.5" />
 </button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {/* Sub-Department Output & Next Destination */}
 <div className="border-t border-border/60 p-3 bg-muted/5 space-y-2.5">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
 <div className="flex items-center gap-1.5">
 <Boxes className="w-3 h-3 text-primary" />
 <span className="text-[11px] font-bold text-foreground">
 Sub-Department Output &amp; Next Destination
 </span>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
 {/* Output Item */}
 <div className="lg:col-span-5 space-y-1">
 <label className="text-[10px] font-semibold text-muted-foreground block">
 Output Item <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={outputCatalogOptions}
 showOptionCode={false}
 renderOption={renderOutputCatalogOption}
 value={subDept.outputItemId || effectiveProductId || productId}
 onChange={(val) => {
 const item = outputCatalogOptions.find((o) => o.id === val);
 updateStep(subDept.key, {
 outputItemId: val,
 outputItemType: item?.type || 'PRODUCT',
 outputUomId: item?.uomId || subDept.outputUomId || defaultUomId
 });
 }}
 placeholder="Search product or material..."
 className="w-full text-xs font-normal"
 />
 </div>

 {/* Quantity */}
 <div className="lg:col-span-2 space-y-1">
 <label className="text-[10px] font-semibold text-muted-foreground block">
 Qty / Unit <span className="text-destructive">*</span>
 </label>
 <Input
 type="number"
 min="0.000001"
 step="any"
 value={subDept.outputQuantityPerUnit ?? 1}
 onChange={(e) => updateStep(subDept.key, { outputQuantityPerUnit: e.target.value })}
 placeholder="1"
 className="bg-background text-xs h-8 shadow-none"
 />
 </div>

 {/* UOM */}
 <div className="lg:col-span-2 space-y-1">
 <label className="text-[10px] font-semibold text-muted-foreground block">
 Output UOM <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={uomOptions}
 value={subDept.outputUomId || defaultUomId}
 onChange={(val) => updateStep(subDept.key, { outputUomId: val })}
 placeholder="Select UOM..."
 className="w-full text-xs font-normal"
 />
 </div>

 {/* Next Department */}
 <div className="lg:col-span-3 space-y-1">
 <label className="text-[10px] font-semibold text-muted-foreground block">
 Next Department <span className="text-destructive">*</span>
 </label>
 <SearchableSelector
 size="sm"
 options={nextDepartmentOptions.filter((option) => allStepsFlat.some((candidate) => candidate.departmentId === option.id) || option.id === assemblyDestinationId)}
 value={subDept.nextDepartmentId || (dept.subDepartments[subIdx + 1]?.departmentId || departmentsList[deptIdx + 1]?.departmentId || assemblyDestinationId)}
 onChange={(val) => updateStep(subDept.key, { nextDepartmentId: val })}
 placeholder="Next destination..."
 className="w-full text-xs font-normal"
 />
 </div>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )}

 {/* Drop target to add department as sub-department */}
 <div
 onDragOver={(e) => {
 e.preventDefault();
 e.stopPropagation();
 setActiveSubDropZone(dept.key);
 }}
 onDragLeave={() => setActiveSubDropZone(null)}
 onDrop={(e) => {
 setActiveSubDropZone(null);
 handleDropOnAddSubDepartment(e, dept.key);
 }}
 className={`rounded-lg border border-dashed py-2 px-3 text-center text-[11px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
 isSubDropActive
 ? 'border-primary bg-primary/10 text-primary'
 : 'border-border/60 hover:border-border text-muted-foreground bg-muted/10'
 }`}
 onClick={() => addSubDepartment(dept.key)}
 >
 <CornerDownRight className="w-3.5 h-3.5 text-primary" />
 <span>Drag department here or click to add sub-stage under Stage {deptIdx + 1}</span>
 </div>
 </div>

 {/* Minimal Sequential Timeline Connector */}
 {deptIdx < departmentsList.length - 1 && (
 <div className="flex items-center justify-center py-0.5">
 <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
 <ArrowDown className="w-3.5 h-3.5 text-muted-foreground/60" />
 </div>
 </div>
 )}
 </div>
 );
 })}

 {/* Bottom Append Drop Target */}
 <div
 onDragOver={(e) => {
 e.preventDefault();
 setDropTargetIndex(departmentsList.length);
 }}
 onDragLeave={() => setDropTargetIndex(null)}
 onDrop={(e) => handleDropOnAddStage(e, departmentsList.length)}
 onClick={() => addDepartment()}
 className={`min-h-[46px] rounded-xl border border-dashed text-center flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer transition-all shadow-none ${
 dropTargetIndex === departmentsList.length
 ? 'border-primary bg-primary/10 text-primary'
 : 'border-border/80 hover:border-primary/50 text-muted-foreground hover:text-foreground bg-muted/10'
 }`}
 >
 <Plus className="w-3.5 h-3.5 text-primary" />
 <span>Drag a department here or click to append stage</span>
 </div>
 </div>
 )}

 </div>

 {/* SECTION 2.1: Right Panel - Departments Catalog with Search */}
 <aside className="xl:sticky xl:top-4 border border-border/80 rounded-xl bg-card overflow-hidden shadow-none">
 <div className="px-3.5 py-3 border-b border-border/70 space-y-2">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5">
 <h3 className="text-xs font-bold text-foreground">Departments Catalog</h3>
 <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full border border-border/50">
 {filteredDepartments.length}
 </span>
 </div>
 <button
 type="button"
 onClick={() => {
 setTargetStepKey(null);
 setCreateDeptOpen(true);
 }}
 className="text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center gap-1 cursor-pointer"
 >
 <Plus className="w-3 h-3" />
 <span>Create Dept</span>
 </button>
 </div>

 {/* Clean Search Input */}
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
 <input
 type="text"
 value={deptSearch}
 onChange={(e) => setDeptSearch(e.target.value)}
 placeholder="Search departments..."
 className="w-full h-8 pl-8 pr-7 text-xs bg-muted/30 border border-input rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 text-foreground shadow-none"
 />
 {deptSearch && (
 <button
 type="button"
 onClick={() => setDeptSearch('')}
 className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 shadow-none"
 >
 <X className="w-3 h-3" />
 </button>
 )}
 </div>
 </div>

 <div className="max-h-[500px] overflow-y-auto p-2 space-y-1">
 {isLoadingDepartments ? (
 <p className="px-2 py-4 text-xs text-muted-foreground text-center">
 Loading departments…
 </p>
 ) : filteredDepartments.length ? (
 filteredDepartments.map((department) => (
 <div
 key={department.id}
 draggable
 onDragStart={(event) => {
 event.dataTransfer.setData('text/sidebar-department-id', department.id);
 event.dataTransfer.effectAllowed = 'copy';
 setDraggedSidebarDeptId(department.id);
 }}
 onDragEnd={() => setDraggedSidebarDeptId(null)}
 className={`group flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-all cursor-grab active:cursor-grabbing shadow-none ${
 draggedSidebarDeptId === department.id
 ? 'border-primary bg-primary/10'
 : 'border-transparent hover:border-border hover:bg-muted/50'
 }`}
 >
 <div className="flex items-center gap-2 min-w-0 flex-1">
 <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 group-hover:text-muted-foreground" />
 <div className="min-w-0 flex-1">
 <span className="block text-xs font-semibold text-foreground truncate">
 {department.name}
 </span>
 {department.code && (
 <span className="text-[10px] font-mono text-muted-foreground">
 {department.code}
 </span>
 )}
 </div>
 </div>

 <button
 type="button"
 onClick={() => addDepartment(department.id)}
 className="shrink-0 text-[11px] font-semibold text-primary hover:bg-primary/10 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-none"
 title={`Add ${department.name} stage`}
 >
 + Add
 </button>
 </div>
 ))
 ) : (
 <p className="px-2 py-4 text-xs text-muted-foreground text-center">
 No matching departments found.
 </p>
 )}
 </div>
 </aside>
 </div>
 </div>
 </form>

 {/* Department Creation Dialog */}
 <DepartmentDialog
 open={createDeptOpen}
 departmentCodePrefix="SHOP"
 onClose={() => {
 setCreateDeptOpen(false);
 setTargetStepKey(null);
 }}
 onCreated={(newDept) => {
 if (Boolean((newDept as any).isAssembly) || isAssemblyDepartment(newDept)) {
 setSelectedAssemblyDeptId(newDept.id);
 setDepartmentsList((current) =>
 current.map((step) => {
 const subDepartments = step.subDepartments.map((sub) => {
 const wasAssemblyHandoff = !sub.nextDepartmentId || allAssemblyDepartments.some((ad) => ad.id === sub.nextDepartmentId);
 return wasAssemblyHandoff ? { ...sub, nextDepartmentId: newDept.id } : sub;
 });
 const wasAssemblyHandoff = !step.nextDepartmentId || allAssemblyDepartments.some((ad) => ad.id === step.nextDepartmentId);
 return {
 ...step,
 nextDepartmentId: wasAssemblyHandoff ? newDept.id : step.nextDepartmentId,
 subDepartments
 };
 })
 );
 showToast({
 kind: 'success',
 title: 'Assembly Station Configured',
 message: `"${newDept.name}" has been set as the handoff destination for route convergence.`
 });
 } else if (targetStepKey) {
 updateStep(targetStepKey, { departmentId: newDept.id });
 } else {
 addDepartment(newDept.id);
 }
 }}
 />
 </div>
 );
}
