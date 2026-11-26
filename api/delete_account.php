<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$in = require_post();
$u  = require_user();
if (strtolower(trim((string)($in['confirmEmail'] ?? ''))) !== $u['email']) fail('Type your email address to confirm.');

$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare('DELETE FROM sync WHERE user_id = ?')->execute([$u['id']]);
    $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$u['id']]);
    $pdo->prepare('DELETE FROM otps WHERE email = ?')->execute([$u['email']]);
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$u['id']]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('TradingMath delete failed: ' . $e->getMessage());
    fail('Could not delete the account. Try again.', 500);
}
set_session_cookie('', time() - 3600);
out(['ok' => true]);
