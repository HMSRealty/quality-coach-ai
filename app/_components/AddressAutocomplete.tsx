"use client";

// Google Places Autocomplete input with a visible status badge that tells you
// EXACTLY what's wrong (no key, script blocked, API not enabled, etc.).
// Reads NEXT_PUBLIC_GOOGLE_PLACES_KEY from the build-time env.
import { useEffect, useRef, useState } from "react";

type W = Window & {
  google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, options: object) => GMAutocomplete } } };
  gm_authFailure?: () => void;
};
type GMComponent = { long_name: string; short_name: string; types: string[] };
type GMAutocomplete = { addListener: (e: string, cb: () => void) => void; getPlace: () => { formatted_address?: string; address_components?: GMComponent[] } };

export interface AddressParts {
  formatted: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

// Pull structured fields out of Google's address_components array.
function toParts(formatted: string, comps: GMComponent[] | undefined): AddressParts {
  const get = (type: string, short = false) => {
    const c = comps?.find((x) => x.types.includes(type));
    return c ? (short ? c.short_name : c.long_name) : "";
  };
  const streetNo = get("street_number");
  const route = get("route");
  return {
    formatted,
    street: [streetNo, route].filter(Boolean).join(" ").trim(),
    city: get("locality") || get("sublocality") || get("postal_town"),
    state: get("administrative_area_level_1", true),
    zip: get("postal_code"),
  };
}

const SCRIPT_ATTR = "data-google-places-loader";

function loadPlaces(key: string): Promise<"ok"> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as W;
    // Already loaded?
    if (w.google?.maps?.places) return resolve("ok");
    // Script already on the page? Poll until ready, then resolve.
    if (document.querySelector(`script[${SCRIPT_ATTR}]`)) {
      const start = Date.now();
      const tick = () => {
        if ((window as unknown as W).google?.maps?.places) return resolve("ok");
        if (Date.now() - start > 12_000) return reject(new Error("places-load-timeout"));
        setTimeout(tick, 120);
      };
      return tick();
    }
    // Hook Google's auth-failure callback so we can surface bad-key errors.
    w.gm_authFailure = () => reject(new Error("places-auth-failure"));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly`;
    s.async = true; s.defer = true;
    s.setAttribute(SCRIPT_ATTR, "1");
    s.onload = () => {
      if ((window as unknown as W).google?.maps?.places) resolve("ok");
      else reject(new Error("places-library-missing"));
    };
    s.onerror = () => reject(new Error("places-script-blocked"));
    document.head.appendChild(s);
  });
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (parts: AddressParts) => void;   // structured data on pick
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
}

type Status = "no-key" | "loading" | "ready" | "auth-failure" | "blocked" | "timeout" | "library-missing";

export function AddressAutocomplete({ value, onChange, onSelect, placeholder, required, style }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Prefer NEXT_PUBLIC_GOOGLE_MAPS_KEY; fall back to the legacy PLACES name.
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;
  const [status, setStatus] = useState<Status>(key ? "loading" : "no-key");

  useEffect(() => {
    if (!key || !inputRef.current) return;
    let ac: GMAutocomplete | null = null;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    (async () => {
      try {
        await loadPlaces(key);
        if (cancelled || !inputRef.current) return;
        const w = window as unknown as W;
        ac = new w.google!.maps!.places!.Autocomplete(inputRef.current, {
          types: ["address"],
          componentRestrictions: { country: ["us"] },
          fields: ["formatted_address", "address_components"],
        });
        ac.addListener("place_changed", () => {
          const p = ac?.getPlace();
          if (p?.formatted_address) {
            onChange(p.formatted_address);
            onSelect?.(toParts(p.formatted_address, p.address_components));
          }
        });
        // Google may post-hoc add the .gm-err-autocomplete class + disable
        // the input if it rejects the key. Watch for that.
        const el = inputRef.current;
        const checkErr = () => {
          if (el.classList.contains("gm-err-autocomplete") || el.disabled) {
            setStatus("auth-failure");
            el.disabled = false; // re-enable so user can keep typing
            el.placeholder = placeholder || "";
          } else {
            setStatus((s) => s === "auth-failure" ? s : "ready");
          }
        };
        checkErr();
        observer = new MutationObserver(checkErr);
        observer.observe(el, { attributes: true, attributeFilter: ["class", "disabled", "placeholder"] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "places-script-blocked";
        if (msg === "places-auth-failure") setStatus("auth-failure");
        else if (msg === "places-load-timeout") setStatus("timeout");
        else if (msg === "places-library-missing") setStatus("library-missing");
        else setStatus("blocked");
      }
    })();
    return () => { cancelled = true; observer?.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const badge = STATUS_LABEL[status];

  // Reserve room on the right for the status dot, force a clean sans-serif
  // (some font-feature-settings render tofu glyphs), neutralize browser/extension
  // autofill (Chrome address chips, LastPass/1Password icons, etc.).
  const inputStyle: React.CSSProperties = {
    ...style,
    paddingRight: 38,
    fontFamily: "var(--font-sans), system-ui, sans-serif",
    fontFeatureSettings: "normal",
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        // type=search → Chrome shows clear-X instead of the address chip row
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        // Disable EVERY form of autofill, password-manager, and predictive UI.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        name="address-line"
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-dashlane-ignore="true"
        style={inputStyle}
      />
      {/* Compact dot — hover for full status text. */}
      <span
        title={`${badge.label} — ${badge.tip}`}
        aria-label={badge.label}
        style={{
          position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
          width: 10, height: 10, borderRadius: "50%",
          background: badge.dot,
          boxShadow: status === "ready" ? `0 0 10px ${badge.dot}88` : "none",
          pointerEvents: "auto", cursor: "help",
        }}
      />
    </div>
  );
}

const STATUS_LABEL: Record<Status, { label: string; tip: string; bg: string; fg: string; dot: string }> = {
  "no-key":          { label: "NO KEY",   tip: "NEXT_PUBLIC_GOOGLE_PLACES_KEY isn't set in the build. Add it as a Cloudflare Pages env var on the Production environment, then redeploy.", bg: "#FEF3C7", fg: "#92400E", dot: "#D97706" },
  "loading":         { label: "LOADING",  tip: "Fetching the Google Places script…", bg: "#E0E7FF", fg: "#3730A3", dot: "#6366F1" },
  "ready":           { label: "AUTOCOMPLETE",  tip: "Google Places is active — start typing to see suggestions.", bg: "#D1FAE5", fg: "#065F46", dot: "#10B981" },
  "auth-failure":    { label: "BAD KEY",  tip: "Google rejected the key. Likely causes: Places API not enabled in your Google Cloud project, billing not enabled, or the key is restricted to a different referrer.", bg: "#FEE2E2", fg: "#991B1B", dot: "#DC2626" },
  "blocked":         { label: "BLOCKED",  tip: "The Google Maps script failed to load (ad-blocker or CORS). Try a different network or disable blockers.", bg: "#FEE2E2", fg: "#991B1B", dot: "#DC2626" },
  "timeout":         { label: "TIMEOUT",  tip: "The script never finished loading. Reload the page; if it persists, the Maps endpoint may be unreachable from your network.", bg: "#FEE2E2", fg: "#991B1B", dot: "#DC2626" },
  "library-missing": { label: "NO PLACES",tip: "Maps loaded but the Places library is missing. Re-check the script URL has libraries=places.", bg: "#FEE2E2", fg: "#991B1B", dot: "#DC2626" },
};
