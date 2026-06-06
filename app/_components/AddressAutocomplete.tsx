"use client";

// Google Places Autocomplete input. Reads the API key from
// NEXT_PUBLIC_GOOGLE_PLACES_KEY (must be set as a build-time Cloudflare env var
// since it's referenced client-side). Gracefully degrades to a plain input if
// the script fails to load or the key is missing.
import { useEffect, useRef } from "react";

type W = Window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, options: object) => GMAutocomplete } } }; __gpLoaded?: boolean; __gpQueue?: Array<() => void> };
type GMAutocomplete = { addListener: (e: string, cb: () => void) => void; getPlace: () => { formatted_address?: string } };

function loadScript(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as W;
    if (w.google?.maps?.places) return resolve();
    if (w.__gpQueue) { w.__gpQueue.push(() => resolve()); return; }
    w.__gpQueue = [() => resolve()];
    const existing = document.querySelector('script[data-google-places="1"]');
    if (existing) return;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async`;
    s.async = true; s.defer = true;
    s.dataset.googlePlaces = "1";
    s.onload = () => { w.__gpLoaded = true; (w.__gpQueue || []).forEach(fn => fn()); w.__gpQueue = []; };
    s.onerror = () => reject(new Error("Google Places failed to load"));
    document.head.appendChild(s);
  });
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
}
export function AddressAutocomplete({ value, onChange, placeholder, required, style }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const key = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;

  useEffect(() => {
    if (!key || !inputRef.current) return;
    let ac: GMAutocomplete | null = null;
    (async () => {
      try {
        await loadScript(key);
        const w = window as unknown as W;
        if (!inputRef.current || !w.google?.maps?.places) return;
        ac = new w.google.maps.places.Autocomplete(inputRef.current, {
          types: ["address"],
          componentRestrictions: { country: ["us"] },
          fields: ["formatted_address", "address_components"],
        });
        ac.addListener("place_changed", () => {
          const p = ac?.getPlace();
          if (p?.formatted_address) onChange(p.formatted_address);
        });
      } catch { /* fallback to plain input */ }
    })();
    return () => { /* cleanup is implicit; the script + autocomplete tear down with the element */ };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      autoComplete="off"
      style={style}
    />
  );
}
