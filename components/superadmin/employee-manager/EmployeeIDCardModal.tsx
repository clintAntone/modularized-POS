
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Employee, Branch } from '../../../types';
import { ProfileAvatar } from '../../ui/ProfileAvatar';
import { ROLE_ORDER } from './SharedComponents';
const icon = '/icon.png';
import { APP_NAME } from '../../../constants';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

interface EmployeeIDCardModalProps {
  employee: Employee;
  branches: Branch[];
  onClose: () => void;
}

export const EmployeeIDCardModal: React.FC<EmployeeIDCardModalProps> = ({ employee, branches, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    if (!cardRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      // Capture at 3× for crisp PDF resolution
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: '#ffffff',
      });

      const img = new Image();
      img.src = dataUrl;
      await new Promise(resolve => { img.onload = resolve; });

      // Card physical size: 2.5in × ~4.3in at 72dpi (jsPDF default)
      const cardWidthIn  = 2.5;
      const cardHeightIn = (img.naturalHeight / img.naturalWidth) * cardWidthIn;
      const pageW = cardWidthIn  + 0.4;  // 0.2in padding each side
      const pageH = cardHeightIn + 0.4;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: [pageW, pageH],
      });

      pdf.addImage(dataUrl, 'PNG', 0.2, 0.2, cardWidthIn, cardHeightIn);

      const safeName = (employee.name || 'employee').replace(/\s+/g, '_').toLowerCase();
      pdf.save(`id_${safeName}.pdf`);
    } catch (err) {
      console.error('[DownloadID]', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const empId = employee.timestamp
    ? (() => {
        const d = new Date(employee.timestamp);
        return `EMP-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${employee.id}`;
      })()
    : employee.id;

  const createdAt = employee.timestamp
    ? new Date(employee.timestamp).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : '—';

  const homeBranch = branches.find(b => b.id === employee.branchId);

  const assignedBranches = branches.filter(b => {
    if (b.id === employee.branchId) return true;
    if (employee.branchAllowances && typeof employee.branchAllowances === 'object' && b.id in employee.branchAllowances) return true;
    if (b.manager?.toUpperCase() === (employee.name || '').toUpperCase()) return true;
    if (b.tempManager?.toUpperCase() === (employee.name || '').toUpperCase()) return true;
    return false;
  });


  // Collect unique roles across all branch allowances + base role
  const allRoles = new Set<string>();
  if (employee.role) employee.role.split(',').forEach(r => { if (r.trim()) allRoles.add(r.trim().toUpperCase()); });
  if (employee.branchAllowances) {
    Object.values(employee.branchAllowances).forEach((cfg: any) => {
      const r = typeof cfg === 'object' ? cfg?.role : '';
      if (r) r.split(',').forEach((role: string) => { if (role.trim()) allRoles.add(role.trim().toUpperCase()); });
    });
  }
  const isActualManager = branches.some(b =>
    b.manager?.toUpperCase() === (employee.name || '').toUpperCase()
  );

  const roles = Array.from(allRoles)
    .filter(r => r !== 'RELIEVER' && r !== 'MANAGER')
    .sort((a, b) => {
      const ai = ROLE_ORDER.indexOf(a);
      const bi = ROLE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  if (isActualManager) roles.unshift('MANAGER');

  const fullNameFormatted = (() => {
    const last = (employee.lastName || '').toUpperCase();
    const first = (employee.firstName || '').toUpperCase();
    const middle = (employee.middleName || '').toUpperCase();
    if (last && first) return `${last}, ${first}${middle ? ` ${middle}` : ''}`;
    return (employee.name || 'UNNAMED').toUpperCase();
  })();

  const roleColors: Record<string, string> = {
    MANAGER: 'bg-indigo-600 text-white',
    THERAPIST: 'bg-emerald-600 text-white',
    BONESETTER: 'bg-amber-500 text-white',
    TRAINEE: 'bg-slate-500 text-white',
  };


  const modal = (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-4 w-full max-w-[320px] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* ID Card — fixed portrait badge */}
        <div ref={cardRef} className="w-full bg-white rounded-3xl overflow-hidden shadow-2xl" style={{ border: '1.5px solid #e2e8f0', minHeight: '500px' }}>

          {/* ── Wrapper so photo can overlap the header/body seam without being clipped ── */}
          <div className="relative">

            {/* Dark header */}
            <div className="relative bg-slate-900 overflow-hidden" style={{ paddingBottom: '56px' }}>
              {/* Decorative circles */}
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-emerald-500/15" />
              <div className="absolute top-4 right-8 w-20 h-20 rounded-full bg-indigo-500/20" />
              <div className="absolute -bottom-12 -left-12 w-44 h-44 rounded-full bg-slate-700/50" />
              <div className="absolute bottom-6 right-6 w-10 h-10 rounded-full bg-emerald-500/10" />

              {/* Logo row */}
              <div className="relative z-10 px-5 pt-4 pb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={icon} alt="" className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shadow-sm" />
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.18em] leading-none">{APP_NAME}</p>
                    <p className="text-[7px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Company ID</p>
                  </div>
                </div>
                <div className={`px-2 py-1 rounded-full text-[7px] font-black uppercase tracking-widest border ${employee.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                  {employee.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>

              {/* Thin accent stripe */}
              <div className="relative z-10 mx-5 mt-4 h-px bg-white/10" />
            </div>

            {/* Lanyard hole — floats just above the avatar circle (photo is 96px, top-half=48px inside header, +10px gap) */}
            <div className="absolute z-30 left-1/2 -translate-x-1/2" style={{ bottom: '58px' }}>
              <div className="w-7 h-3.5 rounded-b-full bg-slate-800 border-x border-b border-slate-600/80 shadow-inner" />
            </div>

            {/* Circular photo — sits on the seam */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-20">
              <div className="w-[96px] h-[96px] rounded-full overflow-hidden border-[4px] border-white shadow-xl bg-slate-700">
                <ProfileAvatar name={employee.name || ''} src={employee.profile} initialsClassName="text-3xl" />
              </div>
            </div>
          </div>

          {/* ── White body ── */}
          <div className="bg-white pb-6 px-6 flex flex-col items-center" style={{ paddingTop: '62px' }}>

            {/* Primary role badge (e.g. MANAGER) */}
            {roles.includes('MANAGER') && (
              <div className="mb-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white shadow-sm">
                  Manager
                </span>
              </div>
            )}

            {/* Name — LAST, FIRST MIDDLE */}
            <div className="text-center mb-3">
              {(() => {
                const last  = (employee.lastName  || '').toUpperCase();
                const first = (employee.firstName || '').toUpperCase();
                const mid   = (employee.middleName || '').toUpperCase();
                if (last && first) {
                  return (
                    <p className="text-[20px] font-black text-slate-900 leading-tight tracking-tight">
                      {last}, {first}{mid ? ` ${mid}` : ''}
                    </p>
                  );
                }
                return <p className="text-[20px] font-black text-slate-900 leading-tight tracking-tight">{(employee.name || 'UNNAMED').toUpperCase()}</p>;
              })()}
            </div>

            {/* Skills — non-manager roles */}
            {roles.filter(r => r !== 'MANAGER').length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mb-5">
                {roles.filter(r => r !== 'MANAGER').map(role => {
                  const pillColors: Record<string, string> = {
                    THERAPIST:  'bg-emerald-100 text-emerald-700 border-emerald-200',
                    BONESETTER: 'bg-amber-100 text-amber-700 border-amber-200',
                    TRAINEE:    'bg-slate-100 text-slate-600 border-slate-200',
                  };
                  const pc = pillColors[role] ?? 'bg-slate-100 text-slate-600 border-slate-200';
                  return (
                    <span key={role} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${pc}`}>
                      {role}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Bottom margin when no skills shown */}
            {roles.filter(r => r !== 'MANAGER').length === 0 && <div className="mb-5" />}

            {/* Divider */}
            <div className="w-full h-px bg-slate-100 mb-4" />

            {/* Detail rows */}
            <div className="w-full space-y-3 mb-5">
              <div className="flex items-start gap-3">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest w-14 shrink-0 pt-0.5">ID No.</p>
                <p className="text-[10px] font-black text-slate-900 font-mono tracking-wider leading-tight break-all">{empId?.toUpperCase()}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest w-14 shrink-0">Issued</p>
                <p className="text-[10px] font-black text-slate-800">{createdAt}</p>
              </div>
            </div>

            {/* Assigned branches */}
            {assignedBranches.length > 0 && (
              <div className="w-full mb-4">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Assigned Branches</p>
                <div className="flex flex-wrap gap-1">
                  {assignedBranches.map((b, i) => (
                    <span key={i} className={`text-[8px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md leading-tight ${b.id === employee.branchId ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Barcode decoration */}
            <div className="w-full mb-4">
              <svg width="100%" height="36" viewBox="0 0 200 36" preserveAspectRatio="none">
                {Array.from({ length: 60 }).map((_, i) => {
                  const x = i * 3.4;
                  const w = i % 5 === 0 ? 2.2 : i % 3 === 0 ? 1.6 : 1;
                  return <rect key={i} x={x} y="0" width={w} height="36" fill={i % 7 === 0 ? '#94a3b8' : '#1e293b'} />;
                })}
              </svg>
              <p className="text-center text-[8px] font-mono text-slate-400 tracking-widest mt-1.5">{(empId || '').toUpperCase().replace(/-/g, ' ')}</p>
            </div>

            {/* Footer */}
            <div className="w-full pt-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Official Company ID</p>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 w-full">
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="flex-1 flex items-center justify-center gap-2 h-10 bg-indigo-600 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95"
          >
            {isDownloading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {isDownloading ? 'Saving…' : 'Save PDF'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 h-10 bg-slate-900 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white shadow-lg hover:bg-slate-800 transition-all active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
