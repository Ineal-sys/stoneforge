/**
 * MoveToTopLevelDialog - Confirmation dialog for moving documents to top-level
 */

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from '@stoneforge/i18n';

interface MoveToTopLevelDialogProps {
  isOpen: boolean;
  documentName: string;
  libraryName: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MoveToTopLevelDialog({
  isOpen,
  documentName,
  libraryName,
  isLoading = false,
  onConfirm,
  onCancel,
}: MoveToTopLevelDialogProps) {
  const { t } = useTranslation('smithy');
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content
          data-testid="move-to-top-level-dialog"
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 w-full max-w-md p-6"
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
            </div>
            <div className="flex-1">
              <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('documents.moveToAllDocuments')}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                <span className="font-medium text-gray-900 dark:text-white">
                  &quot;{documentName}&quot;
                </span>{' '}
                {t('documents.willBeRemovedFrom')}{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  &quot;{libraryName}&quot;
                </span>{' '}
                {t('documents.andMovedToTopLevel')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label={t('documents.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
              data-testid="cancel-move-button"
            >
              {t('documents.cancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
              data-testid="confirm-move-button"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('documents.moving')}
                </>
              ) : (
                t('documents.moveToAllDocuments')
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
