/**
 * Inbox Page (TB137)
 *
 * Full-page inbox for the human operator showing all direct messages and @mentions.
 * Features split layout with message list (left) and message content (right).
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '@stoneforge/i18n';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  Inbox,
  Mail,
  Archive,
  AtSign,
  CheckCheck,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Reply,
  Paperclip,
  CornerUpLeft,
  Filter,
  ArrowUpDown,
  Calendar,
  MessageSquare,
  Loader2,
  Bot,
  User,
  Server,
  FileText,
} from 'lucide-react';
import { VirtualizedList } from '../../components/shared/VirtualizedList';
import { PageHeader } from '../../components/shared/PageHeader';
import { useContainerIsMobile } from '../../hooks';
import { useCurrentUser } from '../../contexts';
import { useRealtimeEvents } from '../../api/hooks/useRealtimeEvents';
import type { WebSocketEvent } from '@stoneforge/ui';
import { groupByTimePeriod, type TimePeriod, formatCompactTime } from '../../lib';

// Types
interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  active?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface InboxItem {
  id: string;
  recipientId: string;
  messageId: string;
  channelId: string;
  sourceType: 'direct' | 'mention';
  status: 'unread' | 'read' | 'archived';
  readAt: string | null;
  createdAt: string;
  // Hydrated fields
  message?: {
    id: string;
    sender: string;
    contentRef: string;
    contentPreview?: string;
    fullContent?: string;
    contentType?: string;
    threadId?: string | null;
    createdAt: string;
  } | null;
  channel?: {
    id: string;
    name: string;
    channelType: 'group' | 'direct';
  } | null;
  sender?: Entity | null;
  recipient?: Entity | null;
  attachments?: {
    id: string;
    title: string;
    content?: string;
    contentType?: string;
  }[];
  threadParent?: {
    id: string;
    sender?: Entity | null;
    contentPreview: string;
    createdAt: string;
  } | null;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

type InboxViewType = 'unread' | 'all' | 'archived';
type InboxSourceFilter = 'all' | 'direct' | 'mention';
type InboxSortOrder = 'newest' | 'oldest' | 'sender';

// Local storage keys
const INBOX_VIEW_KEY = 'stoneforge-inbox-page-view';
const INBOX_SOURCE_FILTER_KEY = 'stoneforge-inbox-page-source-filter';
const INBOX_SORT_ORDER_KEY = 'stoneforge-inbox-page-sort-order';

// Get stored preferences
function getStoredInboxView(): InboxViewType {
  const stored = localStorage.getItem(INBOX_VIEW_KEY);
  if (stored === 'unread' || stored === 'all' || stored === 'archived') {
    return stored;
  }
  return 'unread';
}

function setStoredInboxView(view: InboxViewType): void {
  localStorage.setItem(INBOX_VIEW_KEY, view);
}

function getStoredSourceFilter(): InboxSourceFilter {
  const stored = localStorage.getItem(INBOX_SOURCE_FILTER_KEY);
  if (stored === 'all' || stored === 'direct' || stored === 'mention') {
    return stored;
  }
  return 'all';
}

function setStoredSourceFilter(filter: InboxSourceFilter): void {
  localStorage.setItem(INBOX_SOURCE_FILTER_KEY, filter);
}

function getStoredSortOrder(): InboxSortOrder {
  const stored = localStorage.getItem(INBOX_SORT_ORDER_KEY);
  if (stored === 'newest' || stored === 'oldest' || stored === 'sender') {
    return stored;
  }
  return 'newest';
}

function setStoredSortOrder(order: InboxSortOrder): void {
  localStorage.setItem(INBOX_SORT_ORDER_KEY, order);
}

// Hooks
function useUserInbox(view: InboxViewType = 'all', entityId: string | null) {
  return useQuery<PaginatedResult<InboxItem>>({
    queryKey: ['inbox', entityId, view],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100', hydrate: 'true' });
      if (view === 'unread') {
        params.set('status', 'unread');
      } else if (view === 'archived') {
        params.set('status', 'archived');
      } else {
        params.set('status', 'unread,read');
      }
      // Filter by entity if specified
      if (entityId) {
        params.set('entityId', entityId);
      }
      const response = await fetch(`/api/inbox/all?${params}`);
      if (!response.ok) throw new Error('Failed to fetch inbox');
      return response.json();
    },
    enabled: !!entityId, // Only fetch when we have an entity
    staleTime: 0, // Always consider data stale for real-time updates
    refetchOnWindowFocus: 'always', // Always refetch when tab becomes active (handles missed WebSocket events)
  });
}

function useUserInboxCount(entityId: string | null) {
  return useQuery<{ count: number }>({
    queryKey: ['inbox', entityId, 'count'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityId) {
        params.set('entityId', entityId);
      }
      const response = await fetch(`/api/inbox/count?${params}`);
      if (!response.ok) throw new Error('Failed to fetch inbox count');
      return response.json();
    },
    enabled: !!entityId, // Only fetch when we have an entity
    staleTime: 0, // Always consider data stale for real-time updates
    refetchOnWindowFocus: 'always', // Always refetch when tab becomes active
  });
}

function useMarkInboxRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: 'read' | 'unread' | 'archived' }) => {
      const response = await fetch(`/api/inbox/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update inbox item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

// Hook to send a message reply
function useSendReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      sender,
      content,
      threadId,
    }: {
      channelId: string;
      sender: string;
      content: string;
      threadId?: string;
    }) => {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, sender, content, threadId }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData?.error?.message || 'Failed to send message';
        throw new Error(errorMessage);
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      // Also invalidate the thread replies for this thread (uses same key pattern as useThreadReplies)
      if (variables.threadId) {
        queryClient.invalidateQueries({ queryKey: ['messages', variables.threadId, 'replies'] });
      }
    },
  });
}

// Thread reply type
interface ThreadReply {
  id: string;
  sender: string;
  contentRef: string;
  threadId: string;
  createdAt: string;
  _content?: string;
  _senderEntity?: Entity;
}

// Hook to fetch thread replies for a message
// Uses query key pattern ['messages', messageId, 'replies'] to match automatic WebSocket invalidation
function useThreadReplies(messageId: string | null) {
  return useQuery<ThreadReply[]>({
    queryKey: ['messages', messageId, 'replies'],
    queryFn: async () => {
      if (!messageId) return [];
      const response = await fetch(`/api/messages/${messageId}/replies?hydrate.content=true`);
      if (!response.ok) throw new Error('Failed to fetch thread replies');
      const replies = await response.json();

      // Hydrate sender entities for each reply
      const hydratedReplies = await Promise.all(
        replies.map(async (reply: ThreadReply) => {
          try {
            const senderResponse = await fetch(`/api/entities/${reply.sender}`);
            if (senderResponse.ok) {
              const senderEntity = await senderResponse.json();
              return { ...reply, _senderEntity: senderEntity };
            }
          } catch {
            // Ignore hydration errors
          }
          return reply;
        })
      );
      return hydratedReplies;
    },
    enabled: !!messageId,
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

// Components
function InboxTimePeriodHeader({ period }: { period: TimePeriod }) {
  const { t } = useTranslation('smithy');
  const periodKeyMap: Record<TimePeriod, string> = {
    today: 'inbox.periodToday',
    yesterday: 'inbox.periodYesterday',
    'this-week': 'inbox.periodThisWeek',
    earlier: 'inbox.periodEarlier',
  };
  return (
    <div
      className="sticky top-0 z-10 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2"
      data-testid={`inbox-page-time-period-${period}`}
    >
      <Calendar className="w-3 h-3 text-gray-500" />
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
        {t(periodKeyMap[period])}
      </span>
    </div>
  );
}

function InboxMessageListItem({
  item,
  isSelected,
  onSelect,
  formattedTime,
}: {
  item: InboxItem;
  isSelected: boolean;
  onSelect: () => void;
  formattedTime?: string;
}) {
  const { t } = useTranslation('smithy');
  const isUnread = item.status === 'unread';
  const displayTime = formattedTime ?? formatCompactTime(item.createdAt);

  const senderName = item.sender?.name ?? t('inbox.unknown');
  const senderType = item.sender?.entityType ?? 'agent';
  const messagePreview = item.message?.contentPreview ?? '';
  const firstLine = messagePreview.split('\n')[0]?.slice(0, 50) || '';
  const hasThreadParent = item.threadParent !== null && item.threadParent !== undefined;
  const threadParentSenderName = item.threadParent?.sender?.name ?? t('inbox.unknown');

  const getAvatarIcon = () => {
    switch (senderType) {
      case 'agent': return <Bot className="w-3 h-3" />;
      case 'human': return <User className="w-3 h-3" />;
      case 'system': return <Server className="w-3 h-3" />;
      default: return <User className="w-3 h-3" />;
    }
  };

  const getAvatarColors = () => {
    switch (senderType) {
      case 'agent': return 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400';
      case 'human': return 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400';
      case 'system': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors border-b border-gray-100 dark:border-gray-800 ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-l-blue-500'
          : isUnread
          ? 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'
          : 'bg-gray-50/50 dark:bg-gray-900/50 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
      }`}
      data-testid={`inbox-page-list-item-${item.id}`}
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColors()}`}>
        {getAvatarIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${isUnread ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
            {senderName}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-gray-400 dark:text-gray-500" data-testid={`inbox-page-list-item-time-${item.id}`}>{displayTime}</span>
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-blue-500" data-testid={`inbox-page-list-item-unread-${item.id}`} />
            )}
          </div>
        </div>
        {/* Show thread indicator when message is a reply */}
        {hasThreadParent && (
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5" data-testid={`inbox-page-list-item-thread-${item.id}`}>
            <CornerUpLeft className="w-3 h-3" />
            <span>{t('inbox.replyToSender', { name: threadParentSenderName })}</span>
          </div>
        )}
        {/* Show recipient badge for global inbox */}
        {item.recipient && (
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            <span>{t('inbox.to')}</span>
            <span className="font-medium">{item.recipient.name}</span>
          </div>
        )}
        {firstLine && (
          <p className={`text-xs truncate ${isUnread ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-500'}`}>
            {firstLine}
          </p>
        )}
      </div>
    </button>
  );
}

