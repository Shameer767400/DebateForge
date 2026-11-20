import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import AdminStatusBadge from '../components/admin/AdminStatusBadge';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#1a1a25',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
  },
};

const PIE_COLORS = ['#00ff87', '#ff3366', '#ffcc00', '#00aaff'];

const formatUptime = (secs) => {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

const formatMB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function AdminSystemPage() {
  const [health, setHealth] = useState(null);
  const [aiMetrics, setAiMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, metricsRes] = await Promise.all([
        axios.get('/api/admin/system/health', { baseURL: API, withCredentials: true }),
        axios.get('/api/admin/system/ai-metrics', { baseURL: API, withCredentials: true }),
      ]);
      setHealth(healthRes.data);
      setAiMetrics(metricsRes.data);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

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

  if (error && !health) {
    return <div className="admin-error">Failed to load system data: {error}</div>;
  }

  const services = health?.services || {};
  const server = health?.server || {};
  const aiStatus = health?.aiProviders || aiMetrics?.aiStatus || {};
  const aiProviderList = Array.isArray(aiStatus)
    ? aiStatus
    : Object.entries(aiStatus).map(([name, data]) => ({ name, ...data }));

  const metrics = aiMetrics?.metrics || {};
  const latencyData = metrics.latency
    ? [
        { name: 'Avg', value: metrics.latency.avg },
        { name: 'Min', value: metrics.latency.min },
        { name: 'Max', value: metrics.latency.max },
      ]
    : [];
  const providerDistribution = aiMetrics?.providerDistribution || [];

  // Service health helpers
  const mongoStatus = services.mongodb?.status || services.mongo || 'unknown';
  const redisStatus = services.redis?.status || services.redis || 'unknown';
  const mlStatus = services.mlService?.status || services.ml || 'unknown';
  const emailStatus = services.email?.status || services.email || 'unknown';
  const emailProvider = services.email?.provider || '';
  const aiAvailable = services.aiProviders?.available ?? aiMetrics?.available ?? '?';
  const aiTotal = services.aiProviders?.total ?? aiMetrics?.total ?? '?';

  const statusColor = (s) => {
    if (!s || s === 'unknown') return 'blue';
    const lower = String(s).toLowerCase();
    if (['connected', 'healthy', 'ok', 'configured', 'true'].includes(lower)) return 'green';
    if (['disconnected', 'unreachable', 'error', 'false'].includes(lower)) return 'red';
    return 'yellow';
  };

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="System Monitor"
        subtitle="Service health & AI performance"
        actions={
          <div className="admin-header-meta">
            {lastRefresh && (
              <span className="admin-refresh-time">
                Last refreshed: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button className="admin-btn admin-btn-sm" onClick={fetchData}>
              ↻ Refresh
            </button>
          </div>
        }
      />

      {error && <div className="admin-error admin-error-inline">{error}</div>}

      {/* Service Health Cards */}
      <section className="admin-section">
        <h2 className="admin-section-title">Service Health</h2>
        <div className="admin-service-grid">
          <ServiceCard
            name="MongoDB"
            status={mongoStatus}
            color={statusColor(mongoStatus)}
          />
          <ServiceCard
            name="Redis"
            status={redisStatus}
            color={statusColor(redisStatus)}
          />
          <ServiceCard
            name="AI Providers"
            status={`${aiAvailable}/${aiTotal} available`}
            color={aiAvailable > 0 ? 'green' : 'red'}
          />
          <ServiceCard
            name="ML Service"
            status={mlStatus}
            color={statusColor(mlStatus)}
          />
          <ServiceCard
            name="Email"
            status={`${emailProvider ? emailProvider + ' · ' : ''}${emailStatus}`}
            color={statusColor(emailStatus)}
          />
        </div>
      </section>

      {/* Server Info */}
      <section className="admin-section">
        <h2 className="admin-section-title">Server Info</h2>
        <div className="admin-info-card">
          <div className="admin-info-grid">
            <div className="admin-info-item">
              <span className="admin-info-label">Uptime</span>
              <span className="admin-info-value">
                {server.uptime != null ? formatUptime(server.uptime) : '—'}
              </span>
            </div>
            <div className="admin-info-item">
              <span className="admin-info-label">Node Version</span>
              <span className="admin-info-value">{server.nodeVersion || '—'}</span>
            </div>
            <div className="admin-info-item">
              <span className="admin-info-label">Environment</span>
              <span className="admin-info-value">{server.environment || server.env || '—'}</span>
            </div>
            <div className="admin-info-item">
              <span className="admin-info-label">Memory (RSS)</span>
              <span className="admin-info-value">
                {server.memory?.rss != null ? formatMB(server.memory.rss) : '—'}
              </span>
            </div>
            <div className="admin-info-item">
              <span className="admin-info-label">Heap Used</span>
              <span className="admin-info-value">
                {server.memory?.heapUsed != null ? formatMB(server.memory.heapUsed) : '—'}
              </span>
            </div>
            <div className="admin-info-item">
              <span className="admin-info-label">Heap Total</span>
              <span className="admin-info-value">
                {server.memory?.heapTotal != null ? formatMB(server.memory.heapTotal) : '—'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* AI Provider Details */}
      {aiProviderList.length > 0 && (
        <section className="admin-section">
          <h2 className="admin-section-title">AI Provider Details</h2>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Rate Limited</th>
                  <th>Last Used</th>
                </tr>
              </thead>
              <tbody>
                {aiProviderList.map((p) => (
                  <tr key={p.name}>
                    <td className="admin-provider-name">{p.name}</td>
                    <td>
                      <AdminStatusBadge
                        status={p.status || (p.available ? 'available' : 'unavailable')}
                        color={p.available || p.status === 'available' ? 'green' : 'red'}
                      />
                    </td>
                    <td>
                      <AdminStatusBadge
                        status={p.rateLimited ? 'Yes' : 'No'}
                        color={p.rateLimited ? 'red' : 'green'}
                      />
                    </td>
                    <td>
                      {p.lastUsed
                        ? new Date(p.lastUsed).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* AI Performance Charts */}
      {(latencyData.length > 0 || providerDistribution.length > 0) && (
        <section className="admin-section">
          <h2 className="admin-section-title">AI Performance</h2>
          <div className="admin-charts-grid admin-charts-grid--2col">
            {latencyData.length > 0 && (
              <div className="admin-chart-card">
                <h3 className="admin-chart-title">AI Latency (ms)</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={latencyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#888', fontSize: 11 }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="value" fill="#00aaff" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {providerDistribution.length > 0 && (
              <div className="admin-chart-card">
                <h3 className="admin-chart-title">Provider Usage Distribution</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={providerDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {providerDistribution.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ServiceCard({ name, status, color }) {
  return (
    <div className="admin-service-card">
      <div className="admin-service-name">{name}</div>
      <AdminStatusBadge status={status} color={color} />
    </div>
  );
}
