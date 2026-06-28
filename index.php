<?php
header('Cache-Control: no-cache, must-revalidate');
header('Expires: Sat, 01 Jan 2000 00:00:00 GMT');
header('Pragma: no-cache');
readfile(__DIR__ . '/index.html');
