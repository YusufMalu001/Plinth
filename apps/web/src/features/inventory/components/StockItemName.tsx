import { VariantBadge } from '@/components/ui/VariantBadge';
type VariantItem = {
 isVariant?: boolean;
 parentProductId?: string | null;
 parentMaterialId?: string | null;
 metadata?: Record<string, unknown> | null;
 specs?: Record<string, unknown> | null;
};
export function isStockVariant(item?: VariantItem | null, context?: string | null) {
 return Boolean(item?.isVariant || item?.parentProductId || item?.parentMaterialId ||
 item?.metadata?.isVariant || item?.metadata?.parentProductId ||
 item?.specs?.isVariant || item?.specs?.parentMaterialId ||
 /\[Variant:\s*[^\]]+\]/i.test(context || ''));
}
export function StockItemName({ name, item, context }: {
 name: string | null | undefined; item?: VariantItem | null; context?: string | null;
}) {
 const variantName = context?.match(/\[Variant:\s*([^\]]+)\]/i)?.[1];
 return <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
 <span className="min-w-0 break-words">{variantName || name}</span>
 {isStockVariant(item, context) && <VariantBadge />}
 </span>;
}
