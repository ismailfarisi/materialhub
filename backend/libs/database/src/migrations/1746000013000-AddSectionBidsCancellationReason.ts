import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSectionBidsCancellationReason1746000013000 implements MigrationInterface {
  name = "AddSectionBidsCancellationReason1746000013000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE section_bids ADD COLUMN cancellation_reason VARCHAR(50) NULL;",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE section_bids DROP COLUMN cancellation_reason;");
  }
}
