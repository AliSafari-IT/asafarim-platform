import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "success" | "destructive" | "accent";
}

const variantClasses: Record<NonNullable<ProgressProps["variant"]>, string> = {
  default: "bg-primary",
  success: "bg-emerald-500",
  destructive: "bg-red-500",
  accent: "bg-violet-500",
};

const sizeClasses: Record<NonNullable<ProgressProps["size"]>, string> = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

export function Progress({
  value,
  max = 100,
  showLabel = false,
  size = "md",
  variant = "default",
  className,
  ...props
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("flex items-center gap-3", className)} {...props}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          sizeClasses[size],
        )}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", variantClasses[variant])}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="min-w-[3rem] text-right text-sm font-medium tabular-nums text-muted-foreground">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}
