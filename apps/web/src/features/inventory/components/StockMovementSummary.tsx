type StockMovementSummaryProps = {
  availableQuantity?: number;
  movementQuantity: number;
  uomLabel: string;
  isLoading?: boolean;
  isError?: boolean;
};

const formatQuantity = (value: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(value);

export function StockMovementSummary({
  availableQuantity,
  movementQuantity,
  uomLabel,
  isLoading = false,
  isError = false,
}: StockMovementSummaryProps) {
  const hasAvailableQuantity = typeof availableQuantity === 'number' && Number.isFinite(availableQuantity);
  const projectedQuantity = hasAvailableQuantity ? availableQuantity + movementQuantity : undefined;
  const movementSign = movementQuantity > 0 ? '+' : movementQuantity < 0 ? '−' : '';

  const cards = [
    {
      title: 'Available Stock',
      value: hasAvailableQuantity ? formatQuantity(availableQuantity) : isLoading ? 'Loading…' : '—',
      detail: isError ? 'Current balance could not be loaded' : 'Current available balance',
      valueClass: 'text-foreground',
    },
    {
      title: 'Net Movement',
      value: `${movementSign}${formatQuantity(Math.abs(movementQuantity))}`,
      detail: 'Change from this action',
      valueClass: movementQuantity > 0
        ? 'text-tone-green-text '
        : movementQuantity < 0
          ? 'text-tone-red-text '
          : 'text-foreground',
    },
    {
      title: 'Final Projected Stock',
      value: projectedQuantity === undefined ? '—' : formatQuantity(projectedQuantity),
      detail: projectedQuantity === undefined ? 'Select an item to calculate' : `${uomLabel || 'Units'} after this action`,
      valueClass: projectedQuantity !== undefined && projectedQuantity < 0
        ? 'text-tone-red-text '
        : 'text-foreground',
    },
  ];

  return (
    <section aria-label="Stock movement preview" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.title} className="min-w-0 rounded-xl border border-border/70 bg-card/80 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{card.title}</p>
          <p className={`mt-1 truncate font-mono text-sm font-extrabold ${card.valueClass}`}>
            {card.value}{card.title === 'Available Stock' && hasAvailableQuantity ? ` ${uomLabel}` : ''}
            {card.title === 'Net Movement' && ` ${uomLabel}`}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{card.detail}</p>
        </div>
      ))}
    </section>
  );
}
