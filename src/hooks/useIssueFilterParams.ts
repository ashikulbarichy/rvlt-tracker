import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IssueBucket } from './useIssues';

/**
 * Filter state for the issue lists, held in the URL so links are shareable and
 * back/forward behave, and mirrored to localStorage so arriving via a bare sidebar link
 * restores what you were last looking at.
 *
 * Precedence: explicit URL params > stored filter > the open default.
 */
export interface IssueFilterState {
  bucket: IssueBucket;
  statusIds: string[];
  /** The pre-existing "Mine" tab: an assignee filter, orthogonal to the bucket. */
  mine: boolean;
}

const BUCKETS: IssueBucket[] = ['open', 'closed', 'archived', 'trash', 'all'];
const DEFAULT_BUCKET: IssueBucket = 'open';
const STORAGE_PREFIX = 'rvlt:issue-filter:';

function isBucket(value: string | null): value is IssueBucket {
  return value !== null && (BUCKETS as string[]).includes(value);
}

function parseStatusParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/** Storage can throw outright in private windows, so every access is guarded. */
function readStored(storageKey: string | null): IssueFilterState | null {
  if (!storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const candidate = parsed as { bucket?: unknown; statusIds?: unknown; mine?: unknown };
    const bucket = typeof candidate.bucket === 'string' && isBucket(candidate.bucket)
      ? candidate.bucket
      : DEFAULT_BUCKET;
    const statusIds = Array.isArray(candidate.statusIds)
      ? candidate.statusIds.filter((id): id is string => typeof id === 'string')
      : [];

    return { bucket, statusIds, mine: candidate.mine === true };
  } catch {
    return null;
  }
}

function writeStored(storageKey: string | null, state: IssueFilterState): void {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Storage unavailable — the URL is still the source of truth, so this is survivable.
  }
}

interface UseIssueFilterParamsOptions {
  workspaceSlug?: string;
  /**
   * Ids of the workflow states that exist for the current scope. While this is empty the
   * states are still loading, so unknown ids in the URL are kept rather than stripped.
   */
  validStatusIds?: string[];
  /**
   * Distinguishes surfaces that each remember their own filter. The issue list and the
   * project detail panel are separate scopes, so switching between them doesn't drag
   * one's filter onto the other.
   */
  scope?: string;
}

export function useIssueFilterParams({
  workspaceSlug, validStatusIds, scope = 'issues',
}: UseIssueFilterParamsOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const seeded = useRef(false);
  const storageKey = workspaceSlug ? `${STORAGE_PREFIX}${workspaceSlug}:${scope}` : null;

  const rawView = searchParams.get('view');
  const rawStatus = searchParams.get('status');
  const rawMine = searchParams.get('mine');
  const hasFilterParams = rawView !== null || rawStatus !== null || rawMine !== null;

  const statusListReady = Array.isArray(validStatusIds) && validStatusIds.length > 0;
  const requestedStatusIds = parseStatusParam(rawStatus);

  // Derived during render rather than mirrored into state.
  const bucket: IssueBucket = isBucket(rawView) ? rawView : DEFAULT_BUCKET;
  const mine = rawMine === '1';
  const statusIds = statusListReady
    ? requestedStatusIds.filter(id => validStatusIds!.includes(id))
    : requestedStatusIds;

  const writeParams = useCallback((next: IssueFilterState) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', next.bucket);
    if (next.statusIds.length > 0) {
      params.set('status', next.statusIds.join(','));
    } else {
      params.delete('status');
    }
    if (next.mine) {
      params.set('mine', '1');
    } else {
      params.delete('mine');
    }
    return params;
  }, [searchParams]);

  const apply = useCallback((next: IssueFilterState) => {
    // replace so a filter change doesn't add a history entry per click.
    setSearchParams(writeParams(next), { replace: true });
    writeStored(storageKey, next);
  }, [writeParams, setSearchParams, storageKey]);

  /** Merge a partial change onto the current filter. */
  const setFilter = useCallback((patch: Partial<IssueFilterState>) => {
    apply({ bucket, statusIds, mine, ...patch });
  }, [apply, bucket, statusIds, mine]);

  // Seed a bare URL once, from storage if we have it, otherwise the open default.
  useEffect(() => {
    if (seeded.current || hasFilterParams) {
      if (hasFilterParams) seeded.current = true;
      return;
    }
    seeded.current = true;

    const stored = readStored(storageKey);
    const next: IssueFilterState = stored ?? { bucket: DEFAULT_BUCKET, statusIds: [], mine: false };
    setSearchParams(writeParams(next), { replace: true });
  }, [hasFilterParams, storageKey, writeParams, setSearchParams]);

  // Drop ids for states that no longer exist, so a stale link doesn't show an empty list.
  useEffect(() => {
    if (!statusListReady || requestedStatusIds.length === 0) return;
    if (statusIds.length === requestedStatusIds.length) return;

    const params = new URLSearchParams(searchParams);
    if (statusIds.length > 0) {
      params.set('status', statusIds.join(','));
    } else {
      params.delete('status');
      params.set('view', DEFAULT_BUCKET);
    }
    setSearchParams(params, { replace: true });
  }, [statusListReady, requestedStatusIds, statusIds, searchParams, setSearchParams]);

  const setBucket = useCallback((next: IssueBucket) => {
    // A bucket choice replaces any explicit status selection.
    setFilter({ bucket: next, statusIds: [] });
  }, [setFilter]);

  const setStatusIds = useCallback((ids: string[]) => {
    // An explicit status selection overrides the bucket (spec behaviour 2).
    setFilter({ bucket: ids.length > 0 ? 'all' : DEFAULT_BUCKET, statusIds: ids });
  }, [setFilter]);

  const toggleStatusId = useCallback((id: string) => {
    const next = statusIds.includes(id)
      ? statusIds.filter(existing => existing !== id)
      : [...statusIds, id];
    setStatusIds(next);
  }, [statusIds, setStatusIds]);

  const clearFilters = useCallback(() => {
    apply({ bucket: DEFAULT_BUCKET, statusIds: [], mine: false });
  }, [apply]);

  return { bucket, statusIds, mine, setFilter, setBucket, setStatusIds, toggleStatusId, clearFilters };
}
