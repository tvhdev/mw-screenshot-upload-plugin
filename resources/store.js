/*!
 * ScreenshotUpload — hand-off store.
 *
 * Stashes a single pending screenshot (a Blob) in IndexedDB so it can be
 * handed from the edit page to the Special:Upload page across a navigation.
 * IndexedDB is used rather than localStorage because it stores Blobs directly,
 * with no data-URL bloat and no tight size limit.
 *
 * @license GPL-2.0-or-later
 */
( function () {
	'use strict';

	var su = mw.screenshotUpload = mw.screenshotUpload || {};

	var DB_NAME = 'screenshotUpload';
	var STORE_NAME = 'pending';
	var KEY = 'current';

	function openDb() {
		return new Promise( function ( resolve, reject ) {
			if ( !window.indexedDB ) {
				reject( new Error( 'no-indexeddb' ) );
				return;
			}
			var req = indexedDB.open( DB_NAME, 1 );
			req.onupgradeneeded = function () {
				req.result.createObjectStore( STORE_NAME );
			};
			req.onsuccess = function () {
				resolve( req.result );
			};
			req.onerror = function () {
				reject( req.error );
			};
		} );
	}

	/**
	 * Store a screenshot to be picked up on the upload page.
	 *
	 * @param {File} file
	 * @return {Promise}
	 */
	su.stashScreenshot = function ( file ) {
		return openDb().then( function ( db ) {
			return new Promise( function ( resolve, reject ) {
				var tx = db.transaction( STORE_NAME, 'readwrite' );
				tx.objectStore( STORE_NAME ).put( {
					blob: file,
					name: file.name,
					type: file.type
				}, KEY );
				tx.oncomplete = function () {
					db.close();
					resolve();
				};
				tx.onerror = function () {
					db.close();
					reject( tx.error );
				};
			} );
		} );
	};

	/**
	 * Retrieve and clear the pending screenshot, if any.
	 *
	 * @return {Promise<File|null>}
	 */
	su.takeScreenshot = function () {
		return openDb().then( function ( db ) {
			return new Promise( function ( resolve, reject ) {
				var tx = db.transaction( STORE_NAME, 'readwrite' );
				var store = tx.objectStore( STORE_NAME );
				var getReq = store.get( KEY );
				var record = null;
				getReq.onsuccess = function () {
					record = getReq.result || null;
					store.delete( KEY );
				};
				getReq.onerror = function () {
					reject( getReq.error );
				};
				tx.oncomplete = function () {
					db.close();
					if ( !record ) {
						resolve( null );
						return;
					}
					// Re-materialise into a fresh in-memory Blob. A Blob read
					// back from IndexedDB is disk-backed, and Firefox fails the
					// upload XHR / native submit for such a Blob after the page
					// navigation. Copying the bytes detaches it from IDB.
					record.blob.arrayBuffer().then( function ( buf ) {
						var fresh = new Blob( [ buf ], { type: record.type } );
						resolve( su.blobToFile( fresh, record.name ) );
					}, function () {
						resolve( su.blobToFile( record.blob, record.name ) );
					} );
				};
				tx.onerror = function () {
					db.close();
					reject( tx.error );
				};
			} );
		} );
	};

}() );
