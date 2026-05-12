import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  className?: string;
}

export function AppShell({ children, className = "" }: AppShellProps) {
  return (
    <div
      className={`h-screen w-full bg-[#09090b] text-white flex flex-col overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

interface AppHeaderProps {
  children: ReactNode;
  className?: string;
}

export function AppHeader({ children, className = "" }: AppHeaderProps) {
  return (
    <header
      className={`flex-shrink-0 bg-[#111113]/95 border-b border-white/10 px-4 lg:px-6 py-3 ${className}`}
    >
      {children}
    </header>
  );
}

interface ScrollPanelProps {
  children: ReactNode;
  className?: string;
}

export function ScrollPanel({ children, className = "" }: ScrollPanelProps) {
  return (
    <div className={`flex-1 min-h-0 overflow-y-auto ${className}`}>
      {children}
    </div>
  );
}

interface SurfaceProps {
  children: ReactNode;
  className?: string;
}

export function Surface({ children, className = "" }: SurfaceProps) {
  return (
    <section
      className={`bg-[#111113] rounded-2xl border border-white/10 shadow-2xl ${className}`}
    >
      {children}
    </section>
  );
}
