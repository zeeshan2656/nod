import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { API_BASE_URL } from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import AdPlacement from '../components/AdPlacement';
import Toast from '../components/Toast';

export default function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [video, setVideo] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyText, setReplyText] = useState({}); // Keyed by comment ID
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // 1. Fetch Video details and Comments
  useEffect(() => {
    const fetchWatchData = async () => {
      setLoading(true);
      try {
        const videoRes = await api.get(`/videos/${id}`);
        setVideo(videoRes.data);

        // Check if user has liked this video
        if (user) {
          // Verify liked state (we can infer it if user's ID is in lists, or check endpoint, or toggle handles it)
          // To keep it simple, backend likeVideo endpoint toggles and returns { liked: true/false }.
          // Let's assume a check or let toggle handle it.
        }

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

  // 2. Setup HLS Video Player (Dynamic imports for high PageSpeed)
  useEffect(() => {
    if (!video || !videoRef.current) return;

    const videoElement = videoRef.current;
    
    // Determine path to load
    let videoUrl = '';
    if (video.status === 'ready') {
      videoUrl = `${API_BASE_URL}${video.file_path}`;
    } else {
      // If still processing, play the temporary raw MP4 uploaded path
      videoUrl = `${API_BASE_URL}/${video.file_path.replace(/\\/g, '/')}`;
    }

    // Reset current sources
    videoElement.src = '';
    
    if (video.status === 'ready') {
      // Browser supports native HLS (e.g. Safari / iOS)
      if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = videoUrl;
      } else {
        // Dynamically load HLS.js to optimize bundle size (Core Web Vital PageSpeed optimization)
        import('hls.js').then(({ default: Hls }) => {
          if (Hls.isSupported()) {
            if (hlsRef.current) {
              hlsRef.current.destroy();
            }
            const hlsInstance = new Hls({
              enableWorker: true,
              lowLatencyMode: true
            });
            hlsRef.current = hlsInstance;
            hlsInstance.loadSource(videoUrl);
            hlsInstance.attachMedia(videoElement);
          } else {
            // Fallback for browsers that don't support HLS
            videoElement.src = videoUrl;
          }
        });
      }
    } else {
      // Fallback for non-ready MP4 files directly
      videoElement.src = videoUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [video]);

  // Handle Video Like
  const handleLike = async () => {
    if (!user) {
      setToast({ message: 'Please sign in to like videos.', type: 'danger' });
      return;
    }

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

  // Copy Watch URL to Clipboard
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setToast({ message: 'Link copied to clipboard!', type: 'success' });
  };

  // Add root-level comment
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!user) {
      setToast({ message: 'Please sign in to comment.', type: 'danger' });
      return;
    }
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

  // Add reply to comment
  const handleAddReply = async (commentId) => {
    const text = replyText[commentId];
    if (!user) {
      setToast({ message: 'Please sign in to reply.', type: 'danger' });
      return;
    }
    if (!text || !text.trim()) return;

    try {
      const response = await api.post('/comments', {
        video_id: id,
        parent_id: commentId,
        content: text
      });

      // Insert reply into local comment tree state
      setComments(prev => {
        return prev.map(c => {
          if (c.id === commentId) {
            return { ...c, replies: [...c.replies, response.data] };
          }
          // Also look into replies for deeper nesting if supported
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

  // Delete comment
  const handleDeleteComment = async (commentId, parentId = null) => {
    try {
      await api.delete(`/comments/${commentId}`);
      
      // Update state local tree
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
          {user && (
            <span 
              className="comment-action-btn"
              onClick={() => setActiveReplyId(activeReplyId === comment.id ? null : comment.id)}
            >
              Reply
            </span>
          )}
          
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

        {/* Reply Input Box */}
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

        {/* Render child replies recursively */}
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

        {/* HLS / Native Video Player */}
        <div className="player-wrapper">
          <video
            ref={videoRef}
            className="player-element"
            controls
            autoPlay
            playsInline
          />
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

        {/* Video description */}
        {video.description && (
          <div className="video-description-box">
            {video.description}
          </div>
        )}

        {/* Video Bottom Ad Placement */}
        <AdPlacement placement="video_bottom" />

        {/* Comments Section */}
        <div className="comments-container">
          <h3 className="comments-header">Comments ({comments.length})</h3>

          <form onSubmit={handleAddComment} className="comment-input-box">
            <textarea
              className="comment-textarea"
              placeholder={user ? "Add a public comment..." : "Sign in to add a comment..."}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={!user}
              rows="2"
              required
            />
            <button 
              type="submit" 
              className={`btn btn-primary ${!user ? 'btn-disabled' : ''}`}
              style={{ alignSelf: 'flex-end', height: '40px' }}
              disabled={!user}
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
      </div>

      {/* Sidebar Ad Placement */}
      <div className="watch-sidebar">
        <AdPlacement placement="sidebar" />
        <AdPlacement placement="watch_page" />
      </div>
    </div>
  );
}
