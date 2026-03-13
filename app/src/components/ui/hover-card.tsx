"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface HoverCardContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const HoverCardContext = React.createContext<HoverCardContextValue | null>(null);

function useHoverCard() {
  const context = React.useContext(HoverCardContext);
  if (!context) throw new Error("HoverCard components must be used within a HoverCard");
  return context;
}

export function HoverCard({ children, openDelay = 200, closeDelay = 200 }: {
  children: React.ReactNode;
  openDelay?: number;
  closeDelay?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const openTimer = React.useRef<ReturnType<typeof setTimeout>>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout>>(null);

  const handleOpen = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => setOpen(true), openDelay);
  }, [openDelay]);

  const handleClose = React.useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), closeDelay);
  }, [closeDelay]);

  React.useEffect(() => {
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <HoverCardContext.Provider value={{ open, setOpen }}>
      <div
        className="relative inline-flex"
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
      >
        {children}
      </div>
    </HoverCardContext.Provider>
  );
}

export function HoverCardTrigger({ children, asChild }: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  if (asChild && React.isValidElement(children)) {
    return <>{children}</>;
  }
  return <span>{children}</span>;
}

export function HoverCardContent({
  children,
  className,
  side = "bottom",
  align = "start",
  sideOffset = 8,
}: {
  children: React.ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  const { open } = useHoverCard();
  if (!open) return null;

  const sideClasses = {
    top: `bottom-full mb-${sideOffset >= 8 ? 2 : 1}`,
    bottom: `top-full mt-${sideOffset >= 8 ? 2 : 1}`,
    left: `right-full mr-${sideOffset >= 8 ? 2 : 1}`,
    right: `left-full ml-${sideOffset >= 8 ? 2 : 1}`,
  };

  const alignClasses = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  };

  return (
    <div
      className={cn(
        "absolute z-50 w-72 rounded-lg border bg-popover p-4 shadow-lg animate-in fade-in-0 zoom-in-95",
        sideClasses[side],
        alignClasses[align],
        className
      )}
    >
      {children}
    </div>
  );
}
