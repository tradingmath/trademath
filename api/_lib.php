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
