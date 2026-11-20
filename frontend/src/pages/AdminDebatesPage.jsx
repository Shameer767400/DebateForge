import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import AdminStatCard from '../components/admin/AdminStatCard';
import AdminDataTable from '../components/admin/AdminDataTable';
import AdminStatusBadge from '../components/admin/AdminStatusBadge';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#1a1a25',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
  },
};

const fmtDuration = (secs) =>
  secs ? `${Math.floor(secs / 60)}m ${secs % 60}s` : '—';

const WIN_COLORS = ['#00ff87', '#ff3366', '#ffcc00'];
const DIFF_COLOR = '#00aaff';
const TOPIC_COLOR = '#00ff87';
const SCORE_COLOR = '#ffcc00';

const RANGE_OPTIONS = [
  { label: '7d', value: '7' },
  { label: '30d', value: '30' },
  { label: '90d', value: '90' },
  { label: 'All', value: 'all' },
];

const DEBATE_COLUMNS = [
  { key: 'username', label: 'User' },
  { key: 'topic', label: 'Topic' },
  {
    key: 'format',
    label: 'Format',
    render: (val) => <AdminStatusBadge status={val} />,
  },
  {
    key: 'difficulty',
    label: 'Difficulty',
    render: (val) => <AdminStatusBadge status={val} />,
  },
  { key: 'score', label: 'Score' },
  {
    key: 'winner',
    label: 'Winner',
    render: (val) => {
      const variant =
        val === 'user' ? 'success' : val === 'ai' ? 'danger' : 'warning';
      return <AdminStatusBadge status={val} variant={variant} />;
    },
  },
  {
    key: 'duration',
    label: 'Duration',
    render: (val) => fmtDuration(val),
  },
  {
    key: 'createdAt',
    label: 'Date',
    render: (val) =>
      val
        ? new Date(val).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '—',
  },
];

