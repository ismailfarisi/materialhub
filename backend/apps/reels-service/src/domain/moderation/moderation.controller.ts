import type { ModerationService } from "./moderation.service.ts";

export class ModerationController {
  constructor(private readonly service: ModerationService) {}

  listQueue(opts: { language?: string; cursor?: string; limit?: number }) {
    return this.service.listQueue(opts);
  }
  approve(reelId: string, moderatorId: string, notes?: string) {
    return this.service.approve(reelId, moderatorId, notes);
  }
  reject(reelId: string, moderatorId: string, reason: string, notes?: string) {
    return this.service.reject(reelId, moderatorId, reason, notes);
  }
  flag(reelId: string, moderatorId: string, notes?: string) {
    return this.service.flag(reelId, moderatorId, notes);
  }
}
