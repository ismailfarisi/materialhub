import type { HeaderNavConfig } from "@materialhub/database";
import type { HeaderNavigationResolverService } from "./header-navigation-resolver.service.ts";
import type { HeaderNavigationService } from "./header-navigation.service.ts";

export class HeaderNavigationController {
  constructor(
    private readonly service: HeaderNavigationService,
    private readonly resolver: HeaderNavigationResolverService,
  ) {}

  async getDraft() {
    return this.service.getDraft();
  }
  async upsertDraft(config: HeaderNavConfig, userId: string) {
    return this.service.upsertDraft(config, userId);
  }
  async publish(userId: string) {
    return this.service.publish(userId);
  }
  async resolve(locale: string) {
    return this.resolver.resolve(locale);
  }
}
