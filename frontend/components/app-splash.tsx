"use client";

import { useEffect, useState } from "react";
import { pickSplashQuote } from "@/lib/splash-quotes";
import { cn } from "@/lib/utils";

type Props = {
  /** When true, begin fade-out (parent removes after transition). */
  exiting?: boolean;
  className?: string;
};

/**
 * Full-screen black splash: logo fades in, Welcome, cycling calm quotes.
 * Used in browser / as a soft bridge after the desktop native splash.
 */
export function AppSplash({ exiting = false, className }: Props) {
  const [entered, setEntered] = useState(false);
  const [quote, setQuote] = useState("");
  const [quoteVisible, setQuoteVisible] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 40);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    function cycle() {
      if (cancelled) return;
      setQuoteVisible(false);
      window.setTimeout(() => {
        if (cancelled) return;
        setQuote((prev) => pickSplashQuote(prev));
        setQuoteVisible(true);
      }, 400);
    }

    cycle();
    const id = window.setInterval(cycle, 6500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-white transition-opacity duration-500",
        exiting ? "opacity-0 pointer-events-none" : "opacity-100",
        className
      )}
      aria-busy={!exiting}
      aria-live="polite"
    >
      <div className="flex max-w-md flex-col items-center px-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/splash-logo.svg"
          alt="LedgerFlow"
          className={cn(
            "h-auto w-[min(220px,42vw)] transition-all ease-out",
            entered && !exiting ? "scale-100 opacity-100" : "scale-95 opacity-0"
          )}
          style={{ transitionDuration: "1.4s" }}
        />
        <p
          className={cn(
            "mt-7 text-[clamp(1.35rem,2.4vw,1.75rem)] font-medium tracking-wide transition-opacity delay-300",
            entered && !exiting ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDuration: "1.2s" }}
        >
          Welcome
        </p>
        <div className="mt-9 min-h-[3.5rem] max-w-sm px-2">
          <p
            className={cn(
              "text-[clamp(0.9rem,1.5vw,1.05rem)] italic leading-relaxed text-white/60 transition-opacity duration-700",
              quoteVisible && !exiting ? "opacity-100" : "opacity-0"
            )}
          >
            {quote}
          </p>
        </div>
      </div>
      <p
        className={cn(
          "absolute bottom-8 text-[10px] uppercase tracking-[0.14em] text-white/30 transition-opacity duration-1000 delay-1000",
          entered && !exiting ? "opacity-100" : "opacity-0"
        )}
      >
        Starting your private workspace…
      </p>
    </div>
  );
}
