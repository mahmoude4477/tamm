"use client";
import { cn } from "@/lib/utils";
import { useMessages, useDates } from "@/components/locale-provider";
import { Dialog as Primitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import * as React from "react";
export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Popup>) {
  const en = useMessages();

  return (
    <Primitive.Portal>
      <Primitive.Backdrop className="dialog-overlay" />
      <Primitive.Popup className={cn("dialog-content", className)} {...props}>
        {children}
        <Primitive.Close className="dialog-close" aria-label={en.common.close}>
          <X size={18} />
        </Primitive.Close>
      </Primitive.Popup>
    </Primitive.Portal>
  );
}
