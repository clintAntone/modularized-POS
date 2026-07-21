import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface SplashScreenProps {
  message?: string;
  subMessage?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  message = "Initializing Core Systems",
  subMessage = "Establishing secure connection to master node"
}) => {
  const [elapsed, setElapsed] = useState(0);
  const [diagState, setDiagState] = useState<'idle' | 'running' | 'done'>('idle');
  const [internet, setInternet] = useState<boolean | null>(null);
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);
  const [diagDetail, setDiagDetail] = useState('');

  // Tick every second so we can show elapsed time and trigger diagnostics
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // After 20 s of spinning, auto-run the diagnostic
  useEffect(() => {
    if (elapsed === 20 && diagState === 'idle') {
      runDiagnostic();
    }
  }, [elapsed, diagState]);

  const runDiagnostic = async () => {
    setDiagState('running');

    // 1. Internet
    const online = navigator.onLine;
    setInternet(online);

    if (!online) {
      setDiagDetail('Your device appears to be offline. Check your WiFi or mobile data and try again.');
      setDiagState('done');
      return;
    }

    // 2. Supabase reachability
    try {
      setDiagDetail('Testing connection to the server...');
      const { error } = await supabase
        .from('branches')
        .select('id', { count: 'exact', head: true });

      if (error) throw error;
      setSupabaseOk(true);
      setDiagDetail('Server is reachable. The app may still be loading data. Try refreshing.');
    } catch (err: any) {
      setSupabaseOk(false);
      const msg = err?.message || '';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
        setDiagDetail('Your internet is working but the app server is unreachable. This is most commonly caused by your ISP\'s DNS not recognizing the server address. Changing to a public DNS (Google or Cloudflare) usually fixes this immediately.');
      } else {
        setDiagDetail(`Server error: ${msg || 'Unknown error'}. Try refreshing or contact your admin.`);
      }
    }

    setDiagState('done');
  };

  const StatusDot = ({ ok }: { ok: boolean | null }) => {
    if (ok === null) return <span className="w-2 h-2 rounded-full bg-slate-600 animate-pulse inline-block" />;
    return <span className={`w-2 h-2 rounded-full inline-block ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-6 max-w-xs w-full px-4">
        {/* Animated logo mark */}
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 border-r-emerald-400 animate-spin" style={{ animationDuration: '1s' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shadow-xl">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        </div>

        <div className="text-center space-y-3">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-600 animate-pulse">
            {message}
          </p>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-relaxed">
            {subMessage}
          </p>
          {elapsed >= 10 && diagState === 'idle' && (
            <p className="text-xs text-slate-300 tabular-nums">{elapsed}s elapsed…</p>
          )}
        </div>

        {/* Diagnostic panel — appears after 20 s */}
        {elapsed >= 20 && (
          <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">
              {diagState === 'running' ? 'Checking connection…' : 'Taking longer than expected'}
            </p>

            {/* Status rows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-widest">
                <span>Internet</span>
                <span className="flex items-center gap-1.5">
                  <StatusDot ok={internet} />
                  {internet === null ? 'Checking…' : internet ? 'Connected' : 'No connection'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-widest">
                <span>Server</span>
                <span className="flex items-center gap-1.5">
                  <StatusDot ok={supabaseOk} />
                  {supabaseOk === null ? (internet === false ? 'Skipped' : 'Checking…') : supabaseOk ? 'Reachable' : 'Unreachable'}
                </span>
              </div>
            </div>

            {/* Detail message */}
            {diagDetail && (
              <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
                {diagDetail}
              </p>
            )}

            {/* What to do */}
            {diagState === 'done' && (
              <div className="space-y-2 pt-1">
                {!internet && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
                    <p className="font-semibold uppercase tracking-wide mb-1">Try this:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Toggle airplane mode off and on</li>
                      <li>Switch between WiFi and mobile data</li>
                      <li>Move to a better signal area</li>
                    </ol>
                  </div>
                )}
                {internet && supabaseOk === false && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 leading-relaxed space-y-2">
                    <p className="font-semibold uppercase tracking-wide">Most likely fix — Change DNS:</p>
                    <div className="space-y-1">
                      <p className="font-bold">Android (easiest — works on all networks):</p>
                      <ol className="list-decimal list-inside space-y-0.5 pl-1">
                        <li>Settings → Connections → More connection settings</li>
                        <li>Private DNS → Private DNS provider hostname</li>
                        <li>Type: <span className="font-mono font-bold">dns.google</span> → Save</li>
                      </ol>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold">Android (per WiFi network):</p>
                      <ol className="list-decimal list-inside space-y-0.5 pl-1">
                        <li>Settings → WiFi → long-press your network → Modify</li>
                        <li>Advanced Options → IP settings: Static</li>
                        <li>DNS 1: <span className="font-mono font-bold">8.8.8.8</span> &nbsp; DNS 2: <span className="font-mono font-bold">8.8.4.4</span></li>
                      </ol>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold">iPhone:</p>
                      <ol className="list-decimal list-inside space-y-0.5 pl-1">
                        <li>Settings → WiFi → tap ⓘ next to your network</li>
                        <li>Configure DNS → Manual → add <span className="font-mono font-bold">8.8.8.8</span></li>
                      </ol>
                    </div>
                    <p className="border-t border-rose-200 pt-2 text-rose-700">Other things to try: disconnect/reconnect WiFi, switch to mobile data, or use a different network.</p>
                  </div>
                )}
                {internet && supabaseOk === true && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 leading-relaxed">
                    Server is reachable. The app may be loading a large amount of data. Please wait a moment more or refresh.
                  </div>
                )}

                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl active:scale-95 transition-all"
                >
                  Refresh App
                </button>
                <button
                  onClick={runDiagnostic}
                  disabled={diagState === 'running'}
                  className="w-full py-2.5 bg-slate-100 text-slate-500 font-black text-xs uppercase tracking-widest rounded-xl active:scale-95 transition-all disabled:opacity-40"
                >
                  Run Check Again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SplashScreen;
