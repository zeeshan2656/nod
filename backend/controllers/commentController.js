const db = require('../config/db');
const cache = require('../config/cache');

/**
 * Fetch all comments for a video and structure them into a nested reply tree in-memory
 */
exports.getComments = async (req, res) => {
  const videoId = req.query.video_id ? parseInt(req.query.video_id) : null;

  if (!videoId) {
    return res.status(400).json({ error: 'video_id must be provided.' });
  }

  const cacheKey = `comments_video_${videoId}`;

  try {
    const cachedComments = await cache.get(cacheKey);
    if (cachedComments) {
      return res.json(cachedComments);
    }

    const query = `
      SELECT c.*, COALESCE(u.username, 'Guest') as username 
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.video_id = ?
      ORDER BY c.created_at ASC
    `;
    const params = [videoId];

    const [rows] = await db.query(query, params);

    // 1-pass O(N) nested reply tree builder to avoid N+1 database queries
    const commentMap = {};
    const rootComments = [];

    rows.forEach(comment => {
      comment.replies = [];
      commentMap[comment.id] = comment;
    });

    rows.forEach(comment => {
      if (comment.parent_id) {
        const parent = commentMap[comment.parent_id];
        if (parent) {
          parent.replies.push(comment);
        } else {
          // If parent is missing, treat as root to avoid losing data
          rootComments.push(comment);
        }
      } else {
        rootComments.push(comment);
      }
    });

    await cache.set(cacheKey, rootComments, 60); // 60-second TTL cache (invalidated on mutation)

    res.json(rootComments);
  } catch (err) {
    console.error('Fetch comments error:', err);
    res.status(500).json({ error: 'Database error fetching comments.' });
  }
};

/**
 * Add a comment or reply
 */
exports.addComment = async (req, res) => {
  const { video_id, parent_id, content } = req.body;
  const userId = req.user ? req.user.id : null;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content cannot be empty.' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO comments (video_id, parent_id, user_id, ip_address, content) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        video_id ? parseInt(video_id) : null,
        parent_id ? parseInt(parent_id) : null,
        userId,
        ipAddress,
        content.trim()
      ]
    );

    // Clear caches
    if (video_id) {
      await cache.del(`comments_video_${video_id}`);
      // Clear watch page cache
      await cache.del(`video_${video_id}`);
    }

    // Return the created comment
    const [newCommentRows] = await db.query(
      `SELECT c.*, COALESCE(u.username, 'Guest') as username FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
      [result.insertId]
    );

    const newComment = newCommentRows[0];
    newComment.replies = [];

    res.status(201).json(newComment);
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Database error adding comment.' });
  }
};

/**
 * Delete a comment (Only owners or admins)
 */
exports.deleteComment = async (req, res) => {
  const id = parseInt(req.params.id);
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (isNaN(id)) return res.status(400).json({ error: 'Invalid comment ID.' });

  try {
    const [rows] = await db.query('SELECT * FROM comments WHERE id = ?', [id]);
    const comment = rows[0];

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (comment.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden. You do not own this comment.' });
    }

    await db.query('DELETE FROM comments WHERE id = ?', [id]);

    // Clear caches
    if (comment.video_id) {
      await cache.del(`comments_video_${comment.video_id}`);
      await cache.del(`video_${comment.video_id}`);
    }

    res.json({ message: 'Comment deleted successfully.' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Database error deleting comment.' });
  }
};

/**
 * Like a comment
 */
exports.likeComment = async (req, res) => {
  const commentId = parseInt(req.params.id);
  const userId = req.user.id;

  if (isNaN(commentId)) return res.status(400).json({ error: 'Invalid comment ID.' });

  try {
    const [likes] = await db.query(
      'SELECT id FROM likes WHERE user_id = ? AND item_type = "comment" AND item_id = ?',
      [userId, commentId]
    );

    let liked = false;

    if (likes.length > 0) {
      await db.query('DELETE FROM likes WHERE id = ?', [likes[0].id]);
      await db.query('UPDATE comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [commentId]);
    } else {
      await db.query(
        'INSERT INTO likes (user_id, item_type, item_id) VALUES (?, "comment", ?)',
        [userId, commentId]
      );
      await db.query('UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?', [commentId]);
      liked = true;
    }

    // Find the comment parent video to clear the comments cache
    const [comments] = await db.query('SELECT video_id FROM comments WHERE id = ?', [commentId]);
    if (comments.length > 0) {
      const c = comments[0];
      if (c.video_id) await cache.del(`comments_video_${c.video_id}`);
    }

    res.json({ liked });
  } catch (err) {
    console.error('Like comment error:', err);
    res.status(500).json({ error: 'Database error occurred.' });
  }
};
