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

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');
if ($scheme === 'https') {
    ini_set('session.cookie_secure', 1);
}
session_start();

if (!isset($_SESSION['user_id'])) {
  http_response_code(401);
  echo json_encode(['error' => 'No autenticado']);
  exit;
}

$userId = $_SESSION['user_id'];

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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = json_decode(file_get_contents('php://input'), true);
  if (!$body || !isset($body['items']) || !is_array($body['items'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request body, expected { items: [...] }']);
    exit;
  }

  $lastSync = isset($body['lastSync']) ? (int) $body['lastSync'] : 0;

  $pdo->beginTransaction();
  try {
    $insertSql = "INSERT INTO items (id, type, title, content, parent_id, tags, priority, fecha_inicio, fecha_fin, estado, created, updated, monto, periodicidad, meta, acumulado, user_id)
                  VALUES (:id, :type, :title, :content, :parent_id, :tags, :priority, :fecha_inicio, :fecha_fin, :estado, :created, :updated, :monto, :periodicidad, :meta, :acumulado, :user_id)
                  ON CONFLICT (id) DO UPDATE SET
                    type = EXCLUDED.type,
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    parent_id = EXCLUDED.parent_id,
                    tags = EXCLUDED.tags,
                    priority = EXCLUDED.priority,
                    fecha_inicio = EXCLUDED.fecha_inicio,
                    fecha_fin = EXCLUDED.fecha_fin,
                    estado = EXCLUDED.estado,
                    monto = EXCLUDED.monto,
                    periodicidad = EXCLUDED.periodicidad,
                    meta = EXCLUDED.meta,
                    acumulado = EXCLUDED.acumulado,
                    updated = EXCLUDED.updated
                  WHERE items.updated < EXCLUDED.updated AND items.user_id = :user_id2";

    $deleteSql = "DELETE FROM items WHERE id = :id AND user_id = :user_id";

    foreach ($body['items'] as $item) {
      if (isset($item['_delete']) && $item['_delete'] === true) {
        $stmt = $pdo->prepare($deleteSql);
        $stmt->execute(['id' => $item['id'], 'user_id' => $userId]);
      } else {
        $stmt = $pdo->prepare($insertSql);
        $stmt->execute([
          'id' => $item['id'],
          'type' => $item['type'] ?? 'task',
          'title' => $item['title'] ?? '',
          'content' => $item['content'] ?? '',
          'parent_id' => $item['parent_id'] ?? null,
          'tags' => '{' . implode(',', array_map(function($t) { $escaped = str_replace(['\\', '"'], ['\\\\', '\\"'], $t); return '"' . $escaped . '"'; }, $item['tags'] ?? [])) . '}',
          'priority' => $item['priority'] ?? 2,
          'fecha_inicio' => $item['fecha_inicio'] ?? '',
          'fecha_fin' => $item['fecha_fin'] ?? '',
          'estado' => $item['estado'] ?? 'pendiente',
          'monto' => $item['monto'] ?? 0,
          'periodicidad' => $item['periodicidad'] ?? null,
          'meta' => $item['meta'] ?? 0,
          'acumulado' => $item['acumulado'] ?? 0,
          'created' => $item['created'] ?? round(microtime(true) * 1000),
          'updated' => $item['updated'] ?? round(microtime(true) * 1000),
          'user_id' => $userId,
          'user_id2' => $userId,
        ]);
      }
    }

    $pdo->commit();
  } catch (PDOException $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Sync failed: ' . $e->getMessage()]);
    exit;
  }

  try {
    $stmt = $pdo->prepare("SELECT * FROM items WHERE updated > :lastSync AND user_id = :user_id ORDER BY updated ASC");
    $stmt->execute(['lastSync' => $lastSync, 'user_id' => $userId]);
    $rows = $stmt->fetchAll();
    $changes = array_map('formatItem', $rows);
    $serverTime = round(microtime(true) * 1000);
    echo json_encode(['changes' => $changes, 'serverTime' => $serverTime]);
  } catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
  }
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  try {
    $stmt = $pdo->prepare("SELECT * FROM items WHERE user_id = :user_id ORDER BY updated DESC");
    $stmt->execute(['user_id' => $userId]);
    $rows = $stmt->fetchAll();
    $items = array_map('formatItem', $rows);
    $serverTime = round(microtime(true) * 1000);
    echo json_encode(['changes' => $items, 'serverTime' => $serverTime]);
  } catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
  }
  exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

function formatItem($row) {
  $tags = [];
  if ($row['tags'] && $row['tags'] !== '{}') {
    $trimmed = trim($row['tags'], '{}');
    if ($trimmed !== '') {
      $tags = explode(',', $trimmed);
      $tags = array_map(function($t) {
        return trim($t, '"');
      }, $tags);
    }
  }

  return [
    'id' => $row['id'],
    'type' => $row['type'],
    'title' => $row['title'],
    'content' => $row['content'],
    'parent_id' => $row['parent_id'],
    'tags' => $tags,
    'priority' => (int) $row['priority'],
    'fecha_inicio' => $row['fecha_inicio'],
    'fecha_fin' => $row['fecha_fin'],
    'estado' => $row['estado'],
    'monto' => (float) $row['monto'],
    'periodicidad' => $row['periodicidad'],
    'meta' => (float) $row['meta'],
    'acumulado' => (float) $row['acumulado'],
    'created' => (int) $row['created'],
    'updated' => (int) $row['updated'],
  ];
}
