<?php
header('Content-Type: application/json');

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? '';
$expectedOrigin = "$scheme://$host";
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($requestOrigin === $expectedOrigin || $requestOrigin === '') {
    header("Access-Control-Allow-Origin: $expectedOrigin");
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Credentials: true');
}

ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');
if ($scheme === 'https') {
    ini_set('session.cookie_secure', 1);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

session_start();

$config = require __DIR__ . '/config.php';

try {
  $dsn = "pgsql:host={$config['host']};port={$config['port']};dbname={$config['dbname']}";
  $pdo = new PDO($dsn, $config['user'], $config['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
} catch (PDOException $e) {
  http_response_code(500);
  echo json_encode(['error' => 'DB connection failed']);
  exit;
}

$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'register') {
  $body = json_decode(file_get_contents('php://input'), true);
  $email = trim($body['email'] ?? '');
  $password = $body['password'] ?? '';
  $nombre = trim($body['nombre'] ?? '');

  if (!$email || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Email y contraseña requeridos']);
    exit;
  }

  if (strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(['error' => 'La contraseña debe tener al menos 6 caracteres']);
    exit;
  }

  $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
  $stmt->execute([$email]);
  if ($stmt->fetch()) {
    http_response_code(409);
    echo json_encode(['error' => 'El email ya está registrado']);
    exit;
  }

  $hash = password_hash($password, PASSWORD_BCRYPT);
  $created = round(microtime(true) * 1000);
  $stmt = $pdo->prepare("INSERT INTO users (email, password, nombre, created) VALUES (?, ?, ?, ?)");
  $stmt->execute([$email, $hash, $nombre, $created]);
  $userId = (int) $pdo->lastInsertId();

  $_SESSION['user_id'] = $userId;
  $_SESSION['user_email'] = $email;
  $_SESSION['user_nombre'] = $nombre;
  session_regenerate_id(true);

  echo json_encode(['user' => ['id' => $userId, 'email' => $email, 'nombre' => $nombre]]);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'login') {
  $body = json_decode(file_get_contents('php://input'), true);
  $email = trim($body['email'] ?? '');
  $password = $body['password'] ?? '';

  if (!$email || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Email y contraseña requeridos']);
    exit;
  }

  $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
  $stmt->execute([$email]);
  $user = $stmt->fetch();

  if (!$user || !password_verify($password, $user['password'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Credenciales inválidas']);
    exit;
  }

  $_SESSION['user_id'] = (int) $user['id'];
  $_SESSION['user_email'] = $user['email'];
  $_SESSION['user_nombre'] = $user['nombre'];
  session_regenerate_id(true);

  echo json_encode(['user' => ['id' => (int) $user['id'], 'email' => $user['email'], 'nombre' => $user['nombre']]]);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'logout') {
  $_SESSION = [];
  setcookie(session_name(), '', [
    'expires' => time() - 3600,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => $scheme === 'https',
  ]);
  session_destroy();
  echo json_encode(['ok' => true]);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'me') {
  if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'No autenticado']);
    exit;
  }
  $stmt = $pdo->prepare("SELECT id, email, nombre FROM users WHERE id = ?");
  $stmt->execute([$_SESSION['user_id']]);
  $dbUser = $stmt->fetch();
  if (!$dbUser) {
    $_SESSION = [];
    setcookie(session_name(), '', [
      'expires' => time() - 3600,
      'path' => '/',
      'httponly' => true,
      'samesite' => 'Lax',
      'secure' => $scheme === 'https',
    ]);
    session_destroy();
    http_response_code(401);
    echo json_encode(['error' => 'No autenticado']);
    exit;
  }
  $_SESSION['user_email'] = $dbUser['email'];
  $_SESSION['user_nombre'] = $dbUser['nombre'];
  echo json_encode(['user' => [
    'id' => $_SESSION['user_id'],
    'email' => $_SESSION['user_email'],
    'nombre' => $_SESSION['user_nombre'],
  ]]);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'forgot_password') {
  $body = json_decode(file_get_contents('php://input'), true);
  $email = trim($body['email'] ?? '');

  if (!$email) {
    http_response_code(400);
    echo json_encode(['error' => 'Email requerido']);
    exit;
  }

  $stmt = $pdo->prepare("SELECT id, nombre, reset_token_at FROM users WHERE email = ?");
  $stmt->execute([$email]);
  $user = $stmt->fetch();

  $now = round(microtime(true) * 1000);

  if ($user) {
    $elapsed = $now - (int) $user['reset_token_at'];
    if ($elapsed < 180000) {
      $retryAfter = (int) ceil((180000 - $elapsed) / 1000);
      http_response_code(429);
      echo json_encode(['error' => 'Espera antes de solicitar otra clave', 'retry_after' => $retryAfter]);
      exit;
    }

    $token = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare("UPDATE users SET reset_token = ?, reset_token_at = ? WHERE id = ?");
    $stmt->execute([$token, $now, $user['id']]);

    $resetLink = ($scheme === 'https' ? 'https' : 'http') . "://{$host}/?reset_token={$token}";
    $subject = '=?UTF-8?B?' . base64_encode('UniTrack - Recuperar acceso') . '?=';
    $message = "Hola {$user['nombre']},\r\n\r\n";
    $message .= "Recibiste este correo porque solicitaste recuperar el acceso a UniTrack.\r\n\r\n";
    $message .= "Haz clic en el siguiente enlace para restablecer tu clave:\r\n\r\n";
    $message .= "$resetLink\r\n\r\n";
    $message .= "Este enlace expira en 15 minutos.\r\n\r\n";
    $message .= "Si no solicitaste este cambio, ignora este mensaje.\r\n\r\n";
    $message .= "— UniTrack";
    $headers = "From: UniTrack <jose@alvar3z.nl>\r\n";
    $headers .= "Reply-To: jose@alvar3z.nl\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    mail($email, $subject, $message, $headers);
  }

  echo json_encode(['ok' => true]);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'verify_reset_token') {
  $body = json_decode(file_get_contents('php://input'), true);
  $token = $body['token'] ?? '';

  if (strlen($token) !== 64) {
    http_response_code(400);
    echo json_encode(['error' => 'Token inválido']);
    exit;
  }

  $stmt = $pdo->prepare("SELECT id, email, nombre, reset_token_at FROM users WHERE reset_token = ?");
  $stmt->execute([$token]);
  $user = $stmt->fetch();

  if (!$user) {
    http_response_code(400);
    echo json_encode(['error' => 'Token inválido o ya usado']);
    exit;
  }

  $now = round(microtime(true) * 1000);
  $elapsed = $now - (int) $user['reset_token_at'];

  if ($elapsed > 900000) {
    http_response_code(400);
    echo json_encode(['error' => 'El token ha expirado (15 min). Solicita uno nuevo.']);
    exit;
  }

  echo json_encode(['user' => ['email' => $user['email'], 'nombre' => $user['nombre']]]);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'reset_password_with_token') {
  $body = json_decode(file_get_contents('php://input'), true);
  $token = $body['token'] ?? '';
  $newPassword = $body['new_password'] ?? '';

  if (strlen($token) !== 64) {
    http_response_code(400);
    echo json_encode(['error' => 'Token inválido']);
    exit;
  }

  if (strlen($newPassword) < 6) {
    http_response_code(400);
    echo json_encode(['error' => 'La contraseña debe tener al menos 6 caracteres']);
    exit;
  }

  $stmt = $pdo->prepare("SELECT id, reset_token_at FROM users WHERE reset_token = ?");
  $stmt->execute([$token]);
  $user = $stmt->fetch();

  if (!$user) {
    http_response_code(400);
    echo json_encode(['error' => 'Token inválido o ya usado']);
    exit;
  }

  $now = round(microtime(true) * 1000);
  $elapsed = $now - (int) $user['reset_token_at'];

  if ($elapsed > 900000) {
    http_response_code(400);
    echo json_encode(['error' => 'El token ha expirado. Solicita uno nuevo.']);
    exit;
  }

  $hash = password_hash($newPassword, PASSWORD_BCRYPT);
  $stmt = $pdo->prepare("UPDATE users SET password = ?, reset_token = NULL, reset_token_at = 0 WHERE id = ?");
  $stmt->execute([$hash, $user['id']]);

  echo json_encode(['ok' => true]);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'change_password') {
  if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'No autenticado']);
    exit;
  }

  $body = json_decode(file_get_contents('php://input'), true);
  $newPassword = $body['new_password'] ?? '';

  if (strlen($newPassword) < 6) {
    http_response_code(400);
    echo json_encode(['error' => 'La contraseña debe tener al menos 6 caracteres']);
    exit;
  }

  $hash = password_hash($newPassword, PASSWORD_BCRYPT);
  $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
  $stmt->execute([$hash, $_SESSION['user_id']]);

  $userId = $_SESSION['user_id'];
  $userEmail = $_SESSION['user_email'];
  $userNombre = $_SESSION['user_nombre'];

  $_SESSION = [];
  setcookie(session_name(), '', [
    'expires' => time() - 3600,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => $scheme === 'https',
  ]);
  session_destroy();

  echo json_encode(['ok' => true]);
  exit;
}

http_response_code(404);
echo json_encode(['error' => 'Acción no válida']);
