import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Wifi, WifiOff, ShieldAlert, Activity, CheckCircle2, XCircle } from 'lucide-react';

export const NetworkDiagnostic: React.FC = () => {
  const [status, setStatus] = useState<{
    supabase: 'pending' | 'ok' | 'error';
    api: 'pending' | 'ok' | 'error';
    internet: boolean;
    details: string[];
  }>({
    supabase: 'pending',
    api: 'pending',
    internet: navigator.onLine,
    details: []
  });

  const addDetail = (msg: string) => {
    setStatus(prev => ({ ...prev, details: [...prev.details, `${new Date().toLocaleTimeString()}: ${msg}`] }));
  };

  const runDiagnostic = async () => {
    addDetail('Starting network diagnostic...');
    
    // Check Internet
    const isOnline = navigator.onLine;
    setStatus(prev => ({ ...prev, internet: isOnline }));
    addDetail(`Browser reports online: ${isOnline}`);

    // Check Supabase
    try {
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }
      addDetail('Testing Supabase connection...');
      const { data, error } = await supabase.from('branches').select('count', { count: 'exact', head: true });
      if (error) throw error;
      setStatus(prev => ({ ...prev, supabase: 'ok' }));
      addDetail('✅ Supabase connection successful');
    } catch (err: any) {
      setStatus(prev => ({ ...prev, supabase: 'error' }));
      addDetail(`❌ Supabase error: ${err.message || 'Unknown error'}`);
    }

    // Check API
    try {
      addDetail('Testing local API health...');
      const apiBase = import.meta.env.VITE_SUPABASE_URL || '';
      const res = await fetch(`${apiBase}/api/health`);
      if (res.ok) {
        setStatus(prev => ({ ...prev, api: 'ok' }));
        addDetail('✅ API health check successful');
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch (err: any) {
      setStatus(prev => ({ ...prev, api: 'error' }));
      addDetail(`❌ API error: ${err.message || 'Failed to fetch'}`);
    }
  };

  useEffect(() => {
    runDiagnostic();
  }, []);

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          Network Diagnostic
        </h3>
        <button 
          onClick={() => { setStatus(prev => ({ ...prev, details: [] })); runDiagnostic(); }}
          className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-full hover:bg-blue-100 transition-colors"
        >
          Retry
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`p-3 rounded-lg border ${status.internet ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            {status.internet ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-red-600" />}
            <span className="font-medium text-sm">Internet</span>
          </div>
          <p className="text-xs text-gray-600">{status.internet ? 'Online' : 'Offline'}</p>
        </div>

        <div className={`p-3 rounded-lg border ${status.supabase === 'ok' ? 'bg-green-50 border-green-200' : status.supabase === 'error' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            {status.supabase === 'ok' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : status.supabase === 'error' ? <XCircle className="w-4 h-4 text-red-600" /> : <Activity className="w-4 h-4 text-gray-400 animate-pulse" />}
            <span className="font-medium text-sm">Supabase</span>
          </div>
          <p className="text-xs text-gray-600">{status.supabase === 'ok' ? 'Connected' : status.supabase === 'error' ? 'Failed' : 'Checking...'}</p>
        </div>

        <div className={`p-3 rounded-lg border ${status.api === 'ok' ? 'bg-green-50 border-green-200' : status.api === 'error' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            {status.api === 'ok' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : status.api === 'error' ? <XCircle className="w-4 h-4 text-red-600" /> : <Activity className="w-4 h-4 text-gray-400 animate-pulse" />}
            <span className="font-medium text-sm">Backend API</span>
          </div>
          <p className="text-xs text-gray-600">{status.api === 'ok' ? 'Connected' : status.api === 'error' ? 'Failed' : 'Checking...'}</p>
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 max-h-40 overflow-y-auto">
        {status.details.map((d, i) => (
          <div key={i} className="mb-1">{d}</div>
        ))}
      </div>

      {status.supabase === 'error' && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold mb-1">Supabase Connection Failed</p>
            <p>This is likely caused by missing environment variables or a network firewall blocking Supabase. Check your browser's Network tab for details.</p>
          </div>
        </div>
      )}
    </div>
  );
};
