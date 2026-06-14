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
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsFetched, setCommentsFetched] = useState(false);
  
  // Layout & Optimization States
  const [isMobile, setIsMobile] = useState(window.innerWidth < 960);
  const [renderAds, setRenderAds] = useState(false);

  // Overlay Ad States
  const [showOverlayAd, setShowOverlayAd] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [overlayAdCode, setOverlayAdCode] = useState(null);
  const [adLoading, setAdLoading] = useState(false);
  const overlayTriggered = useRef({ pre: false, mid1: false, mid2: false });
  const showOverlayAdRef = useRef(false);

  useEffect(() => {
    showOverlayAdRef.current = showOverlayAd;
  }, [showOverlayAd]);

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

  // Responsive Layout detection resize listener
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset states on video id changes
  useEffect(() => {
    viewLogged.current = false;
    setShowComments(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setProgress(0);
    setShowControls(true);
    setCommentsFetched(false);
    setComments([]);
    setRenderAds(false);
    // Defer rendering ad tags slightly to guarantee high FPS layout and instant player start
    const timer = setTimeout(() => setRenderAds(true), 100);
    return () => clearTimeout(timer);
  }, [id]);

  // Load video details, related videos, and overlay ad configuration
  useEffect(() => {
    const fetchWatchData = async () => {
      setLoading(true);
      try {
        // Fetch all data in parallel to avoid waterfalls and minimize load times
        const [videoRes, relatedRes, adsRes] = await Promise.all([
          api.get(`/videos/${id}`),
          api.get(`/videos/${id}/related`).catch(err => {
            console.error('Failed to load related videos:', err);
            return { data: [] };
          }),
          api.get('/ads').catch(err => {
            console.error('Failed to load overlay ad:', err);
            return { data: {} };
          })
        ]);

        setVideo(videoRes.data);
        setRelatedVideos(relatedRes.data || []);

        const activeAds = adsRes.data || {};
        if (activeAds && activeAds['video_overlay']) {
          setOverlayAdCode(activeAds['video_overlay']);
          setShowOverlayAd(true);
          setAdLoading(true);
          setCountdown(15);
          overlayTriggered.current = { pre: true, mid1: false, mid2: false };
        } else {
          setOverlayAdCode(null);
          setShowOverlayAd(false);
          setAdLoading(false);
          overlayTriggered.current = { pre: false, mid1: false, mid2: false };
        }
      } catch (err) {
        console.error('Failed to load watch data:', err);
        setToast({ message: 'Error loading video.', type: 'danger' });
      } finally {
        setLoading(false);
      }
    };

    fetchWatchData();
  }, [id, user]);

  // Lazy fetch comments only when opened
  useEffect(() => {
    if (showComments && !commentsFetched) {
      const fetchCommentsData = async () => {
        setCommentsLoading(true);
        try {
          const res = await api.get(`/comments?video_id=${id}`);
          setComments(res.data || []);
          setCommentsFetched(true);
        } catch (err) {
          console.error('Failed to fetch comments:', err);
          setToast({ message: 'Failed to load comments.', type: 'danger' });
        } finally {
          setCommentsLoading(false);
        }
      };
      fetchCommentsData();
    }
  }, [showComments, id, commentsFetched]);

  // Countdown timer for overlay ad
  useEffect(() => {
    if (!showOverlayAd) return;
    if (adLoading) return;
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [showOverlayAd, countdown, adLoading]);

  const triggerOverlayAd = () => {
    if (!overlayAdCode) return;
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    setCountdown(15);
    setAdLoading(true);
    setShowOverlayAd(true);
  };

  const handleCloseOverlayAd = () => {
    setShowOverlayAd(false);
    if (videoRef.current) {
      videoRef.current.play().catch(err => console.warn('Play failed after ad dismissal:', err));
      setIsPlaying(true);
    }
  };

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

    const playOrBlockAutoplay = () => {
      if (!showOverlayAdRef.current) {
        videoElement.play().catch(err => console.warn('Autoplay blocked:', err.message));
        setIsPlaying(true);
      } else {
        videoElement.pause();
        setIsPlaying(false);
      }
    };

    if (video.status === 'ready') {
      if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = videoUrl;
        playOrBlockAutoplay();
      } else {
        if (Hls.isSupported()) {
          const hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 5,
            maxBufferLength: 8,
            maxMaxBufferLength: 15,
            maxBufferSize: 20 * 1024 * 1024 // 20MB
          });
          hlsRef.current = hlsInstance;
          hlsInstance.loadSource(videoUrl);
          hlsInstance.attachMedia(videoElement);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            playOrBlockAutoplay();
          });
        } else {
          videoElement.src = videoUrl;
          playOrBlockAutoplay();
        }
      }
    } else {
      videoElement.src = videoUrl;
      playOrBlockAutoplay();
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
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration || 1;
      setCurrentTime(current);
      setProgress((current / total) * 100);
      if (total > 15) {
        const percentage = current / total;
        if (percentage >= 0.33 && percentage < 0.36 && !overlayTriggered.current.mid1) {
          overlayTriggered.current.mid1 = true;
          triggerOverlayAd();
        } else if (percentage >= 0.66 && percentage < 0.69 && !overlayTriggered.current.mid2) {
          overlayTriggered.current.mid2 = true;
          triggerOverlayAd();
        }
      }
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

  const commentsCount = commentsFetched ? comments.length : (video.comments_count || 0);

  const renderPlayer = () => (
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
        preload="auto"
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

      {/* OVERLAY AD SYSTEM */}
      {showOverlayAd && overlayAdCode && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#0a0a0a',
          zIndex: 100,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          
          {/* Ad display area */}
          <div className="ad-container-filled" style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
            opacity: adLoading ? 0 : 1,
            transition: 'opacity 0.3s ease-in-out'
          }}>
            <AdPlacement
              placement="video_overlay"
              code={overlayAdCode}
              onAdLoaded={() => setAdLoading(false)}
              onAdFailed={() => {
                console.warn('Overlay ad failed to load. Skipping gracefully to playback.');
                setAdLoading(false);
                setShowOverlayAd(false);
                if (videoRef.current) {
                  videoRef.current.play().catch(err => console.warn('Play failed after ad error:', err));
                  setIsPlaying(true);
                }
              }}
            />
          </div>

          {/* Loading state spinner centered */}
          {adLoading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#0a0a0a',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 105
            }}>
              <span className="overlay-ad-spinner" style={{
                display: 'inline-block',
                width: '40px',
                height: '40px',
                border: '3px solid rgba(255, 255, 255, 0.1)',
                borderTop: '3px solid #fff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: '12px'
              }}></span>
              <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500', letterSpacing: '0.5px' }}>Loading...</span>
            </div>
          )}

          {/* Countdown & Close button overlay */}
          {!adLoading && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 110,
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              {countdown > 0 ? (
                <div style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.85)',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: '600',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    border: '2px solid #fff',
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></span>
                  Video plays in {countdown}s
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCloseOverlayAd}
                  style={{
                    backgroundColor: 'var(--primary, #ff0000)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 16px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    transition: 'background-color 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => e.target.style.filter = 'brightness(1.1)'}
                  onMouseLeave={(e) => e.target.style.filter = 'none'}
                >
                  Close Ad ✕
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderInfo = () => (
    <div className="video-details" style={{ borderBottom: 'none', paddingBottom: '8px' }}>
      <h1 className="video-details-title" style={{ margin: 0, fontSize: '16px' }}>{video.title}</h1>
      <div className="video-meta" style={{ marginTop: '4px' }}>
        <span>{video.views_count} views</span>
        <span style={{ margin: '0 6px' }}>•</span>
        <span>{new Date(video.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );

  const renderActions = () => (
    <div className="video-details-actions" style={{ padding: '0 16px 12px 16px', borderBottom: '1px solid var(--border-color)', marginTop: 0 }}>
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

        <div className={`action-btn ${showComments ? 'active' : ''}`} onClick={() => setShowComments(prev => !prev)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <span>Comments ({commentsCount})</span>
        </div>
      </div>

      {video.status === 'processing' && (
        <span style={{ fontSize: '10px', backgroundColor: '#e65100', color: '#fff', padding: '2px 6px', borderRadius: '2px', fontWeight: '600' }}>
          RAW
        </span>
      )}
    </div>
  );

  const renderInfoAndActions = () => (
    <div className="video-details">
      <h1 className="video-details-title" style={{ fontSize: '20px', fontWeight: '700' }}>{video.title}</h1>
      <div className="video-details-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
        <div className="video-meta">
          <span>{video.views_count} views</span>
          <span style={{ margin: '0 6px' }}>•</span>
          <span>{new Date(video.created_at).toLocaleDateString()}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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

            <div className={`action-btn ${showComments ? 'active' : ''}`} onClick={() => setShowComments(prev => !prev)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span>Comments ({commentsCount})</span>
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
        <div className="video-description-box" style={{ margin: '16px 0 0 0' }}>
          {video.description}
        </div>
      )}
    </div>
  );

  const renderRelatedVideos = () => (
    <div className="related-videos-section" style={{ padding: isMobile ? '16px' : '0' }}>
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
  );

  const renderCommentsSection = () => (
    <div className="comments-container" style={{ padding: isMobile ? '16px' : '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 className="comments-header" style={{ margin: 0 }}>Comments ({commentsCount})</h3>
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
        {commentsLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading comments...</div>
        ) : comments.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No comments yet. Be the first to reply!</div>
        ) : (
          renderCommentList(comments)
        )}
      </div>
    </div>
  );

  return (
    <div className="watch-container" style={{ padding: isMobile ? '0' : '0 16px' }}>
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}
      
      {isMobile ? (
        /* Mobile Layout */
        <div className="watch-mobile-wrapper" style={{ width: '100%', padding: '0' }}>
          {/* 1. Video Player */}
          {renderPlayer()}

          {/* 2. Video Information */}
          {renderInfo()}

          {/* 3. Action Buttons */}
          {renderActions()}

          {/* 4. Video Ad Placement */}
          {renderAds && (
            <AdPlacement placement="watch_page_mobile" style={{ padding: '12px 16px' }} />
          )}

          {/* 5. Comments Section */}
          {showComments && renderCommentsSection()}

          {/* 6. Related Videos */}
          {renderRelatedVideos()}
        </div>
      ) : (
        /* Desktop Layout */
        <div className="watch-desktop-wrapper" style={{ display: 'flex', gap: '24px', width: '100%', padding: '0 0 24px 0' }}>
          {/* Main Left Column */}
          <div className="watch-main" style={{ flex: 1, minWidth: 0 }}>
            {/* 1. Video Player */}
            {renderPlayer()}

            {/* 2. Video Information & Action Buttons */}
            {renderInfoAndActions()}

            {/* 3. Video Ad Placement */}
            {renderAds && (
              <AdPlacement placement="watch_page_desktop" style={{ margin: '16px 0' }} />
            )}

            {/* 4. Comments Section */}
            {showComments && renderCommentsSection()}
          </div>

          {/* Right Sidebar Column */}
          <div className="watch-sidebar" style={{ width: '360px', flexShrink: 0 }}>
            {renderRelatedVideos()}
          </div>
        </div>
      )}
    </div>
  );
}
