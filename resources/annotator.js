/*!
 * ScreenshotUpload — crop & annotate editor.
 *
 * Opens a modal over an image File and lets the user crop it and draw
 * annotations (rectangle, ellipse, arrow, freehand pen, text) before the
 * screenshot is handed back for uploading.
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

	/**
	 * @param {File} file Source image file.
	 * @return {jQuery.Promise} Resolves with an edited File.
	 */
	su.annotate = function ( file ) {
		var deferred = $.Deferred();

		var img = new Image();
		var objectUrl = URL.createObjectURL( file );

		img.onload = function () {
			URL.revokeObjectURL( objectUrl );
			try {
				new Editor( img, file, deferred );
			} catch ( e ) {
				deferred.reject( e );
			}
		};
		img.onerror = function () {
			URL.revokeObjectURL( objectUrl );
			deferred.reject( new Error( 'load-failed' ) );
		};
		img.src = objectUrl;

		return deferred.promise();
	};

	/**
	 * The editor instance. One per open modal.
	 *
	 * @constructor
	 * @param {HTMLImageElement} img
	 * @param {File} sourceFile
	 * @param {jQuery.Deferred} deferred
	 */
	function Editor( img, sourceFile, deferred ) {
		this.img = img;
		this.sourceFile = sourceFile;
		this.deferred = deferred;

		// Crop rectangle in natural image coordinates.
		this.crop = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
		// Committed annotation shapes (natural image coordinates).
		this.shapes = [];
		// Undo history: snapshots of { crop, shapes }.
		this.history = [];

		this.tool = 'rectangle';
		this.color = '#e53935';
		this.width = Math.max( 2, Math.round( img.naturalWidth / 400 ) );

		// Interaction state.
		this.drawing = false;
		this.start = null;
		this.previewShape = null;
		this.pendingCrop = null;

		this.build();
		this.render();
	}

	/* ---- UI construction ------------------------------------------------ */

	Editor.prototype.build = function () {
		var self = this;

		this.$overlay = $( '<div>' ).addClass( 'su-overlay' );
		this.$modal = $( '<div>' ).addClass( 'su-modal' ).appendTo( this.$overlay );

		// Title bar.
		$( '<div>' ).addClass( 'su-titlebar' )
			.text( mw.msg( 'screenshotupload-annotator-title' ) )
			.appendTo( this.$modal );

		// Toolbar.
		this.$toolbar = $( '<div>' ).addClass( 'su-toolbar' ).appendTo( this.$modal );

		var tools = [
			{ id: 'crop', msg: 'screenshotupload-tool-crop' },
			{ id: 'rectangle', msg: 'screenshotupload-tool-rectangle' },
			{ id: 'ellipse', msg: 'screenshotupload-tool-ellipse' },
			{ id: 'arrow', msg: 'screenshotupload-tool-arrow' },
			{ id: 'pen', msg: 'screenshotupload-tool-pen' },
			{ id: 'text', msg: 'screenshotupload-tool-text' }
		];
		this.$toolButtons = {};
		tools.forEach( function ( t ) {
			var $b = $( '<button>' )
				.attr( 'type', 'button' )
				.addClass( 'su-tool' )
				.text( mw.msg( t.msg ) )
				.on( 'click', function () {
					self.setTool( t.id );
				} );
			self.$toolButtons[ t.id ] = $b;
			self.$toolbar.append( $b );
		} );

		// Colour picker.
		this.$color = $( '<input>' )
			.attr( { type: 'color', title: mw.msg( 'screenshotupload-tool-color' ) } )
			.val( this.color )
			.addClass( 'su-color' )
			.on( 'input change', function () {
				self.color = this.value;
			} );
		this.$toolbar.append( this.$color );

		// Stroke width.
		this.$width = $( '<input>' )
			.attr( {
				type: 'range', min: 1, max: 40, step: 1,
				title: mw.msg( 'screenshotupload-tool-width' )
			} )
			.val( this.width )
			.addClass( 'su-width' )
			.on( 'input change', function () {
				self.width = parseInt( this.value, 10 );
			} );
		this.$toolbar.append( this.$width );

		// Undo.
		$( '<button>' ).attr( 'type', 'button' )
			.addClass( 'su-tool su-undo' )
			.text( mw.msg( 'screenshotupload-action-undo' ) )
			.on( 'click', function () {
				self.undo();
			} )
			.appendTo( this.$toolbar );

		// Crop apply / cancel controls (hidden unless cropping).
		this.$cropControls = $( '<span>' ).addClass( 'su-crop-controls' ).appendTo( this.$toolbar );
		$( '<button>' ).attr( 'type', 'button' ).addClass( 'su-tool su-crop-apply' )
			.text( mw.msg( 'screenshotupload-tool-crop-apply' ) )
			.on( 'click', function () {
				self.applyCrop();
			} )
			.appendTo( this.$cropControls );
		$( '<button>' ).attr( 'type', 'button' ).addClass( 'su-tool su-crop-cancel' )
			.text( mw.msg( 'screenshotupload-tool-crop-cancel' ) )
			.on( 'click', function () {
				self.pendingCrop = null;
				self.setTool( 'rectangle' );
			} )
			.appendTo( this.$cropControls );

		// Canvas + inline text-entry layer.
		this.$stage = $( '<div>' ).addClass( 'su-stage' ).appendTo( this.$modal );
		this.canvas = document.createElement( 'canvas' );
		this.$canvas = $( this.canvas ).addClass( 'su-canvas' ).appendTo( this.$stage );
		this.ctx = this.canvas.getContext( '2d' );

		this.$canvas
			.on( 'pointerdown', function ( e ) {
				self.onPointerDown( e.originalEvent );
			} )
			.on( 'pointermove', function ( e ) {
				self.onPointerMove( e.originalEvent );
			} )
			.on( 'pointerup pointercancel', function ( e ) {
				self.onPointerUp( e.originalEvent );
			} );

		// Footer actions.
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

		// Close on Escape / backdrop click.
		this.keyHandler = function ( e ) {
			if ( e.key === 'Escape' && !self.$stage.find( '.su-text-input' ).length ) {
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
		this.setTool( this.tool );
	};

	/* ---- Tool handling -------------------------------------------------- */

	Editor.prototype.setTool = function ( id ) {
		this.tool = id;
		this.pendingCrop = null;
		$.each( this.$toolButtons, function ( key, $b ) {
			$b.toggleClass( 'su-active', key === id );
		} );
		this.$cropControls.toggle( id === 'crop' );
		this.render();
	};

	Editor.prototype.pushHistory = function () {
		this.history.push( {
			crop: $.extend( {}, this.crop ),
			shapes: this.shapes.slice()
		} );
		if ( this.history.length > 50 ) {
			this.history.shift();
		}
	};

	Editor.prototype.undo = function () {
		if ( !this.history.length ) {
			return;
		}
		var prev = this.history.pop();
		this.crop = prev.crop;
		this.shapes = prev.shapes;
		this.pendingCrop = null;
		this.render();
	};

	/* ---- Coordinate mapping --------------------------------------------- */

	// Convert a pointer event to natural-image coordinates.
	Editor.prototype.toImage = function ( ev ) {
		var rect = this.canvas.getBoundingClientRect();
		var scaleX = this.crop.w / rect.width;
		var scaleY = this.crop.h / rect.height;
		return {
			x: this.crop.x + ( ev.clientX - rect.left ) * scaleX,
			y: this.crop.y + ( ev.clientY - rect.top ) * scaleY
		};
	};

	/* ---- Pointer interaction -------------------------------------------- */

	Editor.prototype.onPointerDown = function ( ev ) {
		ev.preventDefault();
		if ( this.tool === 'text' ) {
			this.beginText( ev );
			return;
		}
		this.drawing = true;
		this.start = this.toImage( ev );
		if ( this.canvas.setPointerCapture ) {
			try {
				this.canvas.setPointerCapture( ev.pointerId );
			} catch ( e ) {}
		}
		if ( this.tool === 'pen' ) {
			this.previewShape = {
				type: 'pen', color: this.color, width: this.width,
				points: [ this.start ]
			};
		}
	};

	Editor.prototype.onPointerMove = function ( ev ) {
		if ( !this.drawing ) {
			return;
		}
		var p = this.toImage( ev );
		if ( this.tool === 'pen' ) {
			this.previewShape.points.push( p );
		} else if ( this.tool === 'crop' ) {
			this.pendingCrop = this.normRect( this.start, p );
		} else {
			this.previewShape = this.makeShape( this.start, p );
		}
		this.render();
	};

	Editor.prototype.onPointerUp = function ( ev ) {
		if ( !this.drawing ) {
			return;
		}
		this.drawing = false;
		var p = this.toImage( ev );

		if ( this.tool === 'crop' ) {
			this.pendingCrop = this.normRect( this.start, p );
			this.previewShape = null;
			this.render();
			return;
		}

		var shape = this.tool === 'pen' ? this.previewShape : this.makeShape( this.start, p );
		this.previewShape = null;

		// Ignore accidental zero-size clicks.
		if ( this.tool === 'pen' ) {
			if ( shape.points.length > 1 ) {
				this.pushHistory();
				this.shapes.push( shape );
			}
		} else if ( Math.abs( shape.x2 - shape.x1 ) > 2 || Math.abs( shape.y2 - shape.y1 ) > 2 ) {
			this.pushHistory();
			this.shapes.push( shape );
		}
		this.render();
	};

	Editor.prototype.makeShape = function ( a, b ) {
		return {
			type: this.tool,
			color: this.color,
			width: this.width,
			x1: a.x, y1: a.y, x2: b.x, y2: b.y
		};
	};

	Editor.prototype.normRect = function ( a, b ) {
		return {
			x: Math.min( a.x, b.x ),
			y: Math.min( a.y, b.y ),
			w: Math.abs( b.x - a.x ),
			h: Math.abs( b.y - a.y )
		};
	};

	/* ---- Text tool ------------------------------------------------------ */

	Editor.prototype.beginText = function ( ev ) {
		var self = this;
		var p = this.toImage( ev );
		var stageRect = this.$stage[ 0 ].getBoundingClientRect();

		var $input = $( '<input>' )
			.addClass( 'su-text-input' )
			.attr( 'placeholder', mw.msg( 'screenshotupload-text-placeholder' ) )
			.css( {
				left: ( ev.clientX - stageRect.left ) + 'px',
				top: ( ev.clientY - stageRect.top ) + 'px',
				color: this.color,
				fontSize: Math.max( 12, this.width * 6 ) + 'px'
			} );

		function commit() {
			var value = $input.val();
			$input.remove();
			if ( value ) {
				self.pushHistory();
				self.shapes.push( {
					type: 'text', color: self.color,
					size: Math.max( 12, self.width * 6 ),
					x1: p.x, y1: p.y, text: value
				} );
				self.render();
			}
		}

		$input.on( 'keydown', function ( e ) {
			if ( e.key === 'Enter' ) {
				commit();
			} else if ( e.key === 'Escape' ) {
				$input.remove();
			}
			e.stopPropagation();
		} ).on( 'blur', commit );

		this.$stage.append( $input );
		$input.trigger( 'focus' );
	};

	/* ---- Crop ----------------------------------------------------------- */

	Editor.prototype.applyCrop = function () {
		if ( !this.pendingCrop || this.pendingCrop.w < 4 || this.pendingCrop.h < 4 ) {
			return;
		}
		this.pushHistory();
		this.crop = {
			x: Math.round( this.pendingCrop.x ),
			y: Math.round( this.pendingCrop.y ),
			w: Math.round( this.pendingCrop.w ),
			h: Math.round( this.pendingCrop.h )
		};
		this.pendingCrop = null;
		this.setTool( 'rectangle' );
	};

	/* ---- Rendering ------------------------------------------------------ */

	Editor.prototype.render = function () {
		var c = this.crop;
		if ( this.canvas.width !== c.w || this.canvas.height !== c.h ) {
			this.canvas.width = c.w;
			this.canvas.height = c.h;
		}
		var ctx = this.ctx;
		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		ctx.clearRect( 0, 0, c.w, c.h );

		// Draw the (cropped) base image, translated so crop origin is 0,0.
		ctx.drawImage( this.img, -c.x, -c.y );

		var shapes = this.shapes.slice();
		if ( this.previewShape ) {
			shapes.push( this.previewShape );
		}
		for ( var i = 0; i < shapes.length; i++ ) {
			this.drawShape( ctx, shapes[ i ], c );
		}

		// Crop overlay preview.
		if ( this.tool === 'crop' && this.pendingCrop ) {
			this.drawCropOverlay( ctx, c );
		}
	};

	Editor.prototype.drawShape = function ( ctx, s, crop ) {
		ctx.save();
		ctx.translate( -crop.x, -crop.y );
		ctx.strokeStyle = s.color;
		ctx.fillStyle = s.color;
		ctx.lineWidth = s.width || 3;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		switch ( s.type ) {
			case 'rectangle':
				ctx.strokeRect( s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1 );
				break;
			case 'ellipse':
				ctx.beginPath();
				ctx.ellipse(
					( s.x1 + s.x2 ) / 2, ( s.y1 + s.y2 ) / 2,
					Math.abs( s.x2 - s.x1 ) / 2, Math.abs( s.y2 - s.y1 ) / 2,
					0, 0, 2 * Math.PI
				);
				ctx.stroke();
				break;
			case 'arrow':
				this.drawArrow( ctx, s );
				break;
			case 'pen':
				ctx.beginPath();
				ctx.moveTo( s.points[ 0 ].x, s.points[ 0 ].y );
				for ( var i = 1; i < s.points.length; i++ ) {
					ctx.lineTo( s.points[ i ].x, s.points[ i ].y );
				}
				ctx.stroke();
				break;
			case 'text':
				ctx.font = 'bold ' + s.size + 'px sans-serif';
				ctx.textBaseline = 'top';
				ctx.fillText( s.text, s.x1, s.y1 );
				break;
		}
		ctx.restore();
	};

	Editor.prototype.drawArrow = function ( ctx, s ) {
		var head = Math.max( 10, ( s.width || 3 ) * 3 );
		var angle = Math.atan2( s.y2 - s.y1, s.x2 - s.x1 );
		ctx.beginPath();
		ctx.moveTo( s.x1, s.y1 );
		ctx.lineTo( s.x2, s.y2 );
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo( s.x2, s.y2 );
		ctx.lineTo(
			s.x2 - head * Math.cos( angle - Math.PI / 6 ),
			s.y2 - head * Math.sin( angle - Math.PI / 6 )
		);
		ctx.lineTo(
			s.x2 - head * Math.cos( angle + Math.PI / 6 ),
			s.y2 - head * Math.sin( angle + Math.PI / 6 )
		);
		ctx.closePath();
		ctx.fill();
	};

	Editor.prototype.drawCropOverlay = function ( ctx, crop ) {
		var r = this.pendingCrop;
		ctx.save();
		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		// Dim everything outside the selection.
		ctx.fillStyle = 'rgba(0,0,0,0.45)';
		var sx = r.x - crop.x, sy = r.y - crop.y;
		ctx.beginPath();
		ctx.rect( 0, 0, crop.w, crop.h );
		ctx.rect( sx, sy, r.w, r.h );
		ctx.fill( 'evenodd' );
		// Selection border.
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 1;
		ctx.setLineDash( [ 6, 4 ] );
		ctx.strokeRect( sx + 0.5, sy + 0.5, r.w, r.h );
		ctx.restore();
	};

	/* ---- Export / lifecycle --------------------------------------------- */

	Editor.prototype.confirm = function () {
		var self = this;
		// Render a clean version without the crop overlay.
		this.pendingCrop = null;
		this.previewShape = null;
		this.render();

		var type = this.sourceFile.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
		this.canvas.toBlob( function ( blob ) {
			if ( !blob ) {
				self.deferred.reject( new Error( 'export-failed' ) );
				self.destroy();
				return;
			}
			var name = su.generateFilename( { type: type } );
			self.deferred.resolve( su.blobToFile( blob, name ) );
			self.destroy();
		}, type, 0.92 );
	};

	Editor.prototype.cancel = function () {
		this.deferred.reject( 'cancel' );
		this.destroy();
	};

	Editor.prototype.destroy = function () {
		document.removeEventListener( 'keydown', this.keyHandler );
		this.$overlay.remove();
	};

}() );
