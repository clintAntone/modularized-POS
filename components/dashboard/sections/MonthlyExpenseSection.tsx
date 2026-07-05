
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Branch, Expense, SalesReport } from '../../../types';
import { DB_TABLES, DB_COLUMNS } from '../../../constants/db_schema';
import { supabase } from '../../../lib/supabase';
import { playSound } from '../../../lib/audio';
import { compressImage } from '../../../lib/image';
import { UI_THEME } from '../../../constants/ui_designs';
import { logAudit } from '../../../lib/audit';
import { getManilaYear, getManilaMonth } from '../../../lib/time';

// Modular Vault Components
import { VaultBalanceHero } from './vault/VaultBalanceHero';
import { VaultWithdrawalForm } from './vault/VaultWithdrawalForm';
import { VaultActivityLog } from './vault/VaultActivityLog';

interface MonthlyExpenseSectionProps {
  user?: any;
  branch: Branch;
  expenses: Expense[];
  salesReports: SalesReport[];
  isClosedMode?: boolean;
  onRefresh?: () => void;
  onSyncStatusChange?: (isSyncing: boolean) => void;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

export const MonthlyExpenseSection: React.FC<MonthlyExpenseSectionProps> = ({ user, branch, expenses, salesReports, isClosedMode = false, onRefresh, onSyncStatusChange }) => {
  const [formData, setFormData] = useState({ name: '', amount: 0 });
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [movementToDelete, setMovementToDelete] = useState<Expense | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(getManilaYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>((getManilaMonth() + 1).toString().padStart(2, '0'));
  const [searchTerm, setSearchTerm] = useState('');
  
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const now = getManilaYear();
    years.add(now);
    (salesReports || []).forEach(r => {
      const d = new Date(r.reportDate);
      if (!isNaN(d.getTime())) years.add(d.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [salesReports]);

  const months = useMemo(() => [
    { val: '01', label: 'January' }, { val: '02', label: 'February' }, { val: '03', label: 'March' },
    { val: '04', label: 'April' }, { val: '05', label: 'May' }, { val: '06', label: 'June' },
    { val: '07', label: 'July' }, { val: '08', label: 'August' }, { val: '09', label: 'September' },
    { val: '10', label: 'October' }, { val: '11', label: 'November' }, { val: '12', label: 'December' }
  ], []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const { allVaultMovements, reserveBalance, depositCount, payoutCount, carryOverBalance, currentPeriodMovements } = useMemo(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    
    const historicalReports = salesReports.filter(r => r.branchId === branch.id && r.reportDate !== today);
    const historicalItems: Expense[] = historicalReports.flatMap(r => r.vaultData || []);

    const liveVault = expenses.filter(e => 
      e.branchId === branch.id && 
      e.timestamp.startsWith(today) &&
      (e.category === 'PROVISION' || e.category === 'SETTLEMENT')
    );

    const uniqueLive = liveVault.map(l => ({ ...l, isDeletable: l.category === 'SETTLEMENT' } as any));
    
    // Deduplicate by ID to prevent React key warnings
    const movementMap = new Map<string, any>();
    [...uniqueLive, ...historicalItems].forEach(item => {
      if (!movementMap.has(item.id)) {
        movementMap.set(item.id, item);
      }
    });

    const finalItems = Array.from(movementMap.values()).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    const currentPeriodMovements = finalItems.filter(e => {
      const d = new Date(e.timestamp);
      const rYear = d.getFullYear().toString();
      const rMonth = (d.getMonth() + 1).toString().padStart(2, '0');
      const matchesDate = rYear === selectedYear && rMonth === selectedMonth;
      
      if (!matchesDate) return false;
      
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        return e.name.toLowerCase().includes(term);
      }
      
      return true;
    });

    const carryOverMovements = finalItems.filter(e => {
      const d = new Date(e.timestamp);
      const rYear = d.getFullYear().toString();
      const rMonth = (d.getMonth() + 1).toString().padStart(2, '0');
      
      if (rYear < selectedYear) return true;
      if (rYear === selectedYear && rMonth < selectedMonth) return true;
      return false;
    });

    const carryOverBalance = carryOverMovements.reduce((acc, e) => {
      if (e.category === 'PROVISION') return acc + (Number(e.amount) || 0);
      if (e.category === 'SETTLEMENT') return acc - (Number(e.amount) || 0);
      return acc;
    }, 0);

    let deposits = 0;
    let payouts = 0;
    const balance = finalItems.reduce((acc, e) => {
      if (e.category === 'PROVISION') {
        deposits++;
        return acc + (Number(e.amount) || 0);
      }
      if (e.category === 'SETTLEMENT') {
        payouts++;
        return acc - (Number(e.amount) || 0);
      }
      return acc;
    }, 0);

    return { 
      allVaultMovements: finalItems, 
      currentPeriodMovements,
      reserveBalance: balance,
      carryOverBalance,
      depositCount: deposits,
      payoutCount: payouts
    };
  }, [expenses, salesReports, branch.id, selectedYear, selectedMonth]);

  const handleExecutePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !file || isUploading || isClosedMode) {
      playSound('warning');
      showToast(isClosedMode ? 'Terminal Suspended' : 'Receipt & Amount Required', 'error');
      return;
    }

    if (formData.amount > reserveBalance) {
      playSound('warning');
      showToast('Insufficient Reserve Balance', 'error');
      return;
    }

    setIsUploading(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    setUploadProgress(10);
    let receiptUrl = '';
    
    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
    const timePart = now.toTimeString().split(' ')[0];
    const manilaTimestamp = `${today}T${timePart}.000+08:00`;
    
    const expenseId = Math.random().toString(36).substr(2, 9);
    const performer = user?.username || branch.manager || 'BRANCH MANAGER';

    try {
      setUploadProgress(30);
      const compressedBlob = await compressImage(file);
      setUploadProgress(50);

      const filePath = `${branch.id}/vault/${Date.now()}_settlement.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
      
      if (uploadError) throw uploadError;
      setUploadProgress(70);

      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filePath);
      receiptUrl = urlData.publicUrl;

      const { error: dbError } = await supabase.from(DB_TABLES.EXPENSES).insert({
        [DB_COLUMNS.ID]: expenseId,
        [DB_COLUMNS.BRANCH_ID]: branch.id,
        [DB_COLUMNS.TIMESTAMP]: manilaTimestamp,
        [DB_COLUMNS.NAME]: formData.name.trim().toUpperCase(),
        [DB_COLUMNS.AMOUNT]: Number(formData.amount),
        [DB_COLUMNS.CATEGORY]: 'SETTLEMENT',
        [DB_COLUMNS.RECEIPT_IMAGE]: receiptUrl
      });
      if (dbError) throw dbError;
      setUploadProgress(90);

      await logAudit({
        branchId: branch.id,
        activityType: 'CREATE',
        entityType: 'EXPENSE',
        entityId: expenseId,
        description: `Vault Settlement: ${formData.name.toUpperCase()}`,
        amount: Number(formData.amount),
        performerName: performer
      });

      playSound('success');
      setFormData({ name: '', amount: 0 });
      setFile(null);
      showToast('Settlement Recorded Successfully');
      onRefresh?.();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Vault Access Fault', 'error');
      playSound('warning');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleTriggerScrub = (id: string) => {
    const target = allVaultMovements.find(m => m.id === id);
    if (target) {
      playSound('warning');
      setMovementToDelete(target);
    }
  };

  const handleFinalDeleteVaultMovement = async () => {
    if (!movementToDelete || isUploading || isClosedMode) return;
    const target = movementToDelete;

    setIsUploading(true);
    if (onSyncStatusChange) onSyncStatusChange(true);
    
    try {
      const { error } = await supabase.from(DB_TABLES.EXPENSES).delete().eq(DB_COLUMNS.ID, target.id);
      if (error) throw error;

      await logAudit({
        branchId: branch.id,
        activityType: 'DELETE',
        entityType: 'EXPENSE',
        entityId: target.id,
        description: `Authorized Vault scrub of accidental ${target.category.toLowerCase()}: ${target.name} (₱${target.amount})`,
        amount: target.amount,
        performerName: user?.username || branch.manager || 'AUTHORIZED TERMINAL MANAGER'
      });

      showToast('Record Scrubbed Successfully');
      setMovementToDelete(null);
      onRefresh?.();
    } catch (err) {
      showToast('Scrub Protocol Failed', 'error');
    } finally {
      setIsUploading(false);
      if (onSyncStatusChange) onSyncStatusChange(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const doc = new jsPDF();
      const monthLabel = months.find(m => m.val === selectedMonth)?.label || '';
      
      doc.setFontSize(20);
      doc.text(`${branch.name.replace('BRANCH - ', '')}`, 14, 22);
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Monthly Bills Registry: ${monthLabel} ${selectedYear}`, 14, 30);
      
      const tableData = currentPeriodMovements.map(m => [
        new Date(m.timestamp).toLocaleDateString(),
        m.name,
        m.category,
        `P${Number(m.amount).toLocaleString()}`
      ]);
      
      autoTable(doc, {
        startY: 40,
        head: [['Date', 'Description', 'Category', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });
      
      doc.save(`${branch.name}_Bills_${monthLabel}_${selectedYear}.pdf`);
      playSound('success');
    } catch (err) {
      console.error('PDF Export Failed:', err);
      showToast('PDF Export Failed', 'error');
    }
  };

  return (
    <div className="w-full mx-auto pb-20 space-y-8">
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top-6 duration-300 font-bold text-xs uppercase tracking-[0.1em] bg-slate-900 text-white border border-white/10 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></div>
          {toast.message}
        </div>
      )}

      {/* HEADER SECTION */}
      <div className={`bg-white p-4 sm:p-6 md:p-8 ${UI_THEME.radius.card} shadow-sm border border-slate-100 flex flex-col gap-4 sm:gap-6 md:gap-8`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
            <div className="w-10 h-10 sm:w-14 sm:h-14 bg-slate-900 text-white rounded-2xl sm:rounded-3xl flex items-center justify-center text-xl sm:text-2xl shadow-xl border border-white/5 shrink-0">🏢</div>
            <div className="space-y-0.5 sm:space-y-1 overflow-hidden">
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none truncate">{branch.name.replace('BRANCH - ', '')}</h2>
              <p className="text-xs sm:text-xs font-bold text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.4em] truncate">Monthly Bills Registry</p>
            </div>
          </div>

          <button
            onClick={() => handleExportPDF()}
            className="h-10 sm:h-14 px-4 sm:px-10 bg-emerald-600 text-white rounded-xl sm:rounded-[24px] font-bold text-xs sm:text-xs uppercase tracking-widest shadow-xl hover:bg-emerald-700 transition-all active:scale-95 shrink-0 whitespace-nowrap flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            <span className="hidden sm:inline">Export PDF</span>
          </button>
        </div>

        <div className="relative group">
          <input 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search billing records..."
            className="w-full pl-10 sm:pl-14 pr-4 sm:pr-6 py-3 sm:py-5 bg-slate-50 border-2 border-transparent rounded-xl sm:rounded-[24px] font-bold text-xs sm:text-xs uppercase tracking-widest outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner placeholder:text-slate-300"
          />
          <div className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors">
            <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: BALANCE & FORM */}
          <div className="md:col-span-5 space-y-8">
            <VaultBalanceHero 
              balance={reserveBalance}
              depositCount={depositCount}
              payoutCount={payoutCount}
            />

            <VaultWithdrawalForm
                formData={formData}
                setFormData={setFormData}
                file={file}
                setFile={setFile}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                onSubmit={handleExecutePayout}
                isClosedMode={isClosedMode}
                balance={reserveBalance}
            />

            {/* Quick Summary of Period */}
            <div className={`bg-slate-50 border border-slate-200 ${UI_THEME.radius.card} p-6 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-indigo-400 uppercase tracking-[0.2em]">Carry-over</p>
                  <p className={`text-lg font-black tabular-nums tracking-tighter leading-none ${carryOverBalance >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                    ₱{carryOverBalance.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Period Movements</p>
                <p className="text-2xl font-black text-slate-900">{currentPeriodMovements.length}</p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: ACTIVITY LOG / TABLE */}
          <div className="md:col-span-7 space-y-4">
            <div className="flex items-center justify-between px-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Settlement Activity</h3>
              <div className="flex items-center gap-4">
                <select 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-400 uppercase outline-none cursor-pointer hover:text-slate-900 transition-colors"
                >
                  {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                </select>
                <select 
                  value={selectedYear} 
                  onChange={e => setSelectedYear(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-400 uppercase outline-none cursor-pointer hover:text-slate-900 transition-colors"
                >
                  {availableYears.map(y => <option key={y} value={y.toString()}>{y}</option>)}
                </select>
              </div>
            </div>
            <VaultActivityLog 
              movements={currentPeriodMovements}
              onView={setSelectedExpense}
              onDelete={handleTriggerScrub}
            />
          </div>
        </div>

      {/* VIEW MODAL */}
      {selectedExpense && (
        <div className={UI_THEME.layout.modalWrapper} onClick={() => setSelectedExpense(null)}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-8 space-y-6 animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedExpense.name}</h4>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedExpense.category} • {new Date(selectedExpense.timestamp).toLocaleDateString()}</p>
              </div>
              <p className={`text-2xl font-black tabular-nums ${selectedExpense.category === 'SETTLEMENT' ? 'text-rose-600' : 'text-emerald-600'}`}>
                ₱{selectedExpense.amount.toLocaleString()}
              </p>
            </div>
            
            {selectedExpense.receiptImage ? (
              <div className="aspect-square bg-slate-50 rounded-3xl overflow-hidden border border-slate-100 shadow-inner">
                <img src={selectedExpense.receiptImage} alt="Receipt" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <div className="aspect-square bg-slate-50 rounded-3xl flex flex-col items-center justify-center text-slate-200 border border-slate-100 border-dashed">
                <svg className="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002-2z" /></svg>
                <p className="text-xs font-bold uppercase tracking-widest">No Proof Attached</p>
              </div>
            )}
            
            <button onClick={() => setSelectedExpense(null)} className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">Close View</button>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {movementToDelete && (
        <div className={UI_THEME.layout.modalWrapper}>
          <div className={`${UI_THEME.layout.modalStandard} ${UI_THEME.radius.modal} p-10 text-center border border-slate-100 shadow-2xl`}>
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </div>
            <h4 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tighter">Scrub Vault Entry?</h4>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
              This will permanently remove the record for <span className="text-slate-900">{movementToDelete.name}</span>.
            </p>
            <div className="flex flex-col gap-3 mt-10">
              <button
                onClick={handleFinalDeleteVaultMovement}
                disabled={isUploading}
                className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {isUploading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Confirm Scrub'}
              </button>
              <button onClick={() => setMovementToDelete(null)} className="w-full text-slate-400 font-bold py-4 rounded-xl text-xs uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
