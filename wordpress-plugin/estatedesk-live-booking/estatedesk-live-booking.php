<?php
/**
 * Plugin Name: EstateDesk Live Booking
 * Description: Shows live EstateDesk CRM plot availability on WordPress and sends booking requests to the CRM approval queue.
 * Version: 1.1.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: EstateDesk
 * License: GPL-2.0-or-later
 * Text Domain: estatedesk-live-booking
 */

defined('ABSPATH') || exit;

final class EstateDesk_Live_Booking {
    const VERSION = '1.1.0';
    const OPTION = 'edlb_settings';
    const CRON_HOOK = 'edlb_sync_default_project';

    public function __construct() {
        add_action('init', array($this, 'register_shortcode'));
        add_action('rest_api_init', array($this, 'register_routes'));
        add_action('admin_menu', array($this, 'add_settings_page'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action(self::CRON_HOOK, array($this, 'sync_default_project'));
    }

    public static function activate() {
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time() + MINUTE_IN_SECONDS, 'hourly', self::CRON_HOOK);
        }
    }

    public static function deactivate() {
        wp_clear_scheduled_hook(self::CRON_HOOK);
    }

    public function register_shortcode() {
        add_shortcode('estatedesk_live_booking', array($this, 'render_shortcode'));
    }

    public function register_routes() {
        register_rest_route('estatedesk-live-booking/v1', '/inventory/(?P<project_id>[a-f0-9-]{36})', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($this, 'get_inventory'),
            'permission_callback' => '__return_true',
            'args' => array('project_id' => array('required' => true)),
        ));
        register_rest_route('estatedesk-live-booking/v1', '/booking', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'submit_booking'),
            'permission_callback' => '__return_true',
        ));
    }

    public function add_settings_page() {
        add_options_page('EstateDesk Live Booking', 'EstateDesk Live Booking', 'manage_options', 'estatedesk-live-booking', array($this, 'settings_page'));
    }

    public function register_settings() {
        register_setting('edlb_settings_group', self::OPTION, array($this, 'sanitize_settings'));
        add_settings_section('edlb_connection', 'CRM connection', function () {
            echo '<p>The WordPress server securely reads public inventory from your EstateDesk CRM. Do not enter JWT or database credentials here.</p>';
        }, 'estatedesk-live-booking');
        add_settings_field('api_base_url', 'CRM API origin', array($this, 'api_url_field'), 'estatedesk-live-booking', 'edlb_connection');
        add_settings_field('default_project_id', 'Default project UUID', array($this, 'project_id_field'), 'estatedesk-live-booking', 'edlb_connection');
    }

    public function sanitize_settings($input) {
        $settings = array();
        $url = isset($input['api_base_url']) ? esc_url_raw(trim($input['api_base_url'])) : '';
        if ($url && !wp_http_validate_url($url)) {
            add_settings_error(self::OPTION, 'invalid_api_url', 'Enter a valid HTTP or HTTPS CRM origin.');
            $url = '';
        }
        $settings['api_base_url'] = untrailingslashit($url);
        $project_id = isset($input['default_project_id']) ? sanitize_text_field($input['default_project_id']) : '';
        $settings['default_project_id'] = preg_match('/^[a-f0-9-]{36}$/i', $project_id) ? $project_id : '';
        return $settings;
    }

    public function api_url_field() {
        $settings = $this->settings();
        printf('<input class="regular-text code" type="url" name="%1$s[api_base_url]" value="%2$s" placeholder="https://crm.example.com" />', esc_attr(self::OPTION), esc_attr($settings['api_base_url']));
    }

    public function project_id_field() {
        $settings = $this->settings();
        printf('<input class="regular-text code" type="text" name="%1$s[default_project_id]" value="%2$s" placeholder="CRM project UUID" />', esc_attr(self::OPTION), esc_attr($settings['default_project_id']));
        echo '<p class="description">Copy the project ID from the CRM API or provide a project_id attribute in the shortcode.</p>';
    }

    public function settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        echo '<div class="wrap"><h1>EstateDesk Live Booking</h1><form action="options.php" method="post">';
        settings_fields('edlb_settings_group');
        do_settings_sections('estatedesk-live-booking');
        submit_button('Save connection');
        echo '</form><hr><h2>Use on a page</h2><p>Add <code>[estatedesk_live_booking]</code>. To embed a specific project, use <code>[estatedesk_live_booking project_id="PROJECT-UUID"]</code>.</p></div>';
    }

    public function render_shortcode($attributes) {
        $attributes = shortcode_atts(array('project_id' => '', 'title' => 'Live plot availability'), $attributes, 'estatedesk_live_booking');
        $settings = $this->settings();
        $project_id = preg_match('/^[a-f0-9-]{36}$/i', $attributes['project_id']) ? $attributes['project_id'] : $settings['default_project_id'];
        $this->enqueue_assets();
        $widget_id = 'edlb-' . wp_generate_uuid4();
        ob_start();
        ?>
        <section id="<?php echo esc_attr($widget_id); ?>" class="edlb-widget" data-project-id="<?php echo esc_attr($project_id); ?>">
            <header class="edlb-heading"><div><p>ESTATEDESK LIVE INVENTORY</p><h2><?php echo esc_html($attributes['title']); ?></h2><span class="edlb-updated">Connecting to CRM…</span></div><span class="edlb-live"><i></i>Live status</span></header>
            <div class="edlb-error" role="alert" hidden></div>
            <div class="edlb-summary" hidden><div><small>PROJECT</small><strong data-edlb-project></strong><span data-edlb-location></span></div><div><b data-edlb-available>0</b><small>Available</small></div><div><b data-edlb-total>0</b><small>Total plots</small></div></div>
            <div class="edlb-grid" hidden><div class="edlb-card"><h3>Published plot map</h3><div class="edlb-map-wrap"><svg data-edlb-map viewBox="0 0 1000 650" role="img" aria-label="Live plot availability map"></svg><div class="edlb-tooltip" data-edlb-tooltip role="tooltip" hidden></div></div><div class="edlb-legend"><span><i class="available"></i>Available</span><span><i class="hold"></i>On hold</span><span><i class="pending"></i>Pending</span><span><i class="booked"></i>Booked</span></div></div><aside class="edlb-card edlb-detail" data-edlb-detail><h3>Select a plot</h3><p>Choose a plot on the map or in the register to review its current status.</p></aside></div>
            <div class="edlb-card edlb-register" hidden><div><h3>Plot register</h3><input data-edlb-search type="search" placeholder="Search plot number" aria-label="Search plot number"></div><div data-edlb-plots></div></div>
            <dialog class="edlb-dialog" data-edlb-dialog><form data-edlb-booking-form method="dialog"><button class="edlb-close" type="button" data-edlb-close aria-label="Close">×</button><h3>Request this plot</h3><p data-edlb-booking-plot></p><label>Full name<input name="name" maxlength="150" required></label><label>Mobile number<input name="mobile" inputmode="tel" maxlength="20" required></label><label>Email address (optional)<input name="email" type="email" maxlength="255"></label><label>Message (optional)<textarea name="message" maxlength="1000"></textarea></label><label class="edlb-consent"><input name="consent" type="checkbox" required> I agree that the project team may contact me about this non-binding request.</label><input class="edlb-honeypot" name="website" tabindex="-1" autocomplete="off"><p data-edlb-form-error role="alert"></p><button class="edlb-action" type="submit">Send booking request</button></form></dialog>
        </section>
        <?php
        return ob_get_clean();
    }

    private function enqueue_assets() {
        wp_enqueue_style('edlb-live-booking', plugin_dir_url(__FILE__) . 'assets/live-booking.css', array(), self::VERSION);
        wp_enqueue_script('edlb-live-booking', plugin_dir_url(__FILE__) . 'assets/live-booking.js', array(), self::VERSION, true);
        wp_add_inline_script('edlb-live-booking', 'window.EDLB = ' . wp_json_encode(array('restUrl' => esc_url_raw(rest_url('estatedesk-live-booking/v1/')), 'apiOrigin' => esc_url_raw($this->settings()['api_base_url']))) . ';', 'before');
    }

    public function get_inventory(WP_REST_Request $request) {
        $snapshot = $this->inventory($request['project_id'], $request->get_param('refresh') === '1');
        return is_wp_error($snapshot) ? $snapshot : rest_ensure_response($snapshot);
    }

    public function submit_booking(WP_REST_Request $request) {
        $body = (array) $request->get_json_params();
        $project_id = sanitize_text_field($body['project_id'] ?? '');
        $plot_id = sanitize_text_field($body['plot_id'] ?? '');
        $customer = isset($body['customer']) && is_array($body['customer']) ? $body['customer'] : array();
        $name = sanitize_text_field($customer['name'] ?? '');
        $mobile = sanitize_text_field($customer['mobile'] ?? '');
        $email = sanitize_email($customer['email'] ?? '');
        if (!preg_match('/^[a-f0-9-]{36}$/i', $project_id) || !preg_match('/^[a-f0-9-]{36}$/i', $plot_id) || !$name || !preg_match('/^[+()\d\s-]{7,20}$/', $mobile) || ($email && !is_email($email)) || empty($body['consent']) || !empty($body['website'])) {
            return new WP_Error('edlb_invalid_request', 'Please complete the required booking details.', array('status' => 400));
        }
        $rate_key = 'edlb_rate_' . md5($this->client_ip());
        $attempts = (int) get_transient($rate_key);
        if ($attempts >= 8) {
            return new WP_Error('edlb_rate_limited', 'Please wait before sending another request.', array('status' => 429));
        }
        set_transient($rate_key, $attempts + 1, 15 * MINUTE_IN_SECONDS);
        $payload = array('project_id' => $project_id, 'plot_id' => $plot_id, 'customer' => array('name' => $name, 'mobile' => $mobile, 'email' => $email), 'message' => sanitize_textarea_field($body['message'] ?? ''), 'consent' => true, 'website' => '');
        return $this->remote_post('/api/v1/public/booking-requests', $payload);
    }

    public function sync_default_project() {
        $project_id = $this->settings()['default_project_id'];
        if ($project_id) {
            $this->inventory($project_id, true);
        }
    }

    private function inventory($project_id, $refresh = false) {
        if (!preg_match('/^[a-f0-9-]{36}$/i', $project_id)) {
            return new WP_Error('edlb_project_required', 'A valid CRM project ID is required.', array('status' => 400));
        }
        $cache_key = 'edlb_inventory_' . md5($project_id);
        if (!$refresh && ($cached = get_transient($cache_key))) {
            return $cached;
        }
        $project = $this->remote_get('/api/v1/public/projects/' . rawurlencode($project_id));
        $plots = $this->remote_get('/api/v1/public/projects/' . rawurlencode($project_id) . '/plots');
        $layout = $this->remote_get('/api/v1/public/projects/' . rawurlencode($project_id) . '/layout');
        foreach (array($project, $plots, $layout) as $result) {
            if (is_wp_error($result)) {
                return $result;
            }
        }
        $snapshot = array('project' => $project, 'inventory' => $plots, 'layout' => $layout, 'synced_at' => gmdate('c'));
        set_transient($cache_key, $snapshot, 10);
        return $snapshot;
    }

    private function remote_get($path) {
        $response = wp_safe_remote_get($this->api_url($path), array('timeout' => 12, 'headers' => array('Accept' => 'application/json')));
        return $this->parse_remote_response($response);
    }

    private function remote_post($path, $payload) {
        $response = wp_safe_remote_post($this->api_url($path), array('timeout' => 12, 'headers' => array('Content-Type' => 'application/json', 'Accept' => 'application/json'), 'body' => wp_json_encode($payload)));
        return $this->parse_remote_response($response);
    }

    private function parse_remote_response($response) {
        if (is_wp_error($response)) {
            return new WP_Error('edlb_crm_unavailable', 'The CRM is temporarily unavailable. Please try again shortly.', array('status' => 503));
        }
        $body = json_decode(wp_remote_retrieve_body($response), true);
        $status = (int) wp_remote_retrieve_response_code($response);
        if ($status < 200 || $status >= 300 || !is_array($body) || empty($body['success'])) {
            $message = is_array($body) && !empty($body['error']['message']) ? sanitize_text_field($body['error']['message']) : 'The CRM could not complete this request.';
            return new WP_Error('edlb_crm_error', $message, array('status' => $status ?: 502));
        }
        return $body['data'];
    }

    private function api_url($path) {
        $base = $this->settings()['api_base_url'];
        return $base ? $base . '/' . ltrim($path, '/') : '';
    }

    private function settings() {
        return wp_parse_args((array) get_option(self::OPTION, array()), array('api_base_url' => '', 'default_project_id' => ''));
    }

    private function client_ip() {
        return isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : 'unknown';
    }
}

register_activation_hook(__FILE__, array('EstateDesk_Live_Booking', 'activate'));
register_deactivation_hook(__FILE__, array('EstateDesk_Live_Booking', 'deactivate'));
new EstateDesk_Live_Booking();
