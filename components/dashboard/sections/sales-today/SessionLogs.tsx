import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Transaction, Service } from '../../../../types';
import { UI_THEME } from '../../../../constants/ui_designs';

interface SessionLogsProps {
  transactions: Transaction[];
  /** Branch services used for price lookup — avoids a broken DB query */
  services?: Service[];
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const item = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0 }
};

export const SessionLogs: React.FC<SessionLogsProps> = ({ transactions, services = [] }) => {
  // Build a price lookup map from branch services (in-memory, no DB round-trip)
  const serviceMap = useMemo(() => (
    Object.fromEntries(services.map(s => [s.id, s]))
  ), [services]);

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
        <div>
          <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest leading-none">Session Logs</h4>
          <p className="text-[7px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Lists of clients today</p>
        </div>

        <div
            className={`bg-white ${UI_THEME.radius.card} border border-slate-100 shadow-sm overflow-hidden print:overflow-visible`}>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto no-scrollbar print:overflow-visible">
            <table className="w-full text-left text-[12px] min-w-[900px] print:min-w-0">
              <thead>
              <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b bg-slate-50/30">
                <th className="px-8 py-5">Time</th>
                <th className="px-8 py-5">Client</th>
                <th className="px-8 py-5">Service</th>
                <th className="px-8 py-5 text-right">Price</th>
                <th className="px-8 py-5 text-right">Total</th>
                <th className="px-8 py-5">Settlement</th>
                <th className="px-8 py-5">Provider(s)</th>
                <th className="px-8 py-5 text-right">ROI</th>
              </tr>
              </thead>
              <motion.tbody 
                variants={container}
                initial="hidden"
                animate="show"
                className="divide-y divide-slate-100"
              >
              {transactions.length > 0 ? transactions.map(t => {
                const totalDeduction = (Number(t.discount) || 0);
                const therapistComm = Number(t.primaryCommission) || 0;
                const bonesetterComm = Number(t.secondaryCommission) || 0;
                const sessionDeduction = Number(t.deduction) || 0;
                const netTotal = (Number(t.basePrice) - totalDeduction);
                const netRoi = (netTotal - therapistComm - bonesetterComm + sessionDeduction);
                
                const isPaid = t.paymentStatus === 'PAID';

                return (
                    <motion.tr variants={item} key={t.id} className="hover:bg-slate-50/20 transition-colors group">
                      {/* TIME: Standardized to medium slate */}
                      <td className="px-8 py-5 font-medium text-slate-400 uppercase tracking-tighter tabular-nums text-[11px]">
                        {new Intl.DateTimeFormat('en-US', {
                          timeZone: 'Asia/Manila',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        }).format(new Date(t.timestamp))}
                      </td>

                      {/* CLIENT: Standardized to bold slate-900 */}
                      <td className="px-8 py-5 font-bold text-slate-600 text-[11px] uppercase tracking-tight">
                        {t.clientName}
                      </td>

                      {/* SERVICE: with per-service price */}
                      <td className="px-8 py-5 font-bold text-slate-600 uppercase tracking-tight text-[11px] max-w-[240px] break-words leading-tight">
                        <div className="flex flex-col gap-1.5">
                          {getServiceItems(t).map((srv, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-1 h-1 rounded-full bg-slate-300 shrink-0"></div>
                                <span className="truncate">{srv.name}</span>
                              </div>
                              {srv.price !== null && (
                                <span className="text-slate-400 font-semibold tabular-nums shrink-0">₱{srv.price.toLocaleString()}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="px-8 py-5 text-right tabular-nums text-[12px] whitespace-nowrap">
                        <span className="text-slate-900 font-semibold">₱{(Number(t.basePrice) || 0).toLocaleString()}</span>
                        {totalDeduction > 0 && (
                            <span className="text-rose-600 ml-1 text-[10px]">−₱{totalDeduction.toLocaleString()}</span>
                        )}
                      </td>

                      {/* TOTAL: Primary identifier style */}
                      <td className="px-8 py-5 font-bold text-slate-900 text-[13px] text-right tabular-nums tracking-tighter">
                        ₱{netTotal.toLocaleString()}
                      </td>

                      {/* SETTLEMENT: Payment Method and Status */}
                      <td className="px-8 py-5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border leading-none uppercase ${t.paymentMethod === 'GCASH' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                              {t.paymentMethod === 'GCASH' ? '📱 GCash' : '💵 Cash'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${isPaid ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`}>
                              {isPaid ? '● Paid' : '○ Pending'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* PROVIDERS: Standardized font weights and badges */}
                      <td className="px-8 py-5">
                        <div className="flex flex-col gap-1.5">
                          {t.therapistName && t.therapistName.trim() && (
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-md border border-emerald-100 leading-none uppercase shrink-0">T:</span>
                                <span className="text-[11px] px-1.5 py-0.5 leading-none uppercase">₱{therapistComm.toLocaleString()}</span>
                                <span className="font-bold text-slate-600 text-[11px] uppercase tracking-tight truncate max-w-[120px]">{t.therapistName}</span>
                              </div>
                          )}
                          {t.bonesetterName && t.bonesetterName.trim() && (
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md border border-indigo-100 leading-none uppercase shrink-0">B: </span>
                                <span className="text-[11px] px-1.5 py-0.5 leading-none uppercase">₱{bonesetterComm.toLocaleString()}</span>
                                <span className="font-bold text-slate-600 text-[11px] uppercase tracking-tight truncate max-w-[120px]">{t.bonesetterName}</span>
                              </div>
                          )}
                          {sessionDeduction > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-md border border-rose-100 leading-none uppercase shrink-0">D: </span>
                                <span className="text-[11px] px-1.5 py-0.5 leading-none uppercase text-rose-600 font-bold">-₱{sessionDeduction.toLocaleString()}</span>
                              </div>
                          )}
                        </div>
                      </td>

                      {/* NET ROI: */}
                      <td className="px-8 py-5 font-bold text-slate-900 text-base text-right tabular-nums tracking-tighter">
                        ₱{netRoi.toLocaleString()}
                      </td>
                    </motion.tr>
                );
              }) : (
                  <tr>
                    <td colSpan={8} className="py-24 text-center font-bold text-slate-200 uppercase tracking-[0.4em]">
                      No transaction data recorded
                    </td>
                  </tr>
              )}
              </motion.tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4 p-4 bg-slate-100/80">
            {transactions.length > 0 ? transactions.map(t => {
              const totalDeduction = (Number(t.discount) || 0);
              const therapistComm = Number(t.primaryCommission) || 0;
              const bonesetterComm = Number(t.secondaryCommission) || 0;
              const sessionDeduction = Number(t.deduction) || 0;
              const netTotal = (Number(t.basePrice) - totalDeduction);
              const netRoi = (netTotal - therapistComm - bonesetterComm + sessionDeduction);
              const isPaid = t.paymentStatus === 'PAID';

              return (
                <div key={t.id} className="p-5 space-y-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">Session</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">#{t.id.slice(-4).toUpperCase()}</span>
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        {new Intl.DateTimeFormat('en-US', {
                          timeZone: 'Asia/Manila',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        }).format(new Date(t.timestamp))}
                      </p>
                      <h5 className="font-black text-slate-900 uppercase text-[15px] tracking-tight leading-none">{t.clientName}</h5>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-slate-900 text-xl tracking-tightest leading-none mb-1.5">₱{netTotal.toLocaleString()}</p>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border leading-none uppercase ${t.paymentMethod === 'GCASH' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                        {t.paymentMethod === 'GCASH' ? '📱 GCash' : '💵 Cash'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
                    <div className="flex flex-col gap-1.5">
                      {getServiceItems(t).map((srv, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2">
                          <span className="text-[9px] font-black text-slate-600 bg-white px-2 py-1 rounded-lg border border-slate-200 uppercase tracking-tight">
                            {srv.name}
                          </span>
                          {srv.price !== null && (
                            <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">₱{srv.price.toLocaleString()}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 pt-1">
                      {t.therapistName && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Therapist</span>
                          <span className="text-[11px] font-bold text-slate-700 truncate uppercase tracking-tight">{t.therapistName}</span>
                          <span className="text-[9px] font-bold text-emerald-600 tabular-nums">₱{therapistComm.toLocaleString()}</span>
                        </div>
                      )}
                      {t.bonesetterName && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Bonesetter</span>
                          <span className="text-[11px] font-bold text-slate-700 truncate uppercase tracking-tight">{t.bonesetterName}</span>
                          <span className="text-[9px] font-bold text-indigo-600 tabular-nums">₱{bonesetterComm.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {isPaid ? 'Paid' : 'Pending'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Net ROI</span>
                      <span className="text-lg font-black text-slate-900 tracking-tighter leading-none">₱{netRoi.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="py-20 text-center">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">No sessions recorded</p>
              </div>
            )}
          </div>
        </div>
      </div>
  );
};
