import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import SEOHead from '../components/SEOHead';
import '../styles/theme.css';
import '../styles/feedback.css';

const CATEGORIES = [
  { value: 'review', label: 'Review' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'bug_report', label: 'Bug Report' },
];

function StarRating({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="fb-star-row">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`fb-star ${star <= (hover || value) ? 'fb-star--active' : ''}`}
          onClick={() => !readonly && onChange(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          disabled={readonly}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
        >
          {star <= (hover || value) ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}

function ReviewCard({ review }) {
  return (
    <div className="fb-review-card">
      <div className="fb-review-header">
        <div className="fb-review-user">
          <div className="fb-review-avatar">
            {review.username?.[0]?.toUpperCase() || '?'}
          </div>
          <span className="fb-review-name">{review.username}</span>
        </div>
        <span className="fb-review-date">
          {new Date(review.createdAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </span>
      </div>
      <div className="fb-review-stars">
        {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
      </div>
      <p className="fb-review-text">{review.reviewText}</p>
      {review.category && review.category !== 'review' && (
        <span className="fb-review-category">
          {review.category.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  );
}

export default function FeedbackPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const api = useApi();
  const toast = useToast();

  const [myFeedback, setMyFeedback] = useState(null);
  const [publicReviews, setPublicReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);

  // Form state
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [category, setCategory] = useState('review');
  const [isPublic, setIsPublic] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [publicRes, statsRes] = await Promise.allSettled([
        api.get('/api/feedback/public?limit=20'),
        api.get('/api/feedback/stats'),
      ]);
      if (publicRes.status === 'fulfilled') setPublicReviews(publicRes.value.data?.feedback || []);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);

      if (isAuthenticated) {
        try {
          const meRes = await api.get('/api/feedback/me');
          if (meRes.data?.feedback) {
            setMyFeedback(meRes.data.feedback);
          }
        } catch (err) {
          if (err.response?.status !== 404) console.error(err);
        }
      }
    } catch (err) {
      console.error('[Feedback] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [api, isAuthenticated]);

  useEffect(() => {
    // Wait for auth to finish loading before fetching data
    if (!authLoading) loadData();
  }, [loadData, authLoading]);

  const populateForm = (fb) => {
    setRating(fb.rating);
    setReviewText(fb.reviewText);
    setCategory(fb.category);
    setIsPublic(fb.isPublic);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating < 1) { toast.error('Please select a rating'); return; }
    if (reviewText.length < 10) { toast.error('Review must be at least 10 characters'); return; }

    setSubmitting(true);
    try {
      if (editing && myFeedback) {
        await api.put('/api/feedback/me', { rating, reviewText, category, isPublic });
        toast.success('Feedback updated!');
      } else {
        await api.post('/api/feedback', { rating, reviewText, category, isPublic });
        toast.success('Thank you for your feedback!');
      }
      setEditing(false);
      await loadData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to submit feedback';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete your feedback? This cannot be undone.')) return;
    try {
      await api.delete('/api/feedback/me');
      setMyFeedback(null);
      setRating(0);
      setReviewText('');
      setCategory('review');
      setIsPublic(false);
      toast.success('Feedback deleted');
      await loadData();
    } catch (err) {
      toast.error('Failed to delete feedback');
    }
  };

  const avgStars = stats?.averageRating ? '★'.repeat(Math.round(stats.averageRating)) + '☆'.repeat(5 - Math.round(stats.averageRating)) : '☆☆☆☆☆';

  return (
    <div className="fb-page">
      <SEOHead
        title="Community Feedback"
        description="Share your DebateForge experience, suggest features, and read reviews from fellow debaters."
        path="/feedback"
      />

      <div className="fb-header">
        <button className="fb-back" onClick={() => navigate(user ? '/dashboard' : '/')}>
          ← Back
        </button>
        <div className="fb-hero">
          <h1 className="fb-title">Community Feedback</h1>
          <p className="fb-subtitle">
            Share your experience, suggest features, help us improve
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="fb-stats">
          <div className="fb-stat">
            <div className="fb-stat-value">
              {stats.averageRating ? stats.averageRating.toFixed(1) : '—'}
            </div>
            <div className="fb-stat-stars">{avgStars}</div>
            <div className="fb-stat-label">Average Rating</div>
          </div>
          <div className="fb-stat">
            <div className="fb-stat-value">{stats.totalCount || 0}</div>
            <div className="fb-stat-label">Total Reviews</div>
          </div>
        </div>
      )}

      <div className="fb-content">
        {/* Submission / Own Review */}
        <div className="fb-form-card">
          {authLoading ? (
            <div className="fb-signin-prompt">
              <p>Checking authentication...</p>
            </div>
          ) : !isAuthenticated ? (
            <div className="fb-signin-prompt">
              <p>
                <Link to="/login?redirect=/feedback" className="fb-signin-link">Sign in</Link> to share your feedback
              </p>
            </div>
          ) : myFeedback && !editing ? (
            <>
              <div className="fb-own-review-label">Your Feedback</div>
              <ReviewCard review={myFeedback} />
              <div className="fb-actions">
                <button className="fb-btn-edit" onClick={() => { setEditing(true); populateForm(myFeedback); }}>
                  ✏️ Edit
                </button>
                <button className="fb-btn-delete" onClick={handleDelete}>
                  🗑️ Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="fb-form-title">
                {editing ? 'Edit Your Feedback' : 'Share Your Experience'}
              </h2>
              <form onSubmit={handleSubmit}>
                <StarRating value={rating} onChange={setRating} />

                <select
                  className="fb-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>

                <textarea
                  className="fb-textarea"
                  placeholder="Tell us about your experience with DebateForge..."
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value.slice(0, 1000))}
                  maxLength={1000}
                />
                <div className="fb-char-count">{reviewText.length}/1000</div>

                <div className="fb-toggle-row">
                  <button
                    type="button"
                    className={`fb-toggle ${isPublic ? 'fb-toggle--on' : ''}`}
                    onClick={() => setIsPublic(!isPublic)}
                    aria-label="Toggle public visibility"
                  />
                  <span>Make my review publicly visible</span>
                </div>

                <button className="fb-submit" type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : editing ? 'Update Feedback' : 'Submit Feedback'}
                </button>

                {editing && (
                  <button
                    type="button"
                    className="fb-btn-edit"
                    style={{ width: '100%', marginTop: 10 }}
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                )}
              </form>
            </>
          )}
        </div>

        {/* Public Reviews */}
        <h2 className="fb-reviews-title">Community Reviews</h2>
        {loading ? (
          <div className="fb-empty">Loading reviews...</div>
        ) : publicReviews.length === 0 ? (
          <div className="fb-empty">
            No public reviews yet. Be the first to share your experience!
          </div>
        ) : (
          <div className="fb-reviews-grid">
            {publicReviews.map((r, i) => (
              <ReviewCard key={r._id || i} review={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
