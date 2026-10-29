"use client";

/**
 * Availability picker — the conversion surface of the service PDP.
 *
 * Design pass (frontend-design skill, applied to the existing MaterialHub
 * "Maison" brand system rather than inventing a new one):
 * - Date strip: horizontal-scroll day tabs (weekday in tracked uppercase
 *   sans, day number in serif) with a hairline underline that becomes solid
 *   amber when selected — no filled pill background, consistent with the
 *   brand's hairline-border / no-shadow language.
 * - Slot grid: slots are grouped into Morning / Afternoon / Evening — a
 *   grouping that's true to the content (time of day genuinely matters when
 *   picking an appointment), not a decorative numbering scheme. Each slot is
 *   an outline pill; the selected slot fills amber and is "stamped" with the
 *   brand's crescent mark (MaisonMark) — ties the brand identity to the
 *   exact conversion moment instead of a generic checkmark.
 * - Staff filter: a horizontal chip row ("Any professional" + initials
 *   avatars) sitting above the grid, changing the filter re-fetches
 *   availability with staff= (the backend merges slots across staff when no
 *   staff is chosen, so client-side filtering would be wrong).
 * - Area select (home-visit offerings): the backend derives `mode` purely
 *   from the presence of the `area` query param (see
 *   availability.service.ts) — a home-visit-only offering queried without
 *   `area` returns EMPTY slots by construction. So home-visit offerings
 *   require the customer's area up front, before any fetch. The full
 *   address is still deferred to checkout (Task 2) — this is only the
 *   coarse area_id the availability query needs.
 * - Timezone caption sits directly under the section heading so the
 *   time-of-day labels are never ambiguous.
 * - Loading uses the same skeleton-pulse convention as the product PDP;
 *   empty/error states are quiet, serif-italic, non-alarming.
 *
 * Timezone correctness: the date-strip window and every day-tab key are
 * computed ENTIRELY in the offering's own timezone (never the browser's) —
 * see `windowStartKey`/`dayEntries` below, built via `dateKeyInZone` /
 * `todayKeyInZone` / `addDaysToDateKey` (all Intl-based, no manual UTC
 * offset math). Slot buckets already used `dateKeyInZone`; the fix here is
 * making the strip's own key space agree with it.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDaysToDateKey,
  dateKeyInZone,
  dateKeyToUtcIso,
  formatDateInZone,
  formatTimeInZone,
  hourInZone,
  todayKeyInZone,
} from "@/lib/utils";
import { useAvailability, useOfferingStaff } from "@/lib/queries/booking";
import { useAreas, type DeliveryZone } from "@/lib/queries/areas";
import type {
  AvailabilitySlot,
  LocationMode,
  VendorLocation,
} from "@/lib/booking/types";
import {
  MAISON_SANS,
  MAISON_SERIF,
  MaisonMark,
} from "@/components/checkout/maison-primitives";

const WINDOW_DAYS = 14;

// Mirrors booking-service's own AvailabilityService.resolveTimezone()
// fallback — used only as a pre-fetch guess until the availability
// response confirms the actually-resolved zone.
const DEFAULT_TIMEZONE = "Asia/Dubai";

interface AvailabilityPickerProps {
  offeringId: string;
  offeringSlug: string;
  locationMode: LocationMode;
  locations: VendorLocation[];
  maxAdvanceDays: number;
  /**
   * Overrides the default `/book/{slug}` handoff — used by Task 3's
   * reschedule flow to send the same `start/end/tz/staff/location/
   * customer_area_id/mode` query-param contract to
   * `/account/bookings/:id/reschedule` instead of a fresh checkout. Defaults
   * to the PDP's own `/book/{slug}` continuation when omitted.
   */
  buildContinueHref?: (params: URLSearchParams) => string;
  /**
   * Pre-selects a home-visit area (e.g. resolved from a booking's stored
   * `customer_address.area_id`, when the address object carries one) so the
   * reschedule flow doesn't always have to ask again. Ignored for
   * at_premises-only offerings.
   */
  initialAreaId?: string;
}

