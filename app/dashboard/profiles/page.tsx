"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Shield, Mail, Layers, CheckCircle, XCircle } from "lucide-react";

type Profile = {
  id: string;
  email: string;
  role: string;
  monthly_lead_limit: number;
  current_month_usage: number;
  is_active: boolean;
};

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Security check
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        setLoading(false);
        return;
      }
      
      setAuthorized(true);

      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("*")
        .order("email", { ascending: true });
        
      if (allProfiles) setProfiles(allProfiles);
      setLoading(false);
    };

    fetchProfiles();
  }, []);

  if (loading) return <div className="text-gray-400 p-8 text-center">Verifying Access Clearances...</div>;
  if (!authorized) return <div className="text-[#ff4d4d] p-8 text-center font-bold">Access Denied. Admins Only.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header className="bg-[#221C16] p-6 rounded-lg border border-[#333333]">
        <h1 className="text-2xl font-bold text-white tracking-wide">
          USER PROFILE DIRECTORY
        </h1>
        <p className="text-gray-400 mt-1">Monitor tenant access privileges and credit quotas from one central terminal.</p>
      </header>

      <div className="bg-[#221C16] rounded-lg border border-[#333333] overflow-hidden">
        <table className="w-full text-left text-sm text-gray-400">
          <thead className="bg-[#121212] text-gray-300">
            <tr>
              <th className="px-6 py-4">User Account</th>
              <th className="px-6 py-4">Role System</th>
              <th className="px-6 py-4">System Status</th>
              <th className="px-6 py-4">Current Usage Quota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#333333]">
            {profiles.map((prof) => (
              <tr key={prof.id} className="hover:bg-[#252525] transition-colors">
                <td className="px-6 py-4 flex items-center gap-3 font-medium text-white">
                  <Mail size={16} className="text-gray-500" />
                  {prof.email}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 w-fit ${
                    prof.role === "admin" ? "bg-[#00ffcc]/10 text-[#00ffcc] border border-[#00ffcc]/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  }`}>
                    <Shield size={12} />
                    {prof.role.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {prof.is_active ? (
                    <span className="text-[#00ffcc] flex items-center gap-1 text-xs font-medium">
                      <CheckCircle size={14} /> Active Access
                    </span>
                  ) : (
                    <span className="text-[#ff4d4d] flex items-center gap-1 text-xs font-medium">
                      <XCircle size={14} /> Suspended
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-xs font-mono text-gray-300">
                  <div className="flex items-center gap-2">
                    <Layers size={14} className="text-gray-500" />
                    <span>{prof.current_month_usage} / {prof.monthly_lead_limit} Runs Used</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}