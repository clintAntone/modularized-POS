
import React from 'react';
import { Service } from '../../../types';

interface ServiceCatalogMatrixProps {
  services: Service[];
}

export const ServiceCatalogMatrix: React.FC<ServiceCatalogMatrixProps> = ({ services }) => {
  return (
    <section className="space-y-5 animate-in slide-in-from-bottom-5 duration-500">
      <div className="flex justify-between items-end px-1">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.25em]">Registered Service Catalog</h4>
        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 shadow-sm">
          {services?.length || 0} UNITS
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {services && services.length > 0 ? services.map(srv => (
          <div key={srv.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-100 bg-white hover:border-emerald-200 transition-all">
            <div className="flex-1 min-w-0">
              <p className="font-bold uppercase text-xs tracking-tight text-slate-900 truncate">{srv.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                 <p className="text-xs font-semibold uppercase text-slate-400">{srv.duration}m</p>
                 <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                 <p className="text-xs font-bold uppercase text-emerald-600">
                   {srv.commissionType === 'percentage' ? '%' : '₱'}{srv.commissionValue}
                 </p>
              </div>
            </div>
            <p className="text-sm font-black text-slate-900 tabular-nums shrink-0">₱{Number(srv.price).toLocaleString()}</p>
          </div>
        )) : (
          <div className="py-16 text-center bg-slate-50/50 rounded-3xl border-4 border-dashed border-slate-100 opacity-40">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide px-10 leading-relaxed">No services currently attached.</p>
          </div>
        )}
      </div>
    </section>
  );
};
