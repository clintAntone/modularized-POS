import React, { useState, useEffect, useRef } from 'react';
import { playSound } from '../../../../lib/audio';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
  onItemsPerPageChange?: (n: number) => void;
  itemsPerPageOptions?: number[];
  rightSlot?: React.ReactNode;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  onItemsPerPageChange,
  itemsPerPageOptions = [10, 25, 50, 100],
  rightSlot,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    playSound('click');
    onPageChange(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const maxVisiblePages = isMobile ? 2 : 5;

  return (
    <div className="w-full flex flex-row items-center justify-between gap-2 h-14 min-h-[56px] max-h-[56px] px-3 sm:px-4 bg-white border border-slate-100 rounded-2xl shadow-sm no-print overflow-visible dark:bg-slate-800 dark:border-slate-700">

      {/* Items-per-page custom dropdown */}
      <div className="flex items-center gap-2 shrink-0">
        {onItemsPerPageChange && (
          <div ref={dropdownRef} className="relative shrink-0">
            <button
              onClick={() => { setDropdownOpen(p => !p); playSound('click'); }}
              className="h-8 px-3 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:border-slate-400 transition-colors group"
            >
              <span className="text-xs font-black text-slate-700 tabular-nums">{itemsPerPage}</span>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:inline">/ page</span>
              <svg
                className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 bottom-[calc(100%+6px)] z-[300] bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden min-w-[110px] animate-in fade-in zoom-in-95 duration-100">
                <div className="p-1.5 space-y-0.5">
                  {itemsPerPageOptions.map(n => (
                    <button
                      key={n}
                      onClick={() => {
                        playSound('click');
                        onItemsPerPageChange(n);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-black transition-all ${
                        itemsPerPage === n
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span>{n}</span>
                      <span className={`text-xs font-medium uppercase tracking-wide ${itemsPerPage === n ? 'text-slate-400' : 'text-slate-300'}`}>
                        per page
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Page buttons */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-1 sm:gap-2 no-scrollbar py-0.5 shrink-0 ml-auto">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`p-1.5 sm:p-2.5 rounded-lg border transition-all shrink-0 ${
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
                  className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg text-xs sm:text-xs font-black transition-all shrink-0 ${
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
            className={`p-1.5 sm:p-2.5 rounded-lg border transition-all shrink-0 ${
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
          <span className="text-xs sm:text-xs font-black text-slate-300 uppercase tracking-wider italic">
            All pages displayed
          </span>
        </div>
      )}
      {rightSlot && (
        <>
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-600 shrink-0 mx-1" />
          {rightSlot}
        </>
      )}
    </div>
  );
};
