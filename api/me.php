<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$u = current_user();
if (!$u) out(['ok' => true, 'signedIn' => false, 'googleClientId' => (string)cfg('google_client_id', '')]);
$s = db()->prepare('SELECT version, updated_at FROM sync WHERE user_id = ?');
$s->execute([$u['id']]); $row = $s->fetch();
out(['ok' => true, 'signedIn' => true, 'email' => $u['email'],
     'version' => $row ? (int)$row['version'] : 0, 'updatedAt' => $row ? (int)$row['updated_at'] : 0]);
