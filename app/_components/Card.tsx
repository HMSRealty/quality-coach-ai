import React from "react";

/**
 * Shared Card primitive — defined at module scope so React keeps a stable
 * component identity across re-renders. Defining Card inside a page component
 * causes React to unmount/remount on every render, which kills input focus.
 */
export function Card({
  children,
  title,
  style,
  padding = 20,
  className,
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  style?: React.CSSProperties;
  padding?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(26,26,26,0.08)",
        borderRadius: 14,
        padding,
        marginBottom: 16,
        boxShadow: "0 2px 8px rgba(26,26,26,0.04)",
        ...style,
      }}
    >
      {title && (
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", marginBottom: 14 }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
