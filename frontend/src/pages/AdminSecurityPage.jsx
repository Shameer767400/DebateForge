import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import AdminStatCard from '../components/admin/AdminStatCard';
import AdminFilterBar from '../components/admin/AdminFilterBar';
import AdminDataTable from '../components/admin/AdminDataTable';
import AdminStatusBadge from '../components/admin/AdminStatusBadge';
import { useToast } from '../context/ToastContext';
import SEOHead from '../components/SEOHead';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const LEVEL_BADGES = {
  INFO: 'info',
  WARN: 'warning',
  ALERT: 'danger',
  CRITICAL: 'danger',
};

const CATEGORIES = [
  { value: 'AUTH', label: 'Authentication' },
  { value: 'RATE_LIMIT', label: 'Rate Limiting' },
  { value: 'BOT_DEFENSE', label: 'Bot Defense' },
  { value: 'API_ERROR', label: 'API Errors' },
  { value: 'SUSPICIOUS', label: 'Suspicious Activity' },
  { value: 'SYSTEM', label: 'System Operations' },
];

const LEVELS = [
  { value: 'INFO', label: 'INFO' },
  { value: 'WARN', label: 'WARN' },
  { value: 'ALERT', label: 'ALERT' },
  { value: 'CRITICAL', label: 'CRITICAL' },
];

