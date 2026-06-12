import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import Toast from '../components/Toast';

export default function AdminUpload() {
  const { user, loading: authLoading, isAdmin } = useContext(AuthContext);
  const navigate = useNavigate();

  const [uploadType, setUploadType] = useState('video'); // 'video' or 'reel'
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Admin guard redirect
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/login');
    }
  }, [user, authLoading, isAdmin, navigate]);

  const handleFileChange = (e) => {
    setSelectedFiles(Array.from(e.target.files));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setToast({ message: 'Please select at least one file.', type: 'danger' });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    const fieldName = uploadType === 'video' ? 'videos' : 'reels';
    const endpoint = uploadType === 'video' ? '/videos' : '/reels';

    selectedFiles.forEach((file) => {
      formData.append(fieldName, file);
    });

    try {
      await api.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      setToast({ 
        message: `Uploaded ${selectedFiles.length} ${uploadType === 'video' ? 'video(s)' : 'reel(s)'} successfully! Queued for transcoding.`, 
        type: 'success' 
      });
      setSelectedFiles([]);
      // Reset input element
      document.getElementById('media-files').value = null;

      // Navigate back to dashboard after a delay
      setTimeout(() => {
        navigate('/admin');
      }, 2000);

    } catch (err) {
      console.error('Upload failed:', err);
      setToast({ message: err.response?.data?.error || 'Upload failed.', type: 'danger' });
    } finally {
      setUploading(false);
    }
  };

  if (authLoading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <div className="admin-container" style={{ maxWidth: '600px' }}>
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}

      <div className="admin-title-row">
        <h1 style={{ fontSize: '20px', fontWeight: '700' }}>Upload Media Files</h1>
        <Link to="/admin" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>Dashboard</Link>
      </div>

      <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '24px', borderRadius: '2px' }}>
        <form onSubmit={handleUpload}>
          {/* Upload type selection */}
          <div className="form-group">
            <label className="form-label">Media Type</label>
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="uploadType"
                  value="video"
                  checked={uploadType === 'video'}
                  onChange={() => {
                    setUploadType('video');
                    setSelectedFiles([]);
                  }}
                  disabled={uploading}
                />
                Regular Video (landscape aspect ratios)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="uploadType"
                  value="reel"
                  checked={uploadType === 'reel'}
                  onChange={() => {
                    setUploadType('reel');
                    setSelectedFiles([]);
                  }}
                  disabled={uploading}
                />
                Reel / Short Video (vertical format)
              </label>
            </div>
          </div>

          {/* Files select input */}
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label className="form-label">Choose File(s) - Select Multiple Simultaneously</label>
            <input
              type="file"
              id="media-files"
              className="form-input"
              multiple
              accept="video/*"
              onChange={handleFileChange}
              disabled={uploading}
              required
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Supported formats: MP4, MKV, AVI, MOV, WEBM. Maximum filesize: {uploadType === 'video' ? '500MB' : '200MB'} each.
            </span>
          </div>

          {/* List selected files */}
          {selectedFiles.length > 0 && (
            <div style={{ margin: '16px 0', border: '1px solid var(--border-color)', padding: '12px', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontWeight: '600', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                SELECTED FILES ({selectedFiles.length}):
              </div>
              <ul style={{ listStyleType: 'none', paddingLeft: 0, maxHeight: '120px', overflowY: 'auto', fontSize: '12px' }}>
                {selectedFiles.map((f, i) => (
                  <li key={i} style={{ padding: '3px 0', borderBottom: '1px solid #222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🎬 {f.name} ({(f.size / (1024 * 1024)).toFixed(2)} MB)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Progress bar */}
          {uploading && (
            <div style={{ margin: '20px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: 'var(--accent)', transition: 'width 0.2s' }} />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px', textAlign: 'center' }}>
                {uploadProgress === 100 ? 'Processing on server... Do not close this page.' : 'Sending binary data streams...'}
              </span>
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit" 
            className={`btn btn-primary ${uploading ? 'btn-disabled' : ''}`} 
            style={{ width: '100%', marginTop: '20px', height: '42px' }}
            disabled={uploading}
          >
            {uploading ? 'Uploading Media...' : `Start Upload (${selectedFiles.length} file(s))`}
          </button>
        </form>
      </div>
    </div>
  );
}
