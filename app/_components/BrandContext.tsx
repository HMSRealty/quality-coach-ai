"use client";

// Reads the current user's organization branding once on mount, then exposes
// it via context to any dashboard component that wants to show the logo
// or accent color.

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface Brand {
  name: string;
  logoUrl: string | null;
  color: string;       // hex
  isCustom: boolean;   // false when using RealTrack defaults
}

const DEFAULT: Brand = {
  name: "RealTrack",
  logoUrl: null,
  color: "#0a5f52",
  isCustom: false,
};

const BrandCtx = createContext<Brand>(DEFAULT);
export const useBrand = () => useContext(BrandCtx);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<Brand>(DEFAULT);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      const orgId = profile?.organization_id as string | undefined;
      if (!orgId) return;
      const { data: org } = await supabase.from("organizations").select("brand_name, brand_logo_url, brand_color").eq("id", orgId).maybeSingle();
      if (!org) return;
      const custom = !!(org.brand_name || org.brand_logo_url || org.brand_color);
      if (!custom) return;
      setBrand({
        name: (org.brand_name as string) || DEFAULT.name,
        logoUrl: (org.brand_logo_url as string) || null,
        color: (org.brand_color as string) || DEFAULT.color,
        isCustom: true,
      });
      // Inject the accent color as a CSS variable for any descendant to use.
      if (org.brand_color) document.documentElement.style.setProperty("--brand-tenant", org.brand_color as string);
    })();
  }, []);

  return <BrandCtx.Provider value={brand}>{children}</BrandCtx.Provider>;
}
