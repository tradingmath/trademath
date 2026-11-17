<?php
/* Copy this file to config.php ON THE SERVER (hPanel → File Manager) and fill it in.
   config.php is in .gitignore: never commit real passwords. */
return [
    // MySQL: hPanel → Databases → create a database and a user, then paste them here.
    'db_dsn'  => 'mysql:host=localhost;dbname=YOUR_DATABASE;charset=utf8mb4',
    'db_user' => 'YOUR_DB_USER',
    'db_pass' => 'YOUR_DB_PASSWORD',

    // A long random string (40+ characters). Used to sign one-time codes. Changing it invalidates codes in flight.
    'secret'  => 'CHANGE-ME-TO-A-LONG-RANDOM-STRING',

    // Key that encrypts every user's saved cloud copy (AES-256). A long random string. If you lose or change it, saved copies
    // can no longer be opened, so keep a safe copy of it. Leave empty to fall back to 'secret'.
    'data_key' => 'CHANGE-ME-TO-ANOTHER-LONG-RANDOM-STRING',

    // Sender of the OTP email. Use a mailbox on your own domain so the mail does not land in spam.
    'mail_from'      => 'no-reply@yourdomain.in',
    'mail_from_name' => 'TradeMath',
    'mail_reply_to'  => 'support@yourdomain.in',   // people who reply to a code email reach this mailbox

    // "Sign in with Google": your OAuth Web client ID from Google Cloud Console (looks like 123-abc.apps.googleusercontent.com).
    // Leave empty to hide the Google button. This value is public; it is not a secret.
    'google_client_id' => '',

    // Testing only. MUST be false on the real site: true returns the code in the response instead of emailing it.
    'dev_return_code' => false,
];
