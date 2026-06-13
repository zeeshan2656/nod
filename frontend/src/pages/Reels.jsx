import React, { useState, useEffect, useRef, useContext } from 'react';
import api, { API_BASE_URL } from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import AdPlacement from '../components/AdPlacement';
import Toast from '../components/Toast';
import Hls from 'hls.js';

// Individual Reel Component
function ReelItem({ reel, isActive, shouldPreload, isMuted, setIsMuted }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const viewLogged = useRef(false);
  
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(reel.likes_count);
  const { user } = useContext(AuthContext);
  const [toast, setToast] = useState('');
  
  // Comments State
  const [showCommentsOverlay, setShowCommentsOverlay] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  // Determine Video URL
  let videoUrl = '';
  if (reel.status === 'ready') {
    videoUrl = `${API_BASE_URL}${reel.file_path}`;
  } else {
    videoUrl = `${API_BASE_URL}/${reel.file_path.replace(/\\/g, '/')}`;
  }

  // Load comments on mount to show comments count
  useEffect(() => {
    const fetchComments = async () => {
      try {
        const res = await api.get(`/comments?reel_id=${reel.id}`);
        setComments(res.data);
      } catch (err) {
        console.error('Failed to load reel comments count:', err);
      }
    };
    fetchComments();
  }, [reel.id]);

  // Consolidate active state track
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Consolidated Media Binding & Playback Lifecycle (resolves reloading/freezing bug)
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const needsSource = isActive || shouldPreload;

    if (needsSource) {
      // Check if source is already bound
      const isHlsBound = reel.status === 'ready' && Hls.isSupported() && hlsRef.current;
      const isNativeBound = videoElement.src === videoUrl;

      if (!isHlsBound && !isNativeBound) {
        // Source not bound yet, let's bind it
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        if (reel.status === 'ready') {
          if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            videoElement.src = videoUrl;
          } else if (Hls.isSupported()) {
            const hlsInstance = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              maxMaxBufferLength: 10
            });
            hlsRef.current = hlsInstance;
            hlsInstance.loadSource(videoUrl);
            hlsInstance.attachMedia(videoElement);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
              if (isActiveRef.current) {
                videoElement.muted = isMuted; // Sync muted state programmatically
                if (videoElement.paused) {
                  videoElement.play().catch(err => console.warn('Autoplay blocked on manifest:', err.message));
                }
              }
            });
          } else {
            videoElement.src = videoUrl;
          }
        } else {
          videoElement.src = videoUrl;
        }
        videoElement.load();
      }

      // Handle Playback State based on isActive
      if (isActive) {
        videoElement.muted = isMuted; // Always sync muted state before playing!
        if (videoElement.paused) {
          videoElement.play().catch(err => console.warn('Autoplay blocked:', err.message));
        }
        if (!viewLogged.current) {
          viewLogged.current = true;
          api.post(`/reels/${reel.id}/view`).catch(err => {
            console.error('Failed to log reel view:', err);
          });
        }
      } else {
        if (!videoElement.paused) {
          videoElement.pause();
        }
        videoElement.currentTime = 0;
        viewLogged.current = false;
      }
    } else {
      // Unload completely when not active and not preloading
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      videoElement.removeAttribute('src');
      videoElement.load();
      viewLogged.current = false;
    }
  }, [isActive, shouldPreload, videoUrl, reel.status, reel.id, isMuted]);

  // Clean up HLS player on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  const handleToggleMute = (e) => {
    e.stopPropagation();
    if (videoRef.current) {
      const newMuted = !videoRef.current.muted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    try {
      const response = await api.post(`/reels/${reel.id}/like`);
      const { liked: isLiked } = response.data;
      setLiked(isLiked);
      setLikesCount(prev => isLiked ? prev + 1 : Math.max(prev - 1, 0));
    } catch (err) {
      setToast('Like action failed.');
    }
  };

  const handleShare = (e) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/watch/${reel.id}?type=reel`;
    navigator.clipboard.writeText(shareUrl);
    setToast('Link copied to clipboard!');
  };

  return (
    <div className="reel-card" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      
      <div className="reel-video-container" onClick={handleToggleMute} style={{ width: '100%', height: '100%', cursor: 'pointer' }}>
        <video
          ref={videoRef}
          className="reel-video"
          loop
          playsInline
          muted={isMuted}
          poster={`${API_BASE_URL}/api/reels/${reel.id}/thumbnail`}
          preload={isActive ? 'auto' : (shouldPreload ? 'metadata' : 'none')}
        />
      </div>

      <div className="reel-overlay" style={{ pointerEvents: 'none' }}>
        <div className="reel-info-left" style={{ pointerEvents: 'auto' }}>
          <div className="reel-title" style={{ fontSize: '15px', fontWeight: '700' }}>@{reel.title || 'anonymous'}</div>
          {reel.description && <div className="reel-desc" style={{ fontSize: '12px', color: '#ccc', marginTop: '4px' }}>{reel.description}</div>}
        </div>

        <div className="reel-actions-right" style={{ pointerEvents: 'auto' }}>
          {/* Like */}
          <div className="reel-action-circle" onClick={handleLike} style={{ color: liked ? 'var(--primary)' : '#fff' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="reel-action-label">{likesCount}</span>
          </div>

          {/* Comment Button (opens overlay) */}
          <div className="reel-action-circle" onClick={(e) => { e.stopPropagation(); setShowCommentsOverlay(true); }} style={{ color: '#fff' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            <span className="reel-action-label">{comments.length}</span>
          </div>

          {/* Share */}
          <div className="reel-action-circle" onClick={handleShare} style={{ color: '#fff' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span className="reel-action-label">Share</span>
          </div>

          {reel.status === 'processing' && (
            <span style={{ fontSize: '9px', backgroundColor: '#e65100', color: '#fff', padding: '2px 4px', borderRadius: '1px' }}>
              RAW
            </span>
          )}
        </div>
      </div>

      {/* Slide-Up Comments Overlay */}
      {showCommentsOverlay && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60%',
          backgroundColor: 'rgba(20, 20, 20, 0.98)',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          padding: '16px',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.8)',
          animation: 'slideUp 0.3s ease-out',
          color: '#fff',
          pointerEvents: 'auto'
        }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
            <span style={{ fontWeight: '700', fontSize: '15px' }}>Comments ({comments.length})</span>
            <button 
              type="button" 
              onClick={() => setShowCommentsOverlay(false)}
              style={{ color: '#fff', fontSize: '20px', cursor: 'pointer', padding: '0 4px', background: 'none', border: 'none' }}
            >
              ✕
            </button>
          </div>

          {/* List of comments */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
            {comments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No comments yet. Be the first to comment!
              </div>
            ) : (
              comments.map(c => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '12px', color: 'var(--text-muted)' }}>@{c.username || 'Guest'}</span>
                    <span style={{ fontSize: '10px', color: '#666' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#fff', wordBreak: 'break-word' }}>{c.content}</div>
                </div>
              ))
            )}
          </div>

          {/* Add comment input form */}
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newComment.trim()) return;
              try {
                const response = await api.post('/comments', {
                  reel_id: reel.id,
                  content: newComment
                });
                setComments(prev => [...prev, response.data]);
                setNewComment('');
              } catch (err) {
                setToast('Could not post comment.');
              }
            }}
            style={{ display: 'flex', gap: '8px' }}
          >
            <input
              type="text"
              className="form-input"
              style={{ flex: 1, padding: '8px 12px', fontSize: '13px', backgroundColor: '#222', border: '1px solid #444', borderRadius: '4px', color: '#fff' }}
              placeholder="Add an anonymous comment..."
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '12px', height: 'auto', alignSelf: 'stretch' }}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Main Feed Scroll snap Component
export default function Reels() {
  const [reels, setReels] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const containerRef = useRef(null);

  // Load initial reels
  useEffect(() => {
    fetchReels();
  }, []);

  const fetchReels = async (cursor = null) => {
    try {
      let url = '/reels?limit=5';
      if (cursor) {
        url += `&cursor_time=${encodeURIComponent(cursor.cursor_time)}&cursor_id=${cursor.cursor_id}`;
      }

      const response = await api.get(url);
      const { reels: newReels, nextCursor: newCursor, hasMore: more } = response.data;

      if (cursor) {
        setReels(prev => [...prev, ...newReels]);
      } else {
        setReels(newReels);
      }

      setNextCursor(newCursor);
      setHasMore(more);
    } catch (err) {
      console.error('Failed to load reels:', err);
    } finally {
      setLoading(false);
    }
  };

  // Setup scroll observer to detect which reel card is centered in viewport
  useEffect(() => {
    if (reels.length === 0 || !containerRef.current) return;

    const cards = containerRef.current.querySelectorAll('.reel-item-wrapper');
    
    const observerOptions = {
      root: containerRef.current,
      rootMargin: '0px',
      threshold: 0.6 // Card is selected when 60%+ visible
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const index = parseInt(entry.target.getAttribute('data-index'), 10);
          if (!isNaN(index)) {
            setActiveReelIndex(index);

            // Fetch more reels when user scrolls close to the end (e.g. at the 2nd to last reel)
            if (index >= reels.length - 2 && hasMore) {
              fetchReels(nextCursor);
            }
          }
        }
      });
    }, observerOptions);

    cards.forEach(card => observer.observe(card));

    return () => {
      cards.forEach(card => observer.unobserve(card));
      observer.disconnect();
    };
  }, [reels, hasMore, nextCursor]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading Reels feed...</div>;
  }

  if (reels.length === 0) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>No reels available yet.</div>;
  }

  // Interleave Ads and Reels
  // We want to insert a Reel Feed Ad card into the list at set intervals (e.g. every 3rd card)
  const items = [];
  let reelCounter = 0;

  reels.forEach((reel, index) => {
    items.push({
      type: 'reel',
      data: reel,
      index: items.length
    });
    reelCounter++;

    if (reelCounter > 0 && reelCounter % 3 === 0) {
      items.push({
        type: 'ad',
        index: items.length
      });
    }
  });

  return (
    <div ref={containerRef} className="reels-feed-container">
      {items.map((item) => {
        const isActive = activeReelIndex === item.index;
        
        // Smart Prefetch: Preload if the current active item is index X, and this item is X+1 or X+2
        const shouldPreload = item.index === activeReelIndex + 1 || item.index === activeReelIndex + 2;
        const isRendered = item.index >= activeReelIndex - 1 && item.index <= activeReelIndex + 2;

        if (item.type === 'ad') {
          return (
            <div 
              key={`ad-${item.index}`}
              className="reel-item-wrapper reel-ad-card" 
              data-index={item.index}
              style={{ display: 'flex', flexDirection: 'column', padding: '20px', justifyContent: 'center' }}
            >
              <h3 style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>
                SPONSORED ADVERTISEMENT
              </h3>
              <AdPlacement placement="reel_feed" />
            </div>
          );
        }

        return (
          <div key={`reel-${item.data.id}`} data-index={item.index} className="reel-item-wrapper">
            {isRendered ? (
              <ReelItem
                reel={item.data}
                isActive={isActive}
                shouldPreload={shouldPreload}
                isMuted={isMuted}
                setIsMuted={setIsMuted}
              />
            ) : (
              <div style={{ height: '100%', width: '100%', backgroundColor: '#000' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
