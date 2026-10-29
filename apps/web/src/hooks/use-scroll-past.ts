"use client";

import { useState, useEffect, useRef } from "react";

export function useScrollPast<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsPast(!entry.isIntersecting),
      { threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isPast };
}
