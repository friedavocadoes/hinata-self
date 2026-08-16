import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Removes sale history for an order and restores the sold quantities on the
 * purchase lots that were consumed by that order. Inventory is restored by
 * deleting the original movement rather than creating a compensating entry,
 * because this is an explicit destructive delete operation.
 */
export async function revertOrderInventory(admin: SupabaseClient, orderId: string) {
  const { data: movements, error: movementError } = await admin
    .from("inventory_movements")
    .select("id, purchase_item_id, quantity_kg, movement_type")
    .eq("reference_type", "order")
    .eq("reference_id", orderId);

  if (movementError) throw new Error(movementError.message);

  const saleMovements = (movements ?? []).filter((movement) => movement.movement_type === "sale");

  for (const movement of saleMovements) {
    if (!movement.purchase_item_id) continue;

    const { data: purchaseItem, error: purchaseItemError } = await admin
      .from("purchase_items")
      .select("id, sold_qty_kg")
      .eq("id", movement.purchase_item_id)
      .single();

    if (purchaseItemError || !purchaseItem) {
      throw new Error(purchaseItemError?.message ?? "Purchase lot used by this order no longer exists.");
    }

    const restoredSoldQty = Math.max(0, Number(purchaseItem.sold_qty_kg ?? 0) - Number(movement.quantity_kg));
    const { error: updateError } = await admin
      .from("purchase_items")
      .update({ sold_qty_kg: restoredSoldQty })
      .eq("id", purchaseItem.id);

    if (updateError) throw new Error(updateError.message);
  }

  if (movements?.length) {
    const { error: deleteMovementError } = await admin
      .from("inventory_movements")
      .delete()
      .eq("reference_type", "order")
      .eq("reference_id", orderId);

    if (deleteMovementError) throw new Error(deleteMovementError.message);
  }
}

/**
 * Clears every downstream sales/order record that consumed stock from a
 * purchase, then removes the purchase's own inventory movements.
 */
export async function clearPurchaseHistory(admin: SupabaseClient, purchaseId: string) {
  const { data: purchaseItems, error: purchaseItemsError } = await admin
    .from("purchase_items")
    .select("id")
    .eq("purchase_order_id", purchaseId);

  if (purchaseItemsError) throw new Error(purchaseItemsError.message);

  const purchaseItemIds = (purchaseItems ?? []).map((item) => item.id);
  const orderIds = new Set<string>();

  if (purchaseItemIds.length) {
    const { data: saleMovements, error: saleMovementError } = await admin
      .from("inventory_movements")
      .select("reference_id")
      .eq("reference_type", "order")
      .eq("movement_type", "sale")
      .in("purchase_item_id", purchaseItemIds);

    if (saleMovementError) throw new Error(saleMovementError.message);
    for (const movement of saleMovements ?? []) {
      if (movement.reference_id) orderIds.add(movement.reference_id);
    }
  }

  const quotationIds = new Set<string>();

  for (const orderId of orderIds) {
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, quotation_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) throw new Error(orderError.message);
    if (!order) continue;

    if (order.quotation_id) quotationIds.add(order.quotation_id);
    await revertOrderInventory(admin, order.id);

    const { error: deleteOrderError } = await admin.from("orders").delete().eq("id", order.id);
    if (deleteOrderError) throw new Error(deleteOrderError.message);
  }

  if (quotationIds.size) {
    const { error: quotationError } = await admin
      .from("quotations")
      .delete()
      .in("id", [...quotationIds]);

    if (quotationError) throw new Error(quotationError.message);
  }

  const { error: purchaseMovementError } = await admin
    .from("inventory_movements")
    .delete()
    .eq("reference_type", "purchase_order")
    .eq("reference_id", purchaseId);

  if (purchaseMovementError) throw new Error(purchaseMovementError.message);
}
