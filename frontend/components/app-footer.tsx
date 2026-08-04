import { APP_VERSION } from "@/lib/version";

/** Persistent app-wide footer — brand left, version right (for tester tracking). */
export function AppFooter() {
  return (
    <footer className="shrink-0 border-t border-border/60 bg-card/80 px-3 py-1.5 backdrop-blur-sm sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[10px] leading-none tracking-wide text-muted-foreground sm:text-[11px]">
          powered by{" "}
          <span className="font-medium text-foreground/80">IdevConsulting (Pty) Ltd</span>
        </p>
        <p
          className="shrink-0 font-mono text-[10px] leading-none tracking-wide text-muted-foreground sm:text-[11px]"
          title="Installed app version — helps match feedback to builds"
        >
          v{APP_VERSION}
        </p>
      </div>
    </footer>
  );
}
