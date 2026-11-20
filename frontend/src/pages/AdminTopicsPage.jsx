import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import AdminStatCard from '../components/admin/AdminStatCard';
import AdminFilterBar from '../components/admin/AdminFilterBar';
import AdminDataTable from '../components/admin/AdminDataTable';
import AdminStatusBadge from '../components/admin/AdminStatusBadge';
import { useToast } from '../context/ToastContext';
import SEOHead from '../components/SEOHead';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const CATEGORY_COLORS = {
  technology: '#00ff87',
  society: '#00aaff',
  politics: '#ffcc00',
  education: '#a855f7',
  environment: '#10b981',
  economy: '#f59e0b',
};

const CATEGORIES = [
  { value: 'technology', label: 'Technology' },
  { value: 'society', label: 'Society' },
  { value: 'politics', label: 'Politics' },
  { value: 'education', label: 'Education' },
  { value: 'environment', label: 'Environment' },
  { value: 'economy', label: 'Economy' },
];

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

export default function AdminTopicsPage() {
  const toast = useToast();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', difficulty: '', isActive: '' });
  const [sort, setSort] = useState({ key: 'debateCount', order: 'desc' });
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', topic }
  const [formData, setFormData] = useState({ title: '', category: 'technology', difficulty: 'medium' });
  const [saving, setSaving] = useState(false);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.category) params.category = filters.category;
      if (filters.difficulty) params.difficulty = filters.difficulty;
      if (filters.isActive !== '') params.isActive = filters.isActive;

      const res = await axios.get('/api/admin/topics', {
        baseURL: API,
        withCredentials: true,
        params,
      });

      setTopics(res.data.topics || res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load topics');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  // Client-side search and sorting
  const filteredTopics = topics
    .filter((t) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        t.title?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let valA = a[sort.key];
      let valB = b[sort.key];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sort.order === 'asc' ? -1 : 1;
      if (valA > valB) return sort.order === 'asc' ? 1 : -1;
      return 0;
    });

  // Category distribution data for chart
  const categoryCounts = topics.reduce((acc, t) => {
    const cat = t.category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(categoryCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: CATEGORY_COLORS[name] || '#94a3b8',
  }));

  const totalDebatesCount = topics.reduce((sum, t) => sum + (t.debateCount || 0), 0);
  const activeTopicsCount = topics.filter((t) => t.isActive).length;

  const handleOpenAdd = () => {
    setFormData({ title: '', category: 'technology', difficulty: 'medium' });
    setModal({ mode: 'add' });
  };

  const handleOpenEdit = (topic) => {
    setFormData({
      title: topic.title,
      category: topic.category,
      difficulty: topic.difficulty,
    });
    setModal({ mode: 'edit', topic });
  };

  const handleCloseModal = () => {
    setModal(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title || formData.title.trim().length < 10) {
      toast.error('Title must be at least 10 characters long');
      return;
    }

    setSaving(true);
    try {
      if (modal.mode === 'add') {
        await axios.post(
          '/api/admin/topics',
          formData,
          { baseURL: API, withCredentials: true }
        );
        toast.success('Topic created successfully');
      } else {
        await axios.put(
          `/api/admin/topics/${modal.topic._id}`,
          formData,
          { baseURL: API, withCredentials: true }
        );
        toast.success('Topic updated successfully');
      }
      handleCloseModal();
      fetchTopics();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save topic');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (topic) => {
    try {
      await axios.patch(
        `/api/admin/topics/${topic._id}/toggle`,
        {},
        { baseURL: API, withCredentials: true }
      );
      toast.success(`Topic marked ${topic.isActive ? 'inactive' : 'active'}`);
      setTopics((prev) =>
        prev.map((t) =>
          t._id === topic._id ? { ...t, isActive: !t.isActive } : t
        )
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to toggle topic status');
    }
  };

  const columns = [
    {
      key: 'title',
      label: 'Topic Title',
      sortable: true,
      render: (t) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {t.title}
        </span>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      render: (t) => (
        <span
          className="admin-badge admin-badge--info"
          style={{
            borderColor: CATEGORY_COLORS[t.category] || 'var(--border)',
            color: CATEGORY_COLORS[t.category] || 'var(--accent-blue)',
          }}
        >
          {t.category}
        </span>
      ),
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      sortable: true,
      render: (t) => {
        const badgeMap = {
          easy: 'admin-badge--success',
          medium: 'admin-badge--warning',
          hard: 'admin-badge--danger',
        };
        return (
          <span className={`admin-badge ${badgeMap[t.difficulty] || 'admin-badge--muted'}`}>
            {t.difficulty}
          </span>
        );
      },
    },
    {
      key: 'debateCount',
      label: 'Debates',
      sortable: true,
      render: (t) => (t.debateCount || 0).toLocaleString(),
    },
    {
      key: 'voteCount',
      label: 'Votes',
      sortable: true,
      render: (t) => (t.voteCount || 0).toLocaleString(),
    },
    {
      key: 'isActive',
      label: 'Status',
      sortable: true,
      render: (t) => (
        <AdminStatusBadge
          status={t.isActive ? 'success' : 'muted'}
          label={t.isActive ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (t) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary admin-btn--sm"
            onClick={() => handleOpenEdit(t)}
          >
            Edit
          </button>
          <button
            type="button"
            className={`admin-btn admin-btn--sm ${t.isActive ? 'admin-btn--danger' : 'admin-btn--primary'}`}
            onClick={() => handleToggleActive(t)}
          >
            {t.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <SEOHead title="Topic Management - Admin" noindex />
      <AdminPageHeader
        title="Topic Management"
        subtitle="Curate, categorize, and manage all preset debate topics"
      >
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={handleOpenAdd}
        >
          + Add Topic
        </button>
      </AdminPageHeader>

      {/* Stats row */}
      <div className="admin-stats-grid" style={{ marginBottom: '24px' }}>
        <AdminStatCard
          icon="📚"
          label="Total Topics"
          value={topics.length}
          color="blue"
        />
        <AdminStatCard
          icon="🟢"
          label="Active Topics"
          value={activeTopicsCount}
          color="green"
        />
        <AdminStatCard
          icon="🎯"
          label="Total Debates"
          value={totalDebatesCount.toLocaleString()}
          color="yellow"
        />
      </div>

      {/* Category Chart & Info */}
      {pieData.length > 0 && (
        <div className="admin-chart-container" style={{ marginBottom: '24px' }}>
          <div className="admin-chart-title">Topic Category Distribution</div>
          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  innerRadius={45}
                  dataKey="value"
                  paddingAngle={4}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#1a1a25',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    fontFamily: 'var(--font-ui)',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <AdminFilterBar
        searchPlaceholder="Search topics..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: 'category',
            label: 'Category',
            value: filters.category,
            options: [
              { value: '', label: 'All Categories' },
              ...CATEGORIES,
            ],
          },
          {
            key: 'difficulty',
            label: 'Difficulty',
            value: filters.difficulty,
            options: [
              { value: '', label: 'All Difficulties' },
              ...DIFFICULTIES,
            ],
          },
          {
            key: 'isActive',
            label: 'Status',
            value: filters.isActive,
            options: [
              { value: '', label: 'All Status' },
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ],
          },
        ]}
        onFilterChange={(key, val) => setFilters((prev) => ({ ...prev, [key]: val }))}
        onClear={() => {
          setSearch('');
          setFilters({ category: '', difficulty: '', isActive: '' });
        }}
      />

      {/* Data Table */}
      <AdminDataTable
        columns={columns}
        data={filteredTopics}
        loading={loading}
        sortKey={sort.key}
        sortOrder={sort.order}
        onSort={(key, order) => setSort({ key, order })}
        emptyMessage="No topics found matching current criteria"
      />

      {/* Add / Edit Modal */}
      {modal && (
        <div className="admin-modal-overlay" onClick={handleCloseModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {modal.mode === 'add' ? 'Add New Topic' : 'Edit Topic'}
              </h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={handleCloseModal}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Topic Title</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Artificial Intelligence will create more jobs than it destroys"
                    minLength={10}
                    maxLength={200}
                    required
                  />
                  <span className="admin-form-help">
                    Must be 10–200 characters long and state a clear debating proposition.
                  </span>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Category</label>
                  <select
                    className="admin-form-select"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Difficulty</label>
                  <select
                    className="admin-form-select"
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                  >
                    {DIFFICULTIES.map((diff) => (
                      <option key={diff.value} value={diff.value}>
                        {diff.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  onClick={handleCloseModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : modal.mode === 'add' ? 'Create Topic' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
