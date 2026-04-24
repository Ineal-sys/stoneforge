/**
 * SearchBox - Team search input
 */

import { useTranslation } from '@stoneforge/i18n';
import { Search } from 'lucide-react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, onChange }: SearchBoxProps) {
  const { t } = useTranslation('quarry');

  return (
    <div className="relative" data-testid="team-search">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('teamSearch.placeholder')}
        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        data-testid="team-search-input"
      />
    </div>
  );
}
