import React, { useMemo } from 'react';
import { Transaction, Service } from '../../../../types';
import { UI_THEME } from '../../../../constants/ui_designs';

interface SessionLogsProps {
  transactions: Transaction[];
  /** Branch services used for price lookup — avoids a broken DB query */
  services?: Service[];
  /** Optional override to display a total count beside the heading */
  totalCount?: number;
}

const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const SessionLogs: React.FC<SessionLogsProps> = ({ transactions, services = [], totalCount }) => {
  // Build a price lookup map from branch services (in-memory, no DB round-trip)
  const serviceMap = useMemo(() => (
    Object.fromEntries(services.map(s => [s.id, s]))
  ), [services]);

  const totalGross = useMemo(() =>
    transactions.reduce((sum, t) => sum + (Number(t.basePrice) || 0) - (Number(t.discount) || 0), 0),
  [transactions]);

  const totalNetRoi = useMemo(() =>
    transactions.reduce((sum, t) => {
      const net = (Number(t.basePrice) || 0) - (Number(t.discount) || 0);
      const comm = (Number(t.primaryCommission) || 0) + (Number(t.secondaryCommission) || 0);
      const ded = Number(t.deduction) || 0;
      return sum + net - comm + ded;
    }, 0),
  [transactions]);

  // Returns [{name, price}] for a transaction's services
  const getServiceItems = (t: Transaction) => {
    const ids = t.serviceId ? t.serviceId.split(',').map(s => s.trim()).filter(Boolean) : [];
    const names = t.serviceName.split('+').map(s => s.trim());
    if (ids.length === 0) return names.map(name => ({ name, price: null as number | null }));
    return ids.map((id, idx) => ({
      name: names[idx] ?? id,
      price: serviceMap[id]?.price ?? null,
    }));
  };

  return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest leading-none">Session Logs</h4>
            {totalCount !== undefined && (
              <span className="text-xs font-bold text-slate-400">({totalCount})</span>
            )}
          </div>
          {transactions.length > 0 ? (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                <span className="text-xs text-slate-400">Sessions <span className="font-bold text-slate-600">{transactions.length}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="text-xs text-slate-400">Gross <span className="font-bold text-slate-600">{fmt(totalGross)}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                <span className="text-xs text-slate-400">Net ROI <span className="font-bold text-slate-600">{fmt(totalNetRoi)}</span></span>
              </div>
            </div>
          ) : (
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Lists of clients today</p>
          )}
        </div>

        <div
            className={`bg-white ${UI_THEME.radius.card} border border-slate-100 shadow-sm overflow-hidden print:overflow-visible`}>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto no-scrollbar print:overflow-visible">
            <table className="w-full text-left text-xs min-w-[820px] print:min-w-0">
              <thead>
              <tr className="text-xs font-medium text-slate-500 uppercase tracking-wide border-b bg-slate-50">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Settlement</th>
                <th className="px-4 py-3">Provider(s)</th>
                <th className="sticky right-0 bg-slate-50 px-5 py-3 text-right border-l border-slate-100 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.04)]">ROI</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
              {transactions.length > 0 ? transactions.map(t => {
                const totalDeduction = (Number(t.discount) || 0);
                const therapistComm = Number(t.primaryCommission) || 0;
                const bonesetterComm = Number(t.secondaryCommission) || 0;
                const sessionDeduction = Number(t.deduction) || 0;
                const netTotal = (Number(t.basePrice) - totalDeduction);
                const netRoi = (netTotal - therapistComm - bonesetterComm + sessionDeduction);

                const isPaid = t.paymentStatus === 'PAID';

                return (
                    <tr key={t.id} className="hover:bg-slate-50/20 transition-colors group">
                      {/* TIME */}
                      <td className="px-4 py-4 font-medium text-slate-400 uppercase tracking-tighter tabular-nums text-xs whitespace-nowrap">
                        {new Intl.DateTimeFormat('en-US', {
                          timeZone: 'Asia/Manila',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        }).format(new Date(t.timestamp))}
                      </td>

                      {/* CLIENT */}
                      <td className="px-4 py-4 font-bold text-slate-600 text-xs uppercase tracking-tight whitespace-nowrap">
                        {t.clientName}
                      </td>

                      {/* SERVICE */}
                      <td className="px-4 py-4 font-bold text-slate-600 uppercase tracking-tight text-xs max-w-[200px] break-words leading-tight">
                        <div className="flex flex-col gap-1.5">
                          {getServiceItems(t).map((srv, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-slate-300 shrink-0"></div>
                              <span className="truncate">{srv.name}</span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* PRICE */}
                      <td className="px-4 py-4 text-right tabular-nums text-xs whitespace-nowrap">
                        <span className="text-slate-900 font-semibold">₱{(Number(t.basePrice) || 0).toLocaleString()}</span>
                        {totalDeduction > 0 && (
                            <span className="text-rose-600 ml-1 text-xs">−₱{totalDeduction.toLocaleString()}</span>
                        )}
                      </td>

                      {/* TOTAL */}
                      <td className="px-4 py-4 font-bold text-slate-900 text-sm text-right tabular-nums tracking-tighter whitespace-nowrap">
                        ₱{netTotal.toLocaleString()}
                      </td>

                      {/* SETTLEMENT */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs font-black px-2 py-0.5 rounded-md border leading-none uppercase w-fit ${t.paymentMethod === 'GCASH' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                            {t.paymentMethod === 'GCASH' ? '📱 GCash' : '💵 Cash'}
                          </span>
                          <span className={`text-xs font-medium uppercase tracking-wide ${isPaid ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`}>
                            {isPaid ? '● Paid' : '○ Pending'}
                          </span>
                        </div>
                      </td>

                      {/* PROVIDERS */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1.5">
                          {t.therapistName && t.therapistName.trim() && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-md border border-emerald-100 leading-none uppercase shrink-0">T:</span>
                                <span className="text-xs tabular-nums text-slate-500 shrink-0">₱{therapistComm.toLocaleString()}</span>
                                <span className="font-bold text-slate-600 text-xs uppercase tracking-tight truncate max-w-[110px]">{t.therapistName}</span>
                              </div>
                          )}
                          {t.bonesetterName && t.bonesetterName.trim() && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md border border-indigo-100 leading-none uppercase shrink-0">B:</span>
                                <span className="text-xs tabular-nums text-slate-500 shrink-0">₱{bonesetterComm.toLocaleString()}</span>
                                <span className="font-bold text-slate-600 text-xs uppercase tracking-tight truncate max-w-[110px]">{t.bonesetterName}</span>
                              </div>
                          )}
                          {sessionDeduction > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-md border border-rose-100 leading-none uppercase shrink-0">D:</span>
                                <span className="text-xs tabular-nums text-rose-600 font-bold">−₱{sessionDeduction.toLocaleString()}</span>
                              </div>
                          )}
                        </div>
                      </td>

                      {/* NET ROI — sticky so it's always visible */}
                      <td className="sticky right-0 bg-white group-hover:bg-slate-50/20 px-5 py-4 font-bold text-slate-900 text-sm text-right tabular-nums tracking-tighter whitespace-nowrap border-l border-slate-100 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.04)]">
                        ₱{netRoi.toLocaleString()}
                      </td>
                    </tr>
                );
              }) : (
                  <tr>
                    <td colSpan={8} className="py-24 text-center font-bold text-slate-200 uppercase tracking-wide">
                      No transaction data recorded
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3 p-3">
            {transactions.length > 0 ? transactions.map(t => {
              const totalDeduction = (Number(t.discount) || 0);
              const therapistComm = Number(t.primaryCommission) || 0;
              const bonesetterComm = Number(t.secondaryCommission) || 0;
              const sessionDeduction = Number(t.deduction) || 0;
              const netTotal = (Number(t.basePrice) - totalDeduction);
              const netRoi = (netTotal - therapistComm - bonesetterComm + sessionDeduction);
              const isPaid = t.paymentStatus === 'PAID';
              const time = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Manila',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              }).format(new Date(t.timestamp));

              return (
                <div key={t.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  {/* Accent bar */}
                  <div className={`h-0.5 ${isPaid ? 'bg-gradient-to-r from-slate-100 via-emerald-400 to-slate-100' : 'bg-gradient-to-r from-slate-100 via-amber-400 to-slate-100'}`} />

                  <div className="p-5 space-y-4">
                    {/* Top row: time + payment */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{time}</span>
                      <div className="flex items-center gap-1.5">
                        {!isPaid && (
                          <span className="text-xs font-black bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-lg uppercase tracking-widest animate-pulse">Pending</span>
                        )}
                        <span className={`text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-widest border ${t.paymentMethod === 'GCASH' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {t.paymentMethod === 'GCASH' ? 'GCash' : 'Cash'}
                        </span>
                      </div>
                    </div>

                    {/* Client + amount */}
                    <div className="flex items-start justify-between gap-3">
                      <h5 className="font-black text-slate-900 text-[18px] uppercase tracking-tight leading-none">{t.clientName}</h5>
                      <div className="text-right shrink-0">
                        <p className="font-black text-slate-900 text-[22px] tabular-nums tracking-tighter leading-none">₱{netTotal.toLocaleString()}</p>
                        {totalDeduction > 0 && (
                          <p className="text-xs font-bold text-slate-300 line-through tabular-nums mt-0.5">₱{(Number(t.basePrice) || 0).toLocaleString()}</p>
                        )}
                      </div>
                    </div>

                    {/* Services */}
                    <div className="flex flex-wrap gap-1.5">
                      {getServiceItems(t).map((srv, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-xl">
                          <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{srv.name}</span>
                          {srv.price !== null && (
                            <span className="text-xs font-bold text-slate-400 tabular-nums">₱{srv.price.toLocaleString()}</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Staff */}
                    {(t.therapistName || t.bonesetterName) && (
                      <div className="flex gap-4 pt-3 border-t border-slate-100">
                        {t.therapistName && (
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Therapist</p>
                            <p className="text-sm font-black text-slate-900 uppercase truncate leading-tight">{t.therapistName}</p>
                            <p className="text-xs font-black text-emerald-600 tabular-nums mt-0.5">₱{therapistComm.toLocaleString()}</p>
                          </div>
                        )}
                        {t.bonesetterName && (
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Bonesetter</p>
                            <p className="text-sm font-black text-slate-900 uppercase truncate leading-tight">{t.bonesetterName}</p>
                            <p className="text-xs font-black text-indigo-600 tabular-nums mt-0.5">₱{bonesetterComm.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer strip: status + ROI */}
                  <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                      <span className={`text-xs font-semibold uppercase tracking-wide ${isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {isPaid ? 'Paid' : 'Pending'}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Net ROI</p>
                      <p className="text-[15px] font-black text-slate-900 tabular-nums tracking-tighter leading-none">₱{netRoi.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="py-20 text-center">
                <p className="text-xs font-black text-slate-300 uppercase tracking-wide">No sessions recorded</p>
              </div>
            )}
          </div>
        </div>
      </div>
  );
};
