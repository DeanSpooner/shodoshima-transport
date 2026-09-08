import { useEffect, type ReactNode } from 'react';
import { useLanguage } from '../lib/i18n';

type MobileMenuProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function MobileMenu({ isOpen, onClose, children }: MobileMenuProps) {
  const { t } = useLanguage();

  // Escape closes, and the page behind is locked so the drawer scrolls
  // rather than the map panning underneath it.
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden='true'
        className={`fixed inset-0 z-30 bg-olive-900/40 transition-opacity duration-200 sm:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <div
        role='dialog'
        aria-modal='true'
        aria-label={t.menu}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-olive-100 p-4 shadow-xl transition-transform duration-200 sm:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className='flex items-center justify-between gap-2'>
          <span className='text-sm font-semibold text-olive-900'>
            {t.appTitle}
          </span>
          <button
            type='button'
            onClick={onClose}
            aria-label={t.close}
            className='flex h-8 w-8 shrink-0 items-center justify-center rounded text-olive-600 transition-colors duration-200 hover:bg-olive-200 hover:text-olive-900'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
              className='h-5 w-5'
            >
              <line x1='6' y1='6' x2='18' y2='18' />
              <line x1='18' y1='6' x2='6' y2='18' />
            </svg>
          </button>
        </div>

        {children}
      </div>
    </>
  );
}
