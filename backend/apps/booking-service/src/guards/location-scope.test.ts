import { describe, expect, it } from "bun:test";
import type { LocationMembership, VendorLocation } from "@materialhub/database";
import { ForbiddenError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { type LocationActor, assertLocationManager } from "./location-scope.ts";

const VENDOR = "vendor-1";
const OTHER_VENDOR = "vendor-2";
const LOCATION = "loc-1";
const USER = "user-1";

function repos(opts: {
  location?: Partial<VendorLocation> | null;
  membership?: Partial<LocationMembership> | null;
}) {
  return {
    locationRepo: {
      findOne: () => Promise.resolve(opts.location ?? null),
    } as unknown as Repository<VendorLocation>,
    membershipRepo: {
      findOne: () => Promise.resolve(opts.membership ?? null),
    } as unknown as Repository<LocationMembership>,
  };
}

const owner: LocationActor = { userId: USER, vendorId: VENDOR, role: "owner" };
const viewer: LocationActor = { userId: USER, vendorId: VENDOR, role: "viewer" };

describe("assertLocationManager", () => {
  it("owner/manager passes for any branch of their own vendor", async () => {
    const r = repos({ location: { id: LOCATION, vendor_id: VENDOR } });
    await expect(assertLocationManager(owner, LOCATION, r)).resolves.toEqual({ vendorId: VENDOR });
  });

  it("throws NotFoundError when the location does not exist", async () => {
    const r = repos({ location: null });
    await expect(assertLocationManager(owner, LOCATION, r)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ForbiddenError when the branch belongs to another vendor", async () => {
    const r = repos({ location: { id: LOCATION, vendor_id: OTHER_VENDOR } });
    await expect(assertLocationManager(owner, LOCATION, r)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a non-manager vendor role with NO location membership is forbidden", async () => {
    const r = repos({ location: { id: LOCATION, vendor_id: VENDOR }, membership: null });
    await expect(assertLocationManager(viewer, LOCATION, r)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a location admin passes for their own branch", async () => {
    const r = repos({
      location: { id: LOCATION, vendor_id: VENDOR },
      membership: { vendor_location_id: LOCATION, user_id: USER, role: "manager" },
    });
    await expect(assertLocationManager(viewer, LOCATION, r)).resolves.toEqual({ vendorId: VENDOR });
  });

  it("a non-managing location role (e.g. front_desk) is forbidden", async () => {
    const r = repos({
      location: { id: LOCATION, vendor_id: VENDOR },
      membership: { vendor_location_id: LOCATION, user_id: USER, role: "front_desk" },
    });
    await expect(assertLocationManager(viewer, LOCATION, r)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
