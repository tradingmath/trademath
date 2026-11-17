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

sign_in_user($email);
$pdo->prepare('DELETE FROM otps WHERE expires_at < ?')->execute([$now - 86400]);
out(['ok' => true, 'email' => $email]);