export default function AdminSecurityPage() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ level: '', category: '' });
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/security/summary', {
        baseURL: API,
        withCredentials: true,
      });
      setSummary(res.data);
    } catch {
      // Non-fatal if summary endpoint is temporarily quiet
    }
  }, []);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 50,
      };
      if (search.trim()) params.search = search.trim();
      if (filters.level) params.level = filters.level;
      if (filters.category) params.category = filters.category;

      const res = await axios.get('/api/admin/security/logs', {
        baseURL: API,
        withCredentials: true,
        params,
      });

      setLogs(res.data.logs || []);
      if (res.data.pagination) {
        setPagination(res.data.pagination);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch security logs');
    } finally {
      setLoading(false);
    }
  }, [search, filters, toast]);

  useEffect(() => {
    fetchSummary();
    fetchLogs(1);

    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      fetchSummary();
      fetchLogs(pagination.page || 1);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchSummary, fetchLogs]);

  const handlePageChange = (newPage) => {
    fetchLogs(newPage);
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return ts;
    }
  };

  const columns = [
    {
      key: 'timestamp',
      label: 'Timestamp',
      render: (val, item) => (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {formatTimestamp(val || item?.timestamp)}
        </span>
      ),
    },
    {
      key: 'level',
      label: 'Severity',
      render: (val, item) => {
        let lvl = 'INFO';
        if (typeof val === 'string') lvl = val;
        else if (typeof item?.level === 'string') lvl = item.level;
        else if (item?.level && typeof item.level === 'object' && typeof item.level.level === 'string') lvl = item.level.level;

        return (
          <AdminStatusBadge
            status={LEVEL_BADGES[lvl] || 'muted'}
            label={lvl}
          />
        );
      },
    },
    {
      key: 'category',
      label: 'Category',
      render: (val, item) => {
        let cat = '—';
        if (typeof val === 'string') cat = val;
        else if (typeof item?.category === 'string') cat = item.category;
        else if (item?.category && typeof item.category === 'object' && typeof item.category.category === 'string') cat = item.category.category;

        return (
          <span
            className="admin-badge"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {cat}
          </span>
        );
      },
    },
    {
      key: 'message',
      label: 'Event Details',
      render: (val, item, idx) => {
        const isExpanded = expandedLogId === idx;
        const logObj = item && typeof item === 'object' ? item : {};
        const metaKeys = Object.keys(logObj).filter(
          (k) => !['timestamp', 'level', 'category', 'message', 'ip'].includes(k)
        );

        let msg = '—';
        if (typeof val === 'string') msg = val;
        else if (typeof logObj.message === 'string') msg = logObj.message;
        else if (val && typeof val === 'object') msg = JSON.stringify(val);

        const isAlert = logObj.level === 'ALERT' || logObj.level === 'CRITICAL';

        return (
          <div>
            <div
              style={{
                cursor: 'pointer',
                fontWeight: 500,
                color: isAlert ? 'var(--accent-ai)' : 'var(--text-primary)',
              }}
              onClick={() => setExpandedLogId(isExpanded ? null : idx)}
            >
              {msg}
              {metaKeys.length > 0 && (
                <span style={{ marginLeft: '8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {isExpanded ? '▲ Hide metadata' : '▼ Show metadata'}
                </span>
              )}
            </div>

            {isExpanded && metaKeys.length > 0 && (
              <pre
                style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  overflowX: 'auto',
                }}
              >
                {JSON.stringify(
                  metaKeys.reduce((acc, k) => {
                    acc[k] = logObj[k];
                    return acc;
                  }, {}),
                  null,
                  2
                )}
              </pre>
            )}
          </div>
        );
      },
    },
    {
      key: 'ip',
      label: 'IP Address',
      render: (val, item) => (
        <code style={{ fontSize: '0.78rem', color: 'var(--accent-blue)' }}>
          {val || item?.ip || '—'}
        </code>
      ),
    },
  ];

  // Derive 24h summary metrics safely
  const s24 = summary?.last24h || {};
  const totalEvents24h = s24.total || 0;
  const failedLogins24h = s24.byCategory?.AUTH || 0;
  const botsBlocked24h = s24.byCategory?.BOT_DEFENSE || 0;
  const alerts24h = (s24.byLevel?.ALERT || 0) + (s24.byLevel?.CRITICAL || 0);

  return (
    <div className="admin-page">
      <SEOHead title="Security & Audit Log - Admin" noindex />
      <AdminPageHeader
        title="Security & Audit Log"
        subtitle="Real-time monitoring of authentication events, defense triggers, and system anomalies"
      >
        <button
          type="button"
          className="admin-btn admin-btn--secondary"
          onClick={() => {
            fetchSummary();
            fetchLogs(pagination.page);
            toast.info('Refreshing security logs...');
          }}
        >
          🔄 Refresh
        </button>
      </AdminPageHeader>

      {/* 24h Stats summary cards */}
      <div className="admin-stats-grid" style={{ marginBottom: '24px' }}>
        <AdminStatCard
          icon="📋"
          label="Total Events (24h)"
          value={totalEvents24h.toLocaleString()}
          color="blue"
        />
        <AdminStatCard
          icon="🔒"
          label="Auth Operations (24h)"
          value={failedLogins24h.toLocaleString()}
          color="yellow"
        />
        <AdminStatCard
          icon="🤖"
          label="Bot Invocations Blocked"
          value={botsBlocked24h.toLocaleString()}
          color="green"
        />
        <AdminStatCard
          icon="⚠️"
          label="Alerts / Warnings (24h)"
          value={alerts24h.toLocaleString()}
          color={alerts24h > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Filter Bar */}
      <AdminFilterBar
        searchPlaceholder="Search log messages..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: 'level',
            label: 'Severity',
            value: filters.level,
            options: [
              { value: '', label: 'All Severities' },
              ...LEVELS,
            ],
          },
          {
            key: 'category',
            label: 'Category',
            value: filters.category,
            options: [
              { value: '', label: 'All Categories' },
              ...CATEGORIES,
            ],
          },
        ]}
        onFilterChange={(key, val) => setFilters((prev) => ({ ...prev, [key]: val }))}
        onClear={() => {
          setSearch('');
          setFilters({ level: '', category: '' });
        }}
      />

      {/* Logs Table */}
      <AdminDataTable
        columns={columns}
        data={logs}
        loading={loading}
        pagination={pagination}
        onPageChange={handlePageChange}
        emptyMessage="No security events found matching current criteria"
      />
    </div>
  );
}
