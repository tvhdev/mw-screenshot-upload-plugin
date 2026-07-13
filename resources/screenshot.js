/*!
 * ScreenshotUpload — shared helpers.
 *
 * Extracts image data from clipboard/drag events, validates it and builds a
 * sensible destination filename. Exposes everything under
 * `mw.screenshotUpload`.
 *
 * @license GPL-2.0-or-later
 */
( function () {
	'use strict';

	var su = mw.screenshotUpload = mw.screenshotUpload || {};

	/**
	 * Pull the first image File out of a clipboard or drag-and-drop
	 * DataTransfer object.
	 *
	 * @param {DataTransfer} dataTransfer
	 * @return {File|null}
	 */
	su.getImageFromDataTransfer = function ( dataTransfer ) {
		if ( !dataTransfer ) {
			return null;
		}

		// Prefer items[] — this is where pasted (clipboard) images live.
		if ( dataTransfer.items && dataTransfer.items.length ) {
			for ( var i = 0; i < dataTransfer.items.length; i++ ) {
				var item = dataTransfer.items[ i ];
				if ( item.kind === 'file' && item.type.indexOf( 'image/' ) === 0 ) {
					var file = item.getAsFile();
					if ( file ) {
						return file;
					}
				}
			}
		}

		// Fall back to files[] — used by most drag-and-drop sources.
		if ( dataTransfer.files && dataTransfer.files.length ) {
			for ( var j = 0; j < dataTransfer.files.length; j++ ) {
				if ( dataTransfer.files[ j ].type.indexOf( 'image/' ) === 0 ) {
					return dataTransfer.files[ j ];
				}
			}
		}

		return null;
	};

	/**
	 * @param {File} file
	 * @return {string}
	 */
	su.extensionForType = function ( file ) {
		var map = {
			'image/png': 'png',
			'image/jpeg': 'jpg',
			'image/gif': 'gif',
			'image/webp': 'webp'
		};
		return map[ file.type ] || 'png';
	};

	/**
	 * Build a default, collision-resistant destination filename.
	 *
	 * @param {File} file
	 * @return {string} e.g. "Screenshot 2026-07-13 20-38-05.png"
	 */
	su.generateFilename = function ( file ) {
		var prefix = mw.config.get( 'wgScreenshotUploadFilenamePrefix' ) || 'Screenshot';
		var now = new Date();
		function pad( n ) {
			return ( n < 10 ? '0' : '' ) + n;
		}
		var stamp = now.getFullYear() + '-' + pad( now.getMonth() + 1 ) + '-' +
			pad( now.getDate() ) + ' ' + pad( now.getHours() ) + '-' +
			pad( now.getMinutes() ) + '-' + pad( now.getSeconds() );

		// Keep the filename friendly to MediaWiki's title rules.
		var name = ( prefix + ' ' + stamp ).replace( /[#<>[\]|{}/:]/g, '' );
		return name + '.' + su.extensionForType( file );
	};

	/**
	 * Validate that a File is an image within the configured size limit.
	 *
	 * @param {File} file
	 * @return {string|null} An error message key result, or null if valid.
	 */
	su.validate = function ( file ) {
		if ( !file || file.type.indexOf( 'image/' ) !== 0 ) {
			return mw.msg( 'screenshotupload-error-notimage' );
		}
		var max = mw.config.get( 'wgScreenshotUploadMaxSize' ) || 10485760;
		if ( file.size > max ) {
			return mw.msg( 'screenshotupload-error-toolarge',
				Math.round( max / 1048576 ) );
		}
		return null;
	};

	/**
	 * Wrap a Blob back into a File with the given name so it can be uploaded.
	 *
	 * @param {Blob} blob
	 * @param {string} filename
	 * @return {File}
	 */
	su.blobToFile = function ( blob, filename ) {
		try {
			return new File( [ blob ], filename, { type: blob.type } );
		} catch ( e ) {
			// Older engines: File constructor may be unavailable; patch a name on.
			blob.name = filename;
			return blob;
		}
	};

}() );
