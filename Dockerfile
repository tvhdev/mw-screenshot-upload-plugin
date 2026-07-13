# Test image for the ScreenshotUpload extension on the current MediaWiki LTS.
FROM mediawiki:1.43

# Drop the extension into place.
COPY extension.json /var/www/html/extensions/ScreenshotUpload/extension.json
COPY src/           /var/www/html/extensions/ScreenshotUpload/src/
COPY resources/     /var/www/html/extensions/ScreenshotUpload/resources/
COPY i18n/          /var/www/html/extensions/ScreenshotUpload/i18n/

# Entrypoint installs the wiki (SQLite) on first run and enables the extension.
COPY docker/entrypoint.sh /usr/local/bin/su-entrypoint.sh
RUN chmod +x /usr/local/bin/su-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/su-entrypoint.sh"]
CMD ["apache2-foreground"]
