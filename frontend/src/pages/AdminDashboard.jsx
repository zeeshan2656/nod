import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { API_BASE_URL } from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import Toast from '../components/Toast';

export default function AdminDashboard() {
  const { user, loading: authLoading, isAdmin } = useContext(AuthContext);
  const navigate = useNavigate();

  // Statistics
  const [stats, setStats] = useState({ videos: 0, comments: 0, totalViews: 0 });

  // Videos Pagination States (Lazy Load)
  const [videos, setVideos] = useState([]);
  const [videosCursor, setVideosCursor] = useState(null);
  const [hasMoreVideos, setHasMoreVideos] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Multi-Selection States
  const [selectedVideoIds, setSelectedVideoIds] = useState([]);

  // Enforce admin guard
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/login');
    }
  }, [user, authLoading, isAdmin, navigate]);

  // Load dashboard statistics and initial list feeds
  useEffect(() => {
    if (user && isAdmin) {
      loadStats();
      loadVideosFeed();
    }
  }, [user, isAdmin]);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const response = await api.get('/settings/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadVideosFeed = async (cursor = null) => {
    setLoadingVideos(true);
    try {
      let url = '/videos?limit=10';
      if (cursor) {
        url += `&cursor_time=${encodeURIComponent(cursor.cursor_time)}&cursor_id=${cursor.cursor_id}`;
      }

      const response = await api.get(url);
      const { videos: newVideos, nextCursor, hasMore } = response.data;

      if (cursor) {
        setVideos(prev => [...prev, ...newVideos]);
      } else {
        setVideos(newVideos);
      }

      setVideosCursor(nextCursor);
      setHasMoreVideos(hasMore);
    } catch (err) {
      console.error('Failed to load videos:', err);
      setToast({ message: 'Error loading videos list.', type: 'danger' });
    } finally {
      setLoadingVideos(false);
    }
  };

  const handleDeleteVideo = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this video?')) return;
    try {
      await api.delete(`/videos/${id}`);
      setVideos(prev => prev.filter(v => v.id !== id));
      setToast({ message: 'Video deleted successfully.', type: 'success' });
      
      // Update stats count locally
      setStats(prev => ({ ...prev, videos: Math.max(prev.videos - 1, 0) }));
    } catch (err) {
      setToast({ message: 'Delete video failed.', type: 'danger' });
    }
  };

  const toggleSelectVideo = (id) => {
    setSelectedVideoIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllVideos = () => {
    if (videos.length === 0) return;
    if (selectedVideoIds.length === videos.length) {
      setSelectedVideoIds([]);
    } else {
      setSelectedVideoIds(videos.map(v => v.id));
    }
  };

  const handleBulkDeleteVideos = async () => {
    if (selectedVideoIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to permanently delete the ${selectedVideoIds.length} selected videos?`)) return;
    
    setToast({ message: 'Deleting selected videos...', type: 'info' });
    try {
      await Promise.all(selectedVideoIds.map(id => api.delete(`/videos/${id}`)));
      setVideos(prev => prev.filter(v => !selectedVideoIds.includes(v.id)));
      setStats(prev => ({ ...prev, videos: Math.max(prev.videos - selectedVideoIds.length, 0) }));
      setToast({ message: `Successfully deleted ${selectedVideoIds.length} videos.`, type: 'success' });
      setSelectedVideoIds([]);
    } catch (err) {
      setToast({ message: 'Some or all video deletions failed.', type: 'danger' });
      loadVideosFeed();
      loadStats();
    }
  };

  const formatDuration = (secs) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (authLoading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading authentication...</div>;
  }

  return (
    <div className="admin-container" style={{ padding: '16px 0' }}>
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}
      
      <div className="admin-title-row" style={{ padding: '0 16px 12px 16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0 }}>Admin Dashboard</h1>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Video content and platform management</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link to="/admin/settings" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '13px' }}>Settings</Link>
          <Link to="/admin/upload" className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '13px' }}>Upload</Link>
        </div>
      </div>

      {/* Stats Counter Row */}
      <div className="stats-grid" style={{ padding: '0 16px', marginBottom: '20px', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-box">
          <div className="stat-val">{loadingStats ? '...' : stats.videos}</div>
          <div className="stat-lbl">Published Videos</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{loadingStats ? '...' : stats.comments}</div>
          <div className="stat-lbl">Comments</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{loadingStats ? '...' : stats.totalViews}</div>
          <div className="stat-lbl">Total Views</div>
        </div>
      </div>

      {/* Section Header with Bulk Action Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: '#161616',
        borderTop: '1px solid var(--border-color)',
        borderBottom: '1px solid var(--border-color)',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={videos.length > 0 && selectedVideoIds.length === videos.length}
            onChange={handleSelectAllVideos}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          {`Select All (${selectedVideoIds.length} of ${videos.length} selected)`}
        </label>
        
        {selectedVideoIds.length > 0 && (
          <button
            onClick={handleBulkDeleteVideos}
            className="btn btn-danger"
            style={{ padding: '4px 10px', fontSize: '11px', height: 'auto' }}
          >
            Delete Selected ({selectedVideoIds.length})
          </button>
        )}
      </div>

      {/* Responsive Full-Width Video List */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {videos.length === 0 && !loadingVideos ? (
          <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--text-muted)' }}>
            No videos found. Upload your first video or connect an existing server video!
          </div>
        ) : (
          videos.map(video => (
            <div 
              key={video.id}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-color)',
                alignItems: 'center',
                backgroundColor: 'var(--card-bg)'
              }}
            >
              {/* Multi-select Checkbox */}
              <input
                type="checkbox"
                checked={selectedVideoIds.includes(video.id)}
                onChange={() => toggleSelectVideo(video.id)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0, marginRight: '4px' }}
              />
              {/* Thumbnail */}
              <div style={{ width: '90px', aspectRatio: '16/9', backgroundColor: '#000', position: 'relative', flexShrink: 0, borderRadius: '1px', overflow: 'hidden' }}>
                <img 
                  src={`${API_BASE_URL}/api/videos/${video.id}/thumbnail?t=${video.thumbnail_position || 1}`} 
                  alt="thumb" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  loading="lazy"
                />
                <span style={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '4px',
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  fontSize: '9px',
                  padding: '1px 3px',
                  borderRadius: '1px'
                }}>
                  {formatDuration(video.duration)}
                </span>
              </div>

              {/* Info and Actions column */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                <span style={{ fontWeight: '600', color: '#fff', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {video.title}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  👁️ {video.views_count} views • {video.status.toUpperCase()}
                </span>
                
                {/* Actions (Edit, Delete, Play) */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  <Link to={`/admin/edit-video/${video.id}`} className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '11px' }}>
                    Edit
                  </Link>
                  <button 
                    className="btn btn-danger" 
                    style={{ padding: '3px 8px', fontSize: '11px' }} 
                    onClick={() => handleDeleteVideo(video.id)}
                  >
                    Delete
                  </button>
                  <Link to={`/watch/${video.id}`} className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '11px' }}>
                    Play
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Lazy load pagination trigger */}
        {hasMoreVideos && (
          <div className="load-more-container" style={{ padding: '20px 16px' }}>
            <button 
              className="btn btn-secondary" 
              style={{ width: '100%', height: '38px', justifyContent: 'center' }}
              onClick={() => loadVideosFeed(videosCursor)}
              disabled={loadingVideos}
            >
              {loadingVideos ? 'Loading next...' : 'Load More Videos'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
