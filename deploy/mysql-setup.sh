#!/usr/bin/env bash
# Creates the niramoy_web MySQL database and a `niramoy` user that can only
# access that database, and writes the connection settings to
# /etc/niramoy-web.env. Safe to re-run: an existing password is reused.
# Run as root with MYSQL_PWD set to the MySQL root password.
set -euo pipefail

DB=niramoy_web
DB_USER=niramoy
ENV_FILE=/etc/niramoy-web.env

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
if grep -q '^MYSQL_PASSWORD=' "$ENV_FILE"; then
  PASS=$(grep '^MYSQL_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
else
  PASS=$(openssl rand -base64 24 | tr -d '/+=')
  {
    echo "MYSQL_HOST=127.0.0.1"
    echo "MYSQL_PORT=3306"
    echo "MYSQL_DATABASE=$DB"
    echo "MYSQL_USER=$DB_USER"
    echo "MYSQL_PASSWORD=$PASS"
  } >> "$ENV_FILE"
fi

mysql -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$PASS';
ALTER USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$PASS';
GRANT ALL PRIVILEGES ON \`$DB\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB\`.* TO '$DB_USER'@'127.0.0.1';
SQL

echo "MySQL database $DB is ready for user $DB_USER"
