/*!
 * ScreenshotUpload — wikitext editor enhancement.
 *
 * Paste a screenshot while editing a page: it is opened in the crop & annotate
 * editor, then handled according to $wgScreenshotUploadEditMode:
 *
 *   'form' (default) — a [[File:…]] tag is inserted at the cursor and the
 *                      upload page is opened in a new tab with the image
 *                      already loaded, so the user completes the normal upload.
 *   'api'            — the image is uploaded silently through the API and the
 *                      [[File:…]] tag is inserted at the cursor.
 *
 * @license GPL-2.0-or-later
 */
( function () {
	'use strict';

	$( function () {
		var su = mw.screenshotUpload;
		var $textbox = $( '#wpTextbox1' );
		if ( !$textbox.length ) {
			return;
		}

		var fileNs = mw.config.get( 'wgFormattedNamespaces' )[ 6 ];

		function notify( msg, type, sticky ) {
			mw.notify( msg, {
				type: type,
				tag: 'screenshotupload',
				autoHide: !sticky
			} );
		}

		function insertTag( filename ) {
			$textbox.textSelection( 'encapsulateSelection', {
				pre: '[[' + fileNs + ':' + filename + ']]\n',
				peri: '',
				post: ''
			} );
		}

		function handle( file ) {
			var err = su.validate( file );
			if ( err ) {
				notify( err, 'error' );
				return;
			}
			su.annotate( file ).then( dispatch ).catch ( function ( reason ) {
				if ( reason !== 'cancel' ) {
					notify( mw.msg( 'screenshotupload-editor-failed', String( reason ) ), 'error', true );
				}
			} );
		}

		function dispatch( file ) {
			var mode = mw.config.get( 'wgScreenshotUploadEditMode' ) || 'form';
			if ( mode === 'api' ) {
				uploadViaApi( file );
			} else {
				viaUploadForm( file );
			}
		}

		/* ---- 'form' mode: insert tag + open the upload page --------------- */

		function viaUploadForm( file ) {
			var filename = file.name || su.generateFilename( file );

			// Insert the tag first and unconditionally, so the wikitext always
			// gets the [[File:…]] link even if stashing or the popup fails.
			insertTag( filename );

			var url = mw.util.getUrl( 'Special:Upload', { wpDestFile: filename } );

			function openUpload() {
				var win = window.open( url, '_blank' );
				if ( win ) {
					notify( mw.msg( 'screenshotupload-editor-form-hint' ), 'success' );
				} else {
					// Popup blocked — offer a link the user can click instead.
					var $link = $( '<a>' )
						.attr( { href: url, target: '_blank' } )
						.text( mw.msg( 'screenshotupload-editor-openupload' ) );
					mw.notify( $link, {
						type: 'warn',
						tag: 'screenshotupload',
						autoHide: false
					} );
				}
			}

			// Stash the image for the upload page to pick up; open it either way.
			su.stashScreenshot( file ).then( openUpload, openUpload );
		}

		/* ---- 'api' mode: silent upload + insert tag ---------------------- */

		function uploadViaApi( file ) {
			var api = new mw.Api();
			var filename = file.name || su.generateFilename( file );
			notify( mw.msg( 'screenshotupload-editor-uploading' ), 'info', true );
			doUpload( api, file, filename, false );
		}

		function doUpload( api, file, filename, retried ) {
			api.upload( file, {
				filename: filename,
				comment: mw.msg( 'screenshotupload-editor-comment' )
			} ).done( function ( result ) {
				insertTag( result.upload.filename || filename );
				notify( mw.msg( 'screenshotupload-editor-success' ), 'success' );
			} ).fail ( function ( code, data ) {
				if ( !retried && ( code === 'fileexists-no-change' || code === 'exists' ||
					code === 'was-deleted' || code === 'duplicate' ||
					code === 'verification-error' ) ) {
					var dot = filename.lastIndexOf( '.' );
					var rand = '-' + Math.random().toString( 36 ).slice( 2, 7 );
					var unique = dot > 0 ?
						filename.slice( 0, dot ) + rand + filename.slice( dot ) :
						filename + rand;
					notify( mw.msg( 'screenshotupload-editor-exists' ), 'warn' );
					doUpload( api, file, unique, true );
					return;
				}
				var info = ( data && data.error && data.error.info ) || code || 'unknown';
				notify( mw.msg( 'screenshotupload-editor-failed', info ), 'error', true );
			} );
		}

		/* ---- Event wiring ------------------------------------------------ */

		$textbox[ 0 ].addEventListener( 'paste', function ( e ) {
			var file = su.getImageFromDataTransfer( e.clipboardData );
			if ( file ) {
				e.preventDefault();
				handle( file );
			}
		} );

		$textbox[ 0 ].addEventListener( 'dragover', function ( e ) {
			if ( e.dataTransfer &&
				Array.prototype.indexOf.call( e.dataTransfer.types || [], 'Files' ) !== -1 ) {
				e.preventDefault();
			}
		} );
		$textbox[ 0 ].addEventListener( 'drop', function ( e ) {
			var file = su.getImageFromDataTransfer( e.dataTransfer );
			if ( file ) {
				e.preventDefault();
				handle( file );
			}
		} );
	} );

}() );
