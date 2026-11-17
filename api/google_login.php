<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

/* "Sign in with Google": the browser sends the signed ID token Google gave it. We check the signature against
   Google's public certificates, that it was issued for OUR client id, that it has not expired, and that Google has
   verified the email. Only then is the user signed in, exactly like after a correct emailed code. */
$in = require_post();
if ((string)cfg('google_client_id', '') === '') fail('Google sign-in is not set up.', 404);
rate_limit('google-ip:' . client_ip(), 30, 3600);

$claims = verify_google_token((string)($in['credential'] ?? ''));
if ($claims === null) fail('Google sign-in could not be verified. Please try again.', 401);

$email = strtolower(trim((string)$claims['email']));
if ($email === '' || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Google did not return a valid email.', 400);
sign_in_user($email);
out(['ok' => true, 'email' => $email]);
