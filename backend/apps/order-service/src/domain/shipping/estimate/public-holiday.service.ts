// public-holiday.service.ts — admin-edited holiday list for the estimator.
import type { PublicHoliday } from "@materialhub/database";
import { HttpError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";

export interface HolidayInput {
  holiday_date?: string;
  name?: string;
  name_ar?: string | null;
  is_estimate?: boolean;
  is_active?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string): void {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new HttpError(422, "Date must be YYYY-MM-DD", "INVALID_DATE");
  }
  if (new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new HttpError(422, "Date does not exist", "INVALID_DATE");
  }
}

export class PublicHolidayService {
  constructor(
    private repo: Repository<PublicHoliday>,
    private onChange: () => void = () => {},
  ) {}

  list(year?: number): Promise<PublicHoliday[]> {
    const qb = this.repo.createQueryBuilder("h").where("h.country_code = 'AE'");
    if (year) {
      qb.andWhere("h.holiday_date BETWEEN :from AND :to", {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      });
    }
    return qb.orderBy("h.holiday_date", "ASC").getMany();
  }

  private async assertFree(date: string, exceptId?: string): Promise<void> {
    const clash = await this.repo.findOne({
      where: { country_code: "AE", holiday_date: date } as any,
    });
    if (clash && clash.id !== exceptId) {
      throw new HttpError(409, `A holiday already exists on ${date}`, "HOLIDAY_DATE_TAKEN");
    }
  }

  async create(
    input: HolidayInput & { holiday_date: string; name: string },
  ): Promise<PublicHoliday> {
    assertDate(input.holiday_date);
    const name = input.name.trim();
    if (!name) throw new HttpError(422, "Name is required", "INVALID_NAME");
    await this.assertFree(input.holiday_date);
    const saved = await this.repo.save(
      this.repo.create({
        holiday_date: input.holiday_date,
        name,
        name_ar: input.name_ar?.trim() || null,
        country_code: "AE",
        is_estimate: input.is_estimate ?? true,
        is_active: input.is_active ?? true,
      }),
    );
    this.onChange();
    return saved;
  }

  async update(id: string, input: HolidayInput): Promise<PublicHoliday> {
    const row = await this.repo.findOne({ where: { id } as any });
    if (!row) throw new NotFoundError("Holiday not found");
    if (input.holiday_date !== undefined) {
      assertDate(input.holiday_date);
      await this.assertFree(input.holiday_date, id);
      row.holiday_date = input.holiday_date;
    }
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new HttpError(422, "Name is required", "INVALID_NAME");
      row.name = name;
    }
    if (input.name_ar !== undefined) row.name_ar = input.name_ar?.trim() || null;
    if (input.is_estimate !== undefined) row.is_estimate = input.is_estimate;
    if (input.is_active !== undefined) row.is_active = input.is_active;
    const saved = await this.repo.save(row);
    this.onChange();
    return saved;
  }

  async remove(id: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id } as any });
    if (!row) throw new NotFoundError("Holiday not found");
    await this.repo.remove(row);
    this.onChange();
  }
}
