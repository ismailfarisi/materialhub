import {
  AppDataSource,
  Inventory,
  InventoryMovement,
  InventoryReservation,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

export class InventoryReservationService {
  private get reservationRepo() {
    return AppDataSource.getRepository(InventoryReservation);
  }

  async reserve(inventoryId: string, quantity: number, cartId?: string) {
    return AppDataSource.transaction(async (manager) => {
      const inventory = await manager.getRepository(Inventory).findOne({
        where: { id: inventoryId },
        lock: { mode: "pessimistic_write" },
      });
      if (!inventory) throw new HttpError(404, "Inventory not found", "INVENTORY_NOT_FOUND");

      const available = inventory.quantity_on_hand - inventory.quantity_reserved;
      if (available < quantity) {
        throw new HttpError(422, "Insufficient stock", "INSUFFICIENT_STOCK");
      }

      inventory.quantity_reserved += quantity;
      await manager.save(Inventory, inventory);

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      const reservation = await manager.save(
        InventoryReservation,
        manager.create(InventoryReservation, {
          inventory_id: inventoryId,
          cart_id: cartId ?? null,
          quantity,
          status: "active" as any,
          expires_at: expiresAt,
        }),
      );

      await manager.save(
        InventoryMovement,
        manager.create(InventoryMovement, {
          inventory_id: inventoryId,
          product_id: inventory.product_id,
          variant_id: inventory.variant_id,
          quantity: -quantity,
          quantity_before: inventory.quantity_on_hand,
          quantity_after: inventory.quantity_on_hand,
          movement_type: "reserved" as any,
        }),
      );

      return reservation;
    });
  }

  async releaseExpired() {
    const expired = await this.reservationRepo
      .createQueryBuilder("r")
      .where("r.status = :status", { status: "active" })
      .andWhere("r.expires_at <= NOW()")
      .getMany();

    for (const reservation of expired) {
      await AppDataSource.transaction(async (manager) => {
        const inventory = await manager.getRepository(Inventory).findOne({
          where: { id: reservation.inventory_id },
          lock: { mode: "pessimistic_write" },
        });
        if (!inventory) return;

        inventory.quantity_reserved = Math.max(
          0,
          inventory.quantity_reserved - reservation.quantity,
        );
        await manager.save(Inventory, inventory);

        reservation.status = "expired" as any;
        reservation.released_at = new Date();
        await manager.save(InventoryReservation, reservation);

        await manager.save(
          InventoryMovement,
          manager.create(InventoryMovement, {
            inventory_id: inventory.id,
            product_id: inventory.product_id,
            variant_id: inventory.variant_id,
            quantity: reservation.quantity,
            quantity_before: inventory.quantity_on_hand,
            quantity_after: inventory.quantity_on_hand,
            movement_type: "released" as any,
          }),
        );
      });
    }

    return expired.length;
  }
}
