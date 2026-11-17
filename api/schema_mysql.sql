-- Import this once in phpMyAdmin (hPanel → Databases → phpMyAdmin → Import) into the database you created.
-- All times are Unix timestamps (seconds). No passwords are stored anywhere.

CREATE TABLE IF NOT EXISTS users (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(254) NOT NULL,
  created_at  INT UNSIGNED NOT NULL,
  last_login  INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS otps (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(254) NOT NULL,
  code_hash   CHAR(64) NOT NULL,            -- HMAC of the code, never the code itself
  expires_at  INT UNSIGNED NOT NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  used        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  INT UNSIGNED NOT NULL,
  KEY ix_otps_email (email, used, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,            -- SHA-256 of the cookie token
  expires_at  INT UNSIGNED NOT NULL,
  created_at  INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY ix_sessions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sync (
  user_id     BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  version     INT UNSIGNED NOT NULL,
  updated_at  INT UNSIGNED NOT NULL,
  data        MEDIUMTEXT NOT NULL           -- the user's backup JSON (max 2 MB, enforced by the API)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rate_limits (
  k           VARCHAR(120) NOT NULL PRIMARY KEY,
  hits        INT UNSIGNED NOT NULL,
  reset_at    INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
