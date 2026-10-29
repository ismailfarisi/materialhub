import type { UserAdminService } from "../services/user-admin.service.ts";

export class UserAdminController {
  constructor(private readonly userAdminService: UserAdminService) {}

  list(query: any) {
    return this.userAdminService.list(query);
  }

  getById(userId: string) {
    return this.userAdminService.getById(userId);
  }

  updateStatus(userId: string, status: string) {
    return this.userAdminService.updateStatus(userId, status);
  }

  updateRole(userId: string, role: string) {
    return this.userAdminService.updateRole(userId, role);
  }

  updateCreatorTier(userId: string, tier: string) {
    return this.userAdminService.updateCreatorTier(userId, tier);
  }
}
