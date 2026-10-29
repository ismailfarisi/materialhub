"use client";

import { useEffect, useRef, useState } from "react";

const DESKTOP_QUERY = "(min-width: 768px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface BackgroundVideoProps {
  src: string;
  poster: string;
  objectPosition?: string;
  /**
   * When false the element is parked: paused, unloaded, showing its poster.
   * The hero carousel uses this so exactly one slide's video is ever in flight.
   */
  active?: boolean;
}

/**
 * Decorative, muted, looping background video layered over a banner image.
 *
 * The image underneath is always rendered, which is what makes every failure
 * mode benign: a 404 or unsupported codec falls back to `poster` — and the
 * poster *is* that image.
 *
 * Loading is gated in JavaScript rather than in CSS, and this is deliberate.
 * `display:none` suppresses rendering, not loading, and per the HTML spec
 * `autoplay` overrides `preload="none"` — so the earlier markup-only version
 * downloaded the whole clip for mobile and reduced-motion visitors who would
 * never see a frame of it. That is precisely the bandwidth this feature is
 * supposed to protect. So the element ships with neither `autoplay` nor `src`,
 * and both are supplied by the effect below only once `matchMedia` confirms a
 * desktop viewport and no reduced-motion preference.
 *
 * The cost, accepted knowingly: with JavaScript disabled nothing plays. Those
 * visitors get the still image, which is the designed fallback anyway.
 *
 * The Tailwind visibility classes are kept as belt and braces — the JS gate
 * governs bytes, the CSS governs layout.
 */
export function BackgroundVideo({
  src,
  poster,
  objectPosition = "center",
  active = true,
}: BackgroundVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Starts false so the server render and the first client render agree; the
  // effect is what turns ambient playback on.
  const [ambientAllowed, setAmbientAllowed] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setAmbientAllowed(desktop.matches && !reducedMotion.matches);
    sync();
    desktop.addEventListener?.("change", sync);
    reducedMotion.addEventListener?.("change", sync);
    return () => {
      desktop.removeEventListener?.("change", sync);
      reducedMotion.removeEventListener?.("change", sync);
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!ambientAllowed || !active) {
      el.pause();
      if (el.hasAttribute("src")) {
        // Dropping the attribute and re-running the load algorithm releases the
        // buffered data and repaints the poster, so a parked slide holds no
        // video in memory or in flight.
        el.removeAttribute("src");
        el.load();
      }
      return;
    }

    if (el.getAttribute("src") !== src) {
      el.setAttribute("src", src);
      el.load();
    }
    // play() overrides preload="none" and is what actually starts the fetch.
    // The optional call is for jsdom, where play() returns undefined.
    void el.play()?.catch(() => {});
  }, [ambientAllowed, active, src]);

  return (
    // biome-ignore lint/a11y/useMediaCaption: decorative; audio is stripped at transcode
    <video
      ref={videoRef}
      data-testid="background-video"
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      tabIndex={-1}
      className="absolute inset-0 h-full w-full object-cover hidden md:block md:motion-reduce:hidden"
      style={{ objectPosition }}
    />
  );
}
