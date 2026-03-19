"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface PixelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function PixelDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: PixelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "border-2 border-border bg-card shadow-[4px_4px_0px_var(--border)] rounded-none p-0 gap-0",
          className
        )}
      >
        <DialogHeader className="border-b-2 border-border px-4 py-3">
          <DialogTitle className="font-[family-name:var(--font-pixel)] text-xs uppercase tracking-wider">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="p-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
