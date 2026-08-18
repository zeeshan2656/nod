import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { API_BASE_URL } from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import Toast from '../components/Toast';

export default function AdminEditVideo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin } = useContext(AuthContext);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedThumb, setSelectedThumb] = useState(1);
  const [sourceType, setSourceType] = useState('upload');
  const [tempThumbs, setTempThumbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingThumbs, setLoadingThumbs] = useState(true);
  const [thumbError, setThumbError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Admin guard redirect
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/login');
    }
  }, [user, authLoading, isAdmin, navigate]);

  // Load video details and temporary thumbnails
  useEffect(() => {
    if (user && isAdmin) {
      loadVideoDetails();
    }
  }, [id, user, isAdmin]);

  const loadVideoDetails = async () => {
    setLoading(true);
    try {
      // Fetch details
      const response = await api.get(`/videos/${id}`);
      const video = response.data;
      
      setTitle(video.title);
      setDescription(video.description || '');
      setSelectedThumb(video.thumbnail_position || 1);
      setSourceType(video.source_type || 'upload');

      setLoading(false);

      // Load temporary thumbnails in background
      if (!video.source_type || video.source_type === 'upload') {
        loadTemporaryThumbnails();
      } else {
        setLoadingThumbs(false);
      }
    } catch (err) {
      console.error('Failed to load video details:', err);
      setToast({ message: 'Error loading video details.', type: 'danger' });
      setLoading(false);
    }
  };

  const loadTemporaryThumbnails = async () => {
    setLoadingThumbs(true);
    setThumbError('');
    try {
      const response = await api.get(`/videos/${id}/temp-thumbnails`);
      setTempThumbs(response.data.thumbnails || []);
    } catch (err) {
      console.error('Failed to generate temp thumbnails:', err);
      const errorText = err.response?.data?.error || 'Failed to extract video thumbnail choices.';
      const detailText = err.response?.data?.detail ? `: ${err.response.data.detail}` : '';
      setThumbError(`${errorText}${detailText}`);
      setToast({ message: `${errorText}${detailText}`, type: 'danger' });
    } finally {
      setLoadingThumbs(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setToast({ message: 'Title is required.', type: 'danger' });
      return;
    }

    setSaving(true);
    try {
      await api.put(`/videos/${id}`, {
        title: title.trim(),
        description: description.trim(),
        thumbnail_position: selectedThumb
      });

      setToast({ message: 'Video details saved successfully. Temporary thumbnails cleaned.', type: 'success' });
      
      // Delay navigation to show success toast
      setTimeout(() => {
        navigate('/admin');
      }, 1500);

    } catch (err) {
      console.error('Failed to update video:', err);
      setToast({ message: err.response?.data?.error || 'Save failed.', type: 'danger' });
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading Video Details...</div>;
  }

  return (
    <div className="admin-container" style={{ maxWidth: '800px' }}>
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}

      <div className="admin-title-row">
        <h1 style={{ fontSize: '20px', fontWeight: '700' }}>Edit Video Details</h1>
        <Link to="/admin" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>Cancel</Link>
      </div>

      <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '24px', borderRadius: '2px' }}>
        <form onSubmit={handleSubmit}>
          
          <div className="form-group">
            <label className="form-label">Video Title</label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter video title"
              disabled={saving}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Video Description</label>
            <textarea
              className="form-input"
              style={{ minHeight: '80px', resize: 'vertical' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter video description"
              disabled={saving}
            />
          </div>

          {/* Thumbnail Selection Area */}
          {sourceType === 'upload' && (
            <div className="form-group" style={{ marginTop: '24px' }}>
              <label className="form-label" style={{ fontWeight: '600', color: '#fff' }}>
                Select Cover Thumbnail (Frame Position)
              </label>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '10px' }}>
                We extract 30 temporary frames throughout the video. Choose one as the thumbnail cover. No thumbnail image files will be permanently saved.
              </span>

              {loadingThumbs ? (
                <div style={{ padding: '20px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                  ⏳ Extracting 30 frames from video file using FFmpeg... Please wait.
                </div>
              ) : thumbError ? (
                <div style={{ color: 'var(--danger)', fontSize: '13px', padding: '12px', border: '1px solid rgba(244,67,54,0.3)', backgroundColor: 'rgba(244, 67, 54, 0.05)', borderRadius: '2px' }}>
                  <strong>Failed to generate preview frames.</strong> Reason: {thumbError}
                </div>
              ) : tempThumbs.length === 0 ? (
                <div style={{ color: 'var(--danger)', fontSize: '12px' }}>
                  Failed to generate preview frames. Double-check if the source file is available.
                </div>
              ) : (
                <div className="thumb-selector-grid">
                  {tempThumbs.map((thumb) => {
                    const isSelected = selectedThumb === thumb.position;
                    return (
                      <div 
                        key={thumb.position}
                        className={`thumb-option ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedThumb(thumb.position)}
                      >
                        <img 
                          src={`${API_BASE_URL}${thumb.url}`} 
                          alt={`frame-${thumb.position}`}
                          loading="lazy"
                        />
                        {isSelected && (
                          <div className="thumb-selected-check">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Submit controls */}
          <button 
            type="submit" 
            className={`btn btn-primary ${saving ? 'btn-disabled' : ''}`} 
            style={{ width: '100%', marginTop: '30px', height: '42px' }}
            disabled={saving}
          >
            {saving ? 'Saving Changes...' : 'Save Video Details'}
          </button>
        </form>
      </div>
    </div>
  );
}
