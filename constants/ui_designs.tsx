
/**
 * HILOT CORE DESIGN SYSTEM v1.6
 * Standardized for pixel-perfect alignment across all management nodes.
 */

export const UI_THEME = {
  // Color Palette
  colors: {
    primary: 'emerald',    
    secondary: 'indigo',   
    accent: 'amber',      
    danger: 'rose',       
    neutral: 'slate',      
    brandDark: '#0b1426',  
    brandLight: '#f8fafc', 
  },

  // Typography Scaling
  text: {
    label: 'text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400',
    metadata: 'text-[9px] sm:text-[10px] font-medium uppercase tracking-widest text-slate-400',
    title: 'text-xl sm:text-2xl font-bold uppercase tracking-tight text-slate-900',
    section: 'text-sm sm:text-base font-semibold uppercase tracking-widest text-slate-900',
    cardTitle: 'text-[14px] sm:text-[15px] font-semibold uppercase tracking-tight truncate',
    currency: 'font-bold tabular-nums tracking-tighter',
    currencySm: 'text-lg sm:text-xl',
    currencyLg: 'text-2xl sm:text-4xl',
  },

  // Spacing & Layout
  layout: {
    mainPadding: 'px-5 sm:px-8 lg:px-10', 
    cardPadding: 'p-4 sm:p-6',
    containerGap: 'gap-3 sm:gap-5',
    gridGap: 'gap-3 sm:gap-4',
    maxContent: 'max-w-[1400px] mx-auto',
    sectionMargin: 'space-y-6 sm:space-y-10',
    
    // Standard Modal Constraints
    modalWrapper: 'fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/95 no-print animate-in fade-in duration-200',
    modalStandard: 'w-full max-w-md bg-white shadow-2xl animate-in zoom-in-95 duration-300',
    modalLarge: 'w-full max-w-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-300',
    modalFull: 'w-full max-w-7xl bg-white shadow-2xl animate-in zoom-in-95 duration-300',
  },

  // Component Shapes
  radius: {
    pill: 'rounded-full',
    input: 'rounded-xl sm:rounded-2xl',
    card: 'rounded-2xl sm:rounded-3xl',
    modal: 'rounded-2xl sm:rounded-3xl',
  },

  // Global Shadows
  shadows: {
    soft: 'shadow-sm',
    standard: 'shadow-md',
    heavy: 'shadow-xl',
    extreme: 'shadow-[0_20px_50px_-10px_rgba(0,0,0,0.15)]',
  },

  // Standardized Form & Button Components
  styles: {
    controlHeight: 'h-12 sm:h-14',
    inputBase: 'w-full p-4 sm:p-5 bg-slate-50 border border-slate-200 outline-none transition-all shadow-inner focus:bg-white focus:border-emerald-500 font-medium',
    buttonBase: 'transition-all active:scale-[0.98] font-semibold uppercase tracking-wider flex items-center justify-center gap-2.5',
    commandBarContainer: 'bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 flex flex-row items-center gap-2 sm:gap-4',
    actionButton: 'bg-slate-900 text-white hover:bg-emerald-600 shadow-xl shrink-0 transition-all active:scale-95',
    primaryButton: 'py-5 sm:py-6 rounded-[24px] sm:rounded-[32px] font-black uppercase tracking-[0.2em] text-[11px] sm:text-[12px] shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-4 px-10',
  }
};
