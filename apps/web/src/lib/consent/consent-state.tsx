"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type ConsentDecision,
  readConsentCookie,
  writeConsentCookie,
} from "./consent-cookie";

interface ConsentContextValue {
  decision: ConsentDecision;
  setDecision: (d: Exclude<ConsentDecision, null>) => void;
}

const Ctx = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [decision, setDecisionState] = useState<ConsentDecision>(null);

  useEffect(() => {
    setDecisionState(readConsentCookie());
  }, []);

  const setDecision = useCallback(
    (d: Exclude<ConsentDecision, null>) => {
      writeConsentCookie(d);
      setDecisionState(d);
    },
    [],
  );

  const value = useMemo<ConsentContextValue>(
    () => ({ decision, setDecision }),
    [decision, setDecision],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsent(): ConsentContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConsent: ConsentProvider missing");
  return v;
}

export function hasConsent(decision: ConsentDecision): boolean {
  return decision === "accepted";
}
