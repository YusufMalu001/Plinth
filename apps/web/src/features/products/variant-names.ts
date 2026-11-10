/** Extract the variant's own label from legacy names that include the parent. */
export function getVariantLabel(parentName: string | undefined, variantName: string | undefined, fallback?: string) {
  let label = (variantName || '').trim();
  const parent = (parentName || '').trim();
  if (parent && label.toLowerCase().startsWith(`${parent.toLowerCase()} `)) {
    label = label.slice(parent.length).trim();
    if (label.startsWith('-')) label = label.slice(1).trim();
    if (label.startsWith('(') && label.endsWith(')')) label = label.slice(1, -1).trim();
  }
  return label || (fallback || '').trim();
}

export function formatVariantName(parentName: string | undefined, variantName: string | undefined, fallback?: string) {
  const parent = (parentName || '').trim();
  const label = getVariantLabel(parent, variantName, fallback);
  return [parent, label].filter(Boolean).join(' ');
}
