import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        variant === "default" && "border-transparent bg-primary text-primary-foreground",
        variant === "secondary" && "border-transparent bg-secondary text-secondary-foreground",
        variant === "outline" && "text-foreground",
        variant === "success" && "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        variant === "warning" && "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
        variant === "danger" && "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
        className
      )}
      {...props}
    />
  );
}
