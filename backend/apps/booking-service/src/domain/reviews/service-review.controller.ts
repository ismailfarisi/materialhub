// service-review.controller.ts
//
// Thin controller for the booking-gated review APIs (Phase 5 Task 7).
// Translates the snake_case wire DTOs (@materialhub/dto's CreateServiceReviewBody
// / VendorReplyServiceReviewBody) into the camelCase inputs
// ServiceReviewService expects. customerId/vendorId are ALWAYS caller-derived
// (verified JWT / vendorMembership's member.vid) — never trusted from a body
// field.
import type { CreateServiceReviewBody, VendorReplyServiceReviewBody } from "@materialhub/dto";
import type { ServiceReviewService } from "./service-review.service.ts";

export class ServiceReviewController {
  constructor(private readonly svc: ServiceReviewService) {}

  create(customerId: string, bookingId: string, body: CreateServiceReviewBody) {
    return this.svc.create(customerId, bookingId, {
      rating: body.rating,
      title: body.title ?? null,
      body: body.body ?? null,
      mediaUrls: body.media_urls ?? [],
    });
  }

  // `actor` carries the vendorMembership-resolved role as well as the vendor
  // id — replying publicly on the vendor's behalf is owner/manager-only (see
  // ServiceReviewService.vendorReply).
  vendorReply(
    actor: { vendorId: string; role: string },
    reviewId: string,
    body: VendorReplyServiceReviewBody,
  ) {
    return this.svc.vendorReply(actor, reviewId, body.reply);
  }
}
