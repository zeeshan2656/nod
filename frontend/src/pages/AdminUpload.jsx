import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { UploadQueueContext } from '../context/UploadQueueContext';
import Toast from '../components/Toast';
import api, { API_BASE_URL } from '../utils/api';

export default function AdminUpload() {
  const { user, loading: authLoading, isAdmin } = useContext(AuthContext);
  const { addToQueue, queue, setIsQueueVisible, setIsMinimized } = useContext(UploadQueueContext);
  const navigate = useNavigate();

  // Addition Method: 'file', 'media', or 'link'
  const [uploadMethod, setUploadMethod] = useState('file');

  // --- Browser File Upload States ---
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // --- Server Media Library States ---
  const [serverMediaList, setServerMediaList] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null); // Selected server file for post creation
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaDescription, setMediaDescription] = useState('');
  const [mediaThumbPos, setMediaThumbPos] = useState(1);
  const [isPublishingMedia, setIsPublishingMedia] = useState(false);
  const [mediaSearchQuery, setMediaSearchQuery] = useState('');

  // --- External Link Embed States ---
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedTitle, setEmbedTitle] = useState('');
  const [embedDescription, setEmbedDescription] = useState('');
  const [embedDuration, setEmbedDuration] = useState('');
  const [embedThumbnailUrl, setEmbedThumbnailUrl] = useState('');
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);

  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Admin guard redirect
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/login');
    }
  }, [user, authLoading, isAdmin, navigate]);

  // Load server media library when Media tab is activated
  useEffect(() => {
    if (uploadMethod === 'media' && user && isAdmin) {
      loadServerMedia();
    }
  }, [uploadMethod, user, isAdmin]);

  const loadServerMedia = async () => {
    setLoadingMedia(true);
    try {
      const res = await api.get('/videos/server-media');
      const filesArray = Array.isArray(res.data) ? res.data : (res.data?.files || []);
      setServerMediaList(filesArray);
    } catch (err) {
      console.error('Failed to load server media library:', err);
      setToast({ message: 'Failed to load server media files.', type: 'danger' });
    } finally {
      setLoadingMedia(false);
    }
  };

  // Auto detect external video details on URL change (debounced)
  useEffect(() => {
    const isYt = /youtube\.com|youtu\.be/i.test(embedUrl);
    const isGd = /drive\.google\.com/i.test(embedUrl);

    if (isYt || isGd) {
      const fetchMetadata = async () => {
        setIsFetchingMetadata(true);
        try {
          const response = await api.get(`/videos/fetch-metadata?url=${encodeURIComponent(embedUrl)}`);
          const meta = response.data;
          
          setEmbedTitle(meta.title || '');
          setEmbedDuration(meta.duration ? meta.duration.toString() : '');
          setEmbedThumbnailUrl(meta.thumbnail_url || '');
          
          setToast({ message: 'Metadata automatically retrieved from link!', type: 'success' });
        } catch (err) {
          console.warn('Auto-fetch metadata failed:', err.message);
        } finally {
          setIsFetchingMetadata(false);
        }
      };

      const delayTimer = setTimeout(() => {
        fetchMetadata();
      }, 700);

      return () => clearTimeout(delayTimer);
    } else {
      setEmbedThumbnailUrl('');
    }
  }, [embedUrl]);

  // --- Browser File Selection Handlers ---
  const handleFilesSelected = async (filesList) => {
    const files = Array.from(filesList);
    if (files.length === 0) return;

    const videoFiles = files.filter(f => f.type.startsWith('video/') || /\.(mp4|mkv|avi|mov|webm)$/i.test(f.name));
    
    if (videoFiles.length === 0) {
      setToast({ message: 'No valid video files selected.', type: 'danger' });
      return;
    }

    try {
      await addToQueue(videoFiles, 'video');
      
      setToast({ 
        message: `Successfully added ${videoFiles.length} item(s) to the background upload queue!`, 
        type: 'success' 
      });
      
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

  // --- Media Library Selection & Post Creation Handlers ---
  const handleSelectMediaForPost = (media) => {
    setSelectedMedia(media);
    const name = media.fileName || media.filename || '';
    // Derive a clean title from filename without extension
    const defaultTitle = name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    setMediaTitle(defaultTitle);
    setMediaDescription('');
    setMediaThumbPos(1);
  };

  const handleCancelMediaPost = () => {
    setSelectedMedia(null);
    setMediaTitle('');
    setMediaDescription('');
  };

  const handleCreatePostFromMedia = async (e) => {
    e.preventDefault();
    if (!selectedMedia || !mediaTitle.trim()) {
      setToast({ message: 'Title is required to publish video post.', type: 'danger' });
      return;
    }

    const name = selectedMedia.fileName || selectedMedia.filename;
    setIsPublishingMedia(true);
    try {
      const response = await api.post('/videos/create-from-media', {
        fileName: name,
        filename: name,
        title: mediaTitle.trim(),
        description: mediaDescription.trim(),
        thumbnail_position: mediaThumbPos
      });

      setToast({ 
        message: `Successfully published "${response.data.video?.title || mediaTitle}"! Post is created and HLS transcoding is running.`, 
        type: 'success' 
      });

      // Clear selection and refresh server media list
      setSelectedMedia(null);
      setMediaTitle('');
      setMediaDescription('');
      loadServerMedia();
    } catch (err) {
      console.error('Failed to create post from server media:', err);
      const errMsg = err.response?.data?.error || 'Failed to create post from server media.';
      setToast({ message: errMsg, type: 'danger' });
    } finally {
      setIsPublishingMedia(false);
    }
  };

  // --- External Link Embed Handler ---
  const handleLinkSubmit = async (e) => {
    e.preventDefault();
    if (!embedUrl) return;

    setIsSubmittingLink(true);
    try {
      const payload = {
        url: embedUrl,
        title: embedTitle,
        description: embedDescription,
        duration: embedDuration ? parseFloat(embedDuration) : 0,
        thumbnail_url: embedThumbnailUrl
      };

      const response = await api.post('/videos/embed', payload);
      
      setToast({ 
        message: `Successfully added embedded video: "${response.data.title || 'Untitled'}"`, 
        type: 'success' 
      });

      setEmbedUrl('');
      setEmbedTitle('');
      setEmbedDescription('');
      setEmbedDuration('');
      setEmbedThumbnailUrl('');
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Failed to register external link.';
      setToast({ message: errMsg, type: 'danger' });
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const formatDuration = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (authLoading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  // Count active uploads currently running in the background
  const activeCount = queue.filter(item => 
    ['queued', 'uploading', 'processing', 'generating_thumbnail', 'saving_metadata'].includes(item.status)
  ).length;

  const filteredMediaList = (Array.isArray(serverMediaList) ? serverMediaList : []).filter(media => {
    const name = media.fileName || media.filename || '';
    return name.toLowerCase().includes((mediaSearchQuery || '').toLowerCase());
  });

  return (
    <div className="admin-container" style={{ maxWidth: '840px', padding: '16px 16px 40px 16px' }}>
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}

      <div className="admin-title-row" style={{ marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0 }}>Add Video Content</h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Upload files directly, select from existing server media, or embed external video links.
          </p>
        </div>
        <Link to="/admin" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
          Dashboard
        </Link>
      </div>

      <div style={{ 
        backgroundColor: 'var(--card-bg)', 
        border: '1px solid var(--border-color)', 
        padding: '24px', 
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
      }}>

        {/* Method Switcher Navigation Tabs */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            CHOOSE ADDITION METHOD
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', backgroundColor: 'rgba(0,0,0,0.25)', padding: '4px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={() => {
                setUploadMethod('file');
                setSelectedMedia(null);
              }}
              style={{
                padding: '10px 8px',
                textAlign: 'center',
                color: uploadMethod === 'file' ? '#fff' : 'var(--text-muted)',
                fontWeight: uploadMethod === 'file' ? '700' : '500',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: uploadMethod === 'file' ? 'var(--card-bg)' : 'transparent',
                boxShadow: uploadMethod === 'file' ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
                border: uploadMethod === 'file' ? '1px solid var(--border-color)' : '1px solid transparent',
                transition: 'all 0.2s',
                fontSize: '13px'
              }}
            >
              📂 Upload File
            </button>

            <button
              type="button"
              onClick={() => {
                setUploadMethod('media');
                setSelectedMedia(null);
              }}
              style={{
                padding: '10px 8px',
                textAlign: 'center',
                color: uploadMethod === 'media' ? '#fff' : 'var(--text-muted)',
                fontWeight: uploadMethod === 'media' ? '700' : '500',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: uploadMethod === 'media' ? 'var(--card-bg)' : 'transparent',
                boxShadow: uploadMethod === 'media' ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
                border: uploadMethod === 'media' ? '1px solid var(--border-color)' : '1px solid transparent',
                transition: 'all 0.2s',
                fontSize: '13px'
              }}
            >
              📁 Media Library
            </button>

            <button
              type="button"
              onClick={() => {
                setUploadMethod('link');
                setSelectedMedia(null);
              }}
              style={{
                padding: '10px 8px',
                textAlign: 'center',
                color: uploadMethod === 'link' ? '#fff' : 'var(--text-muted)',
                fontWeight: uploadMethod === 'link' ? '700' : '500',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: uploadMethod === 'link' ? 'var(--card-bg)' : 'transparent',
                boxShadow: uploadMethod === 'link' ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
                border: uploadMethod === 'link' ? '1px solid var(--border-color)' : '1px solid transparent',
                transition: 'all 0.2s',
                fontSize: '13px'
              }}
            >
              🔗 External Link
            </button>
          </div>
        </div>

        {/* TAB 1: BROWSER FILE UPLOAD */}
        {uploadMethod === 'file' && (
          <div>
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerSelect}
              style={{
                border: `2px dashed ${isDragOver ? 'var(--accent, #3b82f6)' : 'var(--border-color, #333)'}`,
                backgroundColor: isDragOver ? 'rgba(59, 130, 246, 0.03)' : 'rgba(0,0,0,0.15)',
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
                Select Video Files
              </button>
              
              <div style={{ marginTop: '20px', fontSize: '11px', color: 'var(--text-muted)' }}>
                Supported formats: MP4, MKV, AVI, MOV, WEBM. Select multiple files for fast sequential bulk uploading.
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SERVER MEDIA LIBRARY */}
        {uploadMethod === 'media' && (
          <div>
            {/* Info notice about server direct upload */}
            <div style={{
              backgroundColor: 'rgba(59, 130, 246, 0.06)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '6px',
              padding: '12px 16px',
              marginBottom: '20px',
              fontSize: '12px',
              lineHeight: '1.5',
              color: '#d1d5db'
            }}>
              <div style={{ fontWeight: '600', color: '#93c5fd', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📁 Direct Server Upload Path:</span>
                <code style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', color: '#60a5fa', fontSize: '11px' }}>
                  storage/media/
                </code>
              </div>
              <div>
                Upload raw videos directly to your server folder via FTP, SFTP, or cPanel File Manager. Unposted videos remain private and won't appear on the site until you publish them below.
              </div>
            </div>

            {/* If a media file is selected for post creation, show creation form */}
            {selectedMedia ? (
              <div style={{
                backgroundColor: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#fff' }}>Create Video Post</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Connect server file without re-uploading
                    </span>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleCancelMediaPost}
                    disabled={isPublishingMedia}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                  >
                    ← Back to Media List
                  </button>
                </div>

                <form onSubmit={handleCreatePostFromMedia} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Selected Video Summary Card */}
                  <div style={{
                    display: 'flex',
                    gap: '14px',
                    padding: '12px',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    alignItems: 'center'
                  }}>
                    <div style={{ width: '110px', aspectRatio: '16/9', backgroundColor: '#000', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                      <img 
                        src={`${API_BASE_URL}/api/videos/server-media/thumbnail?file=${encodeURIComponent(selectedMedia.fileName || selectedMedia.filename)}`} 
                        alt="Server video thumb" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <span style={{ position: 'absolute', bottom: '3px', right: '3px', backgroundColor: 'rgba(0,0,0,0.8)', fontSize: '9px', padding: '1px 3px', borderRadius: '2px' }}>
                        {formatDuration(selectedMedia.duration)}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0, fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <strong style={{ color: '#fff', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedMedia.fileName || selectedMedia.filename}>
                        {selectedMedia.fileName || selectedMedia.filename}
                      </strong>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Size: <strong style={{ color: '#ddd' }}>{selectedMedia.fileSize || selectedMedia.sizeFormatted}</strong> • Resolution: <strong style={{ color: '#ddd' }}>{selectedMedia.width}x{selectedMedia.height}</strong>
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Duration: <strong style={{ color: '#ddd' }}>{formatDuration(selectedMedia.duration)}</strong> • Aspect: <strong style={{ color: '#ddd' }}>{selectedMedia.aspectRatio}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Title Input */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                      POST TITLE *
                    </label>
                    <input 
                      type="text" 
                      required
                      value={mediaTitle}
                      onChange={(e) => setMediaTitle(e.target.value)}
                      placeholder="Enter video post title"
                      disabled={isPublishingMedia}
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  {/* Description Input */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                      DESCRIPTION (OPTIONAL)
                    </label>
                    <textarea 
                      rows="3"
                      value={mediaDescription}
                      onChange={(e) => setMediaDescription(e.target.value)}
                      placeholder="Enter description for this video post..."
                      disabled={isPublishingMedia}
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '14px',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  {/* Thumbnail Frame Selection */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
                        THUMBNAIL FRAME POSITION
                      </label>
                      <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: '600' }}>Frame #{mediaThumbPos}</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="30" 
                      value={mediaThumbPos}
                      onChange={(e) => setMediaThumbPos(parseInt(e.target.value))}
                      disabled={isPublishingMedia}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Submit Button */}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={isPublishingMedia || !mediaTitle.trim()}
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '14px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      {isPublishingMedia ? (
                        <>
                          <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          Creating Post & Queuing Transcoding...
                        </>
                      ) : (
                        'Publish Video Post'
                      )}
                    </button>
                    <button 
                      type="button" 
                      onClick={handleCancelMediaPost}
                      disabled={isPublishingMedia}
                      className="btn btn-secondary"
                      style={{ padding: '12px 20px', fontSize: '13px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Media List View */
              <div>
                {/* Search Bar & Refresh Row */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
                  <input 
                    type="text"
                    placeholder="Search unposted server files..."
                    value={mediaSearchQuery}
                    onChange={(e) => setMediaSearchQuery(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      backgroundColor: 'rgba(0,0,0,0.25)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '13px'
                    }}
                  />
                  <button 
                    type="button" 
                    onClick={loadServerMedia}
                    disabled={loadingMedia}
                    className="btn btn-secondary"
                    style={{ padding: '10px 16px', fontSize: '13px', whiteSpace: 'nowrap' }}
                  >
                    {loadingMedia ? 'Scanning...' : '🔄 Scan Folder'}
                  </button>
                </div>

                {loadingMedia ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Scanning server media folder...
                  </div>
                ) : filteredMediaList.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '48px 20px',
                    border: '1px dashed var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>📂</div>
                    <h4 style={{ fontSize: '15px', color: '#fff', margin: '0 0 6px 0' }}>No unposted server media found</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 auto', maxWidth: '420px' }}>
                      To add videos directly, copy video files into <code style={{ color: '#60a5fa' }}>storage/media/</code> on your hosting/server and click <strong>Scan Folder</strong>.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Showing {filteredMediaList.length} unposted video(s) on server:
                    </div>
                    {filteredMediaList.map(media => {
                      const name = media.fileName || media.filename || '';
                      const size = media.fileSize || media.sizeFormatted || '';
                      const thumb = media.thumbnailUrl 
                        ? `${API_BASE_URL}${media.thumbnailUrl}`
                        : `${API_BASE_URL}/api/videos/server-media/thumbnail?file=${encodeURIComponent(name)}`;

                      return (
                        <div 
                          key={name}
                          style={{
                            display: 'flex',
                            gap: '14px',
                            padding: '12px',
                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            alignItems: 'center',
                            transition: 'background-color 0.2s',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleSelectMediaForPost(media)}
                        >
                          {/* Thumbnail */}
                          <div style={{ width: '100px', aspectRatio: '16/9', backgroundColor: '#000', position: 'relative', flexShrink: 0, borderRadius: '4px', overflow: 'hidden' }}>
                            <img 
                              src={thumb} 
                              alt={name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              loading="lazy"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <span style={{ position: 'absolute', bottom: '3px', right: '3px', backgroundColor: 'rgba(0,0,0,0.8)', fontSize: '9px', padding: '1px 3px', borderRadius: '2px', color: '#fff' }}>
                              {formatDuration(media.duration)}
                            </span>
                          </div>

                          {/* Details */}
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontWeight: '600', color: '#fff', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                              {name}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Size: <strong style={{ color: '#ccc' }}>{size}</strong> • Resolution: <strong style={{ color: '#ccc' }}>{media.width}x{media.height}</strong> ({media.aspectRatio})
                            </span>
                            <span style={{ fontSize: '10px', color: '#777' }}>
                              Modified: {new Date(media.modifiedAt).toLocaleString()}
                            </span>
                          </div>

                          {/* Action */}
                          <button 
                            type="button" 
                            className="btn btn-primary"
                            style={{ padding: '6px 14px', fontSize: '12px', flexShrink: 0 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectMediaForPost(media);
                            }}
                          >
                            Create Post
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EXTERNAL LINK EMBED FORM */}
        {uploadMethod === 'link' && (
          <form onSubmit={handleLinkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                PASTE SHARED LINK (YOUTUBE OR GOOGLE DRIVE)
              </label>
              <input 
                type="url" 
                required
                placeholder="https://www.youtube.com/watch?v=... or https://drive.google.com/..." 
                value={embedUrl}
                onChange={(e) => setEmbedUrl(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px'
                }}
              />
              {isFetchingMetadata && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--accent, #2196f3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid var(--accent, #2196f3)', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Detecting source metadata, duration and cover references...
                </div>
              )}
            </div>

            {embedThumbnailUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
                  COVER THUMBNAIL
                </label>
                <img 
                  src={embedThumbnailUrl} 
                  alt="Video Thumbnail Reference" 
                  style={{ 
                    width: '220px', 
                    aspectRatio: '16/9', 
                    objectFit: 'cover', 
                    borderRadius: '6px', 
                    border: '1px solid var(--border-color)',
                    backgroundColor: '#000'
                  }} 
                />
              </div>
            )}
            
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                TITLE
              </label>
              <input 
                type="text" 
                required
                placeholder="Title will auto-populate" 
                value={embedTitle}
                onChange={(e) => setEmbedTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                DESCRIPTION (OPTIONAL)
              </label>
              <textarea 
                rows="3"
                placeholder="Enter description here..." 
                value={embedDescription}
                onChange={(e) => setEmbedDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: 'var(--text-muted)' }}>
                DURATION (SECONDS)
              </label>
              <input 
                type="number" 
                required
                min="0"
                step="any"
                placeholder="Duration will auto-populate" 
                value={embedDuration}
                onChange={(e) => setEmbedDuration(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px'
                }}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSubmittingLink || isFetchingMetadata}
              style={{
                padding: '12px',
                fontSize: '14px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '8px'
              }}
            >
              {isSubmittingLink ? 'Adding Embed...' : 'Add Embedded Video'}
            </button>
          </form>
        )}

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
