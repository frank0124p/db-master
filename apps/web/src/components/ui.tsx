import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";

export function Badge({ status }: { status: "exact" | "alias" | "fuzzy" | "unknown" }) {
  const map = {
    exact:   { label: "✓ exact",   color: "bg-green-900/50 text-green-400 border-green-800" },
    alias:   { label: "⚠ alias",   color: "bg-yellow-900/50 text-yellow-400 border-yellow-800" },
    fuzzy:   { label: "~ fuzzy",   color: "bg-orange-900/50 text-orange-400 border-orange-800" },
    unknown: { label: "? unknown", color: "bg-zinc-800/50 text-zinc-400 border-zinc-700" },
  };
  const { label, color } = map[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${color}`}>
      {label}
    </span>
  );
}

export function Btn({
  variant = "default",
  size = "md",
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const base = "inline-flex items-center gap-1.5 rounded font-medium transition-colors disabled:opacity-40 cursor-pointer";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3 py-1.5 text-sm" };
  const variants = {
    default: "bg-[var(--bg-3)] hover:bg-[var(--border)] text-[var(--text-1)] border border-[var(--border)]",
    primary: "bg-[var(--accent)] hover:bg-blue-500 text-white border border-transparent",
    ghost:   "bg-transparent hover:bg-[var(--bg-3)] text-[var(--text-2)] border border-transparent",
    danger:  "bg-transparent hover:bg-red-900/30 text-[var(--red)] border border-transparent",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full px-3 py-1.5 rounded bg-[var(--bg-0)] border border-[var(--border)] text-[var(--text-1)] text-sm placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={`w-full px-3 py-1.5 rounded bg-[var(--bg-0)] border border-[var(--border)] text-[var(--text-1)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={`bg-[var(--bg-1)] border border-[var(--border)] rounded-lg ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--bg-1)] border border-[var(--border)] rounded-xl w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <span className="font-semibold text-[var(--text-1)]">{title}</span>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-1)] text-lg leading-none">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />;
}

export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-3)]">
      <span className="text-4xl">{icon}</span>
      <span className="text-sm">{message}</span>
    </div>
  );
}
