import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("product_collection_members")
export class ProductCollectionMember {
  @PrimaryColumn({ type: "uuid" })
  collection_id!: string;

  @Index()
  @PrimaryColumn({ type: "uuid" })
  product_id!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  refreshed_at!: Date;
}
