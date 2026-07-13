/*!
 * ScreenshotUpload — Special:Upload enhancement.
 *
 * Adds a paste / drag-and-drop zone to the standard upload form. A pasted,
 * dropped or handed-over (from the editor) screenshot is opened in the crop &
 * annotate editor and shown in the form as normal.
 *
 * Because browsers do not reliably submit a file that JavaScript injects into a
 * file input (a security restriction — see
 * https://pqina.nl/blog/the-trouble-with-editing-and-uploading-files-in-the-browser),
 * we do NOT rely on the native form POST for the screenshot. Instead, when the
 * user submits the form, we intercept it and upload the screenshot
 * asynchronously through the MediaWiki API using the name/description/license
 * the user entered. The upload form itself is otherwise unchanged, so a normal
 * file chosen by the user still submits natively as usual.
 *
 * @license GPL-2.0-or-later
 */
( function () {
	'use strict';

	$( function () {
		var su = mw.screenshotUpload;
		var $fileInput = $( '#wpUploadFile' );
		if ( !$fileInput.length ) {
			return;
		}

		var $form = $fileInput.closest( 'form' );
		var fileNs = ( mw.config.get( 'wgFormattedNamespaces' ) || {} )[ 6 ] || 'File';

		// Build the drop zone and insert it above the file field.
		var $zone = $( '<div>' ).addClass( 'su-dropzone' );
		$( '<div>' ).addClass( 'su-dropzone-label' )
			.text( mw.msg( 'screenshotupload-dropzone-label' ) )
			.appendTo( $zone );
		$( '<div>' ).addClass( 'su-dropzone-hint' )
			.text( mw.msg( 'screenshotupload-dropzone-hint' ) )
			.appendTo( $zone );
		var $preview = $( '<img>' ).addClass( 'su-dropzone-preview' ).appendTo( $zone );

		var $anchor = $fileInput.closest( '.oo-ui-fieldLayout' );
		if ( !$anchor.length ) {
			$anchor = $fileInput;
		}
		$anchor.before( $zone );

		// The screenshot to upload on submit. Null once the user picks their
		// own file instead (then the form submits natively as normal).
		var pendingFile = null;

		function setInputFile( file ) {
			// Purely so MediaWiki's form shows its own preview / autofills the
			// destination name. The bytes are uploaded via the API, not this.
			try {
				var dt = new DataTransfer();
				dt.items.add( file );
				$fileInput[ 0 ].files = dt.files;
			} catch ( e ) {}
		}

		// A genuine user file choice (trusted event) cancels our screenshot so
		// their selection uploads normally. Our own synthetic change events are
		// untrusted and ignored here.
		$fileInput.on( 'change', function ( e ) {
			var oe = e.originalEvent || e;
			if ( oe && oe.isTrusted ) {
				pendingFile = null;
				$zone.removeClass( 'su-has-preview' );
				$preview.hide();
			}
		} );

		function showError( msg ) {
			mw.notify( msg, { type: 'error', tag: 'screenshotupload' } );
		}

		function handle( file ) {
			var err = su.validate( file );
			if ( err ) {
				showError( err );
				return;
			}
			su.annotate( file ).then( function ( edited ) {
				placeIntoForm( edited );
			} ).catch ( function ( reason ) {
				if ( reason !== 'cancel' ) {
					showError( mw.msg( 'screenshotupload-error-notimage' ) );
				}
			} );
		}

		function placeIntoForm( file ) {
			pendingFile = file;
			setInputFile( file );

			// Autofill the destination filename if the user has not set one.
			var $dest = $( '#wpDestFile' );
			if ( $dest.length && !$dest.val() ) {
				$dest.val( file.name );
			}

			// Show a thumbnail in the drop zone.
			var url = URL.createObjectURL( file );
			$preview.attr( 'src', url ).show();
			$zone.addClass( 'su-has-preview' );
		}

		// --- Upload the screenshot via the API on submit. ---------------------

		function buildPageText() {
			var desc = ( $( '#wpUploadDescription' ).val() || '' ).trim();
			var license = $( '#wpLicense' ).val() || '';
			var text = desc;
			if ( license ) {
				text += ( text ? '\n' : '' ) + '{{' + license + '}}';
			}
			return text;
		}

		function collectWarnings( result ) {
			var w = result && result.upload && result.upload.warnings;
			if ( !w ) {
				return null;
			}
			return Object.keys( w ).join( ', ' );
		}

		function apiUpload() {
			var filename = ( $( '#wpDestFile' ).val() || pendingFile.name ).trim();
			var ignore = $( '#wpIgnoreWarning' ).prop( 'checked' ) ? 1 : 0;
			var $watch = $( '#wpWatchthis' );
			var $submit = $form.find( '[name="wpUpload"]' );

			$submit.prop( 'disabled', true );
			mw.notify( mw.msg( 'screenshotupload-form-uploading' ),
				{ type: 'info', tag: 'screenshotupload', autoHide: false } );

			var params = {
				filename: filename,
				text: buildPageText(),
				comment: mw.msg( 'screenshotupload-editor-comment' ),
				ignorewarnings: ignore
			};
			if ( $watch.length ) {
				params.watchlist = $watch.prop( 'checked' ) ? 'watch' : 'preferences';
			}

			new mw.Api().upload( pendingFile, params ).then( function ( result ) {
				var warnings = collectWarnings( result );
				if ( warnings && !ignore ) {
					$submit.prop( 'disabled', false );
					mw.notify( mw.msg( 'screenshotupload-form-warning', warnings ),
						{ type: 'warn', tag: 'screenshotupload', autoHide: false } );
					return;
				}
				var uploaded = ( result.upload && result.upload.filename ) || filename;
				mw.notify( mw.msg( 'screenshotupload-form-uploaded' ),
					{ type: 'success', tag: 'screenshotupload' } );
				// Go to the file description page, like a normal upload does.
				window.location.href = mw.util.getUrl( fileNs + ':' + uploaded );
			}, function ( code, data ) {
				$submit.prop( 'disabled', false );
				var warnings = collectWarnings( data );
				if ( warnings ) {
					mw.notify( mw.msg( 'screenshotupload-form-warning', warnings ),
						{ type: 'warn', tag: 'screenshotupload', autoHide: false } );
					return;
				}
				var info = ( data && data.error && data.error.info ) || code || 'unknown';
				mw.notify( mw.msg( 'screenshotupload-form-failed', info ),
					{ type: 'error', tag: 'screenshotupload', autoHide: false } );
			} );
		}

		// Capture-phase listener so we intercept before MediaWiki's own submit
		// handlers and the native POST. Only when a screenshot is pending.
		$form[ 0 ].addEventListener( 'submit', function ( e ) {
			if ( pendingFile ) {
				e.preventDefault();
				e.stopImmediatePropagation();
				apiUpload();
			}
		}, true );

		// --- Paste anywhere on the upload page. ---
		document.addEventListener( 'paste', function ( e ) {
			var file = su.getImageFromDataTransfer( e.clipboardData );
			if ( file ) {
				e.preventDefault();
				handle( file );
			}
		} );

		// --- Drag & drop onto the zone. ---
		[ 'dragenter', 'dragover' ].forEach( function ( ev ) {
			$zone[ 0 ].addEventListener( ev, function ( e ) {
				e.preventDefault();
				e.stopPropagation();
				$zone.addClass( 'su-dragover' );
			} );
		} );
		[ 'dragleave', 'dragend' ].forEach( function ( ev ) {
			$zone[ 0 ].addEventListener( ev, function () {
				$zone.removeClass( 'su-dragover' );
			} );
		} );
		$zone[ 0 ].addEventListener( 'drop', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			$zone.removeClass( 'su-dragover' );
			var file = su.getImageFromDataTransfer( e.dataTransfer );
			if ( file ) {
				handle( file );
			} else {
				showError( mw.msg( 'screenshotupload-error-notimage' ) );
			}
		} );

		// --- Screenshot handed over from the editor's "form" mode. ---
		if ( su.takeScreenshot ) {
			su.takeScreenshot().then( function ( file ) {
				if ( file ) {
					placeIntoForm( file );
				}
			} ).catch ( function () {} );
		}
	} );

}() );
