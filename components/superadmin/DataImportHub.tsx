
import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { playSound, resumeAudioContext } from '../../lib/audio';

interface ImportSummary {
  tableName: string;
  count: number;
  data: any[];
  conflictTarget: string;
}

export const DataImportHub: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary[]>([]);
  const [status, setStatus] = useState<string>('');
  const [syncProgress, setSyncProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseSqlContent = (sql: string): ImportSummary[] => {
    const results: ImportSummary[] = [];
    const tableRegex = /INSERT INTO public\."([^"]+)" \(([^)]+)\) VALUES\n([\s\S]+?);/g;
    let match;

    while ((match = tableRegex.exec(sql)) !== null) {
      const tableName = match[1];
      const columns = match[2].split(',').map(c => c.trim().replace(/"/g, ''));
      const rawValuesWithConflict = match[3];
      const rawValues = rawValuesWithConflict.split(/ON CONFLICT/i)[0].trim();
      
      const rowsRaw = rawValues.split(/\)\s*,\s*\n?\s*\(/);
      const parsedData = rowsRaw.map(row => {
        let cleanRow = row.trim();
        if (cleanRow.startsWith('(')) cleanRow = cleanRow.substring(1);
        if (cleanRow.endsWith(')')) cleanRow = cleanRow.substring(0, cleanRow.length - 1);

        const values: any[] = [];
        let currentPos = 0;
        while (currentPos < cleanRow.length) {
          if (cleanRow[currentPos] === ' ' || cleanRow[currentPos] === ',') {
            currentPos++;
            continue;
          }
          if (cleanRow[currentPos] === "'") {
            let endPos = currentPos + 1;
            while (endPos < cleanRow.length) {
              if (cleanRow[endPos] === "'" && cleanRow[endPos + 1] === "'") { endPos += 2; continue; }
              if (cleanRow[endPos] === "'") break;
              endPos++;
            }
            values.push(cleanRow.substring(currentPos + 1, endPos).replace(/''/g, "'"));
            currentPos = endPos + 1;
          } else {
            let endPos = currentPos;
            while (endPos < cleanRow.length && cleanRow[endPos] !== ',' && cleanRow[endPos] !== ' ') endPos++;
            const val = cleanRow.substring(currentPos, endPos).trim();
            if (val === 'NULL') values.push(null);
            else if (val === 'TRUE') values.push(true);
            else if (val === 'FALSE') values.push(false);
            else if (!isNaN(Number(val)) && val !== '') values.push(Number(val));
            else values.push(val);
            currentPos = endPos;
          }
        }

        const obj: any = {};
        columns.forEach((col, idx) => {
          obj[col] = values[idx];
        });
        return obj;
      });

      const conflictTarget = tableName === 'system_config' ? 'key' : (tableName === 'payroll' ? 'branch_id,settlement' : 'id');
      results.push({ tableName, count: parsedData.length, data: parsedData, conflictTarget });
    }
    return results;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    resumeAudioContext();
    setIsProcessing(true);
    setFile(selectedFile);
    setStatus('Analyzing Registry Integrity...');

    try {
      const text = await selectedFile.text();
      const parsed = parseSqlContent(text);
      setSummary(parsed);
      
      if (parsed.length > 0) {
        setStatus(`Verified: ${parsed.length} Operational Blocks Found`);
        playSound('success');
      } else {
        setStatus('Analysis Fault: No valid HilotCore data detected');
        playSound('warning');
        setFile(null);
      }
    } catch (err) {
      setStatus('File Error: Decryption failed');
      playSound('warning');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitImport = async () => {
    if (summary.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setSyncProgress(0);
    setStatus('Establishing Cloud Handshake...');

    try {
      let completed = 0;
      for (const table of summary) {
        setStatus(`Syncing: ${table.tableName.toUpperCase()}...`);
        const { error } = await supabase
          .from(table.tableName)
          .upsert(table.data, { onConflict: table.conflictTarget });
        
        if (error) throw error;
        completed++;
        setSyncProgress((completed / summary.length) * 100);
      }

      setStatus('Cloud Registry Synchronized Successfully');
      playSound('success');
      setTimeout(() => { setFile(null); setSummary([]); setStatus(''); }, 5000);
    } catch (err: any) {
      setStatus(`Sync Aborted: ${err.message || 'Handshake Fault'}`);
      playSound('warning');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-700 space-y-6 sm:space-y-8 pb-32 px-2">
      <div className="bg-white p-6 sm:p-8 md:p-12 rounded-[32px] sm:rounded-[56px] border border-slate-100 shadow-sm space-y-8 sm:space-y-10">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-900 text-white rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto text-xl sm:text-2xl mb-4 sm:mb-6 shadow-xl">📥</div>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tighter">System Restore</h3>
          <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Ingest Archive into Cloud Registry</p>
        </div>

        {!file ? (
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full py-12 sm:py-24 rounded-[24px] sm:rounded-[40px] border-4 border-dashed border-slate-100 bg-slate-50 flex flex-col items-center justify-center gap-4 sm:gap-6 hover:border-emerald-500 transition-all group disabled:opacity-50 shadow-inner"
          >
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white shadow-sm flex items-center justify-center text-2xl sm:text-3xl group-hover:scale-110 transition-transform border border-slate-100">📂</div>
            <p className="text-[10px] sm:text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">Select .SQL Migration Script</p>
          </button>
        ) : (
          <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-5 sm:p-8 rounded-[24px] sm:rounded-[36px] bg-[#0F172A] text-white flex items-center justify-between shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 blur-2xl rounded-full"></div>
              <div className="flex items-center gap-4 sm:gap-6 overflow-hidden relative z-10">
                <div className="text-xl sm:text-2xl shrink-0">📄</div>
                <p className="font-bold uppercase text-sm sm:text-base truncate tracking-tight">{file.name}</p>
              </div>
              <button disabled={isProcessing} onClick={() => { setFile(null); setSummary([]); setStatus(''); }} className="p-3 sm:p-4 text-slate-500 hover:text-rose-400 transition-colors relative z-10">
                <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {summary.map(table => (
                <div key={table.tableName} className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 rounded-[16px] sm:rounded-[20px] border border-slate-100 shadow-sm">
                  <span className="font-bold text-[9px] sm:text-[10px] uppercase tracking-widest text-slate-500">{table.tableName}</span>
                  <span className="font-bold text-emerald-600 text-xs sm:text-sm tabular-nums">{table.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <input type="file" ref={fileInputRef} accept=".sql" className="hidden" onChange={handleFileChange} />

        <div className="pt-2 sm:pt-4 space-y-4 sm:space-y-6">
          {status && (
            <div className="p-4 sm:p-5 bg-emerald-50 border border-emerald-100 rounded-[16px] sm:rounded-[20px] flex items-center gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-2">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
              <p className="text-[10px] sm:text-[11px] font-bold text-emerald-800 uppercase tracking-widest leading-tight">{status}</p>
            </div>
          )}

          {isProcessing && syncProgress > 0 && (
            <div className="w-full bg-slate-100 h-1.5 sm:h-2 rounded-full overflow-hidden shadow-inner">
               <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${syncProgress}%` }}></div>
            </div>
          )}

          <button 
            onClick={handleCommitImport}
            disabled={isProcessing || summary.length === 0}
            className={`w-full py-5 sm:py-7 rounded-[20px] sm:rounded-[32px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-[11px] sm:text-[13px] shadow-2xl transition-all active:scale-[0.98] ${isProcessing || summary.length === 0 ? 'bg-slate-50 text-slate-300' : 'bg-slate-950 text-white hover:bg-emerald-700'}`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>RESTORING REGISTRY...</span>
              </div>
            ) : 'AUTHORIZE INGESTION'}
          </button>
        </div>
      </div>
    </div>
  );
};
