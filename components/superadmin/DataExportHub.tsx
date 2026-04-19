import React, { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { playSound, resumeAudioContext } from '../../lib/audio';

interface ExportOptions {
  schema: boolean;
  fullData: boolean;
  storage: boolean;
}

// Manual Encode Function as per guidelines for binary/base64 safety
function manualEncode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// DEFINITIVE SCHEMA MAP ALIGNED TO MAINFRAME DATABASE v5.8
const TABLE_DEFINITIONS: Record<string, { columns: string[], types: Record<string, string>, pk: string }> = {
  attendance: {
    columns: ['id', 'branch_id', 'employee_id', 'staff_name', 'date', 'clock_in', 'clock_out', 'status', 'late_deduction', 'ot_pay', 'cash_advance', 'created_at'],
    types: { late_deduction: 'NUMERIC', ot_pay: 'NUMERIC', cash_advance: 'NUMERIC', clock_in: 'TIMESTAMPTZ', clock_out: 'TIMESTAMPTZ', date: 'TEXT', created_at: 'TIMESTAMPTZ' },
    pk: 'id'
  },
  audit_logs: {
    columns: ['id', 'branch_id', 'timestamp', 'activity_type', 'entity_type', 'entity_id', 'description', 'amount', 'performer_name'],
    types: { id: 'BIGSERIAL', amount: 'NUMERIC', timestamp: 'TIMESTAMPTZ' },
    pk: 'id'
  },
  branches: {
    columns: ['id', 'name', 'pin', 'is_pin_changed', 'is_enabled', 'is_open', 'is_open_date', 'manager', 'temp_manager', 'services', 'weekly_cutoff', 'cycle_start_date', 'daily_provision_amount', 'enable_shift_tracking', 'opening_time', 'closing_time', 'created_at'],
    types: { is_pin_changed: 'BOOLEAN', is_enabled: 'BOOLEAN', is_open: 'BOOLEAN', enable_shift_tracking: 'BOOLEAN', services: 'JSONB', weekly_cutoff: 'TEXT', daily_provision_amount: 'NUMERIC', created_at: 'TIMESTAMPTZ', cycle_start_date: 'TEXT', is_open_date: 'TEXT' },
    pk: 'id'
  },
  employees: {
    columns: ['id', 'branch_id', 'name', 'role', 'allowance', 'is_active', 'profile', 'timestamp', 'created_at', 'username', 'login_pin', 'pin_salt', 'request_reset', 'branch_allowances'],
    types: { allowance: 'NUMERIC', is_active: 'BOOLEAN', request_reset: 'BOOLEAN', timestamp: 'TIMESTAMPTZ', created_at: 'TIMESTAMPTZ', branch_allowances: 'JSONB' },
    pk: 'id'
  },
  expenses: {
    columns: ['id', 'branch_id', 'timestamp', 'name', 'amount', 'category', 'receipt_image'],
    types: { amount: 'NUMERIC', timestamp: 'TIMESTAMPTZ' },
    pk: 'id'
  },
  sales_reports: {
    columns: ['id', 'branch_id', 'report_date', 'submitted_at', 'gross_sales', 'total_staff_pay', 'total_expenses', 'total_vault_provision', 'net_roi', 'session_data', 'staff_breakdown', 'expense_data', 'vault_data'],
    types: { gross_sales: 'NUMERIC', total_staff_pay: 'NUMERIC', total_expenses: 'NUMERIC', total_vault_provision: 'NUMERIC', net_roi: 'NUMERIC', submitted_at: 'TIMESTAMPTZ', session_data: 'JSONB', staff_breakdown: 'JSONB', expense_data: 'JSONB', vault_data: 'JSONB' },
    pk: 'id'
  },
  service_catalogs: {
    columns: ['id', 'name', 'services', 'branch_ids', 'created_at', 'updated_at'],
    types: { services: 'JSONB', branch_ids: 'JSONB', created_at: 'TIMESTAMPTZ', updated_at: 'TIMESTAMPTZ' },
    pk: 'id'
  },
  payroll: {
    columns: ['id', 'branch_id', 'settlement', 'status', 'total_payout', 'staff_summary', 'daily_records', 'metadata', 'created_at'],
    types: { id: 'BIGSERIAL', total_payout: 'NUMERIC', staff_summary: 'JSONB', daily_records: 'JSONB', metadata: 'JSONB', created_at: 'TIMESTAMPTZ' },
    pk: 'id'
  },
  system_config: {
    columns: ['key', 'value', 'updated_at'],
    types: { updated_at: 'TIMESTAMPTZ' },
    pk: 'key'
  },
  transactions: {
    columns: ['id', 'branch_id', 'timestamp', 'client_name', 'therapist_name', 'bonesetter_name', 'service_id', 'service_name', 'base_price', 'discount', 'voucher_value', 'primary_commission', 'secondary_commission', 'total'],
    types: { base_price: 'NUMERIC', discount: 'NUMERIC', voucher_value: 'NUMERIC', primary_commission: 'NUMERIC', secondary_commission: 'NUMERIC', total: 'NUMERIC', timestamp: 'TIMESTAMPTZ' },
    pk: 'id'
  }
};

export const DataExportHub: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [targetEmail, setTargetEmail] = useState<string>('');
  const [options, setOptions] = useState<ExportOptions>({
    schema: true,
    fullData: true,
    storage: true
  });

  const isEmailValid = useMemo(() => {
    if (!targetEmail) return false;
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(targetEmail);
  }, [targetEmail]);

  const coreTables = Object.keys(TABLE_DEFINITIONS);

  const toggleOption = (key: keyof ExportOptions) => {
    resumeAudioContext();
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const escapeSqlValue = (val: any) => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    return `'${String(val).replace(/'/g, "''")}'`;
  };

  const compileSqlContent = async (): Promise<string> => {
    setProgress('Initializing Archive...');
    let sqlContent = `-- HILOT CENTER CORE - FULL SYSTEM SNAPSHOT\n`;
    sqlContent += `-- Generated: ${new Date().toISOString()}\n\n`;
    sqlContent += `SET statement_timeout = 0;\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\n\n`;

    if (options.storage) {
      setProgress('Configuring Storage Layers...');
      sqlContent += `-- STORAGE ARCHITECTURE --\n`;
      const buckets = ['profiles', 'receipts'];
      buckets.forEach(bucket => {
        sqlContent += `INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket}', '${bucket}', true) ON CONFLICT (id) DO NOTHING;\n`;
        sqlContent += `DROP POLICY IF EXISTS "Allow anon all on ${bucket}" ON storage.objects;\n`;
        sqlContent += `CREATE POLICY "Allow anon all on ${bucket}" ON storage.objects FOR ALL TO anon USING (bucket_id = '${bucket}') WITH CHECK (bucket_id = '${bucket}');\n\n`;
      });
    }

    if (options.schema) {
      setProgress('Generating Table Schemas...');
      sqlContent += `-- DATABASE REGISTRY SCHEMA --\n\n`;
      for (const table of coreTables) {
        const def = TABLE_DEFINITIONS[table];
        sqlContent += `DROP TABLE IF EXISTS public."${table}" CASCADE;\n`;
        sqlContent += `CREATE TABLE public."${table}" (\n`;
        
        const colDefs = def.columns.map(c => {
          const type = def.types[c] || 'TEXT';
          const pk = (c === def.pk) ? ' PRIMARY KEY' : '';
          return `    "${c}" ${type}${pk}`;
        });
        
        sqlContent += colDefs.join(',\n') + `\n);\n`;
        sqlContent += `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;\n`;
        sqlContent += `DROP POLICY IF EXISTS "Enable all for anon" ON public."${table}";\n`;
        sqlContent += `CREATE POLICY "Enable all for anon" ON public."${table}" FOR ALL TO anon USING (true) WITH CHECK (true);\n\n`;
      }
    }

    if (options.fullData) {
      sqlContent += `-- SYSTEM REGISTRY DATA STREAM --\n\n`;
      for (const tableName of coreTables) {
        setProgress(`Extracting: ${tableName.toUpperCase()}...`);
        const { data, error } = await supabase.from(tableName).select('*');
        if (error || !data || data.length === 0) continue;
        
        const def = TABLE_DEFINITIONS[tableName];
        const validColumns = Object.keys(data[0]).filter(col => def.columns.includes(col));
        const chunkSize = 100;
        
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          const values = chunk.map(row => `(${validColumns.map(col => escapeSqlValue(row[col])).join(', ')})`).join(',\n');
          sqlContent += `INSERT INTO public."${tableName}" (${validColumns.map(c => `"${c}"`).join(', ')}) VALUES\n${values}\nON CONFLICT ("${def.pk}") DO NOTHING;\n\n`;
        }
      }
    }

    setProgress('Finalizing Archive Bundle...');
    return sqlContent;
  };

  const handleDownload = async () => {
    resumeAudioContext();
    setIsExporting(true);
    try {
      const sqlContent = await compileSqlContent();
      const blob = new Blob([sqlContent], { type: 'text/sql' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hilot_core_full_backup_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setProgress('Archive Exported Successfully');
      playSound('success');
      setTimeout(() => setProgress(''), 4000);
    } catch (err) {
      setProgress('Export Protocol Interrupted');
      playSound('warning');
    } finally {
      setIsExporting(false);
    }
  };

  const handleEmailTransmit = async () => {
    resumeAudioContext();
    if (!targetEmail.trim() || !isEmailValid) {
      setProgress('Valid Destination Required');
      playSound('warning');
      return;
    }
    setIsTransmitting(true);
    try {
      const sqlContent = await compileSqlContent();
      setProgress('Preparing Secure Data Relay...');
      
      // UTF-8 SAFE ENCODING:
      // Convert string to bytes, then bytes to binary string, then binary string to Base64.
      // This bypasses the "outside Latin1 range" error for characters like ₱.
      const encoder = new TextEncoder();
      const bytes = encoder.encode(sqlContent);
      const base64Sql = manualEncode(bytes);

      setProgress('Relaying Securely to Cloud...');
      const { error } = await supabase.functions.invoke('send-export-email', {
        body: {
          to: targetEmail,
          subject: `HILOT CORE SYSTEM BACKUP - ${new Date().toLocaleString()}`,
          sql: base64Sql,
          isBase64: true, // Signal to function that content needs decoding
          fileName: `core_backup_${Date.now()}.sql`
        }
      });
      if (error) throw error;
      setProgress('System Archive Dispatched');
      playSound('success');
    } catch (err) {
      setProgress('Relay Protocol Fault');
      playSound('warning');
    } finally {
      setIsTransmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-700 space-y-8 relative px-2">
      {(isExporting || isTransmitting) && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-2xl flex flex-col items-center justify-center p-10">
           <div className="w-24 h-24 relative mb-10">
              <div className="absolute inset-0 rounded-[32px] border-4 border-emerald-500/20"></div>
              <div className="absolute inset-0 rounded-[32px] border-4 border-t-emerald-500 animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-3xl">💾</div>
           </div>
           <div className="text-center space-y-4">
              <h4 className="text-2xl font-bold text-white uppercase tracking-tighter">Archiving Mainframe</h4>
              <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl inline-flex items-center gap-3">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></div>
                 <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{progress}</span>
              </div>
           </div>
        </div>
      )}

      <div className="bg-white p-6 sm:p-8 md:p-12 rounded-[32px] sm:rounded-[56px] border border-slate-100 shadow-sm space-y-8 sm:space-y-10">
        <div className="text-center space-y-2">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tighter">Network Migration Hub</h3>
          <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Global Registry Synchronization & Export</p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:gap-3">
          <button 
            disabled={isExporting}
            onClick={() => toggleOption('schema')}
            className={`flex items-center justify-between p-4 sm:p-6 rounded-[20px] sm:rounded-[28px] border-2 transition-all group ${options.schema ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-100 bg-slate-50'}`}
          >
            <div className="flex items-center gap-4 sm:gap-5">
               <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-inner transition-all ${options.schema ? 'bg-emerald-600 text-white' : 'bg-white text-slate-300'}`}>🏗️</div>
               <div className="text-left">
                  <p className="font-bold text-slate-900 uppercase text-[10px] sm:text-xs tracking-widest">Database Blueprints</p>
                  <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Full Table Schema & RLS Policies</p>
               </div>
            </div>
            {options.schema && <svg className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 animate-in zoom-in" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
          </button>

          <button 
            disabled={isExporting}
            onClick={() => toggleOption('storage')}
            className={`flex items-center justify-between p-4 sm:p-6 rounded-[20px] sm:rounded-[28px] border-2 transition-all group ${options.storage ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-100 bg-slate-50'}`}
          >
            <div className="flex items-center gap-4 sm:gap-5">
               <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-inner transition-all ${options.storage ? 'bg-indigo-600 text-white' : 'bg-white text-slate-300'}`}>☁️</div>
               <div className="text-left">
                  <p className="font-bold text-slate-900 uppercase text-[10px] sm:text-xs tracking-widest">Storage Assets</p>
                  <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Buckets & Object Access Policies</p>
               </div>
            </div>
            {options.storage && <svg className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 animate-in zoom-in" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
          </button>

          <button 
            disabled={isExporting}
            onClick={() => toggleOption('fullData')}
            className={`flex items-center justify-between p-4 sm:p-6 rounded-[20px] sm:rounded-[28px] border-2 transition-all group ${options.fullData ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-100 bg-slate-50'}`}
          >
            <div className="flex items-center gap-4 sm:gap-5">
               <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-inner transition-all ${options.fullData ? 'bg-emerald-600 text-white' : 'bg-white text-slate-300'}`}>🌌</div>
               <div className="text-left">
                  <p className="font-bold text-slate-900 uppercase text-[10px] sm:text-xs tracking-widest">Registry Data Stream</p>
                  <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Snapshot of All Historical Tables</p>
               </div>
            </div>
            {options.fullData && <svg className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 animate-in zoom-in" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
          </button>
        </div>

        <div className="pt-4 sm:pt-6 border-t border-slate-100 space-y-3 sm:space-y-4">
           <div className="flex items-center justify-between px-1">
              <h4 className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dispatch Target</h4>
              <button onClick={() => setTargetEmail('bobongplayer1921@gmail.com')} className="text-[8px] sm:text-[9px] font-bold text-emerald-600 uppercase hover:text-emerald-700 transition-colors">Fill Admin Relay</button>
           </div>
           <input 
              value={targetEmail}
              onChange={e => setTargetEmail(e.target.value.toLowerCase())}
              placeholder="DESTINATION_ADDRESS@GMAIL.COM"
              className="w-full px-5 sm:px-6 py-4 sm:py-5 bg-slate-50 border-2 border-transparent rounded-[18px] sm:rounded-[24px] font-bold text-[11px] sm:text-sm uppercase outline-none focus:border-emerald-500 transition-all shadow-inner placeholder:text-slate-300"
           />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
           <button onClick={handleDownload} className="py-4 sm:py-6 border-2 border-slate-200 rounded-[18px] sm:rounded-[28px] font-bold uppercase text-[10px] sm:text-[11px] tracking-widest hover:bg-slate-50 transition-all active:scale-[0.98]">Download Script</button>
           <button onClick={handleEmailTransmit} className="py-4 sm:py-6 bg-slate-950 text-white rounded-[18px] sm:rounded-[28px] font-bold uppercase text-[10px] sm:text-[11px] tracking-widest shadow-xl hover:bg-emerald-700 transition-all active:scale-[0.98]">Relay Archive</button>
        </div>
      </div>
    </div>
  );
};
