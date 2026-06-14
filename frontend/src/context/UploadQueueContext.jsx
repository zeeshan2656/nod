import React, { createContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import api, { API_BASE_URL } from '../utils/api';
import { dbHelper } from '../utils/db';

export const UploadQueueContext = createContext();

// Helper to extract duration, dimensions, and thumbnail client-side
export function extractVideoMetadataAndThumbnail(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      const duration = video.duration || 0;
      // Seek to 1 second or 10% of duration to get a valid frame
      video.currentTime = Math.min(1.0, duration * 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        // Keep thumbnail aspect ratio but scale down size for storage
        const maxDim = 320;
        let w = video.videoWidth || 640;
        let h = video.videoHeight || 360;
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }

        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
        
        URL.revokeObjectURL(objectUrl);
        resolve({
          duration: video.duration || 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          thumbnailUrl
        });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        resolve({
          duration: video.duration || 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          thumbnailUrl: ''
        });
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        duration: 0,
        width: 0,
        height: 0,
        thumbnailUrl: ''
      });
    };
  });
}

// Format speed helper
function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond === 0) return '0 KB/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks

export function UploadQueueProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const [activeUpload, setActiveUpload] = useState(null);
  
  // UI Panels State
  const [isQueueVisible, setIsQueueVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeDetailsItem, setActiveDetailsItem] = useState(null);

  const cancelTokensRef = useRef({});
  const isUploadingRef = useRef(false);

  // 1. Initial Load: Restore queue from IndexedDB
  useEffect(() => {
    async function restoreQueue() {
      try {
        const storedItems = await dbHelper.getAllUploadItems();
        if (storedItems && storedItems.length > 0) {
          // Sync each item's current progress with the server
          const syncedItems = await Promise.all(
            storedItems.map(async (item) => {
              if (item.status === 'uploading' || item.status === 'queued' || item.status === 'processing') {
                try {
                  const res = await api.get(`/videos/upload/status/${item.uploadId}`);
                  const serverStatus = res.data.status;
                  const serverUploadedBytes = res.data.uploadedBytes || 0;

                  // Update fields
                  item.status = serverStatus;
                  item.uploadedBytes = serverUploadedBytes;
                  item.progress = Math.round((serverUploadedBytes / item.fileSize) * 100);

                  // Update IndexedDB to keep state in sync
                  await dbHelper.saveUploadItem(item);
                } catch (err) {
                  // If server says 404, reset status to queued to restart
                  if (err.response?.status === 404) {
                    item.status = 'queued';
                    item.uploadedBytes = 0;
                    item.progress = 0;
                    await dbHelper.saveUploadItem(item);
                  } else {
                    // Network issue, mark as queued so it will try to reconnect
                    item.status = 'queued';
                  }
                }
              }
              return item;
            })
          );

          setQueue(syncedItems);
          
          // Show the upload panel if there are active uploads
          const hasActive = syncedItems.some(i => 
            ['queued', 'uploading', 'processing', 'generating_thumbnail', 'saving_metadata'].includes(i.status)
          );
          if (hasActive) {
            setIsQueueVisible(true);
          }
        }
      } catch (err) {
        console.error('Failed to restore upload queue:', err);
      }
    }
    restoreQueue();
  }, []);

  // 2. Queue Loop: Triggers whenever queue updates or activeUpload shifts
  useEffect(() => {
    if (isUploadingRef.current) return;

    const nextItem = queue.find((item) => item.status === 'queued');
    if (nextItem) {
      isUploadingRef.current = true;
      setActiveUpload(nextItem);
      processUpload(nextItem);
    } else {
      setActiveUpload(null);
    }
  }, [queue, activeUpload]);

  // Main processing logic for sequential chunks upload
  async function processUpload(item) {
    const cancelTokenSource = axios.CancelToken.source();
    cancelTokensRef.current[item.uploadId] = cancelTokenSource;

    try {
      // 1. Mark status as uploading
      item.status = 'uploading';
      await updateItemState(item);

      // 2. Initiate session on server (or check status)
      let uploadedBytes = 0;
      try {
        const statusRes = await api.get(`/videos/upload/status/${item.uploadId}`);
        uploadedBytes = statusRes.data.uploadedBytes || 0;
      } catch (err) {
        if (err.response?.status === 404) {
          // Not initiated yet, let's initiate
          await api.post('/videos/upload/initiate', {
            uploadId: item.uploadId,
            title: item.title,
            description: item.description,
            fileName: item.fileName,
            fileSize: item.fileSize,
            duration: item.duration,
            width: item.width,
            height: item.height,
            uploadType: item.uploadType
          });
        } else {
          throw err; // connection error
        }
      }

      // Slice settings
      const file = item.file;
      const fileSize = item.fileSize;
      const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
      let currentChunkIndex = Math.floor(uploadedBytes / CHUNK_SIZE);
      
      // Sync local variable with server offset
      item.uploadedBytes = uploadedBytes;
      item.progress = Math.round((uploadedBytes / fileSize) * 100);
      await updateItemState(item);

      // 3. Sequential upload chunk loop
      while (currentChunkIndex < totalChunks) {
        // Break if cancelled/failed externally
        const refreshedItem = await dbHelper.getUploadItem(item.uploadId);
        if (!refreshedItem || refreshedItem.status === 'cancelled' || refreshedItem.status === 'failed') {
          return;
        }

        const chunkStart = currentChunkIndex * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, fileSize);
        const chunkBlob = file.slice(chunkStart, chunkEnd);

        // Upload chunk with retries
        let success = false;
        let retries = 0;
        const maxRetries = 5;

        while (!success && retries < maxRetries) {
          const startTime = Date.now();
          const formData = new FormData();
          formData.append('uploadId', item.uploadId);
          formData.append('chunkIndex', currentChunkIndex);
          formData.append('totalChunks', totalChunks);
          formData.append('offset', chunkStart);
          formData.append('chunk', chunkBlob, item.fileName);

          try {
            const res = await api.post('/videos/upload/chunk', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
              cancelToken: cancelTokenSource.token
            });

            // Update local state and IndexedDB with server confirmed bytes
            const serverBytes = res.data.uploadedBytes;
            item.uploadedBytes = serverBytes;
            item.progress = Math.round((serverBytes / fileSize) * 100);
            
            // Calculate speed
            const elapsed = (Date.now() - startTime) / 1000;
            const speedBps = elapsed > 0 ? chunkBlob.size / elapsed : 0;
            item.speed = formatSpeed(speedBps);
            
            await updateItemState(item);

            success = true;
            currentChunkIndex++;
          } catch (uploadErr) {
            if (axios.isCancel(uploadErr)) {
              console.log('Chunk upload cancelled:', item.uploadId);
              return;
            }

            retries++;
            console.warn(`Chunk ${currentChunkIndex} upload failed. Retry ${retries}/${maxRetries}. Error:`, uploadErr.message);

            if (retries >= maxRetries) {
              throw new Error(`Connection lost. Chunk upload failed repeatedly after ${maxRetries} retries.`);
            }

            // Exponential backoff wait
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
          }
        }
      }

      // 4. Polling transcode status from server
      item.status = 'processing';
      item.speed = '';
      await updateItemState(item);

      await pollProcessingStatus(item);

    } catch (err) {
      console.error(`Upload error for ${item.title}:`, err);
      item.status = 'failed';
      item.speed = '';
      item.errorMsg = err.message || 'Upload failed.';
      await updateItemState(item);
    } finally {
      delete cancelTokensRef.current[item.uploadId];
      isUploadingRef.current = false;
      // Loop re-enters via activeUpload hook
      setActiveUpload(null);
    }
  }

  // Poll server for transcoding/thumbnail generation status
  function pollProcessingStatus(item) {
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const res = await api.get(`/videos/upload/status/${item.uploadId}`);
          const serverStatus = res.data.status;
          
          if (serverStatus !== item.status) {
            item.status = serverStatus;
            await updateItemState(item);
          }

          if (['completed', 'failed', 'cancelled'].includes(serverStatus)) {
            clearInterval(interval);
            resolve();
          }
        } catch (err) {
          console.warn('Error polling upload status:', err.message);
          // If server fails, we continue polling, don't crash the loop
        }
      }, 2000);
    });
  }

  // Helper to sync state changes to context and IndexedDB
  async function updateItemState(updatedItem) {
    // 1. Update IndexedDB
    await dbHelper.saveUploadItem(updatedItem);
    // 2. Update Context state
    setQueue((prevQueue) =>
      prevQueue.map((item) => (item.uploadId === updatedItem.uploadId ? { ...updatedItem } : item))
    );
  }

  // Add files bulk selection API
  async function addToQueue(files, uploadType) {
    setIsQueueVisible(true);
    setIsMinimized(false);

    const newItems = await Promise.all(
      Array.from(files).map(async (file) => {
        const uploadId = `upload-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const title = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        
        // Extract dimensions and thumbnail asynchronously
        const meta = await extractVideoMetadataAndThumbnail(file);

        const item = {
          uploadId,
          file, // Actual file blob stored in IndexedDB!
          fileName: file.name,
          fileSize: file.size,
          title,
          description: '',
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          thumbnailUrl: meta.thumbnailUrl,
          uploadType, // 'video' or 'reel'
          status: 'queued',
          progress: 0,
          uploadedBytes: 0,
          speed: '',
          createdAt: new Date().toISOString()
        };

        // Save to IndexedDB
        await dbHelper.saveUploadItem(item);
        return item;
      })
    );

    setQueue((prev) => [...prev, ...newItems]);
  }

  // Modify metadata API
  async function updateMetadata(uploadId, title, description) {
    try {
      // 1. Update server
      await api.put('/videos/upload/metadata', { uploadId, title, description });
      
      // 2. Update local state
      setQueue((prevQueue) =>
        prevQueue.map((item) => {
          if (item.uploadId === uploadId) {
            const updated = { ...item, title, description };
            dbHelper.saveUploadItem(updated); // Sync IDB
            return updated;
          }
          return item;
        })
      );
    } catch (err) {
      console.error('Failed to sync upload metadata to server:', err);
      // Even if network fails, save locally
      setQueue((prevQueue) =>
        prevQueue.map((item) => {
          if (item.uploadId === uploadId) {
            const updated = { ...item, title, description };
            dbHelper.saveUploadItem(updated);
            return updated;
          }
          return item;
        })
      );
    }
  }

  // Cancel / Remove API
  async function removeFromQueue(uploadId) {
    // 1. Abort connection if currently uploading
    if (cancelTokensRef.current[uploadId]) {
      cancelTokensRef.current[uploadId].cancel('User cancelled the upload.');
    }

    try {
      // 2. Call cancel on backend
      await api.post(`/videos/upload/cancel/${uploadId}`);
    } catch (err) {
      console.warn('Failed to call cancel route on backend:', err.message);
    }

    // 3. Delete from IndexedDB
    await dbHelper.deleteUploadItem(uploadId);

    // 4. Remove from queue list
    setQueue((prev) => prev.filter((item) => item.uploadId !== uploadId));

    if (activeDetailsItem?.uploadId === uploadId) {
      setActiveDetailsItem(null);
    }
  }

  // Clear completed uploads from panel
  async function clearCompleted() {
    const completedItems = queue.filter((item) => ['completed', 'failed', 'cancelled'].includes(item.status));
    
    for (const item of completedItems) {
      await dbHelper.deleteUploadItem(item.uploadId);
    }

    setQueue((prev) => prev.filter((item) => !['completed', 'failed', 'cancelled'].includes(item.status)));
  }

  return (
    <UploadQueueContext.Provider
      value={{
        queue,
        activeUpload,
        isQueueVisible,
        setIsQueueVisible,
        isMinimized,
        setIsMinimized,
        activeDetailsItem,
        setActiveDetailsItem,
        addToQueue,
        updateMetadata,
        removeFromQueue,
        clearCompleted
      }}
    >
      {children}
    </UploadQueueContext.Provider>
  );
}
