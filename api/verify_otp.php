<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$in    = require_post();
$email = clean_email($in['email'] ?? '');
$code  = preg_replace('/\D/', '', (string)($in['code'] ?? ''));
if (strlen($code) !== 6) fail('Enter the 6-digit code.');

rate_limit('ver-ip:' . client_ip(), 30, 3600);
rate_limit('ver-mail:' . $email, 15, 3600);

$pdo = db(); $now = time();
$s = $pdo->prepare('SELECT id, code_hash, attempts FROM otps WHERE email = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1');
$s->execute([$email, $now]);
$otp = $s->fetch();
if (!$otp) fail('That code has expired. Ask for a new one.', 400);

if ((int)$otp['attempts'] >= 5) {
    $pdo->prepare('UPDATE otps SET used = 1 WHERE id = ?')->execute([$otp['id']]);
    fail('Too many wrong tries. Ask for a new code.', 400);
}
if (!hash_equals($otp['code_hash'], otp_hash($email, $code))) {
    $pdo->prepare('UPDATE otps SET attempts = attempts + 1 WHERE id = ?')->execute([$otp['id']]);
    fail('That code is not right.', 400);
}
$pdo->prepare('UPDATE otps SET used = 1 WHERE id = ?')->execute([$otp['id']]);

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
$pdo->prepare('DELETE FROM otps WHERE expires_at < ?')->execute([$now - 86400]);
set_session_cookie($token, $exp);
out(['ok' => true, 'email' => $email]);
