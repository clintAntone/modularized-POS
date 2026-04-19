import React, { useState, useEffect } from 'react';
import { UI_THEME } from '../../../../constants/ui_designs';
import { playSound } from '../../../../lib/audio';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    playSound('click');
    onPageChange(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const maxVisiblePages = isMobile ? 3 : 5;

  return (
    <div className="w-full flex flex-row items-center justify-between gap-2 h-14 min-h-[56px] max-h-[56px] px-3 sm:px-4 bg-white border border-slate-100 rounded-2xl shadow-sm no-print overflow-hidden">
      <div className="flex-1 min-w-0 text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center whitespace-nowrap overflow-hidden">
        <span className="hidden sm:inline">Showing </span>
        <span className="text-slate-900 mx-0.5 sm:mx-1">{startItem}</span>
        <span className="mx-0.5">-</span>
        <span className="text-slate-900 mx-0.5 sm:mx-1">{endItem}</span>
        <span className="hidden sm:inline"> of </span>
        <span className="inline sm:hidden mx-0.5">/</span>
        <span className="text-slate-900 mx-0.5 sm:mx-1">{totalItems}</span>
        <span className="hidden sm:inline"> entries</span>
      </div>
      
      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-1 sm:gap-2 no-scrollbar py-0.5 shrink-0 ml-auto">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`p-1.5 rounded-lg border transition-all shrink-0 ${
              currentPage === 1 
                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' 
                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-500 hover:text-emerald-600 active:scale-90'
            }`}
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {Array.from({ length: Math.min(maxVisiblePages, totalPages) }, (_, i) => {
              // Show pages around current page
              let pageNum = currentPage;
              const half = Math.floor(maxVisiblePages / 2);
              
              if (totalPages <= maxVisiblePages) {
                pageNum = i + 1;
              } else if (currentPage <= half + 1) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - half) {
                pageNum = totalPages - maxVisiblePages + 1 + i;
              } else {
                pageNum = currentPage - half + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-[9px] sm:text-[10px] font-black transition-all shrink-0 ${
                    currentPage === pageNum
                      ? 'bg-slate-900 text-white shadow-lg'
                      : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`p-1.5 rounded-lg border transition-all shrink-0 ${
              currentPage === totalPages 
                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' 
                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-500 hover:text-emerald-600 active:scale-90'
            }`}
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end ml-auto shrink-0">
          <span className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] italic">
            All pages displayed
          </span>
        </div>
      )}
    </div>
  );
};
