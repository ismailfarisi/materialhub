"use client";

import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useAuthModalStore } from "@/stores/auth-modal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@materialhub/ui";
import { useLocale } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PhoneAuthForm } from "./phone-auth-form";

export function AuthModal() {
  const { isOpen, mode, returnTo, close } = useAuthModalStore();
  const router = useRouter();
  const locale = useLocale();
  const { fire } = useChannelEvents();

  useEffect(() => {
    if (isOpen) {
      fire("AuthModalOpen", { mode, returnTo: returnTo || undefined });
    }
  }, [isOpen, mode, returnTo, fire]);

  function handleAuthenticated() {
    close();
    if (returnTo) {
      router.push(returnTo);
    } else {
      router.push(`/${locale}`);
    }
  }

  const copy =
    mode === "login"
      ? {
          title: "Continue with your phone",
          description: "Enter your mobile number and verify the SMS code to access MaterialHub.",
        }
      : {
          title: "Create your MaterialHub account",
          description: "Verify your phone, add your name, and start shopping.",
        };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-24px)] max-w-[880px] gap-0 overflow-y-auto overscroll-contain rounded-none p-0 sm:rounded-none">
        <div className="grid md:grid-cols-[0.95fr_1fr]">
          <div className="relative hidden min-h-[560px] md:block">
            <Image src="/login.webp" alt="" fill priority sizes="420px" className="object-cover" />
          </div>
          <div className="px-6 py-8 sm:px-10 md:px-12 md:py-12">
            <DialogHeader className="space-y-3 text-left sm:text-left">
              <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-nl-amber">
                MaterialHub account
              </div>
              <DialogTitle className="font-serif text-[30px] font-normal leading-[1.05] tracking-normal text-nl-cacao md:text-[36px]">
                {copy.title}
              </DialogTitle>
              <DialogDescription className="max-w-[360px] text-[14.5px] leading-6 text-nl-russet">
                {copy.description}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6">
              <PhoneAuthForm key={mode} onAuthenticated={handleAuthenticated} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
