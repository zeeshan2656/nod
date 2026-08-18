-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: ultra_fast_video
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `ads`
--

DROP TABLE IF EXISTS `ads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ads` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `placement` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `code` text NOT NULL,
  `is_active` tinyint(4) DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `placement` (`placement`),
  KEY `idx_placement` (`placement`,`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=152 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ads`
--

LOCK TABLES `ads` WRITE;
/*!40000 ALTER TABLE `ads` DISABLE KEYS */;
INSERT INTO `ads` VALUES (9,'landing_row_1','Landing Page Row 1 Ad','<!-- Landing Page Row 1 Ad Placeholder -->',0,'2026-06-14 00:08:16'),(10,'landing_row_2','Landing Page Row 2 Ad','<!-- Landing Page Row 2 Ad Placeholder -->',0,'2026-06-14 00:08:16'),(11,'landing_row_3','Landing Page Row 3 Ad','<!-- Landing Page Row 3 Ad Placeholder -->',0,'2026-06-14 00:08:16'),(12,'landing_row_4','Landing Page Row 4 Ad','<!-- Landing Page Row 4 Ad Placeholder -->',0,'2026-06-14 00:08:16'),(13,'landing_row_5','Landing Page Row 5 Ad','<!-- Landing Page Row 5 Ad Placeholder -->',0,'2026-06-14 00:08:16'),(14,'watch_page_desktop','Watch Page Desktop Ad','<div style=\"padding: 15px; background: #ffd700; color: #000; font-weight: bold; text-align: center; border: 2px dashed #000; width: 100%; box-sizing: border-box;\">★★★ TEST BANNER AD ACTIVE ★★★</div>',1,'2026-06-14 01:01:24'),(15,'watch_page_mobile','Watch Page Mobile Ad','<div style=\"padding: 15px; background: #ffd700; color: #000; font-weight: bold; text-align: center; border: 2px dashed #000; width: 100%; box-sizing: border-box;\">★★★ TEST BANNER AD ACTIVE ★★★</div>',1,'2026-06-14 01:01:24'),(16,'footer_desktop','Footer Desktop Ad','<!-- Footer Desktop Ad Placeholder -->',0,'2026-06-14 00:08:16'),(17,'footer_mobile','Footer Mobile Ad','<!-- Footer Mobile Ad Placeholder -->',0,'2026-06-14 00:08:16'),(18,'video_overlay','Video Overlay Ad','<!-- Video Overlay Ad Placeholder -->',0,'2026-06-14 00:08:16');
/*!40000 ALTER TABLE `ads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `comments`
--

DROP TABLE IF EXISTS `comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `comments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `video_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `content` text NOT NULL,
  `likes_count` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `ip_address` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_video_comments` (`video_id`,`parent_id`,`created_at`),
  KEY `idx_reel_comments` (`parent_id`,`created_at`),
  CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `comments_ibfk_2` FOREIGN KEY (`parent_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `comments`
--

LOCK TABLES `comments` WRITE;
/*!40000 ALTER TABLE `comments` DISABLE KEYS */;
INSERT INTO `comments` VALUES (1,4,1,NULL,'jhkj',0,'2026-06-12 22:15:56','127.0.0.1'),(2,4,1,1,'jkj',0,'2026-06-12 22:16:03','127.0.0.1');
/*!40000 ALTER TABLE `comments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `likes`
--

DROP TABLE IF EXISTS `likes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `likes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `item_type` enum('video','comment') NOT NULL,
  `item_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `ip_address` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_item` (`user_id`,`item_type`,`item_id`),
  KEY `idx_item` (`item_type`,`item_id`),
  CONSTRAINT `likes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `likes`
--

LOCK TABLES `likes` WRITE;
/*!40000 ALTER TABLE `likes` DISABLE KEYS */;
INSERT INTO `likes` VALUES (3,1,'',1,'2026-06-12 21:24:05',NULL),(6,1,'video',2,'2026-06-12 21:55:32',NULL),(7,1,'',3,'2026-06-12 22:16:49','127.0.0.1'),(8,1,'video',3,'2026-06-12 22:30:27','127.0.0.1'),(10,1,'video',1000,'2026-06-13 00:44:07','127.0.0.1');
/*!40000 ALTER TABLE `likes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `settings`
--

DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `settings` (
  `key` varchar(100) NOT NULL,
  `value` text NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `settings`
--

LOCK TABLES `settings` WRITE;
/*!40000 ALTER TABLE `settings` DISABLE KEYS */;
INSERT INTO `settings` VALUES ('analytics_code','<!-- Global Analytics Code Placeholder (Google Analytics, Tag Manager, Facebook Pixel) -->'),('site_name','FREE HUB Video & Reels');
/*!40000 ALTER TABLE `settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `upload_queue`
--

DROP TABLE IF EXISTS `upload_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `upload_queue` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `upload_id` varchar(100) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_size` bigint(20) NOT NULL,
  `uploaded_bytes` bigint(20) DEFAULT 0,
  `status` varchar(50) DEFAULT 'queued',
  `duration` float DEFAULT 0,
  `width` int(11) DEFAULT 0,
  `height` int(11) DEFAULT 0,
  `upload_type` varchar(20) DEFAULT 'video',
  `video_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `upload_id` (`upload_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `upload_queue`
--

LOCK TABLES `upload_queue` WRITE;
/*!40000 ALTER TABLE `upload_queue` DISABLE KEYS */;
INSERT INTO `upload_queue` VALUES (1,'upload-1786741020155-624337443','An_Unforgettable_Experience_with_Mariska(1080P)','','An_Unforgettable_Experience_with_Mariska(1080P).mp4',405347405,405347405,'completed',0,0,0,'video',1012,'2026-08-14 20:57:04','2026-08-14 21:06:23'),(2,'upload-1786741020156-59090179','BABES_-_Natasha_Malkova_and_Richie_Calhoun_make_a_Romatic_Sextape(720P)','','BABES_-_Natasha_Malkova_and_Richie_Calhoun_make_a_Romatic_Sextape(720P).mp4',71555632,71555632,'completed',480.815,1280,720,'video',1013,'2026-08-14 21:06:57','2026-08-14 21:10:06'),(3,'upload-1786741020157-366629385','Big-bootied_Stepmother_Ends_up_in_the_same_Bed_with_her_Stepson_after_Hotel_makes_Mistake(1080P)','','Big-bootied_Stepmother_Ends_up_in_the_same_Bed_with_her_Stepson_after_Hotel_makes_Mistake(1080P).mp4',377775415,377775415,'completed',0,0,0,'video',1014,'2026-08-14 21:10:07','2026-08-14 21:17:42'),(4,'upload-1786741020157-411286239','Big-bottomed_Stepmother_Agrees_to_Share_her_Bed_with_her_Stepson_Angel_Cruz___Sarah_Black_PART_II__2025_(1080P)','','Big-bottomed_Stepmother_Agrees_to_Share_her_Bed_with_her_Stepson_Angel_Cruz___Sarah_Black_PART_II__2025_(1080P).mp4',385586978,385586978,'completed',0,0,0,'video',1015,'2026-08-14 21:17:57','2026-08-14 21:28:17'),(5,'upload-1787086440316-130163423','An_Unforgettable_Experience_with_Mariska(1080P)','','An_Unforgettable_Experience_with_Mariska(1080P).mp4',405347405,405347405,'cancelled',912.76,1920,1080,'video',1016,'2026-08-18 20:54:02','2026-08-18 22:04:55'),(6,'upload-1787090636050-143311793','BABES_-_Natasha_Malkova_and_Richie_Calhoun_make_a_Romatic_Sextape(720P)','','BABES_-_Natasha_Malkova_and_Richie_Calhoun_make_a_Romatic_Sextape(720P).mp4',71555632,71555632,'completed',480.815,1280,720,'video',1019,'2026-08-18 22:03:56','2026-08-18 22:04:04');
/*!40000 ALTER TABLE `upload_queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) DEFAULT 'user',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','$2a$10$8oivwcWOGvw9SA3ZOXlxXu3jGMs.xFbGKAc2Bhke.ljUwZtQiXbfW','admin','2026-06-13 00:12:55');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `videos`
--

DROP TABLE IF EXISTS `videos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `videos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `duration` float NOT NULL DEFAULT 0,
  `width` int(11) NOT NULL DEFAULT 0,
  `height` int(11) NOT NULL DEFAULT 0,
  `aspect_ratio` varchar(20) DEFAULT '16:9',
  `file_size` bigint(20) NOT NULL DEFAULT 0,
  `file_path` varchar(255) DEFAULT NULL,
  `thumbnail_position` int(11) NOT NULL DEFAULT 1,
  `views_count` int(11) DEFAULT 0,
  `likes_count` int(11) DEFAULT 0,
  `status` varchar(20) DEFAULT 'processing',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `source_type` varchar(50) DEFAULT 'upload',
  `source_id` varchar(100) DEFAULT NULL,
  `source_url` text DEFAULT NULL,
  `thumbnail_url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status_created` (`status`,`created_at`,`id`),
  KEY `idx_views` (`views_count`,`id`),
  KEY `idx_videos_title` (`title`)
) ENGINE=InnoDB AUTO_INCREMENT=1021 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `videos`
--

LOCK TABLES `videos` WRITE;
/*!40000 ALTER TABLE `videos` DISABLE KEYS */;
/*!40000 ALTER TABLE `videos` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-19  3:51:11
