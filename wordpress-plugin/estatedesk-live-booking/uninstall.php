<?php
defined('WP_UNINSTALL_PLUGIN') || exit;
delete_option('edlb_settings');
wp_clear_scheduled_hook('edlb_sync_default_project');
