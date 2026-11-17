<?php
declare(strict_types=1);
/* Shared helpers for the TradeMath API. Every endpoint includes this first. */

if (!is_file(__DIR__ . '/config.php')) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'Accounts are not set up on this server yet.']);
    exit;
}
$GLOBALS['TM_CFG'] = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const SESSION_COOKIE = 'tm_session';
const SESSION_DAYS   = 60;
const MAX_SYNC_BYTES = 2000000;

function cfg(string $k, $d = null) { return $GLOBALS['TM_CFG'][$k] ?? $d; }

function out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $code = 400, array $extra = []): void {
    out(array_merge(['ok' => false, 'error' => $msg], $extra), $code);
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(cfg('db_dsn'), cfg('db_user'), cfg('db_pass'), [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        } catch (Throwable $e) {
            error_log('TradeMath DB connect failed: ' . $e->getMessage());
            fail('The server is temporarily unavailable.', 503);
        }
    }
    return $pdo;
}

function is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

/* POST-only endpoints must come from our own pages: a custom header (which other sites cannot send without a
   CORS preflight, and we never allow CORS) plus, when the browser sends one, a matching Origin. */
function require_post(): array {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Use POST.', 405);
    if (($_SERVER['HTTP_X_TM'] ?? '') !== '1') fail('Bad request.', 400);
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $host = parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '');
        if (!hash_equals((string)($_SERVER['HTTP_HOST'] ?? ''), (string)$host)) fail('Bad origin.', 403);
    }
    $raw = file_get_contents('php://input', false, null, 0, MAX_SYNC_BYTES + 100000);
    $j = json_decode($raw === false ? '' : $raw, true);
    return is_array($j) ? $j : [];
}

function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0'), 0, 45); }

/* Fixed-window rate limit: at most $max hits per $windowSec for $key, else HTTP 429. */
function rate_limit(string $key, int $max, int $windowSec): void {
    $pdo = db(); $now = time(); $key = substr($key, 0, 120);
    $s = $pdo->prepare('SELECT hits, reset_at FROM rate_limits WHERE k = ?');
    $s->execute([$key]); $row = $s->fetch();
    if (!$row || (int)$row['reset_at'] <= $now) {
        if ($row) $pdo->prepare('DELETE FROM rate_limits WHERE k = ?')->execute([$key]);
        try { $pdo->prepare('INSERT INTO rate_limits (k, hits, reset_at) VALUES (?, 1, ?)')->execute([$key, $now + $windowSec]); }
        catch (Throwable $e) { /* a parallel request created it first: fine */ }
        return;
    }
    if ((int)$row['hits'] >= $max) fail('Too many attempts. Please wait a while and try again.', 429, ['retryAfter' => (int)$row['reset_at'] - $now]);
    $pdo->prepare('UPDATE rate_limits SET hits = hits + 1 WHERE k = ?')->execute([$key]);
}

function clean_email($v): string {
    $e = strtolower(trim((string)$v));
    if ($e === '' || strlen($e) > 254 || !filter_var($e, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
    return $e;
}

function otp_hash(string $email, string $code): string {
    return hash_hmac('sha256', $email . '|' . $code, (string)cfg('secret', ''));
}

function current_user(): ?array {
    $t = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!is_string($t) || !preg_match('/^[a-f0-9]{64}$/', $t)) return null;
    $s = db()->prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?');
    $s->execute([hash('sha256', $t), time()]);
    $u = $s->fetch();
    return $u ?: null;
}
function require_user(): array {
    $u = current_user();
    if (!$u) fail('Please sign in.', 401);
    return $u;
}

function set_session_cookie(string $token, int $expires): void {
    setcookie(SESSION_COOKIE, $token, [
        'expires' => $expires, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

/* Find or create the user for this email, start a session and set the cookie. Shared by every sign-in method. */
function sign_in_user(string $email): array {
    $pdo = db(); $now = time();
    $u = $pdo->prepare('SELECT id FROM users WHERE email = ?'); $u->execute([$email]); $user = $u->fetch();
    if (!$user) {
        try { $pdo->prepare('INSERT INTO users (email, created_at, last_login) VALUES (?, ?, ?)')->execute([$email, $now, $now]); }
        catch (Throwable $e) { /* created in parallel */ }
        $u->execute([$email]); $user = $u->fetch();
    }
    $pdo->prepare('UPDATE users SET last_login = ? WHERE id = ?')->execute([$now, $user['id']]);
    $token = bin2hex(random_bytes(32));
    $exp   = $now + SESSION_DAYS * 86400;
    $pdo->prepare('INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)')
        ->execute([$user['id'], hash('sha256', $token), $exp, $now]);
    $pdo->prepare('DELETE FROM sessions WHERE expires_at < ?')->execute([$now]);        // tidy up old sessions
    set_session_cookie($token, $exp);
    return $user;
}

/* ── Google sign-in: verify an ID token (RS256 JWT) against Google's published certificates ── */
function http_get(string $url): ?string {
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_FOLLOWLOCATION => false]);
        $r = curl_exec($c); $code = curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
        return ($r !== false && $code === 200) ? (string)$r : null;
    }
    $r = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 6]]));
    return $r === false ? null : $r;
}
function google_certs(bool $refresh = false): array {
    $url   = (string)cfg('google_certs_url', 'https://www.googleapis.com/oauth2/v1/certs');
    $cache = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'tm_google_certs_' . md5($url) . '.json';
    if (!$refresh && is_file($cache) && time() - (int)filemtime($cache) < 3600) {
        $j = json_decode((string)file_get_contents($cache), true);
        if (is_array($j) && $j) return $j;
    }
    $raw = http_get($url);
    $j = $raw === null ? null : json_decode($raw, true);
    if (is_array($j) && $j) { @file_put_contents($cache, $raw); return $j; }
    if (is_file($cache)) { $j = json_decode((string)file_get_contents($cache), true); if (is_array($j)) return $j; }   // stale beats nothing
    return [];
}
function b64url_decode(string $s): string { return (string)base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4)); }
function verify_google_token(string $jwt): ?array {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3 || strlen($jwt) > 4096) return null;
    $header = json_decode(b64url_decode($parts[0]), true); $payload = json_decode(b64url_decode($parts[1]), true);
    if (!is_array($header) || !is_array($payload) || ($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) return null;
    $certs = google_certs(); $pem = $certs[$header['kid']] ?? null;
    if (!is_string($pem)) { $certs = google_certs(true); $pem = $certs[$header['kid']] ?? null; }   // Google rotated its keys: fetch once more
    if (!is_string($pem)) return null;
    if (openssl_verify($parts[0] . '.' . $parts[1], b64url_decode($parts[2]), $pem, OPENSSL_ALGO_SHA256) !== 1) return null;
    $now = time();
    if (!in_array($payload['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) return null;
    if (!hash_equals((string)cfg('google_client_id', ''), (string)($payload['aud'] ?? ''))) return null;
    if ((int)($payload['exp'] ?? 0) < $now - 30 || (int)($payload['iat'] ?? 0) > $now + 300) return null;
    $verified = $payload['email_verified'] ?? false;
    if ($verified !== true && $verified !== 'true') return null;
    if (empty($payload['email']) || !is_string($payload['email'])) return null;
    return $payload;
}
