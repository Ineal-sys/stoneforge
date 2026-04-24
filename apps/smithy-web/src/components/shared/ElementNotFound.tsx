/**
 * ElementNotFound Component
 *
 * Displays a friendly "not found" message when navigating to a
 * non-existent element via deep link.
 */

import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from '@stoneforge/i18n';

export interface ElementNotFoundProps {
  /** Type of element (task, plan, document, etc.) */
  elementType: string;
  /** The ID that was not found */
  elementId: string;
  /** Route to navigate back to (e.g., '/tasks') */
  backRoute: string;
  /** Label for the back button (e.g., 'Back to Tasks') */
  backLabel: string;
  /** Optional callback when user dismisses the message */
  onDismiss?: () => void;
}

export function ElementNotFound({
  elementType,
  elementId,
  backRoute,
  backLabel,
  onDismiss,
}: ElementNotFoundProps) {
const { t } = useTranslation('smithy');
  const navigate = useNavigate();

  const handleBack = () => {
    onDismiss?.();
    navigate({ to: backRoute as string });
  };

  return (
    <div
      className="flex flex-col items-center justify-center h-full p-8 text-center"
      data-testid="element-not-found"
    >
      <div className="mb-4 p-3 bg-yellow-50 rounded-full">
        <AlertCircle className="w-8 h-8 text-yellow-500" />
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-2" data-testid="not-found-title">
        {t('shared.elementNotFound', { type: elementType })}
      </h3>

      <p className="text-gray-600 mb-1" data-testid="not-found-message">
        {t('shared.elementNotFoundDescription', { type: elementType.toLowerCase() })}
      </p>

      <p className="text-sm text-gray-500 font-mono mb-6" data-testid="not-found-id">
        {t('shared.idLabel', { id: elementId })}
      </p>

      <button
        onClick={handleBack}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        data-testid="not-found-back-button"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </button>
    </div>
  );
}
