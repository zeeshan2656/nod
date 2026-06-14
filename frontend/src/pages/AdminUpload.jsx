import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { UploadQueueContext } from '../context/UploadQueueContext';
import Toast from '../components/Toast';

export default function AdminUpload() {
  const { user, loading: authLoading, isAdmin } = useContext(AuthContext);
  const { addToQueue, queue, setIsQueueVisible, setIsMinimized } = useContext(UploadQueueContext);
  const navigate = useNavigate();

  const [uploadType, setUploadType] = useState('video'); // 'video' or 'reel'
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Admin guard redirect
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/login');
    }
  }, [user, authLoading, isAdmin, navigate]);

  const handleFilesSelected = async (filesList) => {
    const files = Array.from(filesList);
    if (files.length === 0) return;

    // Filter non-video files
    const videoFiles = files.filter(f => f.type.startsWith('video/') || /\.(mp4|mkv|avi|mov|webm)$/i.test(f.name));
    
    if (videoFiles.length === 0) {
      setToast({ message: 'No valid video files selected.', type: 'danger' });
      return;
    }

    try {
      await addToQueue(videoFiles, uploadType);
      
      setToast({ 
        message: `Successfully added ${videoFiles.length} item(s) to the background upload queue!`, 
        type: 'success' 
      });
      
      // Auto open and maximize the queue panel
      setIsQueueVisible(true);
      setIsMinimized(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = null;
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to process files for upload.', type: 'danger' });
    }
  };

  const handleFileChange = (e) => {
    handleFilesSelected(e.target.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const triggerSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  if (authLoading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  // Count active uploads currently running in the background
  const activeCount = queue.filter(item => 
    ['queued', 'uploading', 'processing', 'generating_thumbnail', 'saving_metadata'].includes(item.status)
  ).length;

  return (
    <div className="admin-container" style={{ maxWidth: '720px' }}>
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}

      <div className="admin-title-row" style={{ marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0 }}>Upload Media Files</h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Videos are processed sequentially and transcoded to adaptive HLS stream segments.
          </p>
        </div>
        <Link to="/admin" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
          Dashboard
        </Link>
      </div>

      <div style={{ 
        backgroundColor: 'var(--card-bg)', 
        border: '1px solid var(--border-color)', 
        padding: '28px', 
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
      }}>
        {/* Toggle Media Type */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
            SELECT UPLOAD DESTINATION TYPE
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div 
              onClick={() => setUploadType('video')}
              style={{
                flex: 1,
                border: `2px solid ${uploadType === 'video' ? 'var(--accent, #3b82f6)' : 'var(--border-color)'}`,
                backgroundColor: uploadType === 'video' ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s'
              }}
            >
              <input 
                type="radio" 
                name="uploadType" 
                checked={uploadType === 'video'} 
                onChange={() => setUploadType('video')}
                style={{ cursor: 'pointer' }}
              />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: '#fff' }}>Landscape Video</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Standard 16:9 / 4:3 videos. Limit: 500MB each.</span>
              </div>
            </div>

            <div 
              onClick={() => setUploadType('reel')}
              style={{
                flex: 1,
                border: `2px solid ${uploadType === 'reel' ? 'var(--accent, #3b82f6)' : 'var(--border-color)'}`,
                backgroundColor: uploadType === 'reel' ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s'
              }}
            >
              <input 
                type="radio" 
                name="uploadType" 
                checked={uploadType === 'reel'} 
                onChange={() => setUploadType('reel')}
                style={{ cursor: 'pointer' }}
              />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: '#fff' }}>Vertical Reel / Short</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Vertical 9:16 format videos. Limit: 200MB each.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Drag & Drop Zone */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerSelect}
          style={{
            border: `2px dashed ${isDragOver ? 'var(--accent, #3b82f6)' : 'var(--border-color, #333)'}`,
            backgroundColor: isDragOver ? 'rgba(59, 130, 246, 0.03)' : 'rgba(0,0,0,0.1)',
            borderRadius: '8px',
            padding: '48px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
            boxSizing: 'border-box'
          }}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple 
            accept="video/*"
            style={{ display: 'none' }}
          />

          <div style={{ fontSize: '42px', marginBottom: '16px' }}>
            📥
          </div>
          
          <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 8px 0', color: '#fff' }}>
            Drag and drop video files here
          </h3>
          
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
            or click to browse from your device
          </p>

          <button 
            type="button" 
            className="btn btn-primary"
            style={{ padding: '8px 24px', fontSize: '13px', pointerEvents: 'none' }}
          >
            Select Files
          </button>
          
          <div style={{ marginTop: '20px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Supported formats: MP4, MKV, AVI, MOV, WEBM. Select up to 100+ files for sequential bulk upload.
          </div>
        </div>

        {/* Active Uploads Indicator shortcut */}
        {activeCount > 0 && (
          <div 
            onClick={() => {
              setIsQueueVisible(true);
              setIsMinimized(false);
            }}
            style={{ 
              marginTop: '24px', 
              backgroundColor: 'rgba(59, 130, 246, 0.08)', 
              border: '1px solid rgba(59, 130, 246, 0.2)', 
              padding: '12px 16px', 
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#93c5fd', fontWeight: '500' }}>
              <span style={{ width: '8px', height: '8px', backgroundColor: '#3b82f6', borderRadius: '50%', display: 'inline-block' }} />
              {activeCount} upload(s) running in background. You can navigate away.
            </span>
            <span style={{ color: '#3b82f6', fontWeight: '600' }}>View Queue &rarr;</span>
          </div>
        )}
      </div>
    </div>
  );
}
