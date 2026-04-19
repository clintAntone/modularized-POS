
import React from 'react';

interface RoleBadgeProps {
  role: string;
  centered?: boolean;
}

export const RoleBadge = ({ role, centered = false }: RoleBadgeProps) => {
  const rolesList = ['THERAPIST', 'BONESETTER'];
  const ROLE_ORDER = ['MANAGER', ...rolesList, 'TRAINEE'];

  const styles: Record<string, string> = {
    MANAGER: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    THERAPIST: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    BONESETTER: 'bg-amber-50 text-amber-700 border-amber-100',
    TRAINEE: 'bg-slate-50 text-slate-500 border-slate-100'
  };
  
  const roles = (role || '').split(',')
    .filter(Boolean)
    .map(r => r.trim().toUpperCase())
    .filter(r => r !== 'RELIEVER')
    .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
    
  return (
    <div className={`flex flex-wrap gap-1 ${centered ? 'justify-center w-full' : ''}`}>
      {roles.map(r => {
        // Fallback style if role not in predefined styles
        const roleIndex = rolesList.indexOf(r);
        const fallbackStyle = roleIndex % 2 === 0 
          ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
          : 'bg-amber-50 text-amber-700 border-amber-100';

        return (
          <span key={r} className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest border ${styles[r] || fallbackStyle}`}>
            {r}
          </span>
        );
      })}
    </div>
  );
};
