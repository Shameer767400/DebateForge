import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import AdminStatCard from '../components/admin/AdminStatCard';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#1a1a25',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
  },
};

const PIE_COLORS = ['#00ff87', '#ff3366', '#ffcc00', '#00aaff'];
const FORMAT_LABELS = {
  freeform: 'Freeform',
  oxford: 'Oxford',
  lincoln_douglas: 'Lincoln-Douglas',
  parliamentary: 'Parliamentary',
};

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtNum = (n) => (n != null && !isNaN(Number(n)) ? Number(n).toLocaleString() : '0');

export default function AdminOverviewPage() {
  const [stats, setStats] = useState({});
  const [charts, setCharts] = useState({});
  const [recent, setRecent] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      axios.get('/api/admin/overview/stats', { baseURL: API, withCredentials: true }),
      axios.get('/api/admin/overview/charts', { baseURL: API, withCredentials: true }),
      axios.get('/api/admin/overview/recent', { baseURL: API, withCredentials: true }),
    ])
      .then(([statsRes, chartsRes, recentRes]) => {
        setStats(statsRes.data);
        setCharts(chartsRes.data);
        setRecent(recentRes.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

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

  if (error) {
    return <div className="admin-error">Failed to load overview: {error}</div>;
  }

  const registrations = charts.registrations || [];
  const debatesPerDay = charts.debatesPerDay || [];
  const scoreTrends = charts.scoreTrends || [];
  const formatDistribution = (charts.formatDistribution || []).map((item) => {
    const rawKey = item.format || item.name || '';
    return {
      name: FORMAT_LABELS[rawKey] || rawKey || 'Unknown',
      value: typeof item.count === 'number' ? item.count : (typeof item.value === 'number' ? item.value : 0),
    };
  });
  const recentUsers = recent.users || recent.recentUsers || [];
  const recentDebates = recent.debates || recent.recentDebates || [];

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Dashboard Overview"
        subtitle="Real-time platform statistics"
      />

      {/* Stats Grid */}
      <div className="admin-stats-grid">
        <AdminStatCard
          icon="👥"
          label="Total Users"
          value={fmtNum(stats.totalUsers)}
          trend={stats.userGrowth}
          color="green"
        />
        <AdminStatCard
          icon="🎯"
          label="Total Debates"
          value={fmtNum(stats.totalDebates)}
          trend={null}
          color="blue"
        />
        <AdminStatCard
          icon="🟢"
          label="Active Users (7d)"
          value={fmtNum(stats.activeUsers7d)}
          color="green"
        />
        <AdminStatCard
          icon="⭐"
          label="Avg Rating"
          value={`${stats.avgRating}/5`}
          color="yellow"
        />
        <AdminStatCard
          icon="✅"
          label="Completion Rate"
          value={`${stats.completionRate}%`}
          color="blue"
        />
        <AdminStatCard
          icon="📊"
          label="Today's Debates"
          value={fmtNum(stats.debatesToday)}
          color="blue"
        />
      </div>

      {/* Charts Grid */}
      <div className="admin-charts-grid">
        {/* User Growth */}
        <div className="admin-chart-card">
          <h3 className="admin-chart-title">User Growth</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={registrations}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtDate} />
              <Line type="monotone" dataKey="count" stroke="#00ff87" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Debates Per Day */}
        <div className="admin-chart-card">
          <h3 className="admin-chart-title">Debates Per Day</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={debatesPerDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtDate} />
              <Bar dataKey="count" fill="#00aaff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Score Trends */}
        <div className="admin-chart-card">
          <h3 className="admin-chart-title">Score Trends</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={scoreTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={fmtDate} />
              <Legend />
              <Line type="monotone" dataKey="Logic" stroke="#00ff87" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Evidence" stroke="#ffcc00" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Clarity" stroke="#00aaff" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Format Distribution */}
        <div className="admin-chart-card">
          <h3 className="admin-chart-title">Format Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={formatDistribution}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {formatDistribution.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="admin-recent-grid">
        {/* Recent Users */}
        <div className="admin-recent-card">
          <h3 className="admin-recent-title">Recent Registrations</h3>
          <div className="admin-recent-list">
            {recentUsers.length === 0 ? (
              <p className="admin-empty">No recent registrations.</p>
            ) : (
              recentUsers.slice(0, 10).map((u) => (
                <div key={u._id || u.username} className="admin-recent-row">
                  <div className="admin-recent-primary">{u.username}</div>
                  <div className="admin-recent-secondary">{u.email}</div>
                  <div className="admin-recent-meta">{fmtDate(u.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Debates */}
        <div className="admin-recent-card">
          <h3 className="admin-recent-title">Recent Debates</h3>
          <div className="admin-recent-list">
            {recentDebates.length === 0 ? (
              <p className="admin-empty">No recent debates.</p>
            ) : (
              recentDebates.slice(0, 10).map((d) => (
                <div key={d._id} className="admin-recent-row">
                  <div className="admin-recent-primary" title={d.topic}>
                    {d.topic?.length > 40 ? d.topic.slice(0, 40) + '…' : d.topic}
                  </div>
                  <div className="admin-recent-secondary">
                    {d.format} · Score: {d.score} · Winner: {d.winner || '—'}
                  </div>
                  <div className="admin-recent-meta">{fmtDate(d.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
