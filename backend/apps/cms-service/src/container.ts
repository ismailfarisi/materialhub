import { Elysia } from "elysia";

import { PageController } from "./domain/page/page.controller.ts";
import { PageService } from "./domain/page/page.service.ts";

import { BannerController } from "./domain/banner/banner.controller.ts";
import { BannerService } from "./domain/banner/banner.service.ts";

import { SettingController } from "./domain/setting/setting.controller.ts";
import { SettingService } from "./domain/setting/setting.service.ts";

import { SlackSettingsRepository } from "./domain/support/slack-settings.repository.ts";
import { SlackController } from "./domain/support/slack.controller.ts";
import { SlackService } from "./domain/support/slack.service.ts";
import { SupportController } from "./domain/support/support.controller.ts";
import { SupportService } from "./domain/support/support.service.ts";

import { AuditController } from "./domain/audit/audit.controller.ts";
import { AuditService } from "./domain/audit/audit.service.ts";

import { BidController } from "./domain/bid/bid.controller.ts";
import { BidService } from "./domain/bid/bid.service.ts";
import { HeaderNavigationResolverService } from "./domain/header-navigation/header-navigation-resolver.service.ts";
import { HeaderNavigationController } from "./domain/header-navigation/header-navigation.controller.ts";
import { HeaderNavigationService } from "./domain/header-navigation/header-navigation.service.ts";
import { LayoutResolverService } from "./domain/layout/layout-resolver.service.ts";
import { LayoutController } from "./domain/layout/layout.controller.ts";
import { LayoutService } from "./domain/layout/layout.service.ts";
import { SectionTypeController } from "./domain/layout/section-type.controller.ts";
import { SectionTypeService } from "./domain/layout/section-type.service.ts";
import { VendorLayoutInitService } from "./domain/layout/vendor-layout-init.service.ts";

// ─── Page ─────────────────────────────────────────────────────────────────
const pageService = new PageService();
const pageController = new PageController(pageService);

// ─── Banner ───────────────────────────────────────────────────────────────
const bannerService = new BannerService();
const bannerController = new BannerController(bannerService);

// ─── Setting ──────────────────────────────────────────────────────────────
const settingService = new SettingService();
const settingController = new SettingController(settingService);

// ─── Slack ────────────────────────────────────────────────────────────────
const slackSettingsRepo = new SlackSettingsRepository();
const slackService = new SlackService(slackSettingsRepo);
const slackController = new SlackController(slackSettingsRepo, slackService);

// ─── Support ──────────────────────────────────────────────────────────────
const supportService = new SupportService(slackService);
const supportController = new SupportController(supportService);

// ─── Audit ────────────────────────────────────────────────────────────────
const auditService = new AuditService();
const auditController = new AuditController(auditService);

// ─── Section Type ─────────────────────────────────────────────────────────
const sectionTypeService = new SectionTypeService();
const sectionTypeController = new SectionTypeController(sectionTypeService);

// ─── Bid ──────────────────────────────────────────────────────────────────
const bidService = new BidService();
const bidController = new BidController(bidService);

// ─── Layout ───────────────────────────────────────────────────────────────
const layoutService = new LayoutService(bidService);
const layoutController = new LayoutController(layoutService);

// ─── Layout Resolver ──────────────────────────────────────────────────────
const layoutResolverService = new LayoutResolverService();
const layoutResolverController = layoutResolverService;

// ─── Vendor Layout Init ──────────────────────────────────────────────────
const vendorLayoutInitService = new VendorLayoutInitService();

// ─── Header Navigation ───────────────────────────────────────────────────
const headerNavService = new HeaderNavigationService();
const headerNavResolver = new HeaderNavigationResolverService();
const headerNavController = new HeaderNavigationController(headerNavService, headerNavResolver);

export const container = new Elysia({ name: "cms-service-container" })
  .decorate("pageController", pageController)
  .decorate("bannerController", bannerController)
  .decorate("settingController", settingController)
  .decorate("supportController", supportController)
  .decorate("slackController", slackController)
  .decorate("slackService", slackService)
  .decorate("auditController", auditController)
  .decorate("sectionTypeController", sectionTypeController)
  .decorate("layoutController", layoutController)
  .decorate("layoutResolverController", layoutResolverController)
  .decorate("bidController", bidController)
  .decorate("vendorLayoutInitService", vendorLayoutInitService)
  .decorate("headerNavController", headerNavController);
