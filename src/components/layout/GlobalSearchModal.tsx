import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useIssues } from '../../hooks/useIssues';
import { useNavigate } from 'react-router-dom';
import { formatIssueIdentifier } from '../../lib/identifier';
import { StatusBadge } from '../common/StatusBadge';

export const GlobalSearchModal: React.FC = () => {
  const { isSearchModalOpen, setIsSearchModalOpen, currentWorkspace } = useApp();
  const [localQuery, setLocalQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(localQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [localQuery]);

  // Focus input on open
  useEffect(() => {
    if (isSearchModalOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setLocalQuery('');
      setDebouncedQuery('');
    }
  }, [isSearchModalOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchModalOpen) {
        setIsSearchModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchModalOpen, setIsSearchModalOpen]);

  const { issues, isLoading } = useIssues({
    workspaceId: currentWorkspace?.id,
    searchQuery: debouncedQuery,
    limit: 10
  });

  if (!isSearchModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] sm:pt-[20vh] px-3 sm:px-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={() => setIsSearchModalOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-bg-surface-raised rounded-xl shadow-2xl border border-transparent overflow-hidden flex flex-col max-h-[75vh] sm:max-h-[60vh] transform transition-all">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-text-secondary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none text-text-primary px-3 py-1.5 text-base focus:outline-none focus:ring-0 placeholder:text-text-tertiary"
            placeholder="Search issues, docs, or people..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
          />
          {localQuery && (
            <button 
              onClick={() => setLocalQuery('')}
              className="p-1 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="hidden sm:flex items-center space-x-1 ml-2 px-2 py-1 bg-bg-surface-hover rounded-full text-[10px] font-medium text-text-tertiary border border-transparent">
            <span>ESC</span>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto min-h-[100px] p-2">
          {!debouncedQuery ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <Search className="w-8 h-8 text-text-tertiary mb-3 opacity-50" />
              <p className="text-sm text-text-secondary">Type to start searching</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-text-secondary animate-spin" />
            </div>
          ) : issues && issues.length > 0 ? (
            <div className="space-y-1">
              <div className="px-3 py-2 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Issues
              </div>
              {issues.map((issue: any) => (
                <button
                  key={issue.id}
                  onClick={() => {
                    navigate(`/${currentWorkspace?.slug || ''}/issue/${formatIssueIdentifier(issue)}`);
                    setIsSearchModalOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-bg-surface-hover transition-colors text-left group"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="font-id text-[11px] font-medium text-text-secondary shrink-0 w-16">
                      {formatIssueIdentifier(issue)}
                    </span>
                    <span className="text-sm text-text-primary truncate font-medium">
                      {issue.title}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 shrink-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <StatusBadge name={issue.status?.name || 'Todo'} color={issue.status?.color} size="xs" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-text-secondary">No results found for "{debouncedQuery}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
