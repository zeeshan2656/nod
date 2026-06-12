import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { API_BASE_URL } from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import Toast from '../components/Toast';

export default function AdminDashboard() {
  const { user, loading: authLoading, isAdmin } = useContext(AuthContext);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('videos');
  const [stats, setStats] = useState({ videos: 0, reels: 0, comments: 0, totalViews: 0 });
  const [videos, setVideos] = useState([]);
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // 1. Enforce admin guard
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/login');
    }
  }, [user, authLoading, isAdmin, navigate]);

  // 2. Fetch stats, videos, and reels
  useEffect(() => {
    if (user && isAdmin) {
      loadDashboardData();
    }
  }, [user, isAdmin]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const statsRes = await api.get('/settings/stats');
      setStats(statsRes.data);

      const videosRes = await api.get('/videos?limit=100'); // Fetch larger list for administration
      setVideos(videosRes.data.videos);

      const reelsRes = await api.get('/reels?limit=100');
      setReels(reelsRes.data.reels);
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
      setToast({ message: 'Error loading dashboard data.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVideo = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this video?')) return;
    try {
      await api.delete(`/videos/${id}`);
      setVideos(prev => prev.filter(v => v.id !== id));
      setToast({ message: 'Video deleted successfully.', type: 'success' });
    } catch (err) {
      setToast({ message: 'Delete video failed.', type: 'danger' });
    }
  };

  const handleDeleteReel = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this reel?')) return;
    try {
      await api.delete(`/reels/${id}`);
      setReels(prev => prev.filter(r => r.id !== id));
      setToast({ message: 'Reel deleted successfully.', type: 'success' });
    } catch (err) {
      setToast({ message: 'Delete reel failed.', type: 'danger' });
    }
  };

  const formatDuration = (secs) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (authLoading || loading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading Admin Panel...</div>;
  }

  return (
    <div className="admin-container">
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}
      
      <div className="admin-title-row">
        <h1 style={{ fontSize: '24px', fontWeight: '700' }}>Admin Dashboard</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/admin/settings" className="btn btn-secondary">Settings & Ads</Link>
          <Link to="/admin/upload" className="btn btn-primary">Upload Media</Link>
        </div>
      </div>

      {/* Stats Counter Grid */}
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-val">{stats.videos}</div>
          <div className="stat-lbl">Videos</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{stats.reels}</div>
          <div className="stat-lbl">Reels</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{stats.comments}</div>
          <div className="stat-lbl">Comments</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{stats.totalViews}</div>
          <div className="stat-lbl">Views</div>
        </div>
      </div>

      {/* Tabs list */}
      <div className="tabs">
        <div className={`tab-btn ${activeTab === 'videos' ? 'active' : ''}`} onClick={() => setActiveTab('videos')}>
          Videos ({videos.length})
        </div>
        <div className={`tab-btn ${activeTab === 'reels' ? 'active' : ''}`} onClick={() => setActiveTab('reels')}>
          Reels ({reels.length})
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'videos' ? (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Thumbnail</th>
                <th>Title</th>
                <th>Duration</th>
                <th>Views</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {videos.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No videos found.</td>
                </tr>
              ) : (
                videos.map(video => (
                  <tr key={video.id}>
                    <td>
                      <img 
                        src={`${API_BASE_URL}/api/videos/${video.id}/thumbnail`} 
                        alt="thumb" 
                        width="80" 
                        height="45" 
                        style={{ objectFit: 'cover' }} 
                      />
                    </td>
                    <td style={{ fontWeight: '600' }}>{video.title}</td>
                    <td>{formatDuration(video.duration)}</td>
                    <td>{video.views_count}</td>
                    <td>
                      <span style={{ 
                        fontSize: '11px', 
                        padding: '2px 6px', 
                        borderRadius: '2px',
                        backgroundColor: video.status === 'ready' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 152, 0, 0.2)',
                        color: video.status === 'ready' ? 'var(--success)' : '#ff9800'
                      }}>
                        {video.status.toUpperCase()}
                      </span>
                    </td>
                    <td>{new Date(video.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Link to={`/admin/edit-video/${video.id}`} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }}>Edit</Link>
                        <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleDeleteVideo(video.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Duration</th>
                <th>Views</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reels.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No reels found.</td>
                </tr>
              ) : (
                reels.map(reel => (
                  <tr key={reel.id}>
                    <td style={{ fontWeight: '600' }}>{reel.title || `Reel #${reel.id}`}</td>
                    <td>{formatDuration(reel.duration)}</td>
                    <td>{reel.views_count}</td>
                    <td>
                      <span style={{ 
                        fontSize: '11px', 
                        padding: '2px 6px', 
                        borderRadius: '2px',
                        backgroundColor: reel.status === 'ready' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 152, 0, 0.2)',
                        color: reel.status === 'ready' ? 'var(--success)' : '#ff9800'
                      }}>
                        {reel.status.toUpperCase()}
                      </span>
                    </td>
                    <td>{new Date(reel.created_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleDeleteReel(reel.id)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
