"use client";

// Global Lenis smooth scroll for the Next.js 15 App Router.
//   1. Single Lenis instance bound to the window.
//   2. usePathname() → on every route change, reset scroll to top immediately
//      (Next client navigation otherwise keeps the old scroll offset).
//   3. RAF loop cancelled in cleanup → no leaks / double-loops on hot reload.
//   4. Honors prefers-reduced-motion (skips Lenis entirely).
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

export function SmoothScroll() {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Lenis's own stylesheet keys off this class on <html>.
    document.documentElement.classList.add("lenis");

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    lenisRef.current = lenis;

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    // In-page anchor links (#pricing etc.) → let Lenis animate to them.
    const onAnchorClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest("a");
      const href = a?.getAttribute("href");
      if (!href || !href.startsWith("#") || href.length < 2) return;
      const el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -72 });
    };
    document.addEventListener("click", onAnchorClick);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("click", onAnchorClick);
      lenis.destroy();
      lenisRef.current = null;
      document.documentElement.classList.remove("lenis");
    };
  }, []);

  // Route change → snap to top instantly so new pages start at the top.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (lenis) {
      lenis.scrollTo(0, { immediate: true });
    } else {
      // Reduced-motion / Lenis-off fallback.
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}
