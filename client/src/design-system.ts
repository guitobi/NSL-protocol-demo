// Modern Design System - Telegram/Discord inspired

export const colors = {
  // Background
  bg: {
    primary: '#0a0a0a',
    secondary: '#141414',
    tertiary: '#1a1a1a',
    hover: 'rgba(255, 255, 255, 0.03)',
    active: 'rgba(255, 255, 255, 0.05)',
  },

  // Text
  text: {
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.6)',
    tertiary: 'rgba(255, 255, 255, 0.4)',
    disabled: 'rgba(255, 255, 255, 0.2)',
  },

  // Borders
  border: {
    primary: 'rgba(255, 255, 255, 0.08)',
    secondary: 'rgba(255, 255, 255, 0.05)',
    focus: 'rgba(59, 130, 246, 0.5)',
  },

  // Brand colors
  brand: {
    alice: {
      from: '#3b82f6',
      to: '#2563eb',
      light: 'rgba(59, 130, 246, 0.1)',
      border: 'rgba(59, 130, 246, 0.2)',
    },
    bob: {
      from: '#10b981',
      to: '#059669',
      light: 'rgba(16, 185, 129, 0.1)',
      border: 'rgba(16, 185, 129, 0.2)',
    },
    intruder: {
      from: '#ef4444',
      to: '#dc2626',
      light: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.2)',
    },
  },

  // Status colors
  status: {
    success: {
      text: '#10b981',
      bg: 'rgba(16, 185, 129, 0.1)',
      border: 'rgba(16, 185, 129, 0.2)',
    },
    error: {
      text: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.2)',
    },
    warning: {
      text: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.2)',
    },
    info: {
      text: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.1)',
      border: 'rgba(59, 130, 246, 0.2)',
    },
  },
};

export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px
  xl: '1.5rem',    // 24px
  '2xl': '2rem',   // 32px
  '3xl': '3rem',   // 48px
};

export const radius = {
  sm: '0.5rem',    // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px
  xl: '1.25rem',   // 20px
  '2xl': '1.5rem', // 24px
  '3xl': '2rem',   // 32px
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
};

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
};

// Reusable component classes
export const components = {
  button: {
    base: 'px-4 py-2.5 rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0a0a0a]',
    primary: 'bg-gradient-to-r hover:scale-[1.02] active:scale-[0.98] shadow-lg',
    secondary: 'bg-white/5 hover:bg-white/10 border border-white/10',
    ghost: 'hover:bg-white/5',
  },

  input: {
    base: 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all',
  },

  card: {
    base: 'bg-[#141414] rounded-2xl border border-white/5 shadow-xl',
    hover: 'hover:bg-white/[0.02] transition-all duration-200',
  },

  badge: {
    base: 'px-3 py-1 rounded-full text-xs font-medium border',
  },

  avatar: {
    base: 'rounded-2xl flex items-center justify-center shadow-lg',
  },
};
