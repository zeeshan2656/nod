import React, { useContext } from 'react';
import { UploadQueueContext } from '../context/UploadQueueContext';

// Helper to format duration
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Helper to format file size
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Status mapper for user-friendly UI display
function getStatusLabel(status, progress, speed) {
  switch (status) {
    case 'queued':
      return 'Waiting in Queue';
    case 'uploading':
      return `Uploading... ${progress}% ${speed ? `(${speed})` : ''}`;
    case 'processing':
      return 'Processing Video...';
    case 'generating_thumbnail':
      return 'Generating Thumbnail...';
    case 'saving_metadata':
      return 'Saving Metadata...';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

// Status color mapper
function getStatusColor(status) {
  switch (status) {
    case 'completed':
      return '#10b981'; // Green
    case 'failed':
    case 'cancelled':
      return '#ef4444'; // Red
    case 'uploading':
      return '#3b82f6'; // Blue
    case 'processing':
    case 'generating_thumbnail':
    case 'saving_metadata':
      return '#f59e0b'; // Amber
    default:
      return '#888888';
  }
}

export default function UploadQueuePanel() {
  const {
    queue,
    isQueueVisible,
    setIsQueueVisible,
    isMinimized,
    setIsMinimized,
    setActiveDetailsItem,
    removeFromQueue,
    clearCompleted
  } = useContext(UploadQueueContext);

  if (!isQueueVisible || queue.length === 0) return null;

  // Split queue into active items and completed items
  const activeItems = queue.filter(item => 
    ['queued', 'uploading', 'processing', 'generating_thumbnail', 'saving_metadata'].includes(item.status)
  );
  
  const completedItems = queue.filter(item => 
    ['completed', 'failed', 'cancelled'].includes(item.status)
  );

  // Compute overall progress for minimized bar
  const totalActiveSize = activeItems.reduce((acc, item) => acc + item.fileSize, 0);
  const totalActiveUploaded = activeItems.reduce((acc, item) => acc + item.uploadedBytes, 0);
  const overallProgress = totalActiveSize > 0 
    ? Math.round((totalActiveUploaded / totalActiveSize) * 100) 
    : 0;

  const handleToggleMinimize = (e) => {
    e.stopPropagation();
    setIsMinimized(!isMinimized);
  };

  const handleClosePanel = (e) => {
    e.stopPropagation();
    // Allow closing if no active items or after warning
    if (activeItems.length > 0) {
      if (!window.confirm('You have uploads in progress. Closing this panel will hide progress updates, but uploads will continue. Proceed?')) {
        return;
      }
    }
    setIsQueueVisible(false);
  };

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: isMinimized ? '320px' : '380px',
        maxHeight: isMinimized ? 'auto' : '450px',
        backgroundColor: 'rgba(15, 15, 15, 0.95)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        zIndex: 99999,
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)'
      }}
    >
      {/* Header Row */}
      <div 
        onClick={handleToggleMinimize}
        style={{
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: activeItems.length > 0 ? '#3b82f6' : '#10b981',
            animation: activeItems.length > 0 ? 'pulse 1.5s infinite' : 'none'
          }} />
          <span style={{ fontWeight: '600', fontSize: '13.5px' }}>
            {activeItems.length > 0 
              ? `Uploading ${activeItems.length} video(s)...` 
              : 'Uploads Completed'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            type="button" 
            onClick={handleToggleMinimize}
            style={{
              background: 'none',
              border: 'none',
              color: '#aaaaaa',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '2px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {isMinimized ? '▲' : '▼'}
          </button>
          <button 
            type="button" 
            onClick={handleClosePanel}
            style={{
              background: 'none',
              border: 'none',
              color: '#aaaaaa',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '2px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Minimized Progress Pill */}
      {isMinimized && activeItems.length > 0 && (
        <div style={{ width: '100%', height: '3px', backgroundColor: '#222' }}>
          <div style={{ 
            width: `${overallProgress}%`, 
            height: '100%', 
            background: 'linear-gradient(90deg, #3b82f6, #10b981)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      )}

      {/* Main Queue List Container */}
      {!isMinimized && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div 
            style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: '340px',
              padding: '12px'
            }}
            className="custom-scrollbar"
          >
            {/* Active Items Section */}
            {activeItems.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Active Uploads ({activeItems.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                  {activeItems.map((item) => (
                    <QueueItemRow key={item.uploadId} item={item} onEdit={() => setActiveDetailsItem(item)} onRemove={() => removeFromQueue(item.uploadId)} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed/Failed Section */}
            {completedItems.length > 0 && (
              <div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  fontSize: '11px', 
                  fontWeight: '700', 
                  color: '#888', 
                  textTransform: 'uppercase', 
                  marginBottom: '8px', 
                  letterSpacing: '0.5px' 
                }}>
                  <span>Completed Uploads ({completedItems.length})</span>
                  <button 
                    onClick={clearCompleted}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#3b82f6',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: '600',
                      textTransform: 'none',
                      padding: 0
                    }}
                  >
                    Clear All
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {completedItems.map((item) => (
                    <QueueItemRow key={item.uploadId} item={item} onRemove={() => removeFromQueue(item.uploadId)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keyframe Animation for Pulse */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.3; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}

// Renders an individual video item row
function QueueItemRow({ item, onEdit, onRemove }) {
  const isCompleting = ['completed', 'failed', 'cancelled'].includes(item.status);
  const showProgressBar = ['uploading', 'processing', 'generating_thumbnail', 'saving_metadata'].includes(item.status);

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '6px',
        padding: '10px',
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', gap: '10px' }}>
        {/* Local Preview Thumbnail */}
        <div style={{ position: 'relative', width: '70px', height: '40px', backgroundColor: '#111', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
          {item.thumbnailUrl ? (
            <img 
              src={item.thumbnailUrl} 
              alt={item.title} 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
              🎬
            </div>
          )}
          <div style={{
            position: 'absolute',
            bottom: '2px',
            right: '2px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            fontSize: '9px',
            padding: '1px 3px',
            borderRadius: '2px',
            color: '#fff'
          }}>
            {formatDuration(item.duration)}
          </div>
        </div>

        {/* Text Info */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span 
            title={item.title}
            style={{ 
              fontWeight: '600', 
              fontSize: '12.5px', 
              color: '#fff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: '2px'
            }}
          >
            {item.title}
          </span>
          <span style={{ fontSize: '11px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px' }}>
            {item.fileName} ({formatBytes(item.fileSize)})
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <span style={{ fontSize: '11px', color: getStatusColor(item.status), fontWeight: '500' }}>
              {getStatusLabel(item.status, item.progress, item.speed)}
            </span>
            {item.uploadType === 'reel' && (
              <span style={{ fontSize: '9px', backgroundColor: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.4)', color: '#d8b4fe', padding: '0px 4px', borderRadius: '3px' }}>
                Reel
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '4px', alignSelf: 'flex-start' }}>
          {onEdit && !isCompleting && (
            <button 
              type="button" 
              onClick={onEdit} 
              title="Edit Details"
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '4px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(59, 130, 246, 0.08)'
              }}
            >
              ✏️
            </button>
          )}
          <button 
            type="button" 
            onClick={onRemove} 
            title={isCompleting ? 'Clear' : 'Cancel & Remove'}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)'
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {showProgressBar && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '2.5px', overflow: 'hidden' }}>
            <div 
              style={{ 
                width: `${item.progress}%`, 
                height: '100%', 
                background: item.status === 'uploading' 
                  ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' 
                  : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                transition: 'width 0.2s ease'
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
