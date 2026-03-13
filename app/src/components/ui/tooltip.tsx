"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltip() {
  const context = React.useContext(TooltipContext);
  if (!context) {
    throw new Error("Tooltip components must be used within a TooltipProvider");
  }
  return context;
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  return (
    <TooltipContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-flex">{children}</div>
    </TooltipContext.Provider>
  );
}

export function TooltipTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { setOpen, triggerRef } = useTooltip();

  const handleProps = {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      ...handleProps,
      ref: triggerRef,
    });
  }

  return (
    <span {...handleProps} ref={triggerRef as React.Ref<HTMLSpanElement>}>
      {children}
    </span>
  );
}

export function TooltipContent({
  children,
  className,
  side = "top",
  sideOffset = 4,
}: {
  children: React.ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
}) {
  const { open } = useTooltip();

  if (!open) return null;

  const positionClasses = {
    top: `bottom-full left-1/2 -translate-x-1/2 mb-${sideOffset}`,
    bottom: `top-full left-1/2 -translate-x-1/2 mt-${sideOffset}`,
    left: `right-full top-1/2 -translate-y-1/2 mr-${sideOffset}`,
    right: `left-full top-1/2 -translate-y-1/2 ml-${sideOffset}`,
  };

  return (
    <div
      role="tooltip"
      className={cn(
        "absolute z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95",
        positionClasses[side],
        className
      )}
    >
      {children}
    </div>
  );
}
