<?php
header('Content-Type: application/json');

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? '';
$expectedOrigin = "$scheme://$host";
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($requestOrigin === $expectedOrigin || $requestOrigin === '') {
    header("Access-Control-Allow-Origin: $expectedOrigin");
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
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

if (!defined('UNITRACK_GUARD')) {
  define('UNITRACK_GUARD', true);
}
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