export default function AdminDebatesPage() {
  const [range, setRange] = useState('30');
  const [analytics, setAnalytics] = useState(null);
  const [debates, setDebates] = useState([]);
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [debatesLoading, setDebatesLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    setLoading(true);
    axios
      .get('/api/admin/debates/analytics', {
        baseURL: API,
        withCredentials: true,
        params: { range },
      })
      .then((res) => setAnalytics(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [range]);

  const fetchDebates = useCallback(() => {
    setDebatesLoading(true);
    axios
      .get('/api/admin/debates', {
        baseURL: API,
        withCredentials: true,
        params: { range, page, limit: 20 },
      })
      .then((res) => {
        setDebates(res.data.debates || res.data.items || []);
        setPagination(res.data.pagination || {});
      })
      .catch(console.error)
      .finally(() => setDebatesLoading(false));
  }, [range, page]);

  useEffect(() => {
    fetchDebates();
  }, [fetchDebates]);

  const winData = analytics
    ? [
        { name: 'User Wins', value: analytics.userWins || 0 },
        { name: 'AI Wins', value: analytics.aiWins || 0 },
        { name: 'Draws', value: analytics.draws || 0 },
      ]
    : [];

  const diffData = analytics?.difficultyDistribution
    ? Object.entries(analytics.difficultyDistribution).map(([name, value]) => ({
        name,
        value,
      }))
    : [];

  const topTopics = analytics?.topTopics
    ? analytics.topTopics.slice(0, 10).map((t) => ({
        name: t.topic || t._id || t.name,
        value: t.count || t.value,
      }))
    : [];

  const scoreData = analytics?.scoreDistribution
    ? analytics.scoreDistribution
    : [];

  const fallacyData = analytics?.fallacyDistribution
    ? Object.entries(analytics.fallacyDistribution).map(([name, value]) => ({
        name,
        value,
      }))
    : [];

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="df-spinner">
          <div className="df-spinner-core" />
          <div className="df-spinner-orbit" />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page admin-debates-page">
      <AdminPageHeader
        title="Debate Analytics"
        subtitle="Insights into debate activity, performance, and trends"
      />

      {/* Range Selector */}
      <div className="admin-range-selector">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`admin-range-btn${range === opt.value ? ' active' : ''}`}
            onClick={() => {
              setRange(opt.value);
              setPage(1);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="admin-stats-grid admin-stats-grid--6">
        <AdminStatCard
          label="Total Debates"
          value={analytics?.totalDebates ?? '—'}
          icon="🗣️"
          color="#00aaff"
        />
        <AdminStatCard
          label="Completed"
          value={analytics?.completed ?? '—'}
          icon="✅"
          color="#00ff87"
        />
        <AdminStatCard
          label="Avg Duration"
          value={fmtDuration(analytics?.avgDuration)}
          icon="⏱️"
          color="#ffcc00"
        />
        <AdminStatCard
          label="Avg Score"
          value={
            analytics?.avgScore != null
              ? `${Number(analytics.avgScore).toFixed(1)}/100`
              : '—'
          }
          icon="⭐"
          color="#00ff87"
        />
        <AdminStatCard
          label="User Wins"
          value={analytics?.userWins ?? '—'}
          icon="🏆"
          color="#00ff87"
        />
        <AdminStatCard
          label="AI Wins"
          value={analytics?.aiWins ?? '—'}
          icon="🤖"
          color="#ff3366"
        />
      </div>

      {/* Charts Grid */}
      <div className="admin-charts-grid admin-charts-grid--2x2">
        {/* Win Distribution */}
        <div className="admin-chart-card">
          <h3 className="admin-chart-title">Win Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={winData}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {winData.map((_, i) => (
                  <Cell key={i} fill={WIN_COLORS[i % WIN_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Difficulty Distribution */}
        <div className="admin-chart-card">
          <h3 className="admin-chart-title">Difficulty Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={diffData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: '#aaa', fontSize: 12 }} />
              <YAxis tick={{ fill: '#aaa', fontSize: 12 }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="value" fill={DIFF_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Topics */}
        <div className="admin-chart-card">
          <h3 className="admin-chart-title">Top Topics</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={topTopics}
              layout="vertical"
              margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" tick={{ fill: '#aaa', fontSize: 12 }} />
              <YAxis
                dataKey="name"
                type="category"
                width={120}
                tick={{ fill: '#aaa', fontSize: 11 }}
                tickFormatter={(v) =>
                  v && v.length > 16 ? v.slice(0, 16) + '…' : v
                }
              />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="value" fill={TOPIC_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Score Distribution */}
        <div className="admin-chart-card">
          <h3 className="admin-chart-title">Score Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={scoreData}
              margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="bucket" tick={{ fill: '#aaa', fontSize: 12 }} />
              <YAxis tick={{ fill: '#aaa', fontSize: 12 }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="count" fill={SCORE_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fallacy Heatmap */}
      {fallacyData.length > 0 && (
        <div className="admin-chart-card admin-chart-card--wide">
          <h3 className="admin-chart-title">Fallacy Heatmap</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={fallacyData}
              margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#aaa', fontSize: 11 }}
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fill: '#aaa', fontSize: 12 }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="value" fill="#ff3366" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Debates Table */}
      <div className="admin-section">
        <h3 className="admin-section-title">Recent Debates</h3>
        {debatesLoading ? (
          <div className="admin-loading">
            <div className="df-spinner">
              <div className="df-spinner-core" />
              <div className="df-spinner-orbit" />
            </div>
          </div>
        ) : (
          <AdminDataTable
            columns={DEBATE_COLUMNS}
            data={debates}
            pagination={pagination}
            onPageChange={setPage}
            onRowClick={(row) =>
              setExpandedRow(expandedRow === row._id ? null : row._id)
            }
            expandedRowId={expandedRow}
            renderExpandedRow={(row) => (
              <div className="admin-expanded-row">
                <div className="admin-expanded-row__grid">
                  <div>
                    <span className="admin-expanded-label">Debate ID</span>
                    <span className="admin-expanded-value">{row._id}</span>
                  </div>
                  <div>
                    <span className="admin-expanded-label">Full Topic</span>
                    <span className="admin-expanded-value">{row.topic}</span>
                  </div>
                  <div>
                    <span className="admin-expanded-label">Format</span>
                    <span className="admin-expanded-value">{row.format}</span>
                  </div>
                  <div>
                    <span className="admin-expanded-label">Difficulty</span>
                    <span className="admin-expanded-value">{row.difficulty}</span>
                  </div>
                  <div>
                    <span className="admin-expanded-label">Score</span>
                    <span className="admin-expanded-value">{row.score ?? '—'}</span>
                  </div>
                  <div>
                    <span className="admin-expanded-label">Rounds</span>
                    <span className="admin-expanded-value">{row.rounds ?? '—'}</span>
                  </div>
                  {row.feedback && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span className="admin-expanded-label">Feedback</span>
                      <span className="admin-expanded-value">{row.feedback}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            emptyMessage="No debates found for this period."
          />
        )}
      </div>
    </div>
  );
}
