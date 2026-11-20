import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import AdminDataTable from '../components/admin/AdminDataTable';
import AdminFilterBar from '../components/admin/AdminFilterBar';
import AdminStatusBadge from '../components/admin/AdminStatusBadge';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'user', label: 'User' },
];

const PLAN_OPTIONS = [
  { value: '', label: 'All Plans' },
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'institution', label: 'Institution' },
  { value: 'enterprise', label: 'Enterprise' },
];

const VERIFIED_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'true', label: 'Verified' },
  { value: 'false', label: 'Unverified' },
];

const ROLE_COLOR = {
  admin: 'red',
  editor: 'yellow',
  viewer: 'blue',
  user: 'green',
};

const PLAN_COLOR = {
  free: 'blue',
  pro: 'green',
  institution: 'yellow',
  enterprise: 'red',
};

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ role: '', plan: '', verified: '' });
  const [sort, setSort] = useState({ key: 'createdAt', order: 'desc' });
  const [expandedUser, setExpandedUser] = useState(null);
  const [userDetail, setUserDetail] = useState({});
  const [roleModal, setRoleModal] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [roleLoading, setRoleLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const debounceRef = useRef(null);

  const fetchUsers = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        setError(null);
        const params = { page, limit: 20, search, sort: sort.key, order: sort.order };
        if (filters.role) params.role = filters.role;
        if (filters.plan) params.plan = filters.plan;
        if (filters.verified) params.verified = filters.verified;
        const res = await axios.get('/api/admin/users', {
          baseURL: API,
          withCredentials: true,
          params,
        });
        setUsers(res.data.users);
        setPagination(res.data.pagination);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [search, filters, sort]
  );

  // Debounced search + filter effect
  useEffect(() => {
    setCurrentPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchUsers(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, filters, sort, fetchUsers]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    fetchUsers(page);
  };

  const handleSort = (key) => {
    setSort((prev) => ({
      key,
      order: prev.key === key && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleExpand = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    if (!userDetail[userId]) {
      try {
        const res = await axios.get(`/api/admin/users/${userId}`, {
          baseURL: API,
          withCredentials: true,
        });
        setUserDetail((prev) => ({ ...prev, [userId]: res.data }));
      } catch {
        setUserDetail((prev) => ({ ...prev, [userId]: { error: 'Failed to load details' } }));
      }
    }
  };

  const openRoleModal = (user) => {
    setRoleModal(user);
    setNewRole(user.role);
  };

  const handleRoleChange = async () => {
    if (!roleModal || !newRole) return;
    setRoleLoading(true);
    try {
      await axios.put(
        `/api/admin/users/${roleModal._id}/role`,
        { role: newRole },
        { baseURL: API, withCredentials: true }
      );
      setUsers((prev) =>
        prev.map((u) => (u._id === roleModal._id ? { ...u, role: newRole } : u))
      );
      setRoleModal(null);
    } catch (err) {
      alert('Failed to update role: ' + err.message);
    } finally {
      setRoleLoading(false);
    }
  };

  const columns = [
    {
      key: 'username',
      label: 'Username',
      sortable: true,
      render: (u) => <span className="admin-username">{u.username}</span>,
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
      render: (u) => <span className="admin-email">{u.email}</span>,
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (u) => (
        <AdminStatusBadge status={u.role} color={ROLE_COLOR[u.role] || 'blue'} />
      ),
    },
    {
      key: 'plan',
      label: 'Plan',
      sortable: true,
      render: (u) => (
        <AdminStatusBadge
          status={u.subscription?.plan || 'free'}
          color={PLAN_COLOR[u.subscription?.plan] || 'blue'}
        />
      ),
    },
    {
      key: 'eloRating',
      label: 'ELO',
      sortable: true,
      render: (u) => <span>{u.eloRating ?? '—'}</span>,
    },
    {
      key: 'totalDebates',
      label: 'Debates',
      sortable: true,
      render: (u) => <span>{u.stats?.totalDebates ?? 0}</span>,
    },
    {
      key: 'winRate',
      label: 'Win Rate',
      sortable: true,
      render: (u) => {
        const rate =
          u.stats?.totalDebates > 0
            ? ((u.stats.wins / u.stats.totalDebates) * 100).toFixed(1)
            : '0.0';
        return <span>{rate}%</span>;
      },
    },
    {
      key: 'streak',
      label: 'Streak',
      sortable: false,
      render: (u) => <span>{u.stats?.currentStreak ?? 0}</span>,
    },
    {
      key: 'createdAt',
      label: 'Joined',
      sortable: true,
      render: (u) => <span>{fmtDate(u.createdAt)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: false,
      render: (u) => (
        <AdminStatusBadge
          status={u.isVerified ? 'Verified' : 'Unverified'}
          color={u.isVerified ? 'green' : 'red'}
        />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (u) => (
        <div className="admin-actions">
          <button
            className="admin-btn admin-btn-sm"
            onClick={() => toggleExpand(u._id)}
          >
            {expandedUser === u._id ? 'Hide' : 'View'}
          </button>
          <button
            className="admin-btn admin-btn-sm admin-btn-warning"
            onClick={() => openRoleModal(u)}
          >
            Change Role
          </button>
        </div>
      ),
    },
  ];

  const filterConfig = [
    {
      key: 'role',
      label: 'Role',
      options: ROLE_OPTIONS,
    },
    {
      key: 'plan',
      label: 'Plan',
      options: PLAN_OPTIONS,
    },
    {
      key: 'verified',
      label: 'Verified',
      options: VERIFIED_OPTIONS,
    },
  ];

  const detail = expandedUser ? userDetail[expandedUser] : null;

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="User Management"
        subtitle={`${pagination.total ?? '—'} total users`}
      />

      <AdminFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search username or email…"
        filters={filters}
        onFilterChange={(key, val) => setFilters((prev) => ({ ...prev, [key]: val }))}
        filterConfig={filterConfig}
      />

      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="admin-loading">
          <div className="df-spinner">
            <div className="df-spinner-core" />
            <div className="df-spinner-orbit" />
          </div>
        </div>
      ) : (
        <>
          <AdminDataTable
            columns={columns}
            data={users}
            sort={sort}
            onSort={handleSort}
            expandedRow={expandedUser}
            expandedContent={
              expandedUser && detail ? (
                <UserDetailPanel detail={detail} />
              ) : null
            }
            pagination={pagination}
            onPageChange={handlePageChange}
            currentPage={currentPage}
          />
        </>
      )}

      {/* Role Change Modal */}
      {roleModal && (
        <div className="admin-modal-overlay" onClick={() => setRoleModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-modal-title">Change Role</h3>
            <p className="admin-modal-subtitle">
              User: <strong>{roleModal.username}</strong>
            </p>
            <select
              className="admin-select"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            >
              {ROLE_OPTIONS.filter((o) => o.value).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="admin-modal-actions">
              <button
                className="admin-btn admin-btn-primary"
                onClick={handleRoleChange}
                disabled={roleLoading}
              >
                {roleLoading ? 'Saving…' : 'Confirm'}
              </button>
              <button
                className="admin-btn"
                onClick={() => setRoleModal(null)}
                disabled={roleLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserDetailPanel({ detail }) {
  if (detail?.error) {
    return <div className="admin-detail-error">{detail.error}</div>;
  }

  const profile = detail?.profile || detail || {};
  const achievements = detail?.achievements || profile.achievements || [];
  const fallacyProfile = detail?.fallacyProfile || profile.fallacyProfile || {};
  const coachingState = detail?.coachingState || profile.coachingState || {};
  const subscription = detail?.subscription || profile.subscription || {};

  return (
    <div className="admin-user-detail">
      <div className="admin-detail-grid">
        {/* Profile */}
        <div className="admin-detail-section">
          <h4>Profile</h4>
          <div className="admin-detail-row">
            <span>Display Name:</span>
            <span>{profile.displayName || '—'}</span>
          </div>
          <div className="admin-detail-row">
            <span>Bio:</span>
            <span>{profile.bio || '—'}</span>
          </div>
          <div className="admin-detail-row">
            <span>ELO:</span>
            <span>{profile.eloRating ?? '—'}</span>
          </div>
          <div className="admin-detail-row">
            <span>Total Debates:</span>
            <span>{profile.stats?.totalDebates ?? 0}</span>
          </div>
          <div className="admin-detail-row">
            <span>Wins:</span>
            <span>{profile.stats?.wins ?? 0}</span>
          </div>
          <div className="admin-detail-row">
            <span>Best Streak:</span>
            <span>{profile.stats?.bestStreak ?? 0}</span>
          </div>
        </div>

        {/* Subscription */}
        <div className="admin-detail-section">
          <h4>Subscription</h4>
          <div className="admin-detail-row">
            <span>Plan:</span>
            <span>{subscription.plan || 'free'}</span>
          </div>
          <div className="admin-detail-row">
            <span>Status:</span>
            <span>{subscription.status || '—'}</span>
          </div>
          <div className="admin-detail-row">
            <span>Renews:</span>
            <span>
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : '—'}
            </span>
          </div>
        </div>

        {/* Achievements */}
        <div className="admin-detail-section">
          <h4>Achievements ({achievements.length})</h4>
          {achievements.length === 0 ? (
            <p className="admin-empty">No achievements yet.</p>
          ) : (
            <div className="admin-achievement-list">
              {achievements.map((a, i) => (
                <span key={i} className="admin-achievement-badge" title={a.description}>
                  {a.icon || '🏆'} {a.name || a}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Fallacy Profile */}
        <div className="admin-detail-section">
          <h4>Fallacy Profile</h4>
          {Object.keys(fallacyProfile).length === 0 ? (
            <p className="admin-empty">No data yet.</p>
          ) : (
            <div className="admin-fallacy-map">
              {Object.entries(fallacyProfile).map(([k, v]) => (
                <div key={k} className="admin-detail-row">
                  <span>{k}:</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coaching State */}
        <div className="admin-detail-section">
          <h4>Coaching State</h4>
          {Object.keys(coachingState).length === 0 ? (
            <p className="admin-empty">No coaching data.</p>
          ) : (
            Object.entries(coachingState).map(([k, v]) => (
              <div key={k} className="admin-detail-row">
                <span>{k}:</span>
                <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
