import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { API_BASE_URL } from '../utils/api';
import AdPlacement from '../components/AdPlacement';

export default function Home() {
  const [videos, setVideos] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeAds, setActiveAds] = useState({});
  const [searchParams] = useSearchParams();

  const page = parseInt(searchParams.get('page')) || 1;
  const searchQuery = searchParams.get('search') || '';
  const limit = 20;

  // Load active ads once on mount
  useEffect(() => {
    const fetchActiveAds = async () => {
      try {
        const response = await api.get('/ads');
        setActiveAds(response.data || {});
      } catch (err) {
        console.error('Error fetching active ads:', err);
      }
    };
    fetchActiveAds();
  }, []);

  // Load videos when page or searchQuery changes
  useEffect(() => {
    fetchVideos(page, searchQuery);
  }, [page, searchQuery]);

  const fetchVideos = async (pageNumber, queryStr) => {
    setLoading(true);
    try {
      let url = `/videos?page=${pageNumber}&limit=${limit}`;
      if (queryStr) {
        url += `&search=${encodeURIComponent(queryStr)}`;
      }

      const response = await api.get(url);
      const { videos: newVideos, totalCount: newTotal } = response.data;

      setVideos(newVideos);
      setTotalCount(newTotal || 0);
    } catch (err) {
      console.error('Error fetching videos:', err);
    } finally {
      setLoading(false);
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

  // Group videos and inject ad card after every 4th video card
  const gridItems = [];
  let videoCount = 0;
  for (let i = 0; i < videos.length; i++) {
    gridItems.push({ type: 'video', data: videos[i] });
    videoCount++;
    if (videoCount > 0 && videoCount % 4 === 0) {
      const adIndex = videoCount / 4; // 1, 2, 3, 4, 5
      const placement = `landing_row_${adIndex}`;
      // Only inject the ad card if the ad is active and has code
      if (activeAds && activeAds[placement]) {
        gridItems.push({ type: 'ad', placement, key: `ad-${adIndex}-${page}` });
      }
    }
  }

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }

    const getPageUrl = (p) => {
      const params = new URLSearchParams();
      if (p > 1) params.set('page', p);
      if (searchQuery) params.set('search', searchQuery);
      const qs = params.toString();
      return qs ? `/?${qs}` : '/';
    };

    return (
      <div className="pagination-container">
        {page > 1 ? (
          <Link to={getPageUrl(page - 1)} className="pagination-btn">
            &lt;
          </Link>
        ) : (
          <span className="pagination-btn disabled">&lt;</span>
        )}

        {pages.map((p) => (
          <Link
            key={p}
            to={getPageUrl(p)}
            className={`pagination-btn ${p === page ? 'active' : ''}`}
          >
            {p}
          </Link>
        ))}

        {page < totalPages ? (
          <Link to={getPageUrl(page + 1)} className="pagination-btn">
            &gt;
          </Link>
        ) : (
          <span className="pagination-btn disabled">&gt;</span>
        )}
      </div>
    );
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
          {searchQuery ? `No matches found for "${searchQuery}".` : 'No videos available. Check back later!'}
        </div>
      ) : (
        <div>
          <div className="video-grid">
            {gridItems.map((item, idx) => {
              if (item.type === 'ad') {
                return (
                  <div key={item.key} className="video-card ad-card">
                    <AdPlacement placement={item.placement} type="card" code={activeAds[item.placement]} />
                  </div>
                );
              }

              const video = item.data;
              return (
                <Link key={video.id} to={`/watch/${video.id}`} className="video-card">
                  <div className="video-thumbnail-container">
                    <img
                      className="video-thumbnail"
                      src={`${API_BASE_URL}/api/videos/${video.id}/thumbnail`}
                      alt={video.title}
                      loading="lazy"
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
            })}
          </div>

          {renderPagination()}
        </div>
      )}
    </div>
  );
}
