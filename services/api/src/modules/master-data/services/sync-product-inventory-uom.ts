/**
 * Re-label a product's current balances to its catalog UOM without changing
 * quantity or cost. Historical inventory ledger entries intentionally retain
 * the UOM in which each movement was posted.
 */
export async function syncProductInventoryUom(tx: any, productId: string, uomId: string): Promise<void> {
  const balances = await tx.$queryRaw<any[]>`
    SELECT * FROM "inventory_balances"
    WHERE "itemType" = 'PRODUCT' AND "itemId" = ${productId} AND "uomId" <> ${uomId}
    FOR UPDATE
  `;

  for (const balance of balances) {
    const targetRows = await tx.$queryRaw<any[]>`
      SELECT * FROM "inventory_balances"
      WHERE "itemType" = 'PRODUCT' AND "itemId" = ${productId} AND "uomId" = ${uomId}
        AND "locationId" = ${balance.locationId}
        AND "condition" = ${balance.condition}::"InventoryCondition"
        AND "ownership" = ${balance.ownership}::"InventoryOwnership"
        AND COALESCE("lotId", '') = ${balance.lotId || ''}
      FOR UPDATE
    `;
    const target = targetRows[0];

    if (!target) {
      await tx.$executeRaw`UPDATE "inventory_balances" SET "uomId" = ${uomId}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${balance.id}`;
    } else {
      await tx.$executeRaw`
        UPDATE "inventory_balances"
        SET "quantity" = "quantity" + ${balance.quantity}, "reserved" = "reserved" + ${balance.reserved},
            "averageCost" = CASE
              WHEN "quantity" + ${balance.quantity} > 0
                THEN (("quantity" * "averageCost") + (${balance.quantity} * ${balance.averageCost})) / ("quantity" + ${balance.quantity})
              ELSE 0
            END,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${target.id}
      `;
      await tx.$executeRaw`DELETE FROM "inventory_balances" WHERE "id" = ${balance.id}`;
    }
  }

  await tx.$executeRaw`
    UPDATE "inventory_reservations" SET "uomId" = ${uomId}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "itemType" = 'PRODUCT' AND "itemId" = ${productId} AND "uomId" <> ${uomId} AND "status" = 'ACTIVE'
  `;

  const legacyBalances = await tx.stockBalance.findMany({
    where: { productId, uomId: { not: uomId } },
  });
  for (const balance of legacyBalances) {
    const target = await tx.stockBalance.findUnique({
      where: {
        itemKey_uomId_locationId_ownership: {
          itemKey: balance.itemKey,
          uomId,
          locationId: balance.locationId,
          ownership: balance.ownership,
        },
      },
    });
    if (!target) {
      await tx.stockBalance.update({ where: { id: balance.id }, data: { uomId } });
    } else {
      await tx.stockBalance.update({
        where: { id: target.id },
        data: {
          onHandQuantity: { increment: balance.onHandQuantity },
          reservedQuantity: { increment: balance.reservedQuantity },
        },
      });
      await tx.stockBalance.delete({ where: { id: balance.id } });
    }
  }

  await tx.stockReservation.updateMany({
    where: { productId, uomId: { not: uomId }, status: 'ACTIVE' },
    data: { uomId },
  });
}
