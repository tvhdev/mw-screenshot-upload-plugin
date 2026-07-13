<?php
/**
 * Hook handlers for the ScreenshotUpload extension.
 *
 * @file
 * @license GPL-2.0-or-later
 */

namespace MediaWiki\Extension\ScreenshotUpload;

use MediaWiki\Config\Config;
use MediaWiki\Hook\BeforePageDisplayHook;
use MediaWiki\ResourceLoader\Hook\ResourceLoaderGetConfigVarsHook;

/**
 * Adds the screenshot paste / drag-and-drop / annotate behaviour to
 * Special:Upload and, optionally, to the wikitext editor.
 */
class Hooks implements BeforePageDisplayHook, ResourceLoaderGetConfigVarsHook {

	/**
	 * Load the appropriate ResourceLoader module depending on the page.
	 *
	 * @param \OutputPage $out
	 * @param \Skin $skin
	 * @return void
	 */
	public function onBeforePageDisplay( $out, $skin ): void {
		$title = $out->getTitle();
		if ( $title === null ) {
			return;
		}

		// Enhance the standard upload form (Special:Upload).
		if ( $title->isSpecial( 'Upload' ) ) {
			$out->addModules( 'ext.screenshotUpload.upload' );
			return;
		}

		// Enhance the wikitext editor so screenshots can be pasted straight
		// into a page. Only when editing and only when the feature is enabled.
		if ( !$out->getConfig()->get( 'ScreenshotUploadEnableOnEdit' ) ) {
			return;
		}

		$action = $out->getActionName();
		if ( $action !== 'edit' && $action !== 'submit' ) {
			return;
		}

		// Only bother if the current user is actually allowed to upload.
		if ( !$out->getAuthority()->isAllowed( 'upload' ) ) {
			return;
		}

		$out->addModules( 'ext.screenshotUpload.editor' );
	}

	/**
	 * Expose configuration to client-side code.
	 *
	 * @param array &$vars
	 * @param string $skin
	 * @param Config $config
	 * @return void
	 */
	public function onResourceLoaderGetConfigVars( array &$vars, $skin, Config $config ): void {
		$vars['wgScreenshotUploadFilenamePrefix'] =
			$config->get( 'ScreenshotUploadFilenamePrefix' );
		$vars['wgScreenshotUploadMaxSize'] =
			$config->get( 'ScreenshotUploadMaxSize' );
		$vars['wgScreenshotUploadEditMode'] =
			$config->get( 'ScreenshotUploadEditMode' );
	}
}
