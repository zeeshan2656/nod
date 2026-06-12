import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api, { API_BASE_URL } from '../utils/api';
import AdPlacement from '../components/AdPlacement';

export default function Home() {
  const [videos, setVideos] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load initial videos
  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async (cursor = null) => {
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      let url = '/videos?limit=12';
      if (cursor) {
        url += `&cursor_time=${encodeURIComponent(cursor.cursor_time)}&cursor_id=${cursor.cursor_id}`;
      }

      const response = await api.get(url);
      const { videos: newVideos, nextCursor: newCursor, hasMore: more } = response.data;

      if (cursor) {
        setVideos((prev) => [...prev, ...newVideos]);
      } else {
        setVideos(newVideos);
      }

      setNextCursor(newCursor);
      setHasMore(more);
    } catch (err) {
      console.error('Error fetching videos:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const formatDuration = (secs) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ padding: '0 0 20px 0' }}>
      {/* Header Ad Slot */}
      <div style={{ padding: '0 16px' }}>
        <AdPlacement placement="header" />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Loading videos...
        </div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--text-muted)', fontSize: '15px' }}>
          No videos available. Check back later!
        </div>
      ) : (
        <div>
          <div className="video-grid">
            {videos.map((video, index) => {
              const card = (
                <Link key={video.id} to={`/watch/${video.id}`} className="video-card">
                  <div className="video-thumbnail-container">
                    <img
                      className="video-thumbnail"
                      src={`${API_BASE_URL}/api/videos/${video.id}/thumbnail`}
                      alt={video.title}
                      loading="lazy" // Native browser lazy loading (essential for PageSpeed score)
                      width="640"
                      height="360"
                    />
                    <span className="video-duration">{formatDuration(video.duration)}</span>
                  </div>
                  <div className="video-info">
                    <span className="video-title">{video.title}</span>
                    <div className="video-meta">
                      <span>{video.views_count} views</span>
                      <span style={{ margin: '0 6px' }}>•</span>
                      <span>{formatDate(video.created_at)}</span>
                    </div>
                  </div>
                </Link>
              );

              // Inject an ad between card indexes (e.g. after every 6th card)
              if (index > 0 && index % 6 === 0) {
                return (
                  <React.Fragment key={`group-${video.id}`}>
                    <div style={{ gridColumn: '1 / -1', padding: '0 16px' }}>
                      <AdPlacement placement="between_cards" />
                    </div>
                    {card}
                  </React.Fragment>
                );
              }

              return card;
            })}
          </div>

          {hasMore && (
            <div className="load-more-container">
              <button
                className="btn btn-secondary"
                onClick={() => fetchVideos(nextCursor)}
                disabled={loadingMore}
                style={{ minWidth: '150px' }}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer Ad Slot */}
      <div style={{ padding: '0 16px' }}>
        <AdPlacement placement="footer" />
      </div>
    </div>
  );
}
