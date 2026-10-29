import type { DashboardService } from "./dashboard.service.ts";

export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  adminStats() {
    return this.dashboardService.adminStats();
  }

  adminRevenue(period: string) {
    return this.dashboardService.adminRevenue(period);
  }

  vendorStats(vendorId: string) {
    return this.dashboardService.vendorStats(vendorId);
  }

  vendorRevenue(vendorId: string, period: string) {
    return this.dashboardService.vendorRevenue(vendorId, period);
  }
}
