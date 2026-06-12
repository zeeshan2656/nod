import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { API_BASE_URL } from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import AdPlacement from '../components/AdPlacement';
import Toast from '../components/Toast';
import Hls from 'hls.js';

export default function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  // States
  const [video, setVideo] = useState(null);
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyText, setReplyText] = useState({});
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showComments, setShowComments] = useState(false);

  // Custom Video Player States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [seekIndicator, setSeekIndicator] = useState(null); // 'rewind' or 'forward'

  // Refs
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const viewLogged = useRef(false);
  const lastTapRef = useRef({ time: 0, x: 0 });
  const controlsTimeoutRef = useRef(null);
  const playerWrapperRef = useRef(null);

  // Reset states on video id changes
  useEffect(() => {
    viewLogged.current = false;
    setShowComments(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setProgress(0);
    setShowControls(true);
  }, [id]);

  // Load video details, related videos, and comments
  useEffect(() => {
    const fetchWatchData = async () => {
      setLoading(true);
      try {
        const videoRes = await api.get(`/videos/${id}`);
        setVideo(videoRes.data);

        // Fetch related videos (limit to 10 and exclude current)
        const relatedRes = await api.get('/videos?limit=10');
        setRelatedVideos(
          (relatedRes.data.videos || []).filter(v => v.id !== parseInt(id))
        );

        // Fetch comments
        const commentsRes = await api.get(`/comments?video_id=${id}`);
        setComments(commentsRes.data);
      } catch (err) {
        console.error('Failed to load watch data:', err);
        setToast({ message: 'Error loading video.', type: 'danger' });
      } finally {
        setLoading(false);
      }
    };

    fetchWatchData();
  }, [id, user]);

  // HLS / MP4 Media Binding Lifecycle (incorporating `loading` dependency to resolve blank screen bug)
  useEffect(() => {
    if (loading || !video || !videoRef.current) return;

    const videoElement = videoRef.current;
    let videoUrl = '';
    
    if (video.status === 'ready') {
      videoUrl = `${API_BASE_URL}${video.file_path}`;
    } else {
      videoUrl = `${API_BASE_URL}/${video.file_path.replace(/\\/g, '/')}`;
    }

    // Clean up previous HLS instance if any
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (video.status === 'ready') {
      if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = videoUrl;
        videoElement.play().catch(err => console.warn('Autoplay blocked:', err.message));
      } else {
        if (Hls.isSupported()) {
          const hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true
          });
          hlsRef.current = hlsInstance;
          hlsInstance.loadSource(videoUrl);
          hlsInstance.attachMedia(videoElement);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            videoElement.play().catch(err => console.warn('Autoplay blocked:', err.message));
          });
        } else {
          videoElement.src = videoUrl;
          videoElement.play().catch(err => console.warn('Autoplay blocked:', err.message));
        }
      }
    } else {
      videoElement.src = videoUrl;
      videoElement.play().catch(err => console.warn('Autoplay blocked:', err.message));
    }

    // Force load the video element
    videoElement.load();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [video?.id, loading]);

  // Auto-hide controls overlay helper
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  // Playback Control Handlers
  const handlePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(err => console.warn('Playback block:', err.message));
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const seekForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, videoRef.current.duration || 0);
    }
  };

  const seekBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
    }
  };

  const showOverlayIndicator = (type) => {
    setSeekIndicator(type);
    setTimeout(() => {
      setSeekIndicator(null);
    }, 600);
  };

  // Scrubber time update syncs
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      setProgress((videoRef.current.currentTime / (videoRef.current.duration || 1)) * 100);
    }
  };

  const handleDurationChange = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleScrub = (e) => {
    const newTime = (parseFloat(e.target.value) / 100) * duration;
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleFullscreen = () => {
    if (!playerWrapperRef.current) return;
    const container = playerWrapperRef.current;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen().catch(err => console.error('Fullscreen request failed:', err));
    }
  };

  // Keyboard Shortcuts Seek Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.isContentEditable
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekBackward();
        showOverlayIndicator('rewind');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekForward();
        showOverlayIndicator('forward');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration]);

  // Click handler on player view (Double-Tap detector)
  const handleVideoClick = (e) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    // Skip trigger if clicking controls overlay area
    if (clickY > height * 0.8) return;

    if (now - lastTapRef.current.time < DOUBLE_TAP_DELAY) {
      if (clickX < width / 2) {
        seekBackward();
        showOverlayIndicator('rewind');
      } else {
        seekForward();
        showOverlayIndicator('forward');
      }
    } else {
      // Single tap toggles play
      handlePlayPause();
    }
    lastTapRef.current = { time: now, x: clickX };
  };

  // Register views stats trigger on initial play
  const handlePlay = async () => {
    setIsPlaying(true);
    if (!viewLogged.current) {
      viewLogged.current = true;
      try {
        const response = await api.post(`/videos/${id}/view`);
        if (response.data.status === 'counted') {
          setVideo(prev => ({
            ...prev,
            views_count: response.data.views_count
          }));
        }
      } catch (err) {
        console.error('Failed to log video view:', err);
      }
    }
  };

  // Format Helper MM:SS
  const formatTime = (secs) => {
    if (isNaN(secs)) return '00:00';
    const mins = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Like video handler
  const handleLike = async () => {
    try {
      const response = await api.post(`/videos/${id}/like`);
      const { liked: isLiked } = response.data;
      setLiked(isLiked);
      setVideo(prev => ({
        ...prev,
        likes_count: isLiked ? prev.likes_count + 1 : Math.max(prev.likes_count - 1, 0)
      }));
    } catch (err) {
      setToast({ message: 'Failed to like video.', type: 'danger' });
    }
  };

  // Share handler
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setToast({ message: 'Link copied to clipboard!', type: 'success' });
  };

  // Comment additions
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const response = await api.post('/comments', {
        video_id: id,
        content: newComment
      });
      setComments(prev => [response.data, ...prev]);
      setNewComment('');
      setToast({ message: 'Comment added!', type: 'success' });
    } catch (err) {
      setToast({ message: 'Could not post comment.', type: 'danger' });
    }
  };

  const handleAddReply = async (commentId) => {
    const text = replyText[commentId];
    if (!text || !text.trim()) return;

    try {
      const response = await api.post('/comments', {
        video_id: id,
        parent_id: commentId,
        content: text
      });

      setComments(prev => {
        return prev.map(c => {
          if (c.id === commentId) {
            return { ...c, replies: [...c.replies, response.data] };
          }
          return c;
        });
      });

      setReplyText(prev => ({ ...prev, [commentId]: '' }));
      setActiveReplyId(null);
      setToast({ message: 'Reply posted!', type: 'success' });
    } catch (err) {
      setToast({ message: 'Could not post reply.', type: 'danger' });
    }
  };

  const handleDeleteComment = async (commentId, parentId = null) => {
    try {
      await api.delete(`/comments/${commentId}`);
      setComments(prev => {
        if (parentId) {
          return prev.map(c => {
            if (c.id === parentId) {
              return { ...c, replies: c.replies.filter(r => r.id !== commentId) };
            }
            return c;
          });
        } else {
          return prev.filter(c => c.id !== commentId);
        }
      });
      setToast({ message: 'Comment deleted.', type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to delete comment.', type: 'danger' });
    }
  };

  const renderCommentList = (list, parentId = null) => {
    return list.map(comment => (
      <div key={comment.id} className="comment-item" style={{ marginTop: '10px' }}>
        <div className="comment-author">
          {comment.username} 
          <span className="comment-date">{new Date(comment.created_at).toLocaleDateString()}</span>
        </div>
        <div className="comment-content">{comment.content}</div>
        
        <div className="comment-actions">
          <span 
            className="comment-action-btn"
            onClick={() => setActiveReplyId(activeReplyId === comment.id ? null : comment.id)}
          >
            Reply
          </span>
          
          {(user && (user.id === comment.user_id || user.role === 'admin')) && (
            <span 
              className="comment-action-btn" 
              style={{ color: 'var(--danger)' }}
              onClick={() => handleDeleteComment(comment.id, parentId)}
            >
              Delete
            </span>
          )}
        </div>

        {activeReplyId === comment.id && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <input
              type="text"
              className="form-input"
              style={{ padding: '6px 10px', fontSize: '13px' }}
              value={replyText[comment.id] || ''}
              onChange={(e) => setReplyText(prev => ({ ...prev, [comment.id]: e.target.value }))}
              placeholder={`Reply to ${comment.username}...`}
            />
            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleAddReply(comment.id)}>
              Reply
            </button>
          </div>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <div className="comment-replies">
            {renderCommentList(comment.replies, comment.id)}
          </div>
        )}
      </div>
    ));
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading watch page...</div>;
  }

  if (!video) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Video not found.</div>;
  }

  return (
    <div className="watch-container">
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}
      
      {/* Main Column */}
      <div className="watch-main">
        {/* Video Top Ad placement */}
        <AdPlacement placement="video_top" />

        {/* Custom HLS / Native Video Player Container */}
        <div 
          ref={playerWrapperRef}
          className="player-wrapper" 
          style={{ position: 'relative', overflow: 'hidden' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => isPlaying && setShowControls(false)}
        >
          <video
            ref={videoRef}
            className="player-element"
            playsInline
            onPlay={handlePlay}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onClick={handleVideoClick}
            style={{ cursor: 'pointer' }}
          />

          {/* Double Tap Visual Indicator overlays */}
          {seekIndicator && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: seekIndicator === 'rewind' ? 0 : '50%',
              width: '50%',
              height: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              fontSize: '22px',
              fontWeight: 'bold',
              color: '#fff',
              pointerEvents: 'none',
              zIndex: 10,
              borderRadius: '2px'
            }}>
              {seekIndicator === 'rewind' ? '⏪ -10s' : '+10s ⏩'}
            </div>
          )}

          {/* Integrated custom control bar (Issue #2: Controls inside player controls bar) */}
          <div 
            className="custom-player-controls"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'rgba(15, 15, 15, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              padding: '6px 12px',
              gap: '4px',
              zIndex: 20,
              transition: 'opacity 0.25s ease-in-out',
              opacity: showControls ? 1 : 0,
              pointerEvents: showControls ? 'auto' : 'none'
            }}
            onClick={(e) => e.stopPropagation()} // Stop propagation from triggering Play toggle on tap
          >
            {/* Scrubber track */}
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              onChange={handleScrub}
              style={{
                width: '100%',
                accentColor: 'var(--primary)',
                cursor: 'pointer',
                height: '3px',
                backgroundColor: '#333',
                border: 'none',
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {/* Media Controls Group Left */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                
                {/* Integrated Backward skip button */}
                <button 
                  type="button" 
                  onClick={seekBackward} 
                  style={{ cursor: 'pointer', fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Rewind 10 seconds"
                >
                  ⏪
                </button>

                {/* Play/Pause Button */}
                <button 
                  type="button" 
                  onClick={handlePlayPause} 
                  style={{ cursor: 'pointer', fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {isPlaying ? '⏸️' : '▶️'}
                </button>

                {/* Integrated Forward skip button */}
                <button 
                  type="button" 
                  onClick={seekForward} 
                  style={{ cursor: 'pointer', fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Forward 10 seconds"
                >
                  ⏩
                </button>

                {/* Timer details */}
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', userSelect: 'none' }}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Media Controls Group Right */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {/* Mute button */}
                <button 
                  type="button" 
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.muted = !videoRef.current.muted;
                      setIsMuted(videoRef.current.muted);
                    }
                  }} 
                  style={{ cursor: 'pointer', fontSize: '14px', color: '#fff' }}
                >
                  {isMuted ? '🔇' : '🔊'}
                </button>
                {/* Fullscreen button */}
                <button 
                  type="button" 
                  onClick={handleFullscreen} 
                  style={{ cursor: 'pointer', fontSize: '14px', color: '#fff' }}
                  title="Fullscreen toggle"
                >
                  🔲
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Video Details */}
        <div className="video-details">
          <h1 className="video-details-title">{video.title}</h1>
          <div className="video-meta">
            <span>{video.views_count} views</span>
            <span style={{ margin: '0 6px' }}>•</span>
            <span>{new Date(video.created_at).toLocaleDateString()}</span>
          </div>

          <div className="video-details-actions">
            <div className="action-buttons">
              <div className={`action-btn ${liked ? 'active' : ''}`} onClick={handleLike}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                </svg>
                <span>{video.likes_count}</span>
              </div>

              <div className="action-btn" onClick={handleShare}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                <span>Share</span>
              </div>
            </div>

            {video.status === 'processing' && (
              <span style={{ fontSize: '11px', backgroundColor: '#e65100', color: '#fff', padding: '4px 8px', borderRadius: '2px', fontWeight: '600' }}>
                TRANSCODING IN PROGRESS (Original Quality)
              </span>
            )}
          </div>
        </div>

        {video.description && (
          <div className="video-description-box">
            {video.description}
          </div>
        )}

        {/* Video Bottom Ad Placement */}
        <AdPlacement placement="video_bottom" />

        {/* RELATED VIDEOS FEED SECTION (Issue #4: Below Player and Details, above comments) */}
        <div className="related-videos-section" style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', color: '#fff', letterSpacing: '0.5px' }}>
            Related Videos
          </h3>
          {relatedVideos.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No related videos found.</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {relatedVideos.map(rv => (
                <Link 
                  key={rv.id} 
                  to={`/watch/${rv.id}`} 
                  style={{ display: 'flex', gap: '12px', alignItems: 'center' }}
                >
                  <div style={{ width: '110px', aspectRatio: '16/9', backgroundColor: '#000', borderRadius: '1px', overflow: 'hidden', flexShrink: 0 }}>
                    <img 
                      src={`${API_BASE_URL}/api/videos/${rv.id}/thumbnail`} 
                      alt={rv.title} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      loading="lazy"
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: '600', 
                      color: '#fff', 
                      display: '-webkit-box', 
                      WebkitLineClamp: 2, 
                      WebkitBoxOrient: 'vertical', 
                      overflow: 'hidden',
                      lineHeight: '1.2' 
                    }}>
                      {rv.title}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {rv.views_count} views
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* COMMENTS SECTION - Collapsible and hidden by default (Issue #4) */}
        <div style={{ borderBottom: '1px solid var(--border-color)' }}>
          {!showComments ? (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <button 
                type="button"
                className="btn btn-secondary" 
                style={{ width: '100%', height: '40px', justifyContent: 'center' }} 
                onClick={() => setShowComments(true)}
              >
                View Comments ({comments.length})
              </button>
            </div>
          ) : (
            <div className="comments-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className="comments-header" style={{ margin: 0 }}>Comments ({comments.length})</h3>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => setShowComments(false)}
                >
                  Hide Comments
                </button>
              </div>

              <form onSubmit={handleAddComment} className="comment-input-box">
                <textarea
                  className="comment-textarea"
                  placeholder="Add a public comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows="2"
                  required
                />
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-end', height: '40px' }}
                >
                  Comment
                </button>
              </form>

              <div className="comment-list">
                {comments.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No comments yet. Be the first to reply!</div>
                ) : (
                  renderCommentList(comments)
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Column */}
      <div className="watch-sidebar">
        <AdPlacement placement="sidebar" />
        <AdPlacement placement="watch_page" />
      </div>
    </div>
  );
}
