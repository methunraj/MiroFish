import { cn } from "@/lib/utils";
import { PixelBadge } from "@/components/ui/pixel-badge";

const STATUS_CONFIG: Record<
  string,
  { variant: "green" | "coral" | "gold" | "blue" | "muted"; blink: boolean }
> = {
  running: { variant: "green", blink: true },
  completed: { variant: "green", blink: false },
  failed: { variant: "coral", blink: false },
  pending: { variant: "muted", blink: true },
  stopped: { variant: "gold", blink: false },
  generating: { variant: "blue", blink: true },
  evaluating: { variant: "blue", blink: true },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status.toLowerCase()] ?? {
    variant: "muted" as const,
    blink: false,
  };

  return (
    <PixelBadge
      variant={config.variant}
      className={cn(config.blink && "pixel-blink", className)}
    >
      {status.toUpperCase()}
    </PixelBadge>
  );
}
