CREATE DATABASE IF NOT EXISTS ultra_fast_video;
USE ultra_fast_video;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user', -- 'admin' or 'user'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Videos table
CREATE TABLE IF NOT EXISTS videos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration FLOAT NOT NULL DEFAULT 0.0,
    width INT NOT NULL DEFAULT 0,
    height INT NOT NULL DEFAULT 0,
    aspect_ratio VARCHAR(20) DEFAULT '16:9',
    file_size BIGINT NOT NULL DEFAULT 0,
    file_path VARCHAR(255) NOT NULL, -- Path to master.m3u8 or temp original
    thumbnail_position INT NOT NULL DEFAULT 1, -- 1 to 10
    views_count INT DEFAULT 0,
    likes_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'processing', -- 'processing', 'ready', 'failed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status_created (status, created_at DESC, id DESC),
    INDEX idx_views (views_count DESC, id DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Reels table
CREATE TABLE IF NOT EXISTS reels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) DEFAULT NULL,
    description TEXT,
    duration FLOAT NOT NULL DEFAULT 0.0,
    width INT NOT NULL DEFAULT 0,
    height INT NOT NULL DEFAULT 0,
    file_path VARCHAR(255) NOT NULL,
    views_count INT DEFAULT 0,
    likes_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'processing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status_created (status, created_at DESC, id DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Likes table
CREATE TABLE IF NOT EXISTS likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_type ENUM('video', 'reel', 'comment') NOT NULL,
    item_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_item (user_id, item_type, item_id),
    INDEX idx_item (item_type, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Comments table
CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    video_id INT NULL,
    reel_id INT NULL,
    user_id INT NOT NULL,
    parent_id INT NULL, -- For nested replies
    content TEXT NOT NULL,
    likes_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
    INDEX idx_video_comments (video_id, parent_id, created_at ASC),
    INDEX idx_reel_comments (reel_id, parent_id, created_at ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Ad Placements table
CREATE TABLE IF NOT EXISTS ads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    placement VARCHAR(50) NOT NULL UNIQUE, -- 'header', 'footer', 'sidebar', 'video_top', 'video_bottom', 'reel_feed', 'watch_page', 'landing_row_1', 'landing_row_2', 'landing_row_3', 'landing_row_4', 'landing_row_5'
    name VARCHAR(100) NOT NULL,
    code TEXT NOT NULL,
    is_active TINYINT DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_placement (placement, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Settings table (Analytics code, global settings)
CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(100) PRIMARY KEY,
    `value` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default ad placements
INSERT INTO ads (placement, name, code, is_active) VALUES
('header', 'Header Ad Placement', '<!-- Header Ad Placement Placeholder -->', 0),
('footer', 'Footer Ad Placement', '<!-- Footer Ad Placement Placeholder -->', 0),
('sidebar', 'Sidebar Ad Placement', '<!-- Sidebar Ad Placement Placeholder -->', 0),
('video_top', 'Video Top Ad Placement', '<!-- Video Top Ad Placement Placeholder -->', 0),
('video_bottom', 'Video Bottom Ad Placement', '<!-- Video Bottom Ad Placement Placeholder -->', 0),
('reel_feed', 'Reel Feed Ad Placement', '<!-- Reel Feed Ad Placement Placeholder -->', 0),
('watch_page', 'Watch Page Ad Placement', '<!-- Watch Page Ad Placement Placeholder -->', 0),
('landing_row_1', 'Landing Page Row 1 Ad', '<!-- Landing Page Row 1 Ad Placeholder -->', 0),
('landing_row_2', 'Landing Page Row 2 Ad', '<!-- Landing Page Row 2 Ad Placeholder -->', 0),
('landing_row_3', 'Landing Page Row 3 Ad', '<!-- Landing Page Row 3 Ad Placeholder -->', 0),
('landing_row_4', 'Landing Page Row 4 Ad', '<!-- Landing Page Row 4 Ad Placeholder -->', 0),
('landing_row_5', 'Landing Page Row 5 Ad', '<!-- Landing Page Row 5 Ad Placeholder -->', 0)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- Seed default settings
INSERT INTO settings (`key`, `value`) VALUES
('site_name', 'UltraFast Video & Reels'),
('analytics_code', '<!-- Global Analytics Code Placeholder (Google Analytics, Tag Manager, Facebook Pixel) -->')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- Seed default admin user (username: admin, password: admin123)
INSERT INTO users (username, password, role) VALUES
('admin', '$2a$10$JX94dBn5hwIW..0ZMW1fd.kl4Ih25As511f6TFZp5TOEVwo9qyMGG', 'admin')
ON DUPLICATE KEY UPDATE role = 'admin';
