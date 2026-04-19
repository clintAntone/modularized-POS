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
  <div className={`${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} bg-white border border-slate-100 shadow-sm space-y-4`}>
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
      <div key={i} className={`${UI_THEME.layout.cardPadding} ${UI_THEME.radius.card} bg-white border border-slate-100 shadow-sm space-y-2`}>
        <Skeleton variant="text" className="w-1/2 h-3" />
        <Skeleton variant="text" className="w-3/4 h-8" />
      </div>
    ))}
  </div>
);
