"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { THEME_PACKS } from "@/lib/themes";
import { cn } from "@/lib/utils";

export default function AppearancePage() {
  const { theme, pack, setPack, setAppearance } = useTheme();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Settings
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--neon-violet))]">
          Settings · Look
        </p>
        <h1 className="page-title">Appearance</h1>
        <p className="page-subtitle max-w-2xl">
          Pick a theme pack. Light and dark still work on every pack. The whole app — core and
          modules — follows the same tokens.
        </p>
      </header>

      <Card className="section-panel neon-violet border-2">
        <CardHeader>
          <CardTitle>Light or dark</CardTitle>
          <CardDescription>Same toggle as the sidebar. Applies on top of the pack.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={theme === "light" ? "default" : "outline"}
            onClick={() => setAppearance("light")}
          >
            Light
          </Button>
          <Button
            type="button"
            variant={theme === "dark" ? "default" : "outline"}
            onClick={() => setAppearance("dark")}
          >
            Dark
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {THEME_PACKS.map((item) => {
          const selected = pack === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPack(item.id)}
              className={cn(
                "hub-tile group min-h-[160px] text-left",
                selected && "ring-2 ring-[hsl(var(--neon-cyan)/0.7)] ring-offset-2 ring-offset-background"
              )}
            >
              <div className="flex gap-1.5">
                {item.swatches.map((hsl) => (
                  <span
                    key={hsl}
                    className="h-7 w-7 rounded-full border border-border"
                    style={{ backgroundColor: `hsl(${hsl})` }}
                  />
                ))}
              </div>
              <div className="mt-auto space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">{item.name}</h2>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                {selected && (
                  <p className="text-xs font-medium text-[hsl(var(--neon-cyan))]">Active</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
