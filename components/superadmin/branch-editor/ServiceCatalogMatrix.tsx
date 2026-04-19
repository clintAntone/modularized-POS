
import React from 'react';
import { Service } from '../../../types';

interface ServiceCatalogMatrixProps {
  services: Service[];
}

export const ServiceCatalogMatrix: React.FC<ServiceCatalogMatrixProps> = ({ services }) => {
  return (
    <section className="space-y-5 animate-in slide-in-from-bottom-5 duration-500">
      <div className="flex justify-between items-end px-1">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em]">Registered Service Catalog</h4>
        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 shadow-sm">
          {services?.length || 0} UNITS
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {services && services.length > 0 ? services.map(srv => (
          <div key={srv.id} className="w-full p-5 rounded-[28px] border border-slate-100 bg-white flex items-center shadow-sm hover:border-emerald-200 transition-all group/srv">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mr-4 text-slate-300 shrink-0 group-hover/srv:bg-emerald-50 group-hover/srv:text-emerald-500 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 pr-4">
              <p className="font-bold uppercase text-[12px] tracking-tight text-slate-900 mb-1 truncate">{srv.name}</p>
              <div className="flex items-center gap-2">
                 <p className="text-[9px] font-semibold uppercase text-slate-400 tracking-widest">{srv.duration}M</p>
                 <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                 <p className="text-[9px] font-bold uppercase text-emerald-600 tracking-widest">
                   PAY: {srv.commissionType === 'percentage' ? '%' : '₱'}{srv.commissionValue}
                 </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-slate-900 tabular-nums tracking-tighter">₱{Number(srv.price).toLocaleString()}</p>
            </div>
          </div>
        )) : (
          <div className="py-16 text-center bg-slate-50/50 rounded-[40px] border-4 border-dashed border-slate-100 opacity-40">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] px-10 leading-relaxed">No services currently attached.</p>
          </div>
        )}
      </div>
    </section>
  );
};
