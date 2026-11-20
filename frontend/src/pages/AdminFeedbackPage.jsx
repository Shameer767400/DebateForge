import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import SEOHead from '../components/SEOHead';
import '../styles/theme.css';
import '../styles/admin.css';

export default function AdminFeedbackPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const api = useApi();
  const toast = useToast();

  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expanded, setExpanded] = useState(null);

  // Filters
  const [filterRating, setFilterRating] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filterRating) params.set('rating', filterRating);
      if (filterCategory) params.set('category', filterCategory);
      if (filterStatus === 'public') { params.set('isPublic', 'true'); params.set('isApproved', 'true'); }
      if (filterStatus === 'hidden') params.set('isHidden', 'true');
      if (filterStatus === 'pending') { params.set('isPublic', 'true'); params.set('isApproved', 'false'); }

      const [reviewsRes, statsRes] = await Promise.allSettled([
        api.get(`/api/feedback/admin?${params}`),
        api.get('/api/feedback/stats'),
      ]);

      if (reviewsRes.status === 'fulfilled') {
        const data = reviewsRes.value.data;
        setReviews(data?.feedback || data?.items || []);
        setTotalPages(data?.pagination?.totalPages || data?.pagination?.pages || 1);
      }
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
    } catch (err) {
      toast.error('Failed to load feedback data');
    } finally {
      setLoading(false);
    }
  }, [api, page, filterRating, filterCategory, filterStatus, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleModerate = async (id, updates) => {
    try {
      await api.put(`/api/feedback/admin/${id}`, updates);
      toast.success('Feedback updated');
      await loadData();
    } catch (err) {
      toast.error('Failed to update feedback');
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/api/feedback/admin/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debateforge-feedback-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Feedback exported');
    } catch (err) {
      toast.error('Export failed');
    }
  };

  const getStatusBadge = (r) => {
    if (r.isHidden) return <span className="admin-badge admin-badge--hidden">Hidden</span>;
    if (r.isPublic && r.isApproved) return <span className="admin-badge admin-badge--approved">Public</span>;
    if (r.isPublic && !r.isApproved) return <span className="admin-badge admin-badge--pending">Pending</span>;
    return <span className="admin-badge">Private</span>;
  };

  return (
    <div className="admin-page">
      <SEOHead title="Admin — Feedback Dashboard" noindex />

      <button className="admin-back" onClick={() => navigate('/dashboard')}>← Back to Dashboard</button>
      <h1 className="admin-title">Feedback Dashboard</h1>

      {/* Stats */}
      {stats && (
        <div className="admin-stats">
          <div className="admin-stat-card">
            <div className="admin-stat-value">{stats.totalCount || 0}</div>
            <div className="admin-stat-label">Total Reviews</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value" style={{ color: 'var(--accent-user)' }}>
              {stats.averageRating ? stats.averageRating.toFixed(1) : '—'}
            </div>
            <div className="admin-stat-label">Avg Rating</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value" style={{ color: 'var(--accent-score)' }}>
              {stats.categoryCounts?.feature_request || 0}
            </div>
            <div className="admin-stat-label">Feature Requests</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value" style={{ color: 'var(--accent-blue)' }}>
              {stats.categoryCounts?.suggestion || 0}
            </div>
            <div className="admin-stat-label">Suggestions</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="admin-filters">
        <select className="admin-filter-select" value={filterRating} onChange={(e) => { setFilterRating(e.target.value); setPage(1); }}>
          <option value="">All Ratings</option>
          {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} Star{r > 1 ? 's' : ''}</option>)}
        </select>
        <select className="admin-filter-select" value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}>
          <option value="">All Categories</option>
          <option value="review">Review</option>
          <option value="suggestion">Suggestion</option>
          <option value="feature_request">Feature Request</option>
          <option value="bug_report">Bug Report</option>
        </select>
        <select className="admin-filter-select" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="public">Public (Approved)</option>
          <option value="pending">Pending Approval</option>
          <option value="hidden">Hidden</option>
        </select>
        <button className="admin-export-btn" onClick={handleExport}>📥 Export JSON</button>
      </div>

      {/* Reviews */}
      {loading ? (
        <div className="admin-empty">Loading...</div>
      ) : reviews.length === 0 ? (
        <div className="admin-empty">No feedback found matching filters</div>
      ) : (
        <div className="admin-review-list">
          {reviews.map((r) => {
            const isExpanded = expanded === r._id;
            return (
              <div
                key={r._id}
                className={`admin-review-item ${isExpanded ? 'admin-review-item--expanded' : ''}`}
                onClick={() => setExpanded(isExpanded ? null : r._id)}
              >
                <div className="admin-review-row">
                  <span className="admin-review-user">{r.username || r.userId?.username || '—'}</span>
                  <div className="admin-review-meta">
                    <span className="admin-review-stars">
                      {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                    </span>
                    {getStatusBadge(r)}
                    <span className="admin-review-date">
                      {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>

                <p className="admin-review-text">
                  {isExpanded ? r.reviewText : (r.reviewText?.slice(0, 150) + (r.reviewText?.length > 150 ? '...' : ''))}
                </p>

                <span className="admin-review-category">{r.category?.replace(/_/g, ' ')}</span>

                {isExpanded && (
                  <div onClick={(e) => e.stopPropagation()}>
                    {r.adminNote && (
                      <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        📝 Admin note: {r.adminNote}
                      </div>
                    )}
                    <div className="admin-actions">
                      {!r.isApproved && (
                        <button
                          className="admin-action-btn admin-action-btn--approve"
                          onClick={() => handleModerate(r._id, { isApproved: true, isHidden: false })}
                        >
                          ✓ Approve Public
                        </button>
                      )}
                      {r.isApproved && (
                        <button
                          className="admin-action-btn"
                          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                          onClick={() => handleModerate(r._id, { isApproved: false })}
                        >
                          Revoke Approval
                        </button>
                      )}
                      {!r.isHidden ? (
                        <button
                          className="admin-action-btn admin-action-btn--hide"
                          onClick={() => handleModerate(r._id, { isHidden: true, isApproved: false })}
                        >
                          ✗ Hide
                        </button>
                      ) : (
                        <button
                          className="admin-action-btn admin-action-btn--approve"
                          onClick={() => handleModerate(r._id, { isHidden: false })}
                        >
                          Unhide
                        </button>
                      )}
                    </div>
                    <input
                      className="admin-note-input"
                      placeholder="Add admin note..."
                      defaultValue={r.adminNote || ''}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleModerate(r._id, { adminNote: e.target.value });
                      }}
                      onBlur={(e) => {
                        if (e.target.value !== (r.adminNote || '')) {
                          handleModerate(r._id, { adminNote: e.target.value });
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="admin-pagination">
          <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Prev
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', alignSelf: 'center' }}>
            Page {page} of {totalPages}
          </span>
          <button className="admin-page-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
