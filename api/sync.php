<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
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
  echo json_encode(['error' => 'DB connection failed: ' . $e->getMessage()]);
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
    $insertSql = "INSERT INTO items (id, type, title, content, parent_id, tags, priority, fecha_inicio, fecha_fin, estado, created, updated)
                  VALUES (:id, :type, :title, :content, :parent_id, :tags, :priority, :fecha_inicio, :fecha_fin, :estado, :created, :updated)
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
                    updated = EXCLUDED.updated
                  WHERE items.updated < EXCLUDED.updated";

    $deleteSql = "DELETE FROM items WHERE id = :id";

    foreach ($body['items'] as $item) {
      if (isset($item['_delete']) && $item['_delete'] === true) {
        $stmt = $pdo->prepare($deleteSql);
        $stmt->execute(['id' => $item['id']]);
      } else {
        $stmt = $pdo->prepare($insertSql);
        $stmt->execute([
          'id' => $item['id'],
          'type' => $item['type'] ?? 'task',
          'title' => $item['title'] ?? '',
          'content' => $item['content'] ?? '',
          'parent_id' => $item['parent_id'] ?? null,
          'tags' => '{' . implode(',', array_map(function($t) { return '"' . str_replace('"', '\\"', $t) . '"'; }, $item['tags'] ?? [])) . '}',
          'priority' => $item['priority'] ?? 2,
          'fecha_inicio' => $item['fecha_inicio'] ?? '',
          'fecha_fin' => $item['fecha_fin'] ?? '',
          'estado' => $item['estado'] ?? 'pendiente',
          'created' => $item['created'] ?? time() * 1000,
          'updated' => $item['updated'] ?? time() * 1000,
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
    $stmt = $pdo->prepare("SELECT * FROM items WHERE updated > :lastSync ORDER BY updated ASC");
    $stmt->execute(['lastSync' => $lastSync]);
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
    $stmt = $pdo->query("SELECT * FROM items ORDER BY updated DESC");
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
    'created' => (int) $row['created'],
    'updated' => (int) $row['updated'],
  ];
}
