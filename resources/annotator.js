/*!
 * ScreenshotUpload — crop & annotate editor (Toast UI Image Editor).
 *
 * Opens a modal over an image File and lets the user crop it and draw
 * annotations before the screenshot is handed back for uploading.
 *
 * Usage:
 *   mw.screenshotUpload.annotate( file ).then( function ( editedFile ) { ... } );
 *
 * The returned promise resolves with a new image File, or rejects if the
 * user cancels.
 *
 * @license GPL-2.0-or-later
 */
( function () {
	'use strict';

	var su = mw.screenshotUpload = mw.screenshotUpload || {};

	function dataURLToBlob( dataURL ) {
		var parts = dataURL.split( ',' );
		var mime = parts[ 0 ].match( /:(.*?);/ )[ 1 ];
		var binary = atob( parts[ 1 ] );
		var bytes = new Uint8Array( binary.length );
		for ( var i = 0; i < binary.length; i++ ) {
			bytes[ i ] = binary.charCodeAt( i );
		}
		return new Blob( [ bytes ], { type: mime } );
	}

	/**
	 * @param {File} file Source image file.
	 * @return {jQuery.Promise} Resolves with an edited File.
	 */
	su.annotate = function ( file ) {
		var deferred = $.Deferred();
		try {
			new Editor( file, deferred );
		} catch ( e ) {
			deferred.reject( e );
		}
		return deferred.promise();
	};

	/**
	 * @constructor
	 * @param {File} sourceFile
	 * @param {jQuery.Deferred} deferred
	 */
	function Editor( sourceFile, deferred ) {
		var self = this;

		this.sourceFile = sourceFile;
		this.deferred = deferred;
		this.objectUrl = URL.createObjectURL( sourceFile );

		this.$overlay = $( '<div>' ).addClass( 'su-overlay' );
		this.$modal = $( '<div>' ).addClass( 'su-modal su-modal-tui' ).appendTo( this.$overlay );

		$( '<div>' ).addClass( 'su-titlebar' )
			.text( mw.msg( 'screenshotupload-annotator-title' ) )
			.appendTo( this.$modal );

		this.$root = $( '<div>' ).addClass( 'su-tui-root' ).appendTo( this.$modal );

		var $footer = $( '<div>' ).addClass( 'su-footer' ).appendTo( this.$modal );
		$( '<button>' ).attr( 'type', 'button' ).addClass( 'su-btn su-btn-quiet' )
			.text( mw.msg( 'screenshotupload-action-cancel' ) )
			.on( 'click', function () {
				self.cancel();
			} )
			.appendTo( $footer );
		$( '<button>' ).attr( 'type', 'button' ).addClass( 'su-btn su-btn-primary' )
			.text( mw.msg( 'screenshotupload-action-confirm' ) )
			.on( 'click', function () {
				self.confirm();
			} )
			.appendTo( $footer );

		this.keyHandler = function ( e ) {
			var tag = ( document.activeElement && document.activeElement.tagName ) || '';
			if ( e.key === 'Escape' && tag !== 'INPUT' && tag !== 'TEXTAREA' ) {
				self.cancel();
			}
		};
		document.addEventListener( 'keydown', this.keyHandler );
		this.$overlay.on( 'pointerdown', function ( e ) {
			if ( e.target === self.$overlay[ 0 ] ) {
				self.cancel();
			}
		} );

		$( document.body ).append( this.$overlay );

		this.editor = new tui.ImageEditor( this.$root[ 0 ], {
			includeUI: {
				loadImage: {
					path: this.objectUrl,
					name: sourceFile.name || 'screenshot'
				},
				menu: [ 'crop', 'draw', 'shape', 'text', 'icon', 'flip', 'rotate' ],
				initMenu: '',
				menuBarPosition: 'bottom'
			},
			cssMaxWidth: Math.min( Math.round( window.innerWidth * 0.9 ), 1400 ),
			cssMaxHeight: Math.round( window.innerHeight * 0.68 ),
			usageStatistics: false
		} );
	}

	Editor.prototype.confirm = function () {
		var self = this;
		var format = this.sourceFile.type === 'image/jpeg' ? 'jpeg' : 'png';
		var dataURL = this.editor.toDataURL( { format: format, quality: 0.92 } );
		var blob = dataURLToBlob( dataURL );
		var name = su.generateFilename( { type: blob.type } );
		this.deferred.resolve( su.blobToFile( blob, name ) );
		self.destroy();
	};

	Editor.prototype.cancel = function () {
		this.deferred.reject( 'cancel' );
		this.destroy();
	};

	Editor.prototype.destroy = function () {
		document.removeEventListener( 'keydown', this.keyHandler );
		if ( this.editor ) {
			this.editor.destroy();
			this.editor = null;
		}
		URL.revokeObjectURL( this.objectUrl );
		this.$overlay.remove();
	};

}() );
