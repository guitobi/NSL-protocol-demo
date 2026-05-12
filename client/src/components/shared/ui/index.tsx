import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { colors, components } from "../../../design-system";

// Button Component
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  gradient?: string;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  gradient,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const baseClass = components.button.base;

  let variantClass = "";
  let style = {};

  if (variant === "primary" && gradient) {
    variantClass = components.button.primary;
    style = { background: gradient };
  } else if (variant === "primary") {
    variantClass = `${components.button.primary} bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700`;
  } else if (variant === "secondary") {
    variantClass = components.button.secondary;
  } else if (variant === "ghost") {
    variantClass = components.button.ghost;
  }

  return (
    <button
      className={`${baseClass} ${variantClass} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}

// Input Component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
}

export function Input({ icon, className = "", ...props }: InputProps) {
  if (icon) {
    return (
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
          {icon}
        </div>
        <input
          className={`${components.input.base} pl-12 ${className}`}
          {...props}
        />
      </div>
    );
  }

  return (
    <input className={`${components.input.base} ${className}`} {...props} />
  );
}

// Card Component
interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className = "",
  hover = false,
  onClick,
}: CardProps) {
  const hoverClass = hover ? components.card.hover : "";
  const cursorClass = onClick ? "cursor-pointer" : "";

  return (
    <div
      className={`${components.card.base} ${hoverClass} ${cursorClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// Badge Component
interface BadgeProps {
  children: ReactNode;
  color?: "blue" | "green" | "red" | "amber" | "gray";
  className?: string;
}

export function Badge({
  children,
  color = "gray",
  className = "",
}: BadgeProps) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    gray: "bg-white/5 text-white/60 border-white/10",
  };

  return (
    <span
      className={`${components.badge.base} ${colorClasses[color]} ${className}`}
    >
      {children}
    </span>
  );
}

// Avatar Component
interface AvatarProps {
  icon: ReactNode;
  gradient: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({
  icon,
  gradient,
  size = "md",
  className = "",
}: AvatarProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-base",
    md: "w-10 h-10 text-xl",
    lg: "w-12 h-12 text-2xl",
  };

  return (
    <div
      className={`${components.avatar.base} ${sizeClasses[size]} ${className}`}
      style={{ background: gradient }}
    >
      {icon}
    </div>
  );
}

// Section Header Component
interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  gradient: string;
}

export function SectionHeader({
  icon,
  title,
  subtitle,
  action,
  gradient,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Avatar icon={icon} gradient={gradient} size="md" />
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-sm text-white/40">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// Empty State Component
interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="py-8 px-4 text-center">
      <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-white/5 flex items-center justify-center">
        <div className="text-white/20 text-xl">{icon}</div>
      </div>
      <p className="text-sm text-white/45 leading-snug">{title}</p>
      {description && (
        <p className="text-xs text-white/25 mt-1 leading-snug">{description}</p>
      )}
    </div>
  );
}

// Status Indicator Component
interface StatusIndicatorProps {
  type: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
  children?: ReactNode;
}

export function StatusIndicator({
  type,
  title,
  description,
  children,
}: StatusIndicatorProps) {
  const config = {
    success: {
      icon: "✅",
      gradient:
        "linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)",
      border: colors.status.success.border,
      textColor: colors.status.success.text,
    },
    error: {
      icon: "❌",
      gradient:
        "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)",
      border: colors.status.error.border,
      textColor: colors.status.error.text,
    },
    warning: {
      icon: "⚠️",
      gradient:
        "linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%)",
      border: colors.status.warning.border,
      textColor: colors.status.warning.text,
    },
    info: {
      icon: "ℹ️",
      gradient:
        "linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)",
      border: colors.status.info.border,
      textColor: colors.status.info.text,
    },
  };

  const { icon, gradient, border, textColor } = config[type];

  return (
    <div
      className="rounded-2xl p-4 border shadow-xl"
      style={{ background: gradient, borderColor: border }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${border}40` }}
        >
          <span className="text-lg">{icon}</span>
        </div>
        <div className="flex-1">
          <p
            className="font-semibold text-sm mb-1"
            style={{ color: textColor }}
          >
            {title}
          </p>
          {description && (
            <p className="text-xs text-white/50 leading-relaxed">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
