<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

require_post();
$t = $_COOKIE[SESSION_COOKIE] ?? '';
if (is_string($t) && preg_match('/^[a-f0-9]{64}$/', $t)) {
    db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $t)]);
}
set_session_cookie('', time() - 3600);
out(['ok' => true]);
