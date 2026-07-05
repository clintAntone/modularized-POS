import React from 'react';

interface UpdatePopupProps {
  apkUrl: string | null;
}

export const UpdatePopup: React.FC<UpdatePopupProps> = ({ apkUrl }) => {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-8 text-center border border-slate-100 shadow-xl animate-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>

        <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-1">Update Required</p>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">New Version Available</h3>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-3 leading-relaxed">
          Your app is out of date. Please update to continue using the system.
        </p>

        <div className="mt-8 space-y-3">
          {apkUrl ? (
            <a
              href={apkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-slate-900 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg hover:bg-emerald-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Download Update
            </a>
          ) : (
            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-2 w-full bg-slate-900 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg hover:bg-emerald-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reload App
            </button>
          )}
        </div>

        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mt-5">
          Contact your administrator if the issue persists.
        </p>
      </div>
    </div>
  );
};
