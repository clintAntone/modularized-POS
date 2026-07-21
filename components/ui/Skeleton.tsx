import React from 'react';
import { UI_THEME } from '../../constants/ui_designs';

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'rect' }) => {
  const baseClass = "animate-pulse bg-slate-200/60 dark:bg-slate-800/40";
  
  const variantClasses = {
    rect: "rounded-2xl",
    circle: "rounded-full",
    text: "rounded-lg h-4 w-full"
  };

  return (
    <div 
      className={`${baseClass} ${variantClasses[variant]} ${className}`}
      aria-hidden="true"
    />
  );
};

export const CardSkeleton = () => (
  <div className={`${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm space-y-4`}>
    <div className="flex items-center gap-4">
      <Skeleton variant="circle" className="w-12 h-12" />
      <div className="space-y-2 flex-1">
        <Skeleton variant="text" className="w-1/3" />
        <Skeleton variant="text" className="w-1/4" />
      </div>
    </div>
    <Skeleton variant="rect" className="h-32 w-full" />
    <div className="flex justify-between gap-4">
      <Skeleton variant="rect" className="h-10 flex-1" />
      <Skeleton variant="rect" className="h-10 flex-1" />
    </div>
  </div>
);

export const KPISkeleton = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className={`${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm space-y-2`}>
        <Skeleton variant="text" className="w-1/2 h-3" />
        <Skeleton variant="text" className="w-3/4 h-8" />
      </div>
    ))}
  </div>
);

export const UserCardSkeleton = () => (
  <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5 flex items-center justify-between gap-4">
    <div className="flex items-center gap-4 flex-1 min-w-0">
      <Skeleton variant="circle" className="w-11 h-11 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" className="w-2/5 h-3" />
        <Skeleton variant="text" className="w-1/3 h-3" />
      </div>
    </div>
    <Skeleton variant="rect" className="w-16 h-8 shrink-0" />
  </div>
);

export const UserListSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => <UserCardSkeleton key={i} />)}
  </div>
);

export const TableRowSkeleton = () => (
  <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-50 dark:border-slate-700">
    <Skeleton variant="text" className="w-1/4 h-3" />
    <Skeleton variant="text" className="w-1/5 h-3" />
    <Skeleton variant="text" className="w-1/6 h-3" />
    <Skeleton variant="text" className="w-1/6 h-3" />
  </div>
);

export const SectionSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between mb-4">
      <Skeleton variant="text" className="w-1/3 h-5" />
      <Skeleton variant="rect" className="w-24 h-9" />
    </div>
    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => <TableRowSkeleton key={i} />)}
    </div>
  </div>
);
