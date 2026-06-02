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
        background: "var(--surface-2)",
        border: "1px solid var(--border-2)",
        borderRadius: 12,
        padding,
        marginBottom: 16,
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      {title && (
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 14 }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