export function AvailabilityPicker({
  offeringId,
  offeringSlug,
  locationMode,
  locations,
  maxAdvanceDays,
  buildContinueHref,
  initialAreaId,
}: AvailabilityPickerProps) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const router = useRouter();

  const activeLocations = useMemo(
    () => locations.filter((l) => l.is_active),
    [locations],
  );

  // Visit choice only matters for "either" offerings — otherwise it's
  // implied by the offering's own location_mode.
  const [visitChoice, setVisitChoice] = useState<
    "at_premises" | "home_visit"
  >(
    locationMode === "home_visit"
      ? "home_visit"
      : "at_premises",
  );
  const showsPremises =
    locationMode === "at_premises" ||
    (locationMode === "either" && visitChoice === "at_premises");
  const isHomeVisit =
    locationMode === "home_visit" ||
    (locationMode === "either" && visitChoice === "home_visit");

  const [selectedLocationId, setSelectedLocationId] = useState<
    string | undefined
  >(activeLocations.length === 1 ? activeLocations[0].id : undefined);

  const effectiveLocationId = showsPremises ? selectedLocationId : undefined;
  const locationPending = showsPremises && !effectiveLocationId;

  // Home-visit requires the customer's area before any availability fetch —
  // see the `mode` contract note in the file header. Full address stays
  // deferred to checkout.
  const [selectedAreaId, setSelectedAreaId] = useState<string | undefined>(
    initialAreaId,
  );
  const effectiveAreaId = isHomeVisit ? selectedAreaId : undefined;
  const areaPending = isHomeVisit && !effectiveAreaId;
  const areasQuery = useAreas(isHomeVisit);
  const areas = areasQuery.data ?? [];
  const selectedArea = areas.find((a) => a.id === selectedAreaId);

  const selectionPending = locationPending || areaPending;

  const [selectedStaffId, setSelectedStaffId] = useState<string | undefined>(
    undefined,
  );

  // Best pre-fetch guess at the offering's timezone, using the same
  // resolution order as the backend (chosen location's tz, else the
  // vendor's first active location, else the same hardcoded default) — so
  // the date strip renders in the RIGHT zone from the first paint instead
  // of waiting on a round trip. `availability.timezone` (ground truth) wins
  // once the response arrives; if it disagrees with this guess the window
  // recomputes and the query naturally refetches.
  const expectedTimezone = useMemo(() => {
    if (effectiveLocationId) {
      const loc = activeLocations.find((l) => l.id === effectiveLocationId);
      if (loc?.timezone) return loc.timezone;
    }
    return activeLocations[0]?.timezone || DEFAULT_TIMEZONE;
  }, [effectiveLocationId, activeLocations]);

  const [windowOffset, setWindowOffset] = useState(0);

  const availabilityQueryParams = useMemo(
    () =>
      selectionPending
        ? undefined
        : {
            from: addDaysToDateKey(
              todayKeyInZone(expectedTimezone),
              windowOffset * WINDOW_DAYS,
            ),
            to: addDaysToDateKey(
              todayKeyInZone(expectedTimezone),
              windowOffset * WINDOW_DAYS + WINDOW_DAYS,
            ),
            location: effectiveLocationId,
            area: effectiveAreaId,
            staff: selectedStaffId,
          },
    // Recomputed (and re-queried) whenever the resolved timezone guess
    // changes, so the from/to window is always keyed off the right zone.
    [
      selectionPending,
      expectedTimezone,
      windowOffset,
      effectiveLocationId,
      effectiveAreaId,
      selectedStaffId,
    ],
  );

  const availabilityQuery = useAvailability(
    offeringSlug,
    availabilityQueryParams,
  );

  const availability = availabilityQuery.data;

  // Ground-truth timezone once known; falls back to the pre-fetch guess.
  const timezone = availability?.timezone ?? expectedTimezone;

  // The window (and every day-tab key) is derived ENTIRELY from `timezone`
  // via the offering-tz-aware helpers — never browser-local Date parts —
  // so it always agrees with `dateKeyInZone`'s bucketing below.
  const windowStartKey = useMemo(
    () => addDaysToDateKey(todayKeyInZone(timezone), windowOffset * WINDOW_DAYS),
    [timezone, windowOffset],
  );

  const dayEntries = useMemo(() => {
    const days: { key: string }[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      days.push({ key: addDaysToDateKey(windowStartKey, i) });
    }
    return days;
  }, [windowStartKey]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, AvailabilitySlot[]>();
    if (!availability) return map;
    for (const slot of availability.slots) {
      const key = dateKeyInZone(slot.start, availability.timezone);
      const bucket = map.get(key);
      if (bucket) bucket.push(slot);
      else map.set(key, [slot]);
    }
    return map;
  }, [availability]);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(
    null,
  );

  // Once availability loads, default to the first day with openings (falls
  // back to the first day of the window if nothing is open yet).
  useEffect(() => {
    if (!availability) return;
    setSelectedDateKey((current) => {
      if (current && dayEntries.some((d) => d.key === current)) return current;
      const firstOpen = dayEntries.find(
        (d) => (slotsByDate.get(d.key)?.length ?? 0) > 0,
      );
      return (firstOpen ?? dayEntries[0])?.key ?? null;
    });
    // Defensive backstop: drop the selection on a background refetch that
    // resolves with the SAME query key but different data — but ONLY when the
    // selected slot is genuinely gone (e.g. someone else took it). An
    // unconditional reset here silently wiped the customer's choice on every
    // `refetchOnWindowFocus` past `staleTime` (tab-away/return on desktop,
    // every app-switch on mobile), greying out Continue with no explanation.
    // The synchronous resets below (staff/location/area/mode/window changes)
    // are what actually close the race window described in the review.
    setSelectedSlot((current) => {
      if (!current) return null;
      const stillOffered = availability.slots.some(
        (s) => s.start === current.start && s.end === current.end,
      );
      return stillOffered ? current : null;
    });
  }, [availability, dayEntries, slotsByDate]);

  const daySlots = selectedDateKey
    ? (slotsByDate.get(selectedDateKey) ?? [])
    : [];

  const grouped = useMemo(() => {
    if (!availability) return { morning: [], afternoon: [], evening: [] };
    const buckets: Record<
      "morning" | "afternoon" | "evening",
      AvailabilitySlot[]
    > = { morning: [], afternoon: [], evening: [] };
    for (const slot of daySlots) {
      const hour = hourInZone(slot.start, availability.timezone);
      if (hour < 12) buckets.morning.push(slot);
      else if (hour < 17) buckets.afternoon.push(slot);
      else buckets.evening.push(slot);
    }
    return buckets;
  }, [daySlots, availability]);

  const todayKey = todayKeyInZone(timezone);

  // The backend returns `slots: []` silently for both "no openings this
  // window" and "this vendor doesn't serve this area at all" — those need
  // different empty states. An unserved home-visit area yields an entirely
  // empty response (not just an empty selected day), so treat a
  // zero-slot, area-scoped, resolved response as "unserved", not "no
  // openings for this day".
  const unservedArea =
    isHomeVisit &&
    !!effectiveAreaId &&
    !availabilityQuery.isPending &&
    !availabilityQuery.isError &&
    !!availability &&
    availability.slots.length === 0 &&
    windowOffset === 0;

  // Cap "later" navigation at the offering's own max_advance_days — the
  // server clamps slots beyond it anyway, so don't let the UI page into a
  // window that's entirely beyond the bookable horizon.
  const laterDisabled =
    (windowOffset + 1) * WINDOW_DAYS >= maxAdvanceDays;

  function handleContinue() {
    if (!selectedSlot || !availability) return;
    const params = new URLSearchParams();
    params.set("start", selectedSlot.start);
    params.set("end", selectedSlot.end);
    params.set("tz", availability.timezone);
    if (selectedStaffId) params.set("staff", selectedStaffId);
    if (showsPremises && effectiveLocationId) {
      params.set("location", effectiveLocationId);
    }
    if (isHomeVisit && effectiveAreaId) {
      params.set("customer_area_id", effectiveAreaId);
    }
    if (locationMode === "either") params.set("mode", visitChoice);
    const href = buildContinueHref
      ? buildContinueHref(params)
      : `/${locale}/book/${offeringSlug}?${params.toString()}`;
    router.push(href);
  }

  return (
    <section aria-label={t("selectDate")}>
      {/* Visit mode toggle (either-mode offerings only) */}
      {locationMode === "either" && (
        <div className="flex gap-2 mb-4" role="group" aria-label={t("locationLabel")}>
          {(["at_premises", "home_visit"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setVisitChoice(mode);
                setSelectedStaffId(undefined);
                setSelectedSlot(null);
              }}
              className="flex-1 py-2.5 text-center uppercase transition-colors"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 10.5,
                letterSpacing: "0.16em",
                border: `1px solid ${
                  visitChoice === mode
                    ? "hsl(var(--nl-amber))"
                    : "rgba(44,24,16,0.16)"
                }`,
                background:
                  visitChoice === mode
                    ? "rgba(184,115,51,0.08)"
                    : "transparent",
                color:
                  visitChoice === mode
                    ? "hsl(var(--nl-espresso))"
                    : "hsl(var(--nl-russet))",
              }}
            >
              {mode === "at_premises"
                ? t("visitModeAtPremises")
                : t("visitModeHomeVisit")}
            </button>
          ))}
        </div>
      )}

      {isHomeVisit && (
        <p
          className="mb-4"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 12,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {t("homeVisitNote")}
        </p>
      )}

      {/* Area selector (home-visit offerings — required before any fetch) */}
      {isHomeVisit && (
        <div className="mb-4">
          <label
            htmlFor="booking-area-select"
            className="block mb-1.5 uppercase"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "hsl(var(--nl-russet))",
            }}
          >
            {t("selectArea")}
          </label>
          <AreaSelect
            areas={areas}
            isPending={areasQuery.isPending}
            isError={areasQuery.isError}
            onRetry={() => areasQuery.refetch()}
            value={selectedAreaId}
            onChange={(id) => {
              setSelectedAreaId(id);
              setSelectedSlot(null);
            }}
          />
        </div>
      )}

      {/* Location selector (at_premises / either-at-premises with multiple branches) */}
      {showsPremises && activeLocations.length > 1 && (
        <div className="mb-4">
          <label
            className="block mb-1.5 uppercase"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "hsl(var(--nl-russet))",
            }}
          >
            {t("selectLocation")}
          </label>
          <div className="flex flex-wrap gap-2">
            {activeLocations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  setSelectedLocationId(loc.id);
                  setSelectedStaffId(undefined);
                  setSelectedSlot(null);
                }}
                className="px-3 py-2 transition-colors"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 12,
                  border: `1px solid ${
                    selectedLocationId === loc.id
                      ? "hsl(var(--nl-amber))"
                      : "rgba(44,24,16,0.16)"
                  }`,
                  background:
                    selectedLocationId === loc.id
                      ? "rgba(184,115,51,0.08)"
                      : "transparent",
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {showsPremises && activeLocations.length === 0 && (
        <ErrorNote message={t("noLocations")} />
      )}

      {/* Staff filter */}
      {!selectionPending && (
        <StaffFilter
          offeringId={offeringId}
          locationId={effectiveLocationId}
          selectedStaffId={selectedStaffId}
          onSelect={(id) => {
            setSelectedStaffId(id);
            setSelectedSlot(null);
          }}
        />
      )}

      {/* Timezone caption */}
      {!selectionPending && (
        <p
          className="mb-2"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 10.5,
            letterSpacing: "0.06em",
            color: "hsl(var(--nl-russet))",
          }}
        >
          {t("timezoneNote", { tz: timezone })}
        </p>
      )}

      {/* Unserved-area empty state (distinct from "no openings for this day") */}
      {!selectionPending && unservedArea && (
        <div
          className="py-8 text-center"
          style={{
            border: "1px solid rgba(44,24,16,0.08)",
            background: "rgba(44,24,16,0.015)",
          }}
        >
          <p
            style={{
              fontFamily: MAISON_SERIF,
              fontStyle: "italic",
              fontSize: 14,
              color: "hsl(var(--nl-cacao))",
            }}
          >
            {t("unservedArea", { area: selectedArea?.name ?? "" })}
          </p>
          <p
            className="mt-1"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 11,
              color: "hsl(var(--nl-russet))",
            }}
          >
            {t("unservedAreaHint")}
          </p>
        </div>
      )}

      {/* Date strip */}
      {!selectionPending && !unservedArea && (
        <div className="mb-5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setWindowOffset((o) => Math.max(0, o - 1));
                setSelectedSlot(null);
              }}
              disabled={windowOffset === 0}
              aria-label={t("earlier")}
              className="shrink-0 h-9 w-7 flex items-center justify-center disabled:opacity-25"
              style={{ color: "hsl(var(--nl-russet))" }}
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" strokeWidth={1.5} />
            </button>
            <div
              className="flex-1 flex gap-1.5 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "thin" }}
            >
              {dayEntries.map(({ key }) => {
                const count = slotsByDate.get(key)?.length ?? 0;
                const isSelected = key === selectedDateKey;
                const isToday = key === todayKey;
                const dayNumber = Number(key.slice(-2));
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDateKey(key)}
                    className="shrink-0 flex flex-col items-center justify-center transition-colors"
                    style={{
                      width: 52,
                      height: 64,
                      fontFamily: MAISON_SANS,
                      borderBottom: `2px solid ${
                        isSelected
                          ? "hsl(var(--nl-amber))"
                          : "rgba(44,24,16,0.12)"
                      }`,
                      opacity: availability && count === 0 ? 0.45 : 1,
                    }}
                  >
                    {isToday && (
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "hsl(var(--nl-amber))",
                          marginBottom: 2,
                        }}
                      />
                    )}
                    <span
                      className="uppercase"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        color: "hsl(var(--nl-russet))",
                      }}
                    >
                      {formatDateInZone(
                        dateKeyToUtcIso(key),
                        "UTC",
                        locale,
                        { weekday: "short" },
                      )}
                    </span>
                    <span
                      style={{
                        fontFamily: MAISON_SERIF,
                        fontSize: 18,
                        color: isSelected
                          ? "hsl(var(--nl-amber))"
                          : "hsl(var(--nl-cacao))",
                      }}
                    >
                      {dayNumber}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                if (laterDisabled) return;
                setWindowOffset((o) => o + 1);
                setSelectedSlot(null);
              }}
              disabled={laterDisabled}
              aria-label={t("later")}
              className="shrink-0 h-9 w-7 flex items-center justify-center disabled:opacity-25"
              style={{ color: "hsl(var(--nl-russet))" }}
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}

      {/* Slot grid */}
      {selectionPending || unservedArea ? null : (
      <div aria-label={t("selectTime")} role="group">
      {availabilityQuery.isPending ? (
        <SlotGridSkeleton />
      ) : availabilityQuery.isError ? (
        <ErrorNote
          message={t("loadError")}
          onRetry={() => availabilityQuery.refetch()}
        />
      ) : daySlots.length === 0 ? (
        <EmptyDay />
      ) : (
        <div className="space-y-4">
          <SlotGroup
            label={t("morning")}
            slots={grouped.morning}
            selected={selectedSlot}
            onSelect={setSelectedSlot}
            timezone={availability!.timezone}
            locale={locale}
          />
          <SlotGroup
            label={t("afternoon")}
            slots={grouped.afternoon}
            selected={selectedSlot}
            onSelect={setSelectedSlot}
            timezone={availability!.timezone}
            locale={locale}
          />
          <SlotGroup
            label={t("evening")}
            slots={grouped.evening}
            selected={selectedSlot}
            onSelect={setSelectedSlot}
            timezone={availability!.timezone}
            locale={locale}
          />
        </div>
      )}
      </div>
      )}

      {/* Continue */}
      <div className="mt-6">
        <button
          type="button"
          disabled={!selectedSlot}
          onClick={handleContinue}
          className="w-full py-3.5 uppercase transition-opacity disabled:opacity-40"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.2em",
            color: "hsl(var(--nl-espresso))",
            background: "hsl(var(--nl-amber))",
            border: "1px solid hsl(var(--nl-amber))",
          }}
        >
          {t("continue")}
        </button>
        {!selectedSlot && (
          <p
            className="mt-2 text-center"
            style={{
              fontFamily: MAISON_SERIF,
              fontStyle: "italic",
              fontSize: 12,
              color: "hsl(var(--nl-russet))",
            }}
          >
            {t("selectPrompt")}
          </p>
        )}
      </div>
    </section>
  );
}

