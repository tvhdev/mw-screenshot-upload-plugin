#!/bin/bash
#
# Installs MediaWiki with an SQLite backend on first boot and enables the
# ScreenshotUpload extension, then hands off to the normal Apache entrypoint.
#
set -e

cd /var/www/html

SQLITE_DIR="/var/www/data"
SITENAME="${MW_SITENAME:-ScreenshotWiki}"
ADMIN_USER="${MW_ADMIN_USER:-Admin}"
ADMIN_PASS="${MW_ADMIN_PASS:-Admin12345}"
SERVER="${MW_SERVER:-http://localhost:8080}"
LANG_CODE="${MW_LANG:-de}"

mkdir -p "$SQLITE_DIR"
chown -R www-data:www-data "$SQLITE_DIR"

if [ ! -f LocalSettings.php ]; then
	echo ">> Installing MediaWiki (SQLite backend)…"
	php maintenance/install.php \
		--dbtype=sqlite \
		--dbpath="$SQLITE_DIR" \
		--scriptpath="" \
		--server="$SERVER" \
		--lang="$LANG_CODE" \
		--pass="$ADMIN_PASS" \
		"$SITENAME" \
		"$ADMIN_USER"

	echo ">> Enabling ScreenshotUpload and upload settings…"
	cat >> LocalSettings.php <<PHP

## --- ScreenshotUpload test configuration ---
\$wgServer = "$SERVER";
\$wgLanguageCode = "$LANG_CODE";
\$wgEnableUploads = true;
\$wgUseInstantCommons = false;
\$wgFileExtensions = array_merge( \$wgFileExtensions, [ 'png', 'jpg', 'jpeg', 'gif', 'webp' ] );
\$wgGroupPermissions['user']['upload'] = true;
\$wgGroupPermissions['user']['reupload'] = true;
// Let anonymous visitors upload too, purely to make manual testing easy.
\$wgGroupPermissions['*']['upload'] = true;
\$wgGroupPermissions['*']['edit'] = true;

wfLoadExtension( 'ScreenshotUpload' );
// Optional tuning:
// \$wgScreenshotUploadFilenamePrefix = 'Screenshot';
// \$wgScreenshotUploadMaxSize = 10 * 1024 * 1024;
// \$wgScreenshotUploadEnableOnEdit = true;
PHP
fi

chown -R www-data:www-data /var/www/html/images "$SQLITE_DIR" || true

echo ">> MediaWiki ready at $SERVER (admin: $ADMIN_USER / $ADMIN_PASS)"
exec "$@"
