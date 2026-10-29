import type { ReelsService } from "./reels.service.ts";

export class ReelsController {
  constructor(private readonly service: ReelsService) {}

  async requestUpload(userId: string) {
    return this.service.requestUpload({ userId });
  }
}
