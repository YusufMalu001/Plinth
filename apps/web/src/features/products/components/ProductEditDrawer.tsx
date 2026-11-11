"use client";

import React, { useState, useEffect, type FormEvent } from 'react';
import {
  X,
  Save,
  ImagePlus,
  Trash2,
  Plus,
  Layers,
  Settings,
  DollarSign,
  Wrench,
  Boxes,
  UploadCloud,
} from 'lucide-react';
import { Button, Input } from '@plinth/ui';
import type { DetailedProduct, ProductBomComponent, ProductImage } from '../types';
import { useUpdateProduct, useUploadProductImages, useCategories, useProductFamilies, useUoms } from '../../../hooks/useMasterData';
import { showToast } from '../../../components/toast-store';
import { friendlyErrorMessage } from '../../../features/auth/access-control';
import { getResolvedBomFormula, getResolvedSpecifications } from '../utils';
import { handleNumberInputWheel, handleNumberInputKeyDown } from '../utils/tierPricing';

interface ProductEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product: DetailedProduct;
}

export function ProductEditDrawer({ isOpen, onClose, product }: ProductEditDrawerProps) {
  const update = useUpdateProduct();
  const upload = useUploadProductImages();

  const { data: categoriesData } = useCategories();
  const { data: familiesData } = useProductFamilies(product.categoryId);
  const { data: uomsData } = useUoms();

  const [activeTab, setActiveTab] = useState<'GENERAL' | 'PRICING' | 'INVENTORY' | 'SPECS' | 'BOM' | 'IMAGES'>('GENERAL');

  // Form State
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description || '');
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [productFamilyId, setProductFamilyId] = useState(product.productFamilyId);
  const [uomId, setUomId] = useState(product.uomId);

  // Pricing State
  const [mrp, setMrp] = useState<number | string>(product.metadata?.mrp ?? product.metadata?.costPrice ?? 0);
  const [sellingPrice, setSellingPrice] = useState<number | string>(product.metadata?.sellingPrice ?? 2899);
  const [wholesalePrice, setWholesalePrice] = useState<number | string>(product.metadata?.wholesalePrice ?? 2150);
  const [distributorPrice, setDistributorPrice] = useState<number | string>(product.metadata?.distributorPrice ?? 1850);
  const [costPrice, setCostPrice] = useState<number | string>(product.metadata?.costPrice ?? product.metadata?.mrp ?? '');
  const [hsnCode, setHsnCode] = useState<string>(String(product.metadata?.hsnCode ?? product.metadata?.hsn ?? ''));
  const [gstRate, setGstRate] = useState<number | string>(product.metadata?.gstRate ?? 18);
  const [asin, setAsin] = useState<string>(String(product.metadata?.asin ?? ''));
  const [barcode, setBarcode] = useState<string>(String(product.metadata?.barcode ?? ''));
  const isRawMaterial = /raw\s*materials?/i.test(
    categoriesData?.items.find((category) => category.id === categoryId)?.name || product.category?.name || ''
  ) || String(product.metadata?.materialType || '').toUpperCase() === 'RAW_MATERIAL';

  // Inventory State
  const [safetyStock, setSafetyStock] = useState<number | string>(product.metadata?.safetyStock ?? 50);
  const [reorderPoint, setReorderPoint] = useState<number | string>(product.metadata?.reorderPoint ?? 120);
  const [maxCapacity, setMaxCapacity] = useState<number | string>(product.metadata?.maxCapacity ?? 500);
  const [leadTimeDays, setLeadTimeDays] = useState<number | string>(product.metadata?.leadTimeDays ?? 2);

  // Technical Specs State
  const defaultSpecs = getResolvedSpecifications(product);
  const [materialGrade, setMaterialGrade] = useState(defaultSpecs.materialGrade || '');
  const [frameSpecs, setFrameSpecs] = useState(defaultSpecs.frameSpecs || '');
  const [rodSpecs, setRodSpecs] = useState(defaultSpecs.rodSpecs || '');
  const [surfaceFinish, setSurfaceFinish] = useState(defaultSpecs.surfaceFinish || '');
  const [loadCapacity, setLoadCapacity] = useState(defaultSpecs.loadCapacity || '');
  const [foldedDimensions, setFoldedDimensions] = useState(defaultSpecs.foldedDimensions || '');
  const [extendedDimensions, setExtendedDimensions] = useState(defaultSpecs.extendedDimensions || '');
  const [netWeight, setNetWeight] = useState(defaultSpecs.netWeight || '');
  const [grossWeight, setGrossWeight] = useState(defaultSpecs.grossWeight || '');
  const [packagingType, setPackagingType] = useState(defaultSpecs.packagingType || '');

  // BOM State
  const defaultBom = getResolvedBomFormula(product);
  const [bomLines, setBomLines] = useState<ProductBomComponent[]>(defaultBom);

  // Image State
  const [images, setImages] = useState<ProductImage[]>(
    Array.isArray(product.metadata?.images) ? product.metadata.images : []
  );
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);

  useEffect(() => {
    setName(product.name);
    setDescription(product.description || '');
    setCategoryId(product.categoryId);
    setProductFamilyId(product.productFamilyId);
    setUomId(product.uomId);
    setImages(Array.isArray(product.metadata?.images) ? product.metadata.images : []);
  }, [product]);

  if (!isOpen) return null;

  function addBomLine() {
    setBomLines([
      ...bomLines,
      {
        component: 'New Component',
        code: `COMP-${bomLines.length + 1}`,
        category: 'RAW_MATERIAL',
        quantity: 1,
        uom: 'pcs',
        scrapAllowance: '1.0%',
        unitCost: 10,
        note: '',
      },
    ]);
  }

  function removeBomLine(index: number) {
    setBomLines(bomLines.filter((_, i) => i !== index));
  }

  function updateBomLine(index: number, field: keyof ProductBomComponent, val: string | number) {
    const updated = [...bomLines];
    updated[index] = { ...updated[index], [field]: val };
    setBomLines(updated);
  }

  function addImageUrl() {
    if (!newImageUrl.trim()) return;
    setImages([...images, { url: newImageUrl.trim(), fileName: 'Product Image', isPrimary: images.length === 0 }]);
    setNewImageUrl('');
  }

  function removeImage(index: number) {
    setImages(images.filter((_, i) => i !== index));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    try {
      let finalImages = [...images];

      // Handle upload of local files if any
      if (uploadFiles.length > 0) {
        const uploadResult = await upload.mutateAsync({
          productKey: product.sku,
          files: uploadFiles,
        });
        if (uploadResult?.images) {
          finalImages = [...finalImages, ...uploadResult.images];
        }
      }

      const updatedMetadata = {
        ...Object.fromEntries(Object.entries(product.metadata || {}).filter(([key]) => key !== 'warehouseLocationId')),
        mrp: isRawMaterial ? null : Number(mrp) || null,
        sellingPrice: isRawMaterial ? null : Number(sellingPrice) || null,
        wholesalePrice: isRawMaterial ? null : Number(wholesalePrice) || null,
        distributorPrice: isRawMaterial ? null : Number(distributorPrice) || null,
        costPrice: isRawMaterial ? Number(mrp) || null : Number(costPrice) || null,
        hsnCode,
        gstRate: Number(gstRate) || 18,
        asin,
        barcode,
        safetyStock: Number(safetyStock) || 50,
        reorderPoint: Number(reorderPoint) || 120,
        maxCapacity: Number(maxCapacity) || 500,
        leadTimeDays: Number(leadTimeDays) || 2,
        specifications: {
          materialGrade,
          frameSpecs,
          rodSpecs,
          surfaceFinish,
          loadCapacity,
          foldedDimensions,
          extendedDimensions,
          netWeight,
          grossWeight,
          packagingType,
        },
        bomFormula: bomLines,
        images: finalImages,
      };

      await update.mutateAsync({
        id: product.id,
        name,
        description,
        categoryId: categoryId || undefined,
        uomId: uomId || undefined,
        minStockLevel: Number(safetyStock) || 0,
        reorderPoint: Number(reorderPoint) || 0,
        leadTimeDays: Number(leadTimeDays) || 0,
        costPrice: isRawMaterial ? Number(mrp) || 0 : Number(costPrice) || 0,
        sellingPrice: isRawMaterial ? 0 : Number(sellingPrice) || 0,
        metadata: updatedMetadata,
      } as any);

      showToast({
        kind: 'success',
        title: 'Product Master Saved',
        message: `${name} (${product.sku}) specifications & commercial master data updated successfully.`,
      });

      onClose();
    } catch (err) {
      showToast({
        kind: 'error',
        title: 'Save Failed',
        message: friendlyErrorMessage(err),
      });
    }
  }

  const drawerTabs = [
    { key: 'GENERAL', label: 'General & Identity', icon: Settings },
    { key: 'PRICING', label: 'Pricing & Commercials', icon: DollarSign },
    { key: 'INVENTORY', label: 'Inventory Rules', icon: Boxes },
    { key: 'SPECS', label: 'Engineering Specs', icon: Wrench },
    { key: 'BOM', label: 'BOM Recipe', icon: Layers },
    { key: 'IMAGES', label: 'Media Gallery', icon: ImagePlus },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="flex h-full w-full max-w-4xl flex-col bg-card border-l border-border shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Master Data Editor</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono font-bold text-foreground">
                {product.sku}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground mt-0.5">Edit Industrial Product</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-border bg-card px-6 py-2 overflow-x-auto">
          {drawerTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === key
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Drawer Scrollable Content Body */}
        <form id="edit-product-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'GENERAL' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Product Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SKU Code (Read Only)</label>
                  <Input value={product.sku} disabled className="font-mono bg-muted" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium outline-none focus:border-primary"
                  >
                    {categoriesData?.items?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Product Family</label>
                  <select
                    value={productFamilyId}
                    onChange={(e) => setProductFamilyId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium outline-none focus:border-primary"
                  >
                    {familiesData?.items?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Base Unit of Measure</label>
                  <select
                    value={uomId}
                    onChange={(e) => setUomId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium outline-none focus:border-primary"
                  >
                    {uomsData?.items?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Detailed Description & Marketing Copy</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
            </div>
          )}

          {activeTab === 'PRICING' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{isRawMaterial ? 'Cost Price (₹)' : 'Maximum Retail Price (MRP ₹)'}</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={!mrp || mrp === 0 || mrp === '0' ? '' : mrp}
                    onChange={(e) => setMrp(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, mrp, (val) => setMrp(val))}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, mrp, (val) => setMrp(val))}
                    required
                  />
                </div>
                {!isRawMaterial && <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary">Plinth Online / B2C Price (₹)</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={!sellingPrice || sellingPrice === 0 || sellingPrice === '0' ? '' : sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, sellingPrice, (val) => setSellingPrice(val))}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, sellingPrice, (val) => setSellingPrice(val))}
                    required
                  />
                </div>}
                {!isRawMaterial && <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Wholesale Dealer Rate (₹)</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={!wholesalePrice || wholesalePrice === 0 || wholesalePrice === '0' ? '' : wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, wholesalePrice, (val) => setWholesalePrice(val))}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, wholesalePrice, (val) => setWholesalePrice(val))}
                  />
                </div>}
                {!isRawMaterial && <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Super Distributor Price (₹)</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={!distributorPrice || distributorPrice === 0 || distributorPrice === '0' ? '' : distributorPrice}
                    onChange={(e) => setDistributorPrice(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, distributorPrice, (val) => setDistributorPrice(val))}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, distributorPrice, (val) => setDistributorPrice(val))}
                  />
                </div>}
                {!isRawMaterial && <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Unit Standard Cost (₹)</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={!costPrice || costPrice === 0 || costPrice === '0' ? '' : costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, costPrice, (val) => setCostPrice(val))}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, costPrice, (val) => setCostPrice(val))}
                  />
                </div>}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">GST Rate (%)</label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={!gstRate || gstRate === 0 || gstRate === '0' ? '' : gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, gstRate, (val) => setGstRate(val), { min: 0, max: 100 })}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, gstRate, (val) => setGstRate(val), { min: 0, max: 100 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border pt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">HSN Code</label>
                  <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amazon ASIN</label>
                  <Input value={asin} onChange={(e) => setAsin(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">EAN-13 Barcode</label>
                  <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'INVENTORY' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Safety Stock Buffer (pcs)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={!safetyStock || safetyStock === 0 || safetyStock === '0' ? '' : safetyStock}
                    onChange={(e) => setSafetyStock(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, safetyStock, (val) => setSafetyStock(val))}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, safetyStock, (val) => setSafetyStock(val))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reorder Point Threshold (pcs)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={!reorderPoint || reorderPoint === 0 || reorderPoint === '0' ? '' : reorderPoint}
                    onChange={(e) => setReorderPoint(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, reorderPoint, (val) => setReorderPoint(val))}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, reorderPoint, (val) => setReorderPoint(val))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Max Stock Capacity (pcs)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={!maxCapacity || maxCapacity === 0 || maxCapacity === '0' ? '' : maxCapacity}
                    onChange={(e) => setMaxCapacity(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, maxCapacity, (val) => setMaxCapacity(val))}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, maxCapacity, (val) => setMaxCapacity(val))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Manufacturing Lead Time (Days)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={!leadTimeDays || leadTimeDays === 0 || leadTimeDays === '0' ? '' : leadTimeDays}
                    onChange={(e) => setLeadTimeDays(e.target.value)}
                    onWheel={(e) => handleNumberInputWheel(e, leadTimeDays, (val) => setLeadTimeDays(val))}
                    onKeyDown={(e) => handleNumberInputKeyDown(e, leadTimeDays, (val) => setLeadTimeDays(val))}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'SPECS' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Material Alloy & Grade</label>
                  <Input value={materialGrade} onChange={(e) => setMaterialGrade(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Surface Finish / Treatment</label>
                  <Input value={surfaceFinish} onChange={(e) => setSurfaceFinish(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Frame & Pipe Specifications</label>
                  <Input value={frameSpecs} onChange={(e) => setFrameSpecs(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hanging Rods Array & Sizes</label>
                  <Input value={rodSpecs} onChange={(e) => setRodSpecs(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extended Dimensions (L × W × H)</label>
                  <Input value={extendedDimensions} onChange={(e) => setExtendedDimensions(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Folded Flat Dimensions</label>
                  <Input value={foldedDimensions} onChange={(e) => setFoldedDimensions(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Load Bearing Capacity</label>
                  <Input value={loadCapacity} onChange={(e) => setLoadCapacity(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Packaging Type</label>
                  <Input value={packagingType} onChange={(e) => setPackagingType(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Net Weight (Product Only)</label>
                  <Input value={netWeight} onChange={(e) => setNetWeight(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Gross Weight (With Carton)</label>
                  <Input value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'BOM' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Specify raw materials, sub-assemblies, fasteners, and packaging that make up 1 unit of this finished item.
                </p>
                <Button type="button" size="sm" icon={Plus} onClick={addBomLine}>
                  Add Component Line
                </Button>
              </div>

              <div className="space-y-3">
                {bomLines.map((line, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 p-3">
                    <div className="flex-1 min-w-[200px]">
                      <Input
                        placeholder="Component Name"
                        value={line.component}
                        onChange={(e) => updateBomLine(idx, 'component', e.target.value)}
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        placeholder="Code"
                        value={line.code || ''}
                        onChange={(e) => updateBomLine(idx, 'code', e.target.value)}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        step="any"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateBomLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        placeholder="UOM"
                        value={line.uom}
                        onChange={(e) => updateBomLine(idx, 'uom', e.target.value)}
                      />
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        step="any"
                        placeholder="Cost ₹"
                        value={line.unitCost || 0}
                        onChange={(e) => updateBomLine(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBomLine(idx)}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'IMAGES' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Add Image via URL</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/product-image.jpg"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                  />
                  <Button type="button" onClick={addImageUrl}>
                    Add URL
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Or Upload Image Files</label>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center hover:bg-primary/10 transition-colors">
                  <UploadCloud className="mb-2 h-8 w-8 text-primary" />
                  <span className="font-bold text-sm text-foreground">Click to select files</span>
                  <span className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP up to 5 MB each</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []);
                      setUploadFiles(selected);
                      setUploadPreviews(selected.map((f) => URL.createObjectURL(f)));
                    }}
                  />
                </label>
                {uploadPreviews.length > 0 && (
                  <div className="grid grid-cols-4 gap-3 mt-3">
                    {uploadPreviews.map((url, i) => (
                      <img key={i} src={url} alt="Pending upload" className="aspect-square rounded-lg border object-cover" />
                    ))}
                  </div>
                )}
              </div>

              {/* Current Active Images List */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current Active Images</label>
                {images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {images.map((img, idx) => (
                      <div key={idx} className="group relative rounded-xl border border-border overflow-hidden bg-muted/40 aspect-square">
                        <img src={img.url} alt={img.fileName || 'Product'} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-2 right-2 rounded-lg bg-black/70 p-1.5 text-white hover:bg-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No image URLs configured yet.</p>
                )}
              </div>
            </div>
          )}
        </form>

        {/* Drawer Footer Actions */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-4">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button form="edit-product-form" type="submit" icon={Save} loading={update.isPending || upload.isPending}>
            Save Product Master
          </Button>
        </div>
      </div>
    </div>
  );
}
