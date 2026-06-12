import React, { useState, useEffect, useRef, useContext } from 'react';
import api, { API_BASE_URL } from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import AdPlacement from '../components/AdPlacement';
import Toast from '../components/Toast';

// Individual Reel Component
function ReelItem({ reel, isActive, shouldPreload }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const viewLogged = useRef(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(reel.likes_count);
  const { user } = useContext(AuthContext);
  const [toast, setToast] = useState('');

  // Determine Video URL
  let videoUrl = '';
  if (reel.status === 'ready') {
    videoUrl = `${API_BASE_URL}${reel.file_path}`;
  } else {
    videoUrl = `${API_BASE_URL}/${reel.file_path.replace(/\\/g, '/')}`;
  }

  // Manage HLS player setup & playback states
  useEffect(() => {
    if (!videoRef.current) return;
    const videoElement = videoRef.current;

    // Autoplay active reel and trigger view stats
    if (isActive) {
      if (videoElement.paused) {
        videoElement.play().catch(err => {
          // Auto-play might be blocked by browser media policies until user interaction
          console.warn('Autoplay blocked:', err.message);
        });
      }
      
      // Log view once per activation
      if (!viewLogged.current) {
        viewLogged.current = true;
        api.post(`/reels/${reel.id}/view`).catch(err => {
          console.error('Failed to log reel view:', err);
        });
      }
    } else {
      // Pause inactive reels
      if (!videoElement.paused) {
        videoElement.pause();
      }
      // Reset position
      videoElement.currentTime = 0;
      viewLogged.current = false;
    }
  }, [isActive, reel.id]);

  // Load stream source (HLS vs native Mp4)
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Only set up HLS player if the reel is active OR marked for preloading
    if (isActive || shouldPreload) {
      if (reel.status === 'ready') {
        if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
          videoElement.src = videoUrl;
        } else {
          // Dynamic import of HLS.js for page load optimization
          import('hls.js').then(({ default: Hls }) => {
            if (Hls.isSupported()) {
              if (hlsRef.current) {
                hlsRef.current.destroy();
              }
              const hlsInstance = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                maxMaxBufferLength: 10 // Smaller buffer for reels
              });
              hlsRef.current = hlsInstance;
              hlsInstance.loadSource(videoUrl);
              hlsInstance.attachMedia(videoElement);
            } else {
              videoElement.src = videoUrl;
            }
          });
        }
      } else {
        videoElement.src = videoUrl;
      }
    } else {
      // Unload video source to save memory and network bandwidth
      videoElement.src = '';
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isActive, shouldPreload, videoUrl, reel.status]);

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!user) {
      setToast('Sign in to like reels.');
      return;
    }

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
    <div className="reel-card">
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      
      <div className="reel-video-container">
        <video
          ref={videoRef}
          className="reel-video"
          loop
          playsInline
          muted={false} // Autoplay policy may require user engagement, clicking un-mutes
          preload={shouldPreload || isActive ? 'auto' : 'none'}
        />
      </div>

      <div className="reel-overlay">
        <div className="reel-info-left">
          <div className="reel-title">@{reel.title || 'anonymous'}</div>
          {reel.description && <div className="reel-desc">{reel.description}</div>}
        </div>

        <div className="reel-actions-right">
          <div className="reel-action-circle" onClick={handleLike} style={{ color: liked ? 'var(--primary)' : '#fff' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="reel-action-label">{likesCount}</span>
          </div>

          <div className="reel-action-circle" onClick={handleShare}>
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

    const cards = containerRef.current.querySelectorAll('.reel-card, .reel-ad-card');
    
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

        if (item.type === 'ad') {
          return (
            <div 
              key={`ad-${item.index}`}
              className="reel-card reel-ad-card" 
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
          <div key={`reel-${item.data.id}`} data-index={item.index} className="reel-item-wrapper" style={{ height: '100%' }}>
            <ReelItem
              reel={item.data}
              isActive={isActive}
              shouldPreload={shouldPreload}
            />
          </div>
        );
      })}
    </div>
  );
}
