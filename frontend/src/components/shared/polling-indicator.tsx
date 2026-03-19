import { cn } from "@/lib/utils";

interface PollingIndicatorProps {
  active: boolean;
  className?: string;
}

export function PollingIndicator({ active, className }: PollingIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-block size-2 border border-primary",
        active ? "bg-primary pixel-blink" : "bg-transparent",
        className
      )}
      title={active ? "Live polling" : "Idle"}
    />
  );
}
