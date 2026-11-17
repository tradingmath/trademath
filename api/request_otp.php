<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$in    = require_post();
$email = clean_email($in['email'] ?? '');
$pdo   = db();

rate_limit('otp-ip:' . client_ip(), 15, 3600);      // per address
rate_limit('otp-mail:' . $email, 5, 3600);          // per mailbox: stops inbox flooding
rate_limit('otp-gap:' . $email, 1, 45);             // at most one code every 45 seconds

$code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$now  = time();
$pdo->prepare('UPDATE otps SET used = 1 WHERE email = ? AND used = 0')->execute([$email]);   // only the newest code works
$pdo->prepare('INSERT INTO otps (email, code_hash, expires_at, attempts, used, created_at) VALUES (?, ?, ?, 0, 0, ?)')
    ->execute([$email, otp_hash($email, $code), $now + 600, $now]);

$resp = ['ok' => true, 'expiresIn' => 600];
if (cfg('dev_return_code', false) === true) {
    $resp['devCode'] = $code;                       // local testing only
} else {
    $from = (string)cfg('mail_from', 'no-reply@localhost');
    $name = str_replace(["\r", "\n", '"'], '', (string)cfg('mail_from_name', 'TradeMath'));
    $headers = "From: \"$name\" <$from>\r\nReply-To: $from\r\nContent-Type: text/plain; charset=UTF-8\r\nX-Mailer: TradeMath";
    $text = "Your TradeMath sign-in code is $code\r\n\r\nIt works for 10 minutes. If you did not ask for it, ignore this email: nobody can sign in without the code.\r\n";
    if (!@mail($email, 'Your TradeMath code: ' . $code, $text, $headers)) {
        error_log('TradeMath: mail() failed');
        fail('We could not send the email. Please try again later.', 502);
    }
}
out($resp);