function InboxMessageContent({
  item,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onRestore,
  isPending,
  onNavigateToMessage,
  onNavigateToEntity,
  onReply,
  threadReplies,
  threadRepliesLoading,
  currentUserId,
}: {
  item: InboxItem;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onRestore: () => void;
  isPending: boolean;
  onNavigateToMessage: () => void;
  onNavigateToEntity: (entityId: string) => void;
  onReply?: () => void;
  threadReplies?: ThreadReply[];
  threadRepliesLoading?: boolean;
  currentUserId?: string;
}) {
  const { t } = useTranslation('smithy');
  const isUnread = item.status === 'unread';
  const isArchived = item.status === 'archived';

  const formatFullTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatAbsoluteTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('inbox.justNow');
    if (minutes < 60) return t('inbox.minutesAgo', { count: minutes });
    if (hours < 24) return t('inbox.hoursAgo', { count: hours });
    if (days < 7) return t('inbox.daysAgo', { count: days });
    return '';
  };

  const senderName = item.sender?.name ?? t('inbox.unknown');
  const senderType = item.sender?.entityType ?? 'agent';
  const senderId = item.sender?.id ?? item.message?.sender;
  const channelName = item.channel?.name ?? item.channelId;
  const messageContent = item.message?.fullContent ?? item.message?.contentPreview ?? '';
  const contentType = item.message?.contentType ?? 'text';

  const getAvatarIcon = (entityType?: string) => {
    switch (entityType ?? senderType) {
      case 'agent': return <Bot className="w-5 h-5" />;
      case 'human': return <User className="w-5 h-5" />;
      case 'system': return <Server className="w-5 h-5" />;
      default: return <User className="w-5 h-5" />;
    }
  };

  const getAvatarColors = (entityType?: string) => {
    switch (entityType ?? senderType) {
      case 'agent': return 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400';
      case 'human': return 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400';
      case 'system': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const relativeTime = formatRelativeTime(item.createdAt);
  const hasAttachments = item.attachments && item.attachments.length > 0;
  const hasThreadParent = item.threadParent !== null && item.threadParent !== undefined;

  return (
    <div className="flex flex-col" data-testid={`inbox-page-message-content-${item.id}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => senderId && onNavigateToEntity(senderId)}
              className={`w-10 h-10 rounded-full flex items-center justify-center ${getAvatarColors()} hover:ring-2 hover:ring-blue-300 transition-all`}
              data-testid={`inbox-page-content-avatar-${item.id}`}
            >
              {getAvatarIcon()}
            </button>
            <div>
              <button
                onClick={() => senderId && onNavigateToEntity(senderId)}
                className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 hover:underline"
                data-testid={`inbox-page-content-sender-${item.id}`}
              >
                {senderName}
              </button>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <button
                  onClick={onNavigateToMessage}
                  className="hover:text-blue-600 hover:underline"
                  data-testid={`inbox-page-content-channel-${item.id}`}
                >
                  #{channelName}
                </button>
                <span>*</span>
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded ${
                    item.sourceType === 'mention'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  }`}
                >
                  {item.sourceType === 'mention' ? (
                    <>
                      <AtSign className="w-3 h-3" />
                      {t('inbox.mentionBadge')}
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-3 h-3" />
                      {t('inbox.directBadge')}
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              <>
                {!isArchived && onReply && (
                  <button
                    onClick={onReply}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                    title={t('inbox.reply')}
                    data-testid={`inbox-page-content-reply-${item.id}`}
                  >
                    <Reply className="w-4 h-4" />
                  </button>
                )}
                {isArchived ? (
                  <button
                    onClick={onRestore}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                    title={t('inbox.restore')}
                    data-testid={`inbox-page-content-restore-${item.id}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    {isUnread ? (
                      <button
                        onClick={onMarkRead}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                        title={t('inbox.markAsRead')}
                        data-testid={`inbox-page-content-mark-read-${item.id}`}
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={onMarkUnread}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                        title={t('inbox.markAsUnread')}
                        data-testid={`inbox-page-content-mark-unread-${item.id}`}
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={onArchive}
                      className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded transition-colors"
                      title={t('inbox.archive')}
                      data-testid={`inbox-page-content-archive-${item.id}`}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div
          className="mt-2 text-xs text-gray-500 dark:text-gray-400 cursor-help"
          title={formatAbsoluteTime(item.createdAt)}
          data-testid={`inbox-page-content-time-${item.id}`}
        >
          {formatFullTime(item.createdAt)}
          {relativeTime && <span className="ml-1">({relativeTime})</span>}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1">
        {/* Thread context */}
        {hasThreadParent && item.threadParent && (
          <div
            className="mx-4 mt-4 p-3 bg-gray-50 dark:bg-gray-800 border-l-4 border-gray-300 dark:border-gray-600 rounded-r"
            data-testid={`inbox-page-content-thread-context-${item.id}`}
          >
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <CornerUpLeft className="w-3 h-3" />
              <span>{t('inbox.replyTo')}</span>
            </div>
            <div className="flex items-start gap-2">
              <button
                onClick={() => item.threadParent?.sender?.id && onNavigateToEntity(item.threadParent.sender.id)}
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColors(item.threadParent.sender?.entityType)} hover:ring-2 hover:ring-blue-300 transition-all`}
              >
                {getAvatarIcon(item.threadParent.sender?.entityType)}
              </button>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => item.threadParent?.sender?.id && onNavigateToEntity(item.threadParent.sender.id)}
                  className="text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 hover:underline"
                >
                  {item.threadParent.sender?.name ?? t('inbox.unknown')}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {item.threadParent.contentPreview || t('inbox.noContent')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Message Content */}
        <div className="p-4">
          <div
            className={`prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 ${
              contentType === 'markdown' ? 'whitespace-pre-wrap' : 'whitespace-pre-wrap'
            }`}
            data-testid={`inbox-page-content-body-${item.id}`}
          >
            {messageContent || <span className="text-gray-400 italic">{t('inbox.noContent')}</span>}
          </div>
        </div>

        {/* Attachments */}
        {hasAttachments && (
          <div
            className="px-4 pb-4"
            data-testid={`inbox-page-content-attachments-${item.id}`}
          >
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
              <Paperclip className="w-3 h-3" />
              <span>{t('inbox.attachmentCount', { count: item.attachments!.length })}</span>
            </div>
            <div className="space-y-2">
              {item.attachments!.map((attachment) => (
                <div
                  key={attachment.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  data-testid={`inbox-page-content-attachment-${attachment.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                          {attachment.title}
                        </p>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                          {attachment.contentType ?? 'text'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {attachment.content && (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-3 whitespace-pre-wrap">
                      {attachment.content.substring(0, 200)}
                      {attachment.content.length > 200 && '...'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Thread Replies Section */}
        {(threadReplies && threadReplies.length > 0) && (
          <div
            className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 mt-4 pt-4"
            data-testid={`inbox-page-content-thread-${item.id}`}
          >
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
              <MessageSquare className="w-3 h-3" />
              <span className="font-medium">{t('inbox.threadReplyCount', { count: threadReplies.length })}</span>
            </div>
            <div className="space-y-3">
              {threadReplies.map((reply) => {
                const isOwnReply = reply.sender === currentUserId;
                const replySender = reply._senderEntity;
                const replySenderName = replySender?.name ?? t('inbox.unknown');
                const replySenderType = replySender?.entityType ?? 'agent';

                const getReplyAvatarIcon = () => {
                  switch (replySenderType) {
                    case 'agent': return <Bot className="w-3 h-3" />;
                    case 'human': return <User className="w-3 h-3" />;
                    case 'system': return <Server className="w-3 h-3" />;
                    default: return <User className="w-3 h-3" />;
                  }
                };

                const getReplyAvatarColors = () => {
                  if (isOwnReply) {
                    return 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400';
                  }
                  switch (replySenderType) {
                    case 'agent': return 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400';
                    case 'human': return 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400';
                    case 'system': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
                    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
                  }
                };

                const formatReplyTime = (dateStr: string) => {
                  const date = new Date(dateStr);
                  const now = new Date();
                  const diff = now.getTime() - date.getTime();
                  const minutes = Math.floor(diff / 60000);
                  const hours = Math.floor(diff / 3600000);

                  if (minutes < 1) return t('inbox.justNow');
                  if (minutes < 60) return t('inbox.minutesAgo', { count: minutes });
                  if (hours < 24) return t('inbox.hoursAgo', { count: hours });
                  return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
                };

                return (
                  <div
                    key={reply.id}
                    className={`flex gap-2 p-3 rounded-lg ${
                      isOwnReply
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                        : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                    }`}
                    data-testid={`inbox-page-thread-reply-${reply.id}`}
                  >
                    <button
                      onClick={() => reply.sender && onNavigateToEntity(reply.sender)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${getReplyAvatarColors()} hover:ring-2 hover:ring-blue-300 transition-all`}
                    >
                      {getReplyAvatarIcon()}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => reply.sender && onNavigateToEntity(reply.sender)}
                            className={`text-xs font-medium hover:text-blue-600 hover:underline ${
                              isOwnReply
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {replySenderName}
                          </button>
                          {isOwnReply && (
                            <span className="text-xs px-1.5 py-0.5 bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300 rounded font-medium">
                              {t('inbox.you')}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatReplyTime(reply.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {reply._content ?? ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading state for thread replies */}
        {threadRepliesLoading && (
          <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 mt-4 pt-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{t('inbox.loadingThread')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button
          onClick={onNavigateToMessage}
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
          data-testid={`inbox-page-content-view-in-channel-${item.id}`}
        >
          {t('inbox.viewInChannel')}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function InboxMessageEmptyState() {
  const { t } = useTranslation('smithy');
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500" data-testid="inbox-page-content-empty">
      <Inbox className="w-12 h-12 mb-3" />
      <p className="text-sm font-medium">{t('inbox.selectMessage')}</p>
      <p className="text-xs mt-1">{t('inbox.selectMessageDesc')}</p>
      <p className="text-xs mt-3 text-gray-300 dark:text-gray-600">{t('inbox.tipNavigate')}</p>
    </div>
  );
}

// Main Page Component
export function InboxPage() {
  const { t } = useTranslation('smithy');
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { message?: string };
  const { currentUser, isLoading: userLoading } = useCurrentUser();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null>(null);

  // State
  const [inboxView, setInboxView] = useState<InboxViewType>(() => getStoredInboxView());
  const [inboxSourceFilter, setInboxSourceFilter] = useState<InboxSourceFilter>(() => getStoredSourceFilter());
  const [inboxSortOrder, setInboxSortOrder] = useState<InboxSortOrder>(() => getStoredSortOrder());
  const [selectedInboxItemId, setSelectedInboxItemId] = useState<string | null>((search as { message?: string }).message || null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [timeUpdateTrigger, setTimeUpdateTrigger] = useState(0);
  const [replyContent, setReplyContent] = useState('');
  const [showReplyComposer, setShowReplyComposer] = useState(false);

  // Real-time updates with toast notifications
  // Note: Query cache invalidation is handled automatically by useRealtimeEvents with autoInvalidate=true
  const handleInboxEvent = useCallback((event: WebSocketEvent) => {
    // Handle inbox-item events for the current user - show toast notification
    if (event.elementType === 'inbox-item' && event.eventType === 'created') {
      const recipientId = event.newValue?.recipientId as string | undefined;
      if (recipientId === currentUser?.id) {
        // Show toast notification for new inbox item
        const sourceType = event.newValue?.sourceType as string;
        const message = sourceType === 'mention'
          ? t('inbox.mentionedToast')
          : t('inbox.directToast');
        toast.info(message, {
          description: t('inbox.clickToView'),
          action: {
            label: t('inbox.view'),
            onClick: () => {
              // Clear selection to show the new item at top
              setSelectedInboxItemId(null);
            },
          },
        });
      }
    }
  }, [currentUser?.id]);

  // Subscribe to real-time events - include messages channel for thread updates
  useRealtimeEvents({
    channels: currentUser?.id ? [`inbox:${currentUser.id}`, 'inbox', 'messages'] : ['inbox', 'messages'],
    onEvent: handleInboxEvent,
  });

  // Refetch inbox when switching users
  useEffect(() => {
    if (currentUser?.id && prevUserIdRef.current !== currentUser.id) {
      // Clear selection when switching users
      setSelectedInboxItemId(null);
      setShowReplyComposer(false);
      setReplyContent('');
      // Invalidate queries to force refetch
      queryClient.invalidateQueries({ queryKey: ['inbox', currentUser.id] });
      prevUserIdRef.current = currentUser.id;
    }
  }, [currentUser?.id, queryClient]);

  // Periodic time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeUpdateTrigger(prev => prev + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch data for the current user
  const { data: inboxData, isLoading: inboxLoading, isError: inboxError, refetch: refetchInbox } = useUserInbox(inboxView, currentUser?.id ?? null);
  const { data: inboxCount } = useUserInboxCount(currentUser?.id ?? null);
  const markInboxMutation = useMarkInboxRead();
  const sendReplyMutation = useSendReply();

  // Get the message ID for the selected inbox item to fetch thread replies
  const selectedMessageId = useMemo(() => {
    if (!selectedInboxItemId || !inboxData?.items) return null;
    const item = inboxData.items.find(i => i.id === selectedInboxItemId);
    return item?.messageId ?? null;
  }, [selectedInboxItemId, inboxData?.items]);

  // Fetch thread replies for the selected message
  const { data: threadReplies, isLoading: threadRepliesLoading } = useThreadReplies(selectedMessageId);

  // Filter and sort items
  const filteredAndSortedInboxItems = useMemo(() => {
    if (!inboxData?.items) return [];

    let items = [...inboxData.items];

    // Apply source filter
    if (inboxSourceFilter === 'direct') {
      items = items.filter(item => item.sourceType === 'direct');
    } else if (inboxSourceFilter === 'mention') {
      items = items.filter(item => item.sourceType === 'mention');
    }

    // Apply sort
    if (inboxSortOrder === 'newest') {
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (inboxSortOrder === 'oldest') {
      items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (inboxSortOrder === 'sender') {
      items.sort((a, b) => (a.sender?.name ?? '').localeCompare(b.sender?.name ?? ''));
    }

    return items;
  }, [inboxData, inboxSourceFilter, inboxSortOrder]);

  // Group items by time period
  const groupedInboxItems = useMemo(() => {
    return groupByTimePeriod(
      filteredAndSortedInboxItems,
      (item) => new Date(item.createdAt)
    );
  }, [filteredAndSortedInboxItems]);

  // Selected item
  const selectedInboxItem = useMemo(() => {
    return filteredAndSortedInboxItems.find(item => item.id === selectedInboxItemId) || null;
  }, [filteredAndSortedInboxItems, selectedInboxItemId]);

  // Handlers
  const handleViewChange = useCallback((view: InboxViewType) => {
    setInboxView(view);
    setStoredInboxView(view);
    setSelectedInboxItemId(null);
  }, []);

  const handleSourceFilterChange = useCallback((filter: InboxSourceFilter) => {
    setInboxSourceFilter(filter);
    setStoredSourceFilter(filter);
  }, []);

  const handleSortOrderChange = useCallback((order: InboxSortOrder) => {
    setInboxSortOrder(order);
    setStoredSortOrder(order);
  }, []);

  const handleMarkInboxRead = useCallback((itemId: string) => {
    setPendingItemId(itemId);
    markInboxMutation.mutate(
      { itemId, status: 'read' },
      {
        onSettled: () => setPendingItemId(null),
      }
    );
  }, [markInboxMutation]);

  const handleMarkInboxUnread = useCallback((itemId: string) => {
    setPendingItemId(itemId);
    markInboxMutation.mutate(
      { itemId, status: 'unread' },
      {
        onSettled: () => setPendingItemId(null),
      }
    );
  }, [markInboxMutation]);

  const handleArchiveInbox = useCallback((itemId: string) => {
    setPendingItemId(itemId);
    markInboxMutation.mutate(
      { itemId, status: 'archived' },
      {
        onSuccess: () => {
          // Move to next message or clear selection
          const currentIndex = filteredAndSortedInboxItems.findIndex(item => item.id === itemId);
          const nextItem = filteredAndSortedInboxItems[currentIndex + 1] || filteredAndSortedInboxItems[currentIndex - 1];
          setSelectedInboxItemId(nextItem?.id || null);
        },
        onSettled: () => setPendingItemId(null),
      }
    );
  }, [markInboxMutation, filteredAndSortedInboxItems]);

  const handleRestoreInbox = useCallback((itemId: string) => {
    setPendingItemId(itemId);
    markInboxMutation.mutate(
      { itemId, status: 'read' },
      {
        onSettled: () => setPendingItemId(null),
      }
    );
  }, [markInboxMutation]);

  const handleNavigateToMessage = useCallback((channelId: string, _messageId: string) => {
    // Navigate to agents page since messages route may not exist in orchestrator-web
    // In the future, this could navigate to a messages route if added
    console.log(`Navigate to channel: ${channelId}`);
  }, []);

  const handleNavigateToEntity = useCallback((entityId: string) => {
    navigate({
      to: '/agents',
      search: { selected: entityId, tab: 'agents', role: undefined },
    });
  }, [navigate]);

  // Keyboard navigation
  const handleKeyNavigation = useCallback((direction: 'next' | 'prev') => {
    const currentIndex = filteredAndSortedInboxItems.findIndex(item => item.id === selectedInboxItemId);
    let newIndex = currentIndex;

    if (direction === 'next') {
      newIndex = currentIndex < filteredAndSortedInboxItems.length - 1 ? currentIndex + 1 : currentIndex;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
    }

    if (newIndex !== currentIndex && filteredAndSortedInboxItems[newIndex]) {
      setSelectedInboxItemId(filteredAndSortedInboxItems[newIndex].id);
    }
  }, [filteredAndSortedInboxItems, selectedInboxItemId]);

  // Keyboard shortcuts - using native event listener since useKeyboardShortcut may not exist
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'j' || e.key === 'J') {
        handleKeyNavigation('next');
      } else if (e.key === 'k' || e.key === 'K') {
        handleKeyNavigation('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyNavigation]);

  const isMobile = useContainerIsMobile();

  // Handle reply submission
  const handleSendReply = useCallback(async () => {
    if (!replyContent.trim() || !selectedInboxItem || !currentUser) return;

    try {
      await sendReplyMutation.mutateAsync({
        channelId: selectedInboxItem.channelId,
        sender: currentUser.id,
        content: replyContent.trim(),
        threadId: selectedInboxItem.messageId, // Reply to the original message
      });
      setReplyContent('');
      setShowReplyComposer(false);
    } catch (error) {
      console.error('Failed to send reply:', error);
    }
  }, [replyContent, selectedInboxItem, currentUser, sendReplyMutation]);

  // Show no user selected state
  if (!userLoading && !currentUser) {
    return (
      <div className="h-full flex flex-col bg-[var(--color-bg)]" data-testid="inbox-page">
        <PageHeader
          title={t('inbox.title')}
          icon={Inbox}
          iconColor="text-blue-500"
          subtitle={t('inbox.noUserSelected')}
          bordered
          testId="inbox-header"
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">{t('inbox.noUserSelected')}</p>
            <p className="text-sm mt-1">{t('inbox.noUserDesc')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg)]" data-testid="inbox-page">
      {/* Header */}
      <PageHeader
        title={currentUser ? t('inbox.userInbox', { name: currentUser.name }) : t('inbox.title')}
        icon={Inbox}
        iconColor="text-blue-500"
        subtitle={inboxCount?.count !== undefined && inboxCount.count > 0
          ? t('inbox.unreadCount', { count: inboxCount.count })
          : t('inbox.noUnread')}
        bordered
        testId="inbox-header"
      >
        {/* View tabs */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => handleViewChange('unread')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              inboxView === 'unread'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
            data-testid="inbox-page-tab-unread"
          >
            {t('inbox.tabUnread')}
            {inboxCount?.count !== undefined && inboxCount.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                {inboxCount.count}
              </span>
            )}
          </button>
          <button
            onClick={() => handleViewChange('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              inboxView === 'all'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
            data-testid="inbox-page-tab-all"
          >
            {t('inbox.tabAll')}
          </button>
          <button
            onClick={() => handleViewChange('archived')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              inboxView === 'archived'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
            data-testid="inbox-page-tab-archived"
          >
            {t('inbox.tabArchived')}
          </button>
        </div>
      </PageHeader>

      {/* Filter/Sort bar */}
      <div className={`flex items-center justify-between ${isMobile ? 'px-3' : 'px-6'} py-2 border-b border-[var(--color-border)] bg-gray-50 dark:bg-gray-900/50`}>
        {/* Source filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={inboxSourceFilter}
            onChange={(e) => handleSourceFilterChange(e.target.value as InboxSourceFilter)}
            className="text-sm bg-transparent border-none text-gray-600 dark:text-gray-400 cursor-pointer focus:outline-none"
            data-testid="inbox-page-source-filter"
          >
            <option value="all">{t('inbox.filterAllSources')}</option>
            <option value="direct">{t('inbox.filterDirect')}</option>
            <option value="mention">{t('inbox.filterMentions')}</option>
          </select>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-gray-400" />
          <select
            value={inboxSortOrder}
            onChange={(e) => handleSortOrderChange(e.target.value as InboxSortOrder)}
            className="text-sm bg-transparent border-none text-gray-600 dark:text-gray-400 cursor-pointer focus:outline-none"
            data-testid="inbox-page-sort-order"
          >
            <option value="newest">{t('inbox.sortNewest')}</option>
            <option value="oldest">{t('inbox.sortOldest')}</option>
            <option value="sender">{t('inbox.sortBySender')}</option>
          </select>
        </div>
      </div>

      {/* Main content - Split layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Message List (40%) */}
        <div
          className="w-2/5 border-r border-[var(--color-border)] overflow-hidden flex flex-col bg-white dark:bg-gray-900"
          data-testid="inbox-page-message-list"
        >
          {inboxLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">{t('inbox.loading')}</span>
            </div>
          ) : inboxError ? (
            <div className="text-center py-8 px-4" data-testid="inbox-page-error">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-gray-700 dark:text-gray-300">{t('inbox.errorTitle')}</p>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                {t('inbox.errorDesc')}
              </p>
              <button
                onClick={() => refetchInbox()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                data-testid="inbox-page-retry"
              >
                <RefreshCw className="w-3 h-3" />
                {t('inbox.retry')}
              </button>
            </div>
          ) : !inboxData || inboxData.items.length === 0 ? (
            <div className="text-center py-8 px-4" data-testid="inbox-page-empty">
              <Inbox className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {inboxView === 'unread'
                  ? t('inbox.noUnreadMessages')
                  : inboxView === 'archived'
                  ? t('inbox.noArchivedMessages')
                  : t('inbox.inboxEmpty')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
                {inboxView === 'archived'
                  ? t('inbox.archivedWillAppear')
                  : t('inbox.messagesWillAppear')}
              </p>
              {inboxView === 'unread' && (
                <button
                  onClick={() => handleViewChange('all')}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {t('inbox.viewAllMessages')}
                </button>
              )}
            </div>
          ) : filteredAndSortedInboxItems.length === 0 ? (
            <div className="text-center py-8 px-4" data-testid="inbox-page-filtered-empty">
              <Filter className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('inbox.noMatchFilters')}</p>
              <button
                onClick={() => handleSourceFilterChange('all')}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {t('inbox.clearFilters')}
              </button>
            </div>
          ) : (
            <VirtualizedList
              items={groupedInboxItems}
              getItemKey={(groupedItem) => groupedItem.item.id}
              estimateSize={(index) => {
                const groupedItem = groupedInboxItems[index];
                if (groupedItem?.isFirstInGroup && inboxSortOrder !== 'sender') {
                  return 72 + 28; // Item with recipient info + header
                }
                return 72; // Item with recipient info
              }}
              height="100%"
              testId="inbox-page-items-list"
              renderItem={(groupedItem) => (
                <>
                  {groupedItem.isFirstInGroup && inboxSortOrder !== 'sender' && (
                    <InboxTimePeriodHeader period={groupedItem.period} />
                  )}
                  <InboxMessageListItem
                    item={groupedItem.item}
                    isSelected={selectedInboxItemId === groupedItem.item.id}
                    onSelect={() => setSelectedInboxItemId(groupedItem.item.id)}
                    formattedTime={formatCompactTime(groupedItem.item.createdAt)}
                    key={`${groupedItem.item.id}-${timeUpdateTrigger}`}
                  />
                </>
              )}
            />
          )}

          {/* Count info */}
          {inboxData && inboxData.items.length > 0 && (
            <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-2 border-t border-gray-100 dark:border-gray-800">
              {inboxSourceFilter !== 'all' ? (
                <>{t('inbox.showingFiltered', { shown: filteredAndSortedInboxItems.length, total: inboxData.items.length })}</>
              ) : inboxData.hasMore ? (
                <>{t('inbox.showingTotal', { shown: inboxData.items.length, total: inboxData.total })}</>
              ) : (
                <>{t('inbox.itemCount', { count: inboxData.items.length })}</>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Message Content (60%) */}
        <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900 flex flex-col" data-testid="inbox-page-message-content-panel">
          {selectedInboxItem ? (
            <>
              <div className="flex-1 overflow-auto">
                <InboxMessageContent
                  item={selectedInboxItem}
                  onMarkRead={() => handleMarkInboxRead(selectedInboxItem.id)}
                  onMarkUnread={() => handleMarkInboxUnread(selectedInboxItem.id)}
                  onArchive={() => handleArchiveInbox(selectedInboxItem.id)}
                  onRestore={() => handleRestoreInbox(selectedInboxItem.id)}
                  isPending={pendingItemId === selectedInboxItem.id}
                  onNavigateToMessage={() => handleNavigateToMessage(selectedInboxItem.channelId, selectedInboxItem.messageId)}
                  onNavigateToEntity={handleNavigateToEntity}
                  onReply={() => setShowReplyComposer(!showReplyComposer)}
                  threadReplies={threadReplies}
                  threadRepliesLoading={threadRepliesLoading}
                  currentUserId={currentUser?.id}
                />
              </div>
              {/* Reply Composer */}
              {showReplyComposer && selectedInboxItem.status !== 'archived' && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800" data-testid="inbox-reply-composer">
                  <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
                    <Reply className="w-3 h-3" />
                    <span>
                      {t('inbox.replyingAs', { sender: currentUser?.name, recipient: selectedInboxItem.sender?.name ?? t('inbox.unknown') })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder={t('inbox.replyPlaceholder')}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      rows={3}
                      data-testid="inbox-reply-textarea"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          handleSendReply();
                        }
                      }}
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleSendReply}
                        disabled={!replyContent.trim() || sendReplyMutation.isPending}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        data-testid="inbox-reply-send"
                      >
                        {sendReplyMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Reply className="w-4 h-4" />
                        )}
                        {t('inbox.send')}
                      </button>
                      <button
                        onClick={() => {
                          setShowReplyComposer(false);
                          setReplyContent('');
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg transition-colors"
                        data-testid="inbox-reply-cancel"
                      >
                        {t('inbox.cancel')}
                      </button>
                    </div>
                  </div>
                  {sendReplyMutation.isError && (
                    <p className="mt-2 text-xs text-red-500" data-testid="inbox-reply-error">
                      {sendReplyMutation.error instanceof Error
                        ? sendReplyMutation.error.message
                        : t('inbox.failedReply')}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    {t('inbox.sendHint', { key: navigator.platform.includes('Mac') ? 'Cmd+' : 'Ctrl+' })}
                  </p>
                </div>
              )}
            </>
          ) : (
            <InboxMessageEmptyState />
          )}
        </div>
      </div>
    </div>
  );
}
