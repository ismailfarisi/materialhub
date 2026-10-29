"use client";

import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16 px-6 text-center",
        className
      )}
    >
      {icon && (
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-stone-100 text-stone-400">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-stone-900">{title}</h3>
        <p className="text-sm text-stone-500 max-w-sm">{description}</p>
      </div>
      {action && (
        <Button onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      )}
    </div>
  );
}
