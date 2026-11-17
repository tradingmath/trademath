<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? '';

if ($method === 'GET') {                       // download the saved copy
    $u = require_user();
    $s = $pdo->prepare('SELECT version, updated_at, data FROM sync WHERE user_id = ?');
    $s->execute([$u['id']]); $row = $s->fetch();
    if (!$row) out(['ok' => true, 'version' => 0, 'updatedAt' => 0, 'data' => null]);
    out(['ok' => true, 'version' => (int)$row['version'], 'updatedAt' => (int)$row['updated_at'], 'data' => json_decode($row['data'], true)]);
}

$in = require_post();                          // upload: {baseVersion, data, force?}
$u  = require_user();
rate_limit('sync:' . $u['id'], 120, 3600);

$data = $in['data'] ?? null;
if (!is_array($data) || ($data['app'] ?? '') !== 'TradeMath' || !isset($data['trades']) || !is_array($data['trades'])) {
    fail('That is not a TradeMath backup.');
}
$json = json_encode($data, JSON_UNESCAPED_UNICODE);
if ($json === false || strlen($json) > MAX_SYNC_BYTES) fail('Your data is too large to sync (limit 2 MB).', 413);
$base  = (int)($in['baseVersion'] ?? 0);
$force = ($in['force'] ?? false) === true;
$now   = time();

$pdo->beginTransaction();
try {
    $s = $pdo->prepare('SELECT version FROM sync WHERE user_id = ?');
    $s->execute([$u['id']]); $row = $s->fetch();
    $cur = $row ? (int)$row['version'] : 0;
    if ($cur !== $base && !$force) { $pdo->rollBack(); fail('The cloud copy changed on another device.', 409, ['conflict' => true, 'version' => $cur]); }
    $new = $cur + 1;
    if ($row) $pdo->prepare('UPDATE sync SET version = ?, updated_at = ?, data = ? WHERE user_id = ?')->execute([$new, $now, $json, $u['id']]);
    else      $pdo->prepare('INSERT INTO sync (user_id, version, updated_at, data) VALUES (?, ?, ?, ?)')->execute([$u['id'], $new, $now, $json]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('TradeMath sync failed: ' . $e->getMessage());
    fail('Could not save to the cloud. Try again.', 500);
}
out(['ok' => true, 'version' => $new, 'updatedAt' => $now]);
