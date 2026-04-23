/**
 * DeleteLibraryModal - Confirmation modal for deleting a library
 *
 * Shows a warning that the action is irreversible and lets the user
 * choose whether to delete or keep the documents in the library.
 */

import { useState, useEffect } from 'react';
import { X, ChevronLeft, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@stoneforge/i18n';

interface DeleteLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (deleteDocuments: boolean) => Promise<void>;
  library: {
    id: string;
    name: string;
  } | null;
  documentCount?: number;
  isDeleting?: boolean;
  error?: string | null;
  isMobile?: boolean;
}

export function DeleteLibraryModal({
  isOpen,
  onClose,
  onConfirm,
  library,
  documentCount = 0,
  isDeleting = false,
  error = null,
  isMobile = false,
}: DeleteLibraryModalProps) {
  const { t } = useTranslation('ui');
  const [deleteDocuments, setDeleteDocuments] = useState(true);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDeleteDocuments(true);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    await onConfirm(deleteDocuments);
  };

  const handleClose = () => {
    if (!isDeleting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Mobile: Full-screen modal
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--color-bg)]" data-testid="delete-library-modal">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10">
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target disabled:opacity-50"
            aria-label={t('documents.deleteLibrary.cancel')}
            data-testid="delete-library-close"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Trash2 className="w-5 h-5 text-red-500" />
          <h2 className="flex-1 text-lg font-semibold text-[var(--color-text)]">{t('documents.deleteLibrary.title')}</h2>
        </div>

        {/* Content */}
        <div className="p-4 pb-24 overflow-y-auto">
          <ModalContent
            library={library}
            documentCount={documentCount}
            deleteDocuments={deleteDocuments}
            setDeleteDocuments={setDeleteDocuments}
            error={error}
            t={t}
          />
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isDeleting}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 touch-target"
              data-testid="delete-library-cancel-button"
            >
              {t('documents.deleteLibrary.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
              data-testid="delete-library-confirm-button"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('documents.deleteLibrary.deleting')}
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  {t('documents.deleteLibrary.title')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop: Centered modal
  return (
    <div
      data-testid="delete-library-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('documents.deleteLibrary.title')}</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50"
            data-testid="delete-library-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <ModalContent
            library={library}
            documentCount={documentCount}
            deleteDocuments={deleteDocuments}
            setDeleteDocuments={setDeleteDocuments}
            error={error}
            t={t}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
            data-testid="delete-library-cancel-button"
          >
            {t('documents.deleteLibrary.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="delete-library-confirm-button"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('documents.deleteLibrary.deleting')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {t('documents.deleteLibrary.title')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal content shared between mobile and desktop layouts
 */
function ModalContent({
  library,
  documentCount,
  deleteDocuments,
  setDeleteDocuments,
  error,
  t,
}: {
  library: { id: string; name: string } | null;
  documentCount: number;
  deleteDocuments: boolean;
  setDeleteDocuments: (value: boolean) => void;
  error: string | null;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <>
      {/* Warning Message */}
      <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-medium text-red-800 dark:text-red-300">
            {t('documents.deleteLibrary.warningTitle')}
          </h4>
          <p className="mt-1 text-sm text-red-700 dark:text-red-400">
            {t('documents.deleteLibrary.warningBody', { name: library?.name })}
            {documentCount > 0 && (
              <>
                {' '}{t('documents.deleteLibrary.warningDocuments', { count: documentCount })}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Document handling option */}
      {documentCount > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('documents.deleteLibrary.documentsQuestion')}
          </p>
          <div className="space-y-2">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <input
                type="radio"
                name="deleteDocuments"
                checked={deleteDocuments}
                onChange={() => setDeleteDocuments(true)}
                className="mt-0.5"
                data-testid="delete-documents-radio"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t('documents.deleteLibrary.deleteDocuments')}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('documents.deleteLibrary.deleteDocumentsDescription', { count: documentCount })}
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <input
                type="radio"
                name="deleteDocuments"
                checked={!deleteDocuments}
                onChange={() => setDeleteDocuments(false)}
                className="mt-0.5"
                data-testid="keep-documents-radio"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t('documents.deleteLibrary.keepDocuments')}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('documents.deleteLibrary.keepDocumentsDescription')}
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div
          className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400"
          data-testid="delete-library-error"
        >
          {error}
        </div>
      )}
    </>
  );
}
