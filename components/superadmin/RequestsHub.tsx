
import React, { useState, useMemo } from 'react';
import { Request, Employee, Branch, Transaction, Attendance, SalesReport } from '../../types';
import { UI_THEME } from '../../constants/ui_designs';
import { supabase } from '../../lib/supabase';
import { DB_TABLES, DB_COLUMNS } from '../../constants/db_schema';
import { playSound } from '../../lib/audio';
import { formatManilaDate, formatManilaTime } from '../../lib/time';

interface RequestsHubProps {
  requests: Request[];
  employees: Employee[];
  branches: Branch[];
  salesReports: SalesReport[];
  onRefresh?: () => void;
}

export const RequestsHub: React.FC<RequestsHubProps> = ({ requests, employees, branches, salesReports = [], onRefresh }) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');

  const filteredRequests = useMemo(() => {
    if (filter === 'ALL') return requests;
    return requests.filter(r => r.status === filter);
  }, [requests, filter]);

  const handleAction = async (request: Request, action: 'APPROVE' | 'REJECT') => {
    if (action === 'APPROVE' && request.type === 'BACKFILL_REPORT') {
      const conflict = salesReports.find(r => r.branchId === request.branchId && r.reportDate === request.data.reportDate);
      if (conflict) {
        const confirmOverride = window.confirm(`CONFLICT DETECTED: A sales report already exists for ${request.data.reportDate}. Approving this request will OVERWRITE the existing report. Do you want to proceed?`);
        if (!confirmOverride) return;
      }
    }

    setIsProcessing(request.id);
    try {
      if (action === 'APPROVE') {
        // Execute the actual data change based on request type
        if (request.type === 'BACKFILL_TRANSACTION') {
          const { error: txError } = await supabase.from(DB_TABLES.TRANSACTIONS).insert(request.data);
          if (txError) throw txError;
        } else if (request.type === 'BACKFILL_ATTENDANCE') {
          const { error: attError } = await supabase.from(DB_TABLES.ATTENDANCE).insert(request.data);
          if (attError) throw attError;
        } else if (request.type === 'BACKFILL_REPORT') {
          const { grossSales, totalExpenses, totalVaultProvision, staffBreakdown, reportDate } = request.data;
          
          const totalStaffPay = staffBreakdown.reduce((sum: number, s: any) => 
            sum + (s.salary || 0) + (s.commission || 0) + (s.otPay || 0) + (s.allowance || 0) - (s.lateDeduction || 0)
          , 0);

          const netRoi = grossSales - totalExpenses - totalVaultProvision - totalStaffPay;

          const reportId = `${request.branchId}_${reportDate.replace(/-/g, '')}`;
          const existingReport = salesReports.find(r => r.branchId === request.branchId && r.reportDate === reportDate);

          const payload = {
            [DB_COLUMNS.ID]: reportId,
            [DB_COLUMNS.BRANCH_ID]: request.branchId,
            [DB_COLUMNS.REPORT_DATE]: reportDate,
            [DB_COLUMNS.SUBMITTED_AT]: new Date().toISOString(),
            [DB_COLUMNS.GROSS_SALES]: grossSales,
            [DB_COLUMNS.TOTAL_STAFF_PAY]: totalStaffPay,
            [DB_COLUMNS.TOTAL_EXPENSES]: totalExpenses,
            [DB_COLUMNS.TOTAL_VAULT_PROVISION]: totalVaultProvision,
            [DB_COLUMNS.NET_ROI]: netRoi,
            [DB_COLUMNS.STAFF_BREAKDOWN]: staffBreakdown,
            [DB_COLUMNS.SESSION_DATA]: existingReport?.sessionData || [],
            [DB_COLUMNS.EXPENSE_DATA]: existingReport?.expenseData || [],
            [DB_COLUMNS.VAULT_DATA]: existingReport?.vaultData || [],
            [DB_COLUMNS.IS_VALIDATED]: existingReport?.isValidated || false
          };

          const { error: reportError } = await supabase.from(DB_TABLES.SALES_REPORTS).upsert(payload);
          if (reportError) throw reportError;
        } else if (request.type === 'PASSWORD_RESET') {
          const { error: empError } = await supabase
            .from(DB_TABLES.EMPLOYEES)
            .update({ 
              [DB_COLUMNS.REQUEST_RESET]: true,
              [DB_COLUMNS.RESET_APPROVED]: true 
            })
            .eq(DB_COLUMNS.ID, request.data.employeeId);
          if (empError) throw empError;
        }

        await supabase.from(DB_TABLES.REQUESTS).update({
          [DB_COLUMNS.STATUS]: 'APPROVED',
          [DB_COLUMNS.REVIEWED_BY]: 'SUPERADMIN',
          [DB_COLUMNS.UPDATED_AT]: new Date().toISOString()
        }).eq(DB_COLUMNS.ID, request.id);

        playSound('success');
      } else {
        if (request.type === 'PASSWORD_RESET') {
            await supabase
              .from(DB_TABLES.EMPLOYEES)
              .update({ 
                [DB_COLUMNS.REQUEST_RESET]: false,
                [DB_COLUMNS.RESET_APPROVED]: false 
              })
              .eq(DB_COLUMNS.ID, request.data.employeeId);
        }

        await supabase.from(DB_TABLES.REQUESTS).update({
          [DB_COLUMNS.STATUS]: 'REJECTED',
          [DB_COLUMNS.REVIEWED_BY]: 'SUPERADMIN',
          [DB_COLUMNS.UPDATED_AT]: new Date().toISOString()
        }).eq(DB_COLUMNS.ID, request.id);

        playSound('warning');
      }
      onRefresh?.();
    } catch (err) {
      console.error(err);
      alert('Action failed. Check connection.');
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className={UI_THEME.text.title}>Approval Workflows</h2>
          <p className={UI_THEME.text.metadata}>Manage pending backfills and security requests</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-[32px] p-20 text-center border border-dashed border-slate-200">
            <div className="text-4xl mb-4 opacity-20">📥</div>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">No requests found in this queue</p>
          </div>
        ) : (
          filteredRequests.map(request => {
            const branch = branches.find(b => b.id === request.branchId);
            const hasConflict = request.type === 'BACKFILL_REPORT' && salesReports.some(r => r.branchId === request.branchId && r.reportDate === request.data.reportDate);

            return (
              <div key={request.id} className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col md:flex-row gap-6 items-start md:items-center">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                  request.type === 'PASSWORD_RESET' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'
                }`}>
                  {request.type === 'PASSWORD_RESET' ? '🔑' : '📝'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{request.type.replace('_', ' ')}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                      request.status === 'PENDING' ? 'bg-amber-50 text-amber-600' :
                      request.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' :
                      'bg-rose-50 text-rose-600'
                    }`}>
                      {request.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase truncate">{branch?.name || 'Unknown Branch'}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Requested by {request.requesterName} • {formatManilaDate(new Date(request.timestamp))} {formatManilaTime(new Date(request.timestamp))}
                  </p>
                  
                  <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    {hasConflict && (
                      <div className="mb-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 animate-pulse">
                        <span className="text-xl">⚠️</span>
                        <div>
                          <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Conflict Detected</p>
                          <p className="text-[9px] font-bold text-rose-400 uppercase tracking-tight">A report already exists for this date. Approving will override it.</p>
                        </div>
                      </div>
                    )}
                    {request.type === 'BACKFILL_REPORT' ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white p-4 rounded-2xl border border-slate-100">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross Sales</p>
                            <p className="text-sm font-black text-slate-900">₱{(request.data.grossSales || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-100">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Expenses</p>
                            <p className="text-sm font-black text-slate-900 text-rose-600">₱{(request.data.totalExpenses || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-100">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Rent/Bills</p>
                            <p className="text-sm font-black text-slate-900 text-indigo-600">₱{(request.data.totalVaultProvision || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-slate-900 p-4 rounded-2xl border border-white/5">
                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Projected ROI</p>
                            <p className="text-sm font-black text-emerald-400">
                              ₱{(
                                (request.data.grossSales || 0) - 
                                (request.data.totalExpenses || 0) - 
                                (request.data.totalVaultProvision || 0) - 
                                (request.data.staffBreakdown?.reduce((s: number, p: any) => s + (p.salary || 0) + (p.commission || 0) + (p.otPay || 0) + (p.allowance || 0) - (p.lateDeduction || 0), 0) || 0)
                              ).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <p className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Staff Payroll Breakdown</p>
                            <div className="h-px flex-1 bg-slate-200"></div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {request.data.staffBreakdown?.map((s: any) => {
                                const total = (s.salary || 0) + (s.commission || 0) + (s.otPay || 0) + (s.allowance || 0) - (s.lateDeduction || 0);
                                return (
                                    <div key={s.employeeId} className="flex justify-between items-center text-[10px] font-bold text-slate-600 bg-white p-3 rounded-xl border border-slate-100">
                                        <div className="flex flex-col">
                                            <span className="text-slate-900 uppercase">{s.name}</span>
                                            <span className="text-[8px] text-slate-400 uppercase tracking-tighter">
                                                S: {s.salary} | C: {s.commission} | OT: {s.otPay} | A: {s.allowance} | L: -{s.lateDeduction}
                                            </span>
                                        </div>
                                        <span className="font-black text-slate-900">₱{total.toLocaleString()}</span>
                                    </div>
                                );
                            })}
                          </div>
                        </div>

                        {request.data.notes && (
                          <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100/50">
                            <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">Manager's Justification</p>
                            <p className="text-[11px] text-slate-700 font-medium italic leading-relaxed">"{request.data.notes}"</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <pre className="text-[9px] font-mono text-slate-600 whitespace-pre-wrap">
                        {JSON.stringify(request.data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>

                {request.status === 'PENDING' && (
                  <div className="flex gap-2 w-full md:w-auto">
                    <button
                      onClick={() => handleAction(request, 'REJECT')}
                      disabled={!!isProcessing}
                      className="flex-1 md:flex-none px-6 py-3 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleAction(request, 'APPROVE')}
                      disabled={!!isProcessing}
                      className="flex-1 md:flex-none px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isProcessing === request.id ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Approve'}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
