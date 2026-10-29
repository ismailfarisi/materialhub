import type { CustomerBeautyProfile } from "@materialhub/database";
import type { Repository } from "typeorm";

// Field values are validated against UpdateBeautyProfileBody at the route layer, so they
// arrive as plain strings; the entity columns are nominal TS enums, so the persistence
// boundary in upsert() casts. Keeping this contract string-based avoids nominal-enum
// friction without losing runtime safety (the DTO is the source of truth for valid values).
export type BeautyProfileInput = {
  skin_type?: string | null;
  skin_concerns?: string[] | null;
  skin_tone_depth?: string | null;
  undertone?: string | null;
  hair_type?: string | null;
  fragrance_families?: string[] | null;
  completed?: boolean;
};

export class CustomerBeautyProfileService {
  constructor(private readonly profileRepo: Repository<CustomerBeautyProfile>) {}

  async get(userId: string): Promise<CustomerBeautyProfile | null> {
    return this.profileRepo.findOne({ where: { user_id: userId } });
  }

  async isCompleted(userId: string): Promise<boolean> {
    const profile = await this.get(userId);
    return !!profile?.completed_at;
  }

  async upsert(userId: string, input: BeautyProfileInput): Promise<CustomerBeautyProfile> {
    const { completed, ...fields } = input;

    const existing = await this.get(userId);

    const merged: Partial<CustomerBeautyProfile> = {
      ...(existing ?? ({ user_id: userId } as Partial<CustomerBeautyProfile>)),
      ...(fields as Partial<CustomerBeautyProfile>),
    };

    // Completion is one-directional by design: once a customer finishes the quiz the
    // "finish your profile" nudge never returns, even if they later re-open and resave.
    // So `completed: false`/omitted intentionally leaves an existing completed_at intact.
    if (completed) {
      merged.completed_at = new Date();
    }

    return this.profileRepo.save(merged as CustomerBeautyProfile);
  }
}
