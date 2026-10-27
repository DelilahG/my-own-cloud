import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './primitives';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };

/**
 * Modal built on the native <dialog> element: the browser provides focus
 * trapping, Escape-to-close, an inert background and focus restoration.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault(); // let React state drive closing
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      className={`m-auto w-[calc(100%-2rem)] ${WIDTHS[size]} rounded-2xl border border-line bg-surface p-0 text-fg shadow-pop backdrop:bg-transparent open:animate-in`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold tracking-tight">
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-1 text-sm text-fg-muted">
                  {description}
                </div>
              )}
            </div>
            <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
              <X size={18} />
            </IconButton>
          </div>
          {children && <div className="overflow-y-auto px-6 pt-4 pb-1">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 px-6 pt-4 pb-5">{footer}</div>}
          {!footer && <div className="pb-5" />}
        </div>
      )}
    </dialog>
  );
}
