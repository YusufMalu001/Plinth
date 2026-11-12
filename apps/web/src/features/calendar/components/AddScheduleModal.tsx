'use client';

import React, { useState, useEffect } from 'react';
import { X, Factory, ShoppingCart, Truck, PackageCheck, Plus } from 'lucide-react';
import { EventCategory, DayOperationalSummary } from '../types';
import { fetchApi } from '../../api/client';

interface AddScheduleModalProps {
 isOpen: boolean;
 onClose: () => void;
 selectedDate?: Date;
 currentSummary: DayOperationalSummary;
 onSave: (updatedSummary: DayOperationalSummary) => void;
}

interface ProductItem {
 id: string;
 name: string;
 sku: string;
}

interface VendorItem {
 id: string;
 name: string;
 code?: string;
}

export function AddScheduleModal({
 isOpen,
 onClose,
 currentSummary,
 onSave,
}: AddScheduleModalProps) {
 const [category, setCategory] = useState<EventCategory>('production');
 const [title, setTitle] = useState('');
 const [code, setCode] = useState('');
 const [quantity, setQuantity] = useState(500);
 const [lineOrDestination, setLineOrDestination] = useState('');
 const [shiftOrTime, setShiftOrTime] = useState('Morning (06:00 - 14:00)');
 const [notes, setNotes] = useState('');

 const [productsList, setProductsList] = useState<ProductItem[]>([]);
 const [vendorsList, setVendorsList] = useState<VendorItem[]>([]);

 useEffect(() => {
 if (isOpen) {
 fetchApi<{ items?: ProductItem[] }>('/master-data/products?limit=50')
 .then((res) => {
 if (res?.items) setProductsList(res.items);
 })
 .catch(() => {});

 fetchApi<{ items?: VendorItem[] }>('/master-data/vendors?limit=50&activeOnly=true')
 .then((res) => {
 if (res?.items) setVendorsList(res.items);
 })
 .catch(() => {});
 }
 }, [isOpen]);

 if (!isOpen) return null;

 const dateStr = currentSummary.dateStr;

 const handleSelectProduct = (e: React.ChangeEvent<HTMLSelectElement>) => {
 const val = e.target.value;
 setTitle(val);
 const prod = productsList.find((p) => p.name === val);
 if (prod) {
 setCode(`WO-${prod.sku}-${Math.floor(100 + Math.random() * 900)}`);
 }
 };

 const handleSelectVendor = (e: React.ChangeEvent<HTMLSelectElement>) => {
 const val = e.target.value;
 setTitle(val);
 const v = vendorsList.find((ven) => ven.name === val);
 if (v) {
 setCode(`PO-${v.code || 'VEND'}-${Math.floor(100 + Math.random() * 900)}`);
 }
 };

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 const updated = { ...currentSummary };

 if (category === 'production') {
 const newProd = {
 id: `PRD-${Date.now()}`,
 code: code || `WO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
 productName: title || 'Industrial Component Batch',
 sku: 'SKU-PRD-01',
 line: lineOrDestination || 'Line 1 (Heavy Extrusion)',
 shift: shiftOrTime as 'Morning (06:00 - 14:00)' | 'Evening (14:00 - 22:00)' | 'Night (22:00 - 06:00)',
 supervisor: currentSummary.shiftSupervisor || 'Operations Lead',
 targetQuantity: Number(quantity) || 500,
 completedQuantity: 0,
 unit: 'units',
 status: 'scheduled' as const,
 progressPct: 0,
 priority: 'high' as const,
 bomCode: 'BOM-LIVE-REV1',
 notes: notes || 'Scheduled via Operations Calendar',
 startTime: '08:00 AM',
 endTime: '04:00 PM',
 };
 updated.productionEvents = [newProd, ...updated.productionEvents];
 updated.plannedOutputUnits += Number(quantity) || 500;
 } else if (category === 'order') {
 const newOrder = {
 id: `SO-${Date.now()}`,
 orderNumber: code || `SO-2026-${Math.floor(10000 + Math.random() * 89999)}`,
 clientName: title || 'Enterprise Partner Client',
 clientTier: 'Enterprise' as const,
 destination: lineOrDestination || 'Central Hub Logistics Gate',
 itemsCount: 3,
 totalValue: Number(quantity) * 45 || 25000,
 currency: 'INR',
 status: 'confirmed' as const,
 priority: 'high' as const,
 fulfillmentDate: dateStr,
 items: [{ name: title || 'Industrial Supplies', qty: Number(quantity) || 500, unitPrice: 45 }],
 salesRep: 'Procurement Logistics Team',
 };
 updated.salesOrders = [newOrder, ...updated.salesOrders];
 updated.ordersCount += 1;
 updated.ordersTotalValue += newOrder.totalValue;
 } else if (category === 'dispatch') {
 const newDispatch = {
 id: `DSP-${Date.now()}`,
 manifestNumber: code || `MNF-26-${Math.floor(1000 + Math.random() * 9000)}`,
 vehicleNumber: 'MH-04-TR-9901',
 driverName: title || 'Harpreet Singh',
 driverPhone: '+91 98201 55432',
 carrierName: 'DHL Global Logistics',
 destination: lineOrDestination || 'Rotterdam Port Terminal Gateway',
 dockNumber: 'Bay 4',
 departureTime: '11:00 AM',
 estimatedArrival: '06:00 PM',
 packagesCount: 24,
 totalWeightKg: Number(quantity) || 2400,
 status: 'dock_loading' as const,
 associatedOrders: ['SO-2026-9021'],
 };
 updated.dispatches = [newDispatch, ...updated.dispatches];
 updated.dispatchesCount += 1;
 updated.dispatchedWeightKg += Number(quantity) || 2400;
 } else if (category === 'inbound') {
 const newInbound = {
 id: `INB-${Date.now()}`,
 poNumber: code || `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
 vendorName: title || 'Primary Metal Suppliers',
 materialName: lineOrDestination || 'Raw Aluminum Billets',
 quantity: Number(quantity) || 15,
 unit: 'MT',
 dockNumber: 'Inbound Dock A',
 expectedTime: '09:30 hrs',
 status: 'expected' as const,
 };
 updated.inboundReceipts = [newInbound, ...updated.inboundReceipts];
 updated.inboundReceiptsCount += 1;
 }

 // Also add to timeline
 updated.timeline = [
 {
 id: `TL-${Date.now()}`,
 time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
 title: `${category.toUpperCase()}: ${title || code}`,
 description: notes || `Created schedule operation on ${dateStr}`,
 category,
 status: 'scheduled',
 badgeText: 'Manual Scheduled',
 actor: 'Operations Planner',
 },
 ...updated.timeline,
 ];

 onSave(updated);
 onClose();
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--overlay)] backdrop-blur-xs p-4">
 <div className="relative w-full max-w-lg rounded-2xl border border-border bg-white shadow-2xl p-6 overflow-hidden">
 {/* Modal Top Bar */}
 <div className="flex items-center justify-between border-b border-border pb-4">
 <div>
 <h3 className="text-lg font-bold text-ink ">
 Schedule Day Operation
 </h3>
 <p className="text-xs text-ink-secondary">
 For date: <strong className="text-[#3E63DD] ">{dateStr}</strong>
 </p>
 </div>
 <button
 type="button"
 onClick={onClose}
 className="p-1 rounded-lg text-ink-muted hover:text-ink-secondary cursor-pointer"
 >
 <X className="h-5 w-5" />
 </button>
 </div>

 {/* Category Choice */}
 <form onSubmit={handleSubmit} className="mt-4 space-y-4">
 <div>
 <label className="block text-xs font-bold text-ink-secondary uppercase tracking-wider mb-2">
 Select Operation Stream
 </label>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {[
 { id: 'production', label: 'Production', icon: Factory },
 { id: 'order', label: 'Order', icon: ShoppingCart },
 { id: 'dispatch', label: 'Dispatch', icon: Truck },
 { id: 'inbound', label: 'Inbound GRN', icon: PackageCheck },
 ].map((item) => {
 const Icon = item.icon;
 const isSelected = category === item.id;
 return (
 <button
 key={item.id}
 type="button"
 onClick={() => setCategory(item.id as EventCategory)}
 className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
 isSelected
 ? 'border-[#3E63DD] bg-[#3E63DD]/10 text-[#3E63DD] ring-2 ring-[#3E63DD]/20'
 : 'border-border hover:bg-muted text-ink-secondary '
 }`}
 >
 <Icon className="h-4 w-4 mb-1" />
 <span>{item.label}</span>
 </button>
 );
 })}
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <div className="flex items-center justify-between mb-1">
 <label className="text-xs font-semibold text-ink-secondary ">
 {category === 'production'
 ? 'Product Name'
 : category === 'order'
 ? 'Client / Vendor'
 : category === 'dispatch'
 ? 'Carrier / Driver'
 : 'Vendor / Supplier'}
 </label>
 {category === 'production' && productsList.length > 0 && (
 <select
 onChange={handleSelectProduct}
 className="text-[10px] text-[#3E63DD] bg-transparent border-0 cursor-pointer focus:outline-none"
 >
 <option value="">Choose Existing...</option>
 {productsList.map((p) => (
 <option key={p.id} value={p.name} className="bg-white text-ink ">
 {p.name} ({p.sku})
 </option>
 ))}
 </select>
 )}
 {category === 'inbound' && vendorsList.length > 0 && (
 <select
 onChange={handleSelectVendor}
 className="text-[10px] text-[#3E63DD] bg-transparent border-0 cursor-pointer focus:outline-none"
 >
 <option value="">Choose Vendor...</option>
 {vendorsList.map((v) => (
 <option key={v.id} value={v.name} className="bg-white text-ink ">
 {v.name}
 </option>
 ))}
 </select>
 )}
 </div>
 <input
 type="text"
 required
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder={
 category === 'production'
 ? 'e.g. Precision Hydraulic Flange'
 : category === 'order'
 ? 'e.g. Apex Heavy Industries'
 : category === 'dispatch'
 ? 'e.g. DHL Surface Logistics'
 : 'e.g. Hindalco Metals'
 }
 className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs text-ink focus:border-[#3E63DD] focus:outline-none focus:ring-1 focus:ring-[#3E63DD]"
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-ink-secondary mb-1">
 Reference Code / Number
 </label>
 <input
 type="text"
 value={code}
 onChange={(e) => setCode(e.target.value)}
 placeholder="e.g. WO-2026-9081 / SO-4421"
 className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs text-ink focus:border-[#3E63DD] focus:outline-none focus:ring-1 focus:ring-[#3E63DD]"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-semibold text-ink-secondary mb-1">
 {category === 'production'
 ? 'Target Quantity'
 : category === 'order'
 ? 'Units Ordered'
 : category === 'dispatch'
 ? 'Cargo Weight (Kg)'
 : 'Quantity (MT)'}
 </label>
 <input
 type="number"
 value={quantity}
 onChange={(e) => setQuantity(Number(e.target.value))}
 className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs text-ink focus:border-[#3E63DD] focus:outline-none focus:ring-1 focus:ring-[#3E63DD]"
 />
 </div>

 <div>
 <label className="block text-xs font-semibold text-ink-secondary mb-1">
 {category === 'production'
 ? 'Production Line'
 : category === 'order' || category === 'dispatch'
 ? 'Destination'
 : 'Dock Allocation'}
 </label>
 <input
 type="text"
 value={lineOrDestination}
 onChange={(e) => setLineOrDestination(e.target.value)}
 placeholder={category === 'production' ? 'Line 1 (Heavy Extrusion)' : 'Jamshedpur Hub Plant'}
 className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs text-ink focus:border-[#3E63DD] focus:outline-none focus:ring-1 focus:ring-[#3E63DD]"
 />
 </div>
 </div>

 {category === 'production' && (
 <div>
 <label className="block text-xs font-semibold text-ink-secondary mb-1">
 Assigned Shift Time
 </label>
 <select
 value={shiftOrTime}
 onChange={(e) => setShiftOrTime(e.target.value)}
 className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs text-ink focus:border-[#3E63DD] focus:outline-none focus:ring-1 focus:ring-[#3E63DD]"
 >
 <option value="Morning (06:00 - 14:00)">Morning (06:00 - 14:00)</option>
 <option value="Evening (14:00 - 22:00)">Evening (14:00 - 22:00)</option>
 <option value="Night (22:00 - 06:00)">Night (22:00 - 06:00)</option>
 </select>
 </div>
 )}

 <div>
 <label className="block text-xs font-semibold text-ink-secondary mb-1">
 Operation Notes / Instructions
 </label>
 <textarea
 rows={2}
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 placeholder="Add special instructions, priority notes or tooling details..."
 className="w-full rounded-xl border border-border bg-white px-3 py-2 text-xs text-ink focus:border-[#3E63DD] focus:outline-none focus:ring-1 focus:ring-[#3E63DD]"
 />
 </div>

 {/* Action buttons */}
 <div className="flex items-center justify-end gap-2 pt-3 border-t border-border ">
 <button
 type="button"
 onClick={onClose}
 className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-ink-secondary hover:bg-muted transition-colors cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 className="inline-flex items-center gap-1.5 rounded-xl bg-inverse hover:bg-[#2E2E2E] active:bg-[#000000] text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors ring-2 ring-[#3E63DD]/20 cursor-pointer"
 >
 <Plus className="h-4 w-4" />
 <span>Schedule Event</span>
 </button>
 </div>
 </form>
 </div>
 </div>
 );
}
