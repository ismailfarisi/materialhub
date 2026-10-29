"use client";

import Script from "next/script";
import { useEffect } from "react";
import { useConsent } from "@/lib/consent/consent-state";
import { useMetaAdvancedMatching } from "./meta-advanced-matching";
import { useTikTokAdvancedMatching } from "./tiktok-advanced-matching";
import {
  buildGoogleChannel,
  buildMetaChannel,
  buildTikTokChannel,
  getRegisteredChannels,
  registerChannel,
} from "./registry";

interface Props {
  googleGtagId: string | undefined;
  googleConversionId: string | undefined;
  metaPixelId: string | undefined;
  tiktokPixelCode: string | undefined;
}

export function TagLoader({
  googleGtagId,
  googleConversionId,
  metaPixelId,
  tiktokPixelCode,
}: Props) {
  const { decision } = useConsent();
  const metaAdvancedMatching = useMetaAdvancedMatching();
  const tiktokAdvancedMatching = useTikTokAdvancedMatching();

  useEffect(() => {
    if (googleGtagId && googleConversionId) {
      registerChannel(
        buildGoogleChannel({
          gtagId: googleGtagId,
          conversionId: googleConversionId,
        }),
      );
    }
  }, [googleGtagId, googleConversionId]);

  useEffect(() => {
    if (metaPixelId) {
      // Note: registerChannel is idempotent on `id`. When auth state changes,
      // the descriptor will re-register but the existing descriptor wins,
      // which means Advanced Matching for an already-loaded Pixel is set
      // at first render only. That matches Meta's documented model — `fbq('init')`
      // with AM is meant to run before tracking events fire, not be updated
      // mid-session. If the user signs in mid-session, the next full page
      // reload will pick up AM on the freshly-initialised Pixel.
      registerChannel(
        buildMetaChannel({ pixelId: metaPixelId, advancedMatching: metaAdvancedMatching }),
      );
    }
  }, [metaPixelId, metaAdvancedMatching]);

  useEffect(() => {
    if (tiktokPixelCode) {
      // Mirrors the Meta block above: registerChannel is idempotent on `id`,
      // so once the TikTok descriptor is in the registry, a later AM-state
      // change won't overwrite it. ttq.identify() runs once at script init —
      // the same first-render-wins semantic Meta documents for fbq('init').
      // A mid-session sign-in picks up AM on the next full page reload.
      registerChannel(
        buildTikTokChannel({
          pixelCode: tiktokPixelCode,
          advancedMatching: tiktokAdvancedMatching,
        }),
      );
    }
  }, [tiktokPixelCode, tiktokAdvancedMatching]);

  if (decision !== "accepted") return null;

  const channels = getRegisteredChannels();
  return (
    <>
      {channels.map((c) =>
        c.scriptSrc ? (
          <Script
            key={`${c.id}-src`}
            src={c.scriptSrc}
            strategy="afterInteractive"
          />
        ) : null,
      )}
      {channels.map((c) =>
        c.scriptInit ? (
          <Script
            key={`${c.id}-init`}
            id={`${c.id}-init`}
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: c.scriptInit }}
          />
        ) : null,
      )}
    </>
  );
}