function AreaSelect({
  areas,
  isPending,
  isError,
  onRetry,
  value,
  onChange,
}: {
  areas: DeliveryZone[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  const t = useTranslations("booking");

  if (isPending) {
    return (
      <div
        className="h-11 animate-pulse"
        style={{ background: "rgba(44,24,16,0.06)" }}
      />
    );
  }

  if (isError) {
    return <ErrorNote message={t("areaLoadError")} onRetry={onRetry} />;
  }

  const byEmirate = new Map<string, DeliveryZone[]>();
  for (const area of areas) {
    const bucket = byEmirate.get(area.emirate);
    if (bucket) bucket.push(area);
    else byEmirate.set(area.emirate, [area]);
  }

  return (
    <select
      id="booking-area-select"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="w-full bg-transparent outline-none"
      style={{
        fontFamily: MAISON_SANS,
        fontSize: 13,
        border: "1px solid rgba(44,24,16,0.16)",
        padding: "10px 12px",
        color: "hsl(var(--nl-cacao))",
      }}
    >
      <option value="" disabled>
        {t("selectAreaPlaceholder")}
      </option>
      {Array.from(byEmirate.entries()).map(([emirate, zones]) => (
        <optgroup key={emirate} label={emirate}>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function SlotGroup({
  label,
  slots,
  selected,
  onSelect,
  timezone,
  locale,
}: {
  label: string;
  slots: AvailabilitySlot[];
  selected: AvailabilitySlot | null;
  onSelect: (slot: AvailabilitySlot) => void;
  timezone: string;
  locale: string;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <div
        className="mb-2"
        style={{
          fontFamily: MAISON_SERIF,
          fontStyle: "italic",
          fontSize: 12,
          color: "hsl(var(--nl-amber))",
        }}
      >
        {label}
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))" }}
      >
        {slots.map((slot) => {
          const isSelected =
            selected?.start === slot.start && selected?.end === slot.end;
          return (
            <button
              key={slot.start}
              type="button"
              onClick={() => onSelect(slot)}
              className="py-2.5 flex items-center justify-center gap-1 transition-colors"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 12.5,
                border: `1px solid ${
                  isSelected ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.16)"
                }`,
                background: isSelected
                  ? "hsl(var(--nl-amber))"
                  : "rgba(255,255,255,0.55)",
                color: isSelected
                  ? "hsl(var(--nl-espresso))"
                  : "hsl(var(--nl-cacao))",
              }}
            >
              {isSelected && <MaisonMark size={9} />}
              {formatTimeInZone(slot.start, timezone, locale)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StaffFilter({
  offeringId,
  locationId,
  selectedStaffId,
  onSelect,
}: {
  offeringId: string;
  locationId: string | undefined;
  selectedStaffId: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  const t = useTranslations("booking");
  const staffQuery = useOfferingStaff(offeringId, locationId);
  const staff = staffQuery.data ?? [];

  if (staffQuery.isPending) {
    return (
      <div className="flex gap-2 mb-4 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-full bg-muted" />
        ))}
      </div>
    );
  }

  if (staff.length === 0) return null;

  return (
    <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => onSelect(undefined)}
        className="shrink-0 px-3.5 py-2 rounded-full transition-colors"
        style={{
          fontFamily: MAISON_SANS,
          fontSize: 11.5,
          letterSpacing: "0.02em",
          border: `1px solid ${
            !selectedStaffId ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.16)"
          }`,
          background: !selectedStaffId ? "rgba(184,115,51,0.08)" : "transparent",
          color: "hsl(var(--nl-cacao))",
        }}
      >
        {t("anyProfessional")}
      </button>
      {staff.map((member) => {
        const isSelected = selectedStaffId === member.id;
        return (
          <button
            key={member.id}
            type="button"
            onClick={() => onSelect(member.id)}
            className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 11.5,
              border: `1px solid ${
                isSelected ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.16)"
              }`,
              background: isSelected ? "rgba(184,115,51,0.08)" : "transparent",
              color: "hsl(var(--nl-cacao))",
            }}
          >
            <span
              className="inline-flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 22,
                height: 22,
                background: "rgba(184,115,51,0.15)",
                fontFamily: MAISON_SERIF,
                fontSize: 11,
                color: "hsl(var(--nl-amber))",
                overflow: "hidden",
              }}
            >
              {member.avatar_url ? (
                // Small avatar thumbnail — plain img is fine at this size.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                member.name.charAt(0).toUpperCase()
              )}
            </span>
            {member.name}
          </button>
        );
      })}
    </div>
  );
}

function SlotGridSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g}>
          <div className="h-3 w-16 rounded bg-muted mb-2" />
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyDay() {
  const t = useTranslations("booking");
  return (
    <div
      className="py-8 text-center"
      style={{
        border: "1px solid rgba(44,24,16,0.08)",
        background: "rgba(44,24,16,0.015)",
      }}
    >
      <p
        style={{
          fontFamily: MAISON_SERIF,
          fontStyle: "italic",
          fontSize: 14,
          color: "hsl(var(--nl-cacao))",
        }}
      >
        {t("noSlotsForDay")}
      </p>
      <p
        className="mt-1"
        style={{
          fontFamily: MAISON_SANS,
          fontSize: 11,
          color: "hsl(var(--nl-russet))",
        }}
      >
        {t("tryAnotherDay")}
      </p>
    </div>
  );
}

function ErrorNote({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const tCommon = useTranslations("common");
  return (
    <div
      className="py-5 px-4 text-center"
      style={{ border: "1px solid rgba(184,60,40,0.3)" }}
    >
      <p
        style={{
          fontFamily: MAISON_SANS,
          fontSize: 12.5,
          color: "hsl(var(--nl-russet))",
        }}
      >
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 uppercase"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 10.5,
            letterSpacing: "0.16em",
            color: "hsl(var(--nl-amber))",
          }}
        >
          {tCommon("retry")}
        </button>
      )}
    </div>
  );
}
