"use client";
import { cn } from "@/lib/utils";
import en from "@/messages/en.json";
import * as Primitive from "@radix-ui/react-dialog";
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
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="dialog-overlay" />
      <Primitive.Content className={cn("dialog-content", className)} {...props}>
        {children}
        <Primitive.Close className="dialog-close" aria-label={en.common.close}>
          <X size={18} />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
