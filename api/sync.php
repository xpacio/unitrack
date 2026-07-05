<?php
require __DIR__ . '/db.php';

if (!isset($_SESSION['user_id'])) {
  http_response_code(401);
  echo json_encode(['error' => 'No autenticado']);
  exit;
}

$userId = $_SESSION['user_id'];

const VALID_TYPES = ['task', 'note', 'event', 'carpeta', 'suscripcion', 'gasto', 'ahorro'];
const VALID_PRIORITIES = [1, 2, 3];
const VALID_ESTADOS = ['pendiente', 'en_curso', 'completada', 'activa', 'pausada', 'cancelada', 'pagado', ''];

function validateItem(array $item): ?string {
  if (empty($item['id']) || !is_string($item['id'])) return 'id inválido';
  if (isset($item['type']) && !in_array($item['type'], VALID_TYPES, true)) return 'type inválido: ' . $item['type'];
  if (isset($item['priority']) && $item['priority'] !== null && !in_array((int) $item['priority'], VALID_PRIORITIES, true)) return 'priority inválido';
  if (isset($item['estado']) && $item['estado'] !== null && !in_array($item['estado'], VALID_ESTADOS, true)) return 'estado inválido: ' . $item['estado'];
  if (isset($item['monto']) && !is_numeric($item['monto'])) return 'monto debe ser numérico';
  if (isset($item['meta']) && !is_numeric($item['meta'])) return 'meta debe ser numérico';
  if (isset($item['acumulado']) && !is_numeric($item['acumulado'])) return 'acumulado debe ser numérico';
  if (isset($item['tags']) && !is_array($item['tags'])) return 'tags debe ser un array';
  if (isset($item['cantidad']) && !is_int($item['cantidad']) && !is_numeric($item['cantidad'])) return 'cantidad debe ser numérico';
  if (isset($item['precio_unitario']) && !is_numeric($item['precio_unitario'])) return 'precio_unitario debe ser numérico';
  return null;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
  $sessionToken = $_SESSION['csrf_token'] ?? '';
  if ($header === '' || $sessionToken === '' || !hash_equals($sessionToken, $header)) {
    http_response_code(403);
    echo json_encode(['error' => 'CSRF token inválido']);
    exit;
  }

  $body = json_decode(file_get_contents('php://input'), true);
  if (!$body || !isset($body['items']) || !is_array($body['items'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request body, expected { items: [...] }']);
    exit;
  }

  $lastSync = isset($body['lastSync']) ? (int) $body['lastSync'] : 0;

  $pdo->beginTransaction();
  try {
    $finanzaTypes = ['suscripcion', 'gasto', 'ahorro'];
    $insertSql = "INSERT INTO items (id, type, title, content, parent_id, tags, priority, fecha_inicio, fecha_fin, estado, created, updated, user_id)
                  VALUES (:id, :type, :title, :content, :parent_id, :tags, :priority, :fecha_inicio, :fecha_fin, :estado, :created, :updated, :user_id)
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
                  WHERE items.updated < EXCLUDED.updated AND items.user_id = :user_id2";

    $fiInsertSql = "INSERT INTO items_finanza (id, monto, periodicidad, meta, acumulado, cantidad, precio_unitario)
                    VALUES (:id, :monto, :periodicidad, :meta, :acumulado, :cantidad, :precio_unitario)
                    ON CONFLICT (id) DO UPDATE SET
                      monto = EXCLUDED.monto,
                      periodicidad = EXCLUDED.periodicidad,
                      meta = EXCLUDED.meta,
                      acumulado = EXCLUDED.acumulado,
                      cantidad = EXCLUDED.cantidad,
                      precio_unitario = EXCLUDED.precio_unitario";

    $deleteSql = "DELETE FROM items WHERE id = :id AND user_id = :user_id";

    foreach ($body['items'] as $item) {
      if (isset($item['_delete']) && $item['_delete'] === true) {
        if (empty($item['id']) || !is_string($item['id'])) {
          $pdo->rollBack();
          http_response_code(400);
          echo json_encode(['error' => 'Item con _delete tiene id inválido']);
          exit;
        }
        $stmt = $pdo->prepare($deleteSql);
        $stmt->execute(['id' => $item['id'], 'user_id' => $userId]);
      } else {
        $error = validateItem($item);
        if ($error !== null) {
          $pdo->rollBack();
          http_response_code(400);
          echo json_encode(['error' => "Datos inválidos en item {$item['id']}: $error"]);
          exit;
        }
        $stmt->execute([
          'id' => $item['id'],
          'type' => $item['type'] ?? 'task',
          'title' => $item['title'] ?? '',
          'content' => $item['content'] ?? '',
          'parent_id' => $item['parent_id'] ?? null,
          'tags' => '{' . implode(',', array_map(function($t) { $escaped = str_replace(['\\', '"', "\n", "\r"], ['\\\\', '\\"', '\\n', '\\r'], $t); return '"' . $escaped . '"'; }, $item['tags'] ?? [])) . '}',
          'priority' => $item['priority'] ?? 2,
          'fecha_inicio' => !empty($item['fecha_inicio']) ? $item['fecha_inicio'] : null,
          'fecha_fin' => !empty($item['fecha_fin']) ? $item['fecha_fin'] : null,
          'estado' => $item['estado'] ?? 'pendiente',
          'created' => $item['created'] ?? round(microtime(true) * 1000),
          'updated' => $item['updated'] ?? round(microtime(true) * 1000),
          'user_id' => $userId,
          'user_id2' => $userId,
        ]);

        if (in_array($item['type'] ?? '', $finanzaTypes, true)) {
          $fiStmt = $pdo->prepare($fiInsertSql);
          $fiStmt->execute([
            'id' => $item['id'],
            'monto' => $item['monto'] ?? 0,
            'periodicidad' => $item['periodicidad'] ?? null,
            'meta' => $item['meta'] ?? 0,
            'acumulado' => $item['acumulado'] ?? 0,
            'cantidad' => $item['cantidad'] ?? 1,
            'precio_unitario' => $item['precio_unitario'] ?? 0,
          ]);
        }
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
    $stmt = $pdo->prepare("SELECT i.*, f.monto as fi_monto, f.periodicidad as fi_periodicidad, f.meta as fi_meta, f.acumulado as fi_acumulado, f.cantidad as fi_cantidad, f.precio_unitario as fi_precio_unitario FROM items i LEFT JOIN items_finanza f ON i.id = f.id WHERE i.updated > :lastSync AND i.user_id = :user_id ORDER BY i.updated ASC");
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
    $stmt = $pdo->prepare("SELECT i.*, f.monto as fi_monto, f.periodicidad as fi_periodicidad, f.meta as fi_meta, f.acumulado as fi_acumulado, f.cantidad as fi_cantidad, f.precio_unitario as fi_precio_unitario FROM items i LEFT JOIN items_finanza f ON i.id = f.id WHERE i.user_id = :user_id ORDER BY i.updated DESC");
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

  $monto = $row['fi_monto'] !== null ? (float) $row['fi_monto'] : 0;
  $periodicidad = $row['fi_periodicidad'];
  $meta = $row['fi_meta'] !== null ? (float) $row['fi_meta'] : 0;
  $acumulado = $row['fi_acumulado'] !== null ? (float) $row['fi_acumulado'] : 0;

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
    'monto' => $monto,
    'periodicidad' => $periodicidad,
    'meta' => $meta,
    'acumulado' => $acumulado,
    'cantidad' => $row['fi_cantidad'] !== null ? (int) $row['fi_cantidad'] : 1,
    'precio_unitario' => $row['fi_precio_unitario'] !== null ? (float) $row['fi_precio_unitario'] : 0,
    'created' => (int) $row['created'],
    'updated' => (int) $row['updated'],
  ];
}
