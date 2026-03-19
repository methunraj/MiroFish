import { cn } from "@/lib/utils";
import { PixelButton } from "@/components/ui/pixel-button";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16 text-center",
        className
      )}
    >
      <div className="size-16 border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
        <span className="text-2xl text-muted-foreground/60">?</span>
      </div>
      <h3 className="font-[family-name:var(--font-pixel)] text-xs uppercase tracking-wider">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {actionLabel && onAction && (
        <PixelButton onClick={onAction}>{`>> ${actionLabel}`}</PixelButton>
      )}
    </div>
  );
}
