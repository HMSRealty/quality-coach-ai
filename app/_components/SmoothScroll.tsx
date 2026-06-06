"use client";

// Global smooth scroll via Lenis. The previous setup let inertial
// scrolling fall out of sync when the layout had any nested overflow
// containers. This version:
//   • binds Lenis to the document/window explicitly
//   • adds the `lenis` class to <html> so Lenis's own CSS (imported in
//     globals.css) takes effect
//   • disables Lenis whenever the user prefers reduced motion
//   • cancels properly on hot-reload so a second instance never starts
import { useEffect } from "react";
import Lenis from "lenis";

export function SmoothScroll() {
  useEffect(() => {
    // Respect OS reduced-motion preference — never override native scroll.
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Lenis ships a CSS sheet that EXPECTS this class on <html>.
    document.documentElement.classList.add("lenis");

    const lenis = new Lenis({
      // Bind explicitly to the window — older versions of Lenis default to
      // document.documentElement which sometimes loses sync.
      wrapper: window,
      content: document.documentElement,
      duration: 1.05,                                 // a touch heavier than default
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
      // wheelMultiplier left at default 1 so trackpads aren't oversensitive.
    });

    let raf = 0;
    const loop = (time: number) => { lenis.raf(time); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    // Programmatic scroll-to-anchor (e.g., #pricing) — let Lenis handle it.
    const onAnchor = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("#") || href.length < 2) return;
      const el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -60 });
    };
    document.addEventListener("click", onAnchor);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", onAnchor);
      lenis.destroy();
      document.documentElement.classList.remove("lenis");
    };
  }, []);

  return null;
}
