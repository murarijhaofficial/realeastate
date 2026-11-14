<?php
/**
 * Plugin Name: Nestoria Property Projects
 * Description: Property project listings, responsive project detail pages, and booking/enquiry management with email and WhatsApp integration.
 * Version: 2.3.1
 * Author: Custom Website Plugin
 * Text Domain: nestoria-property-projects
 */

if (!defined('ABSPATH')) { exit; }

final class NPP_Nestoria_Property_Projects {
    const VERSION = '2.3.1';
    const PROJECT = 'npp_project';
    const LEAD = 'npp_lead';
    const NONCE_ACTION = 'npp_submit_enquiry';

    public function __construct() {
        add_action('init', [$this, 'register_post_types']);
        add_action('add_meta_boxes', [$this, 'add_project_meta_boxes']);
        add_action('save_post_' . self::PROJECT, [$this, 'save_project_meta'], 10, 2);
        add_action('admin_menu', [$this, 'admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('wp_enqueue_scripts', [$this, 'register_assets']);
        add_filter('template_include', [$this, 'archive_template']);
        add_action('admin_enqueue_scripts', [$this, 'admin_assets']);
        add_shortcode('property_projects', [$this, 'projects_shortcode']);
        add_shortcode('khushii_project_showcase', [$this, 'showcase_shortcode']);
        add_shortcode('property_project', [$this, 'single_project_shortcode']);
        add_shortcode('property_booking_form', [$this, 'booking_shortcode']);
        add_action('wp_ajax_npp_submit_enquiry', [$this, 'handle_enquiry']);
        add_action('wp_ajax_nopriv_npp_submit_enquiry', [$this, 'handle_enquiry']);
        add_filter('the_content', [$this, 'append_project_layout']);
        add_filter('manage_' . self::LEAD . '_posts_columns', [$this, 'lead_columns']);
        add_action('manage_' . self::LEAD . '_posts_custom_column', [$this, 'lead_column_content'], 10, 2);
        add_filter('manage_edit-' . self::LEAD . '_sortable_columns', [$this, 'lead_sortable_columns']);
    }

    public static function activate() {
        $plugin = new self();
        $plugin->register_post_types();
        flush_rewrite_rules();
    }

    public static function deactivate() {
        flush_rewrite_rules();
    }

    public function register_post_types() {
        register_post_type(self::PROJECT, [
            'labels' => [
                'name' => 'Property Projects', 'singular_name' => 'Property Project',
                'add_new_item' => 'Add New Project', 'edit_item' => 'Edit Project',
                'menu_name' => 'Property Projects'
            ],
            'public' => true, 'show_in_rest' => true, 'has_archive' => true,
            'rewrite' => ['slug' => 'projects'], 'menu_icon' => 'dashicons-building',
            'supports' => ['title', 'editor', 'thumbnail', 'excerpt', 'page-attributes'],
        ]);
        register_post_type(self::LEAD, [
            'labels' => ['name' => 'Property Enquiries', 'singular_name' => 'Property Enquiry', 'menu_name' => 'Property Enquiries'],
            'public' => false, 'show_ui' => true, 'show_in_menu' => 'edit.php?post_type=' . self::PROJECT,
            'supports' => ['title'], 'capability_type' => 'post', 'map_meta_cap' => true,
        ]);
    }

    public function add_project_meta_boxes() {
        add_meta_box('npp_project_details', 'Project Information', [$this, 'project_details_box'], self::PROJECT, 'normal', 'high');
        add_meta_box('npp_plot_availability', 'Visual Plot Availability & Master Plan', [$this, 'plot_availability_box'], self::PROJECT, 'normal', 'default');
        add_meta_box('npp_project_gallery', 'Project Gallery', [$this, 'project_gallery_box'], self::PROJECT, 'normal', 'default');
    }

    public function project_details_box($post) {
        wp_nonce_field('npp_save_project', 'npp_project_nonce');
        $fields = [
            'tagline' => ['Short description', 'text'],
            'category' => ['Project category (e.g. Residential Plots)', 'text'],
            'status' => ['Project status (e.g. Running Project (2026))', 'text'],
            'title_guarantee' => ['Title guarantee (e.g. 100% Clear Title)', 'text'],
            'location' => ['Project location', 'text'],
            'price' => ['Starting price / price range', 'text'],
            'plot_sizes' => ['Plot sizes', 'text'],
            'approval' => ['Approval details', 'text'],
            'possession' => ['Possession / registry', 'text'],
            'availability' => ['Availability', 'text'],
            'whatsapp' => ['WhatsApp number (digits with country code)', 'text'],
            'brochure_url' => ['Brochure URL', 'url'],
            'map_url' => ['Google Maps URL', 'url'],
            'highlights' => ['Project highlights (one per line)', 'textarea'],
        ];
        echo '<table class="form-table"><tbody>';
        foreach ($fields as $key => $info) {
            $value = get_post_meta($post->ID, '_npp_' . $key, true);
            echo '<tr><th><label for="npp_' . esc_attr($key) . '">' . esc_html($info[0]) . '</label></th><td>';
            if ($info[1] === 'textarea') {
                echo '<textarea class="large-text" rows="4" id="npp_' . esc_attr($key) . '" name="npp_' . esc_attr($key) . '">' . esc_textarea($value) . '</textarea>';
            } else {
                echo '<input class="regular-text" type="' . esc_attr($info[1]) . '" id="npp_' . esc_attr($key) . '" name="npp_' . esc_attr($key) . '" value="' . esc_attr($value) . '">';
            }
            echo '</td></tr>';
        }
        echo '</tbody></table><p class="description">Use the Featured Image for the main project image. Add the full project description in the main editor.</p>';
    }

    public function plot_availability_box($post) {
        $image = get_post_meta($post->ID, '_npp_plot_plan_image', true);
        
        $rows = get_post_meta($post->ID, '_npp_plot_inventory', true);
        echo '<p><strong>Master layout image URL</strong> — upload your own approved project layout to the WordPress Media Library and paste its image URL.</p>';
        echo '<input class="large-text" type="url" name="npp_plot_plan_image" value="' . esc_attr($image) . '" placeholder="https://example.com/wp-content/uploads/layout.jpg">';
        echo '<p><strong>Plot inventory</strong> — one plot per line, using: <code>Plot No | Status | Area (sq yd) | Polygon points (optional) | Client name (optional, private)</code></p>';
        echo '<p>Statuses: <code>available</code>, <code>reserved</code>, <code>sold</code>. To make a plot clickable on the actual map, add polygon vertices as <code>x,y;x,y;x,y;x,y</code>, using percentage positions (0–100) on the original image. Example: <code>1 | available | 113.20 | 12,20;18,20;18,27;12,27</code>.</p>';
        echo '<textarea class="large-text code" name="npp_plot_inventory" rows="13" placeholder="1 | available | 113.20 | 12,20;18,20;18,27;12,27&#10;2 | reserved | 125&#10;3 | sold | 150">' . esc_textarea($rows) . '</textarea>';
        echo '<p class="description">Optional fifth field: client name for reserved/sold plots. The public map shows initials masked (e.g., R*** K***), never the full name. Avoid entering personal data without authorization.</p>';
        echo '<p class="description">For Antriksh projects, the supplied original project image is enforced, replacing any previously saved reference map URL. For Antriksh, the built-in SVG parcel polygons are aligned to the full bundled original image and take priority over older label-only coordinates entered in inventory. The coordinates are visually traced, not legally surveyed. Other projects use the polygon coordinates entered in the inventory. Existing inventory statuses remain administrator-controlled. Verify all statuses and areas before publishing. Save or update the project to publish changes.</p>';
    }

    private function npp_get_plots($id) {
        $raw = (string)get_post_meta($id, '_npp_plot_inventory', true);
        $plots = []; $seen = [];
        foreach (preg_split('/\r\n|\r|\n/', $raw) as $line) {
            if (!trim($line)) continue;
            $parts = array_map('trim', explode('|', $line));
            if (count($parts) < 2) continue;
            $number = sanitize_text_field($parts[0]);
            $status = strtolower($parts[1]);
            if (!$number || isset($seen[$number]) || !in_array($status, ['available','reserved','sold'], true)) continue;
            $seen[$number] = true;
            $area = isset($parts[2]) ? sanitize_text_field($parts[2]) : '';
            $client = isset($parts[4]) ? sanitize_text_field($parts[4]) : '';
            // Do not expose a full buyer name to visitors. Keep first letter of each word only.
            $masked_client = '';
            if ($client !== '') {
                $words = preg_split('/\s+/u', trim($client));
                $masked = [];
                foreach ($words as $word) {
                    if ($word === '') continue;
                    $first = function_exists('mb_substr') ? mb_substr($word, 0, 1, 'UTF-8') : substr($word, 0, 1);
                    $masked[] = $first . '***';
                }
                $masked_client = implode(' ', $masked);
            }
            $polygon = [];
            if (!empty($parts[3])) {
                foreach (explode(';', $parts[3]) as $point) {
                    $xy = explode(',', trim($point));
                    if (count($xy) !== 2 || !is_numeric($xy[0]) || !is_numeric($xy[1])) { $polygon = []; break; }
                    $x = (float)$xy[0]; $y = (float)$xy[1];
                    if ($x < 0 || $x > 100 || $y < 0 || $y > 100) { $polygon = []; break; }
                    $polygon[] = [$x, $y];
                }
                if (count($polygon) < 3 || count($polygon) > 16) $polygon = [];
            }
            $plots[] = ['number'=>$number,'status'=>$status,'area'=>$area,'polygon'=>$polygon,'client_masked'=>$masked_client];
            if (count($plots) >= 500) break;
        }
        return $plots;
    }


    // Editable polygon overrides take priority. These default parcel-sized regions are
    // visually estimated from the brochure, NOT cadastral/survey boundaries.
    private function npp_parcel_polygons() {
        $path = plugin_dir_path(__FILE__) . 'assets/kd-antriksh-parcel-polygons.json';
        $data = is_readable($path) ? json_decode(file_get_contents($path), true) : [];
        return is_array($data) ? $data : [];
    }

    private function npp_reference_plot_hotspots() {
        return [
            1 => '19.617,60.628 22.617,60.628 22.617,67.428 19.617,67.428',
            2 => '19.617,66.044 22.617,66.044 22.617,72.844 19.617,72.844',
            3 => '19.617,73.395 22.617,73.395 22.617,80.195 19.617,80.195',
            4 => '25.163,73.395 28.163,73.395 28.163,80.195 25.163,80.195',
            5 => '25.163,66.044 28.163,66.044 28.163,72.844 25.163,72.844',
            6 => '25.163,60.628 28.163,60.628 28.163,67.428 25.163,67.428',
            7 => '22.816,40.224 25.816,40.224 25.816,46.824 22.816,46.824',
            8 => '22.816,34.807 25.816,34.807 25.816,41.407 22.816,41.407',
            9 => '22.816,25.135 25.816,25.135 25.816,31.735 22.816,31.735',
            10 => '22.816,19.526 25.816,19.526 25.816,26.126 22.816,26.126',
            11 => '28.362,19.526 31.362,19.526 31.362,26.126 28.362,26.126',
            12 => '28.362,25.135 31.362,25.135 31.362,31.735 28.362,31.735',
            13 => '28.362,34.807 31.362,34.807 31.362,41.407 28.362,41.407',
            14 => '28.362,40.224 31.362,40.224 31.362,46.824 28.362,46.824',
            15 => '27.864,60.628 30.864,60.628 30.864,67.428 27.864,67.428',
            16 => '27.864,66.044 30.864,66.044 30.864,72.844 27.864,72.844',
            17 => '27.864,73.395 30.864,73.395 30.864,80.195 27.864,80.195',
            18 => '33.481,73.395 36.481,73.395 36.481,80.195 33.481,80.195',
            19 => '33.481,66.044 36.481,66.044 36.481,72.844 33.481,72.844',
            20 => '33.481,60.628 36.481,60.628 36.481,67.428 33.481,67.428',
            21 => '31.064,40.224 34.064,40.224 34.064,46.824 31.064,46.824',
            22 => '31.064,34.807 34.064,34.807 34.064,41.407 31.064,41.407',
            23 => '31.064,25.135 34.064,25.135 34.064,31.735 31.064,31.735',
            24 => '31.064,19.526 34.064,19.526 34.064,26.126 31.064,26.126',
            25 => '36.610,19.526 39.610,19.526 39.610,26.126 36.610,26.126',
            26 => '36.610,25.135 39.610,25.135 39.610,31.735 36.610,31.735',
            27 => '36.610,34.807 39.610,34.807 39.610,41.407 36.610,41.407',
            28 => '36.610,40.224 39.610,40.224 39.610,46.824 36.610,46.824',
            29 => '36.112,60.628 39.112,60.628 39.112,67.428 36.112,67.428',
            30 => '36.112,66.044 39.112,66.044 39.112,72.844 36.112,72.844',
            31 => '36.112,73.395 39.112,73.395 39.112,80.195 36.112,80.195',
            32 => '41.729,73.395 44.729,73.395 44.729,80.195 41.729,80.195',
            33 => '41.729,66.044 44.729,66.044 44.729,72.844 41.729,72.844',
            34 => '41.729,60.628 44.729,60.628 44.729,67.428 41.729,67.428',
            35 => '39.311,40.224 42.311,40.224 42.311,46.824 39.311,46.824',
            36 => '39.311,34.807 42.311,34.807 42.311,41.407 39.311,41.407',
            37 => '39.311,25.135 42.311,25.135 42.311,31.735 39.311,31.735',
            38 => '39.311,19.526 42.311,19.526 42.311,26.126 39.311,26.126',
            39 => '44.857,24.942 47.857,24.942 47.857,31.542 44.857,31.542',
            40 => '44.857,34.807 47.857,34.807 47.857,41.407 44.857,41.407',
            41 => '44.857,40.224 47.857,40.224 47.857,46.824 44.857,46.824',
            42 => '44.431,60.628 47.431,60.628 47.431,67.428 44.431,67.428',
            43 => '44.431,66.044 47.431,66.044 47.431,72.844 44.431,72.844',
            44 => '44.431,73.395 47.431,73.395 47.431,80.195 44.431,80.195',
            45 => '49.905,73.395 52.905,73.395 52.905,80.195 49.905,80.195',
            46 => '49.905,66.044 52.905,66.044 52.905,72.844 49.905,72.844',
            47 => '49.905,60.628 52.905,60.628 52.905,67.428 49.905,67.428',
            48 => '47.559,40.224 50.559,40.224 50.559,46.824 47.559,46.824',
            49 => '47.559,34.807 50.559,34.807 50.559,41.407 47.559,41.407',
            50 => '47.559,24.942 50.559,24.942 50.559,31.542 47.559,31.542',
            51 => '52.820,24.942 55.820,24.942 55.820,31.542 52.820,31.542',
            52 => '52.820,34.807 55.820,34.807 55.820,41.407 52.820,41.407',
            53 => '52.820,40.224 55.820,40.224 55.820,46.824 52.820,46.824',
            54 => '52.607,60.628 55.607,60.628 55.607,67.428 52.607,67.428',
            55 => '52.607,66.044 55.607,66.044 55.607,72.844 52.607,72.844',
            56 => '52.607,73.395 55.607,73.395 55.607,80.195 52.607,80.195',
            57 => '58.082,73.395 61.082,73.395 61.082,80.195 58.082,80.195',
            58 => '58.082,66.044 61.082,66.044 61.082,72.844 58.082,72.844',
            59 => '58.082,60.628 61.082,60.628 61.082,67.428 58.082,67.428',
            60 => '60.784,60.628 63.784,60.628 63.784,67.428 60.784,67.428',
            61 => '60.784,66.044 63.784,66.044 63.784,72.844 60.784,72.844',
            62 => '60.784,73.395 63.784,73.395 63.784,80.195 60.784,80.195',
            63 => '66.258,73.395 69.258,73.395 69.258,80.195 66.258,80.195',
            64 => '66.258,66.044 69.258,66.044 69.258,72.844 66.258,72.844',
            65 => '66.258,60.628 69.258,60.628 69.258,67.428 66.258,67.428',
            66 => '62.988,40.224 65.988,40.224 65.988,46.824 62.988,46.824',
            67 => '62.988,34.614 65.988,34.614 65.988,41.214 62.988,41.214',
            68 => '62.988,26.683 65.988,26.683 65.988,33.283 62.988,33.283',
            69 => '68.320,34.614 71.320,34.614 71.320,41.214 68.320,41.214',
            70 => '68.320,40.224 71.320,40.224 71.320,46.824 68.320,46.824',
            71 => '69.031,60.628 72.031,60.628 72.031,67.428 69.031,67.428',
            72 => '69.031,66.044 72.031,66.044 72.031,72.844 69.031,72.844',
            73 => '69.031,73.395 72.031,73.395 72.031,80.195 69.031,80.195',
            74 => '74.506,73.395 77.506,73.395 77.506,80.195 74.506,80.195',
            75 => '74.506,66.044 77.506,66.044 77.506,72.844 74.506,72.844',
            76 => '74.506,60.628 77.506,60.628 77.506,67.428 74.506,67.428',
            77 => '71.022,40.224 74.022,40.224 74.022,46.824 71.022,46.824',
            78 => '71.022,34.614 74.022,34.614 74.022,41.214 71.022,41.214',
            79 => '76.497,34.614 79.497,34.614 79.497,41.214 76.497,41.214',
            80 => '76.497,40.224 79.497,40.224 79.497,46.824 76.497,46.824',
            81 => '77.137,60.628 80.137,60.628 80.137,67.428 77.137,67.428',
            82 => '77.137,66.044 80.137,66.044 80.137,72.844 77.137,72.844',
            83 => '77.137,73.395 80.137,73.395 80.137,80.195 77.137,80.195',
            84 => '82.754,73.395 85.754,73.395 85.754,80.195 82.754,80.195',
            85 => '82.754,66.044 85.754,66.044 85.754,72.844 82.754,72.844',
            86 => '82.754,60.628 85.754,60.628 85.754,67.428 82.754,67.428',
            87 => '79.198,40.224 82.198,40.224 82.198,46.824 79.198,46.824',
            88 => '79.198,34.614 82.198,34.614 82.198,41.214 79.198,41.214',
            89 => '84.673,34.614 87.673,34.614 87.673,41.214 84.673,41.214',
            90 => '84.673,40.224 87.673,40.224 87.673,46.824 84.673,46.824',
            91 => '85.384,60.628 88.384,60.628 88.384,67.428 85.384,67.428',
            92 => '85.384,66.044 88.384,66.044 88.384,72.844 85.384,72.844',
            93 => '85.384,73.395 88.384,73.395 88.384,80.195 85.384,80.195',
            94 => '91.428,73.395 94.428,73.395 94.428,80.195 91.428,80.195',
            95 => '91.428,66.044 94.428,66.044 94.428,72.844 91.428,72.844',
            96 => '91.428,60.628 94.428,60.628 94.428,67.428 91.428,67.428',
            97 => '87.446,40.224 90.446,40.224 90.446,46.824 87.446,46.824',
            98 => '87.446,34.614 90.446,34.614 90.446,41.214 87.446,41.214',
            99 => '92.352,34.614 95.352,34.614 95.352,41.214 92.352,41.214',
            100 => '92.352,40.224 95.352,40.224 95.352,46.824 92.352,46.824',
            101 => '3.719,60.802 6.519,60.802 6.519,68.802 3.719,68.802',
            102 => '7.132,26.564 9.932,26.564 9.932,34.564 7.132,34.564',
        ];
    }

    private function npp_plot_section($id) {
        $plots = $this->npp_get_plots($id);
        $image = esc_url(get_post_meta($id, '_npp_plot_plan_image', true));
        $npp_is_builtin_map = false;
        if (stripos(get_post_field('post_name', $id), 'antriksh') !== false || stripos(get_the_title($id), 'antriksh') !== false) {
            $image = esc_url(plugins_url('assets/kd-antriksh-original-layout.png', __FILE__));
            $npp_is_builtin_map = true;
        }
        if (!$plots && !$image) return '';
        $counts = ['available'=>0,'reserved'=>0,'sold'=>0];
        foreach ($plots as $plot) $counts[$plot['status']]++;
        ob_start(); ?>
        <section class="npp-plot-section" id="plot-availability" aria-labelledby="npp-plot-title">
            <div class="npp-plot-heading"><div><span class="npp-plot-eyebrow">INTERACTIVE TOWNSHIP MASTER PLAN</span><h2 id="npp-plot-title">Explore Your Plot</h2><p>Explore the original Antriksh layout. Select a plot number to see its recorded status and send an enquiry when available.</p></div><div class="npp-plot-legend"><span><i class="npp-plot-dot available"></i> Available <b><?php echo esc_html($counts['available']); ?></b></span><span><i class="npp-plot-dot reserved"></i> Reserved <b><?php echo esc_html($counts['reserved']); ?></b></span><span><i class="npp-plot-dot sold"></i> Sold <b><?php echo esc_html($counts['sold']); ?></b></span></div></div>
            <?php if ($image): ?>
            <div class="npp-map-actionbar"><span>ORIGINAL ANTRIKSH MASTER PLAN</span><div class="npp-map-buttons"><button type="button" class="npp-map-zoom-out" aria-label="Zoom out">−</button><button type="button" class="npp-map-zoom-in" aria-label="Zoom in">+</button><button type="button" class="npp-map-reset">Reset</button></div></div>
            <div class="npp-plot-map-scroller"><div class="npp-plot-map<?php echo $npp_is_builtin_map ? ' npp-reference-map' : ''; ?>">
            <img src="<?php echo esc_url($image); ?>" alt="<?php echo esc_attr(get_the_title($id)); ?> original numbered township master plan" loading="lazy">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Select a plot by its printed number">
            <?php $parcel_polygons = $npp_is_builtin_map ? $this->npp_parcel_polygons() : [];
            foreach ($plots as $plot):
                $poly = $plot['polygon'];
                if ($npp_is_builtin_map && isset($parcel_polygons[(string)$plot['number']])) {
                    // These SVG polygons are calibrated to the exact bundled full master image.
                    // Existing legacy label hotspot coordinates are intentionally superseded.
                    $poly_string = str_replace(';', ' ', $parcel_polygons[(string)$plot['number']]);
                } else {
                    $poly_string = $poly ? implode(' ', array_map(function($pt){return round((float)$pt[0],3).','.round((float)$pt[1],3);}, $poly)) : '';
                }
                if (!$poly_string) continue; ?>
                <polygon points="<?php echo esc_attr($poly_string); ?>" class="npp-plot-polygon npp-plot-hotspot is-<?php echo esc_attr($plot['status']); ?>" data-plot="<?php echo esc_attr($plot['number']); ?>" data-status="<?php echo esc_attr($plot['status']); ?>" data-area="<?php echo esc_attr($plot['area']); ?>" data-client="<?php echo esc_attr($plot['client_masked']); ?>" tabindex="0" role="button" aria-label="Plot <?php echo esc_attr($plot['number']); ?>: <?php echo esc_attr($plot['status']); ?>" />
            <?php endforeach; ?></svg><div class="npp-map-tooltip" role="status" hidden></div></div></div>
            <div class="npp-plot-selected" aria-live="polite"><strong>Select a plot number on the map</strong><span>Tap a numbered plot to view the inventory status. Map polygons are visually traced against the supplied plan; verify against the approved survey layout before relying on boundaries.</span><button type="button" class="npp-selected-enquire" hidden>Enquire about this plot ↗</button></div>
            <?php endif; ?>
            <?php if ($plots): ?><details class="npp-plot-inventory-details"><summary>Browse all <?php echo count($plots); ?> plots <span>Filter &amp; enquire</span></summary><div class="npp-plot-tools"><label for="npp-plot-filter-<?php echo esc_attr($id); ?>">Show</label><select class="npp-plot-filter" id="npp-plot-filter-<?php echo esc_attr($id); ?>"><option value="all">All plots</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select><span class="npp-plot-visible" aria-live="polite"><?php echo count($plots); ?> plots</span></div><div class="npp-plot-cards">
            <?php foreach ($plots as $plot): ?><article class="npp-plot-card is-<?php echo esc_attr($plot['status']); ?>" data-status="<?php echo esc_attr($plot['status']); ?>"><strong>Plot <?php echo esc_html($plot['number']); ?></strong><?php if ($plot['area']): ?><small><?php echo esc_html($plot['area']); ?> sq yd</small><?php endif; ?><span class="npp-plot-status"><?php echo esc_html(ucfirst($plot['status'])); ?></span><?php if ($plot['status']==='available'): ?><button type="button" class="npp-plot-enquire" data-plot="<?php echo esc_attr($plot['number']); ?>">Enquire about plot ↗</button><?php endif; ?></article><?php endforeach; ?></div></details><?php endif; ?>
            <p class="npp-plot-disclaimer">The displayed master plan is the supplied original project image. The colored SVG parcel regions are visually traced approximations, not legally surveyed boundaries. Replace them with verified polygon coordinates for precise boundaries. Availability is controlled by the project administrator and is not independently verified. Please confirm the latest inventory, approved layout, dimensions and documentation. Sending an enquiry does not reserve a plot.</p>
        </section>
        <?php return ob_get_clean();
    }

    public function project_gallery_box($post) {
        $ids = get_post_meta($post->ID, '_npp_gallery_ids', true);
        $ids = is_array($ids) ? $ids : [];
        echo '<input type="hidden" id="npp_gallery_ids" name="npp_gallery_ids" value="' . esc_attr(implode(',', array_map('absint', $ids))) . '">';
        echo '<button type="button" class="button" id="npp_gallery_select">Select / Update Gallery Images</button> ';
        echo '<button type="button" class="button" id="npp_gallery_clear">Clear Gallery</button>';
        echo '<div id="npp_gallery_preview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">';
        foreach ($ids as $id) {
            $thumb = wp_get_attachment_image_url($id, 'thumbnail');
            if ($thumb) echo '<img src="' . esc_url($thumb) . '" style="width:84px;height:64px;object-fit:cover;border:1px solid #ccd0d4;border-radius:5px">';
        }
        echo '</div><p class="description">Choose multiple images from the Media Library. The first image is used as the gallery lead image when no featured image is set.</p>';
    }

    public function save_project_meta($post_id, $post) {
        if (!isset($_POST['npp_project_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['npp_project_nonce'])), 'npp_save_project')) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!current_user_can('edit_post', $post_id)) return;
        $keys = ['tagline','category','status','title_guarantee','location','price','plot_sizes','approval','possession','availability','whatsapp','brochure_url','map_url','highlights'];
        foreach ($keys as $key) {
            if (!isset($_POST['npp_' . $key])) continue;
            $raw = wp_unslash($_POST['npp_' . $key]);
            $value = ($key === 'highlights') ? sanitize_textarea_field($raw) : (($key === 'brochure_url' || $key === 'map_url') ? esc_url_raw($raw) : sanitize_text_field($raw));
            update_post_meta($post_id, '_npp_' . $key, $value);
        }
        if (isset($_POST['npp_plot_plan_image'])) update_post_meta($post_id, '_npp_plot_plan_image', esc_url_raw(wp_unslash($_POST['npp_plot_plan_image'])));
        if (isset($_POST['npp_plot_inventory'])) {
            $lines = preg_split('/\r\n|\r|\n/', wp_unslash($_POST['npp_plot_inventory']));
            $safe = [];
            foreach (array_slice($lines, 0, 500) as $line) {
                $parts = array_map('trim', explode('|', $line));
                if (count($parts) < 2 || !in_array(strtolower($parts[1]), ['available','reserved','sold'], true)) continue;
                $poly = isset($parts[3]) && preg_match('/^[0-9.,;\s-]+$/', $parts[3]) ? trim($parts[3]) : '';
                $safe[] = sanitize_text_field($parts[0]) . ' | ' . strtolower($parts[1]) . ' | ' . sanitize_text_field($parts[2] ?? '') . ' | ' . $poly . ' | ' . sanitize_text_field($parts[4] ?? '');
            }
            update_post_meta($post_id, '_npp_plot_inventory', implode("\n", $safe));
        }
        if (isset($_POST['npp_gallery_ids'])) {
            $ids = array_filter(array_map('absint', explode(',', sanitize_text_field(wp_unslash($_POST['npp_gallery_ids'])))));
            update_post_meta($post_id, '_npp_gallery_ids', $ids);
        }
    }

    public function admin_menu() {
        add_submenu_page('edit.php?post_type=' . self::PROJECT, 'Plugin Settings', 'Settings', 'manage_options', 'npp-settings', [$this, 'settings_page']);
    }

    public function register_settings() {
        register_setting('npp_settings_group', 'npp_settings', [$this, 'sanitize_settings']);
    }

    public function sanitize_settings($input) {
        $out = [];
        $out['email'] = isset($input['email']) ? sanitize_email($input['email']) : get_option('admin_email');
        $out['whatsapp'] = isset($input['whatsapp']) ? preg_replace('/\D+/', '', $input['whatsapp']) : '';
        $out['currency'] = isset($input['currency']) ? sanitize_text_field($input['currency']) : 'INR';
        $out['success_message'] = isset($input['success_message']) ? sanitize_text_field($input['success_message']) : 'Thank you! Your enquiry has been received.';
        return $out;
    }

    public function settings_page() {
        if (!current_user_can('manage_options')) return;
        $s = wp_parse_args(get_option('npp_settings', []), ['email' => get_option('admin_email'), 'whatsapp' => '', 'currency' => 'INR', 'success_message' => 'Thank you! Your enquiry has been received.']);
        ?>
        <div class="wrap"><h1>Nestoria Property Projects Settings</h1>
        <form method="post" action="options.php"><?php settings_fields('npp_settings_group'); ?>
        <table class="form-table">
        <tr><th><label for="npp_email">Enquiry notification email</label></th><td><input class="regular-text" type="email" id="npp_email" name="npp_settings[email]" value="<?php echo esc_attr($s['email']); ?>"></td></tr>
        <tr><th><label for="npp_whatsapp">Default WhatsApp number</label></th><td><input class="regular-text" type="text" id="npp_whatsapp" name="npp_settings[whatsapp]" value="<?php echo esc_attr($s['whatsapp']); ?>"><p class="description">Include country code, digits only. Example India: 91XXXXXXXXXX.</p></td></tr>
        <tr><th><label for="npp_currency">Currency label</label></th><td><input class="regular-text" type="text" id="npp_currency" name="npp_settings[currency]" value="<?php echo esc_attr($s['currency']); ?>"></td></tr>
        <tr><th><label for="npp_success">Form success message</label></th><td><input class="regular-text" type="text" id="npp_success" name="npp_settings[success_message]" value="<?php echo esc_attr($s['success_message']); ?>"></td></tr>
        </table><?php submit_button(); ?></form>
        <hr><h2>Shortcodes</h2><p><code>[property_projects]</code> displays a project grid.</p><p><code>[property_project id="123"]</code> displays a specific project detail page.</p><p><code>[property_booking_form project_id="123"]</code> displays the booking form.</p>
        </div><?php
    }

    public function admin_assets($hook) {
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if ($screen && $screen->post_type === self::PROJECT) {
            wp_enqueue_media();
            wp_enqueue_script('npp-admin', plugins_url('assets/npp-admin.js', __FILE__), ['jquery'], self::VERSION, true);
        }
    }

    public function archive_template($template) {
        if (is_post_type_archive(self::PROJECT)) {
            $archive = plugin_dir_path(__FILE__) . 'templates/archive-npp_project.php';
            if (file_exists($archive)) return $archive;
        }
        return $template;
    }

    public function register_assets() {
        wp_register_style('npp-front', plugins_url('assets/npp-front.css', __FILE__), [], self::VERSION . '-' . filemtime(plugin_dir_path(__FILE__) . 'assets/npp-front.css'));
        wp_register_script('npp-front', plugins_url('assets/npp-front.js', __FILE__), ['jquery'], self::VERSION . '-' . filemtime(plugin_dir_path(__FILE__) . 'assets/npp-front.js'), true);
        wp_register_script('npp-admin', plugins_url('assets/npp-admin.js', __FILE__), ['jquery'], self::VERSION, true);
    }

    private function enqueue_front() {
        wp_enqueue_style('npp-front');
        wp_enqueue_script('npp-front');
        wp_localize_script('npp-front', 'NPPData', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce(self::NONCE_ACTION),
            'success' => wp_parse_args(get_option('npp_settings', []), ['success_message' => 'Thank you! Your enquiry has been received.'])['success_message'],
        ]);
    }

    public function projects_shortcode($atts) {
        $atts = shortcode_atts(['posts_per_page' => 9, 'category' => ''], $atts, 'property_projects');
        $q = new WP_Query(['post_type' => self::PROJECT, 'post_status' => 'publish', 'posts_per_page' => max(1, min(48, absint($atts['posts_per_page']))), 'orderby' => 'menu_order date', 'order' => 'DESC']);
        $this->enqueue_front();
        ob_start();
        echo '<div class="npp-project-grid">';
        while ($q->have_posts()) { $q->the_post(); $id = get_the_ID(); $img = get_the_post_thumbnail_url($id, 'large'); if (!$img) $img = $this->first_gallery_image($id); ?>
            <article class="npp-project-card">
                <a class="npp-card-image" href="<?php the_permalink(); ?>"><?php if ($img) echo '<img src="' . esc_url($img) . '" alt="' . esc_attr(get_the_title()) . '">'; ?><span class="npp-card-status"><?php echo esc_html(get_post_meta($id, '_npp_status', true) ?: 'Property Project'); ?></span></a>
                <div class="npp-card-body"><div class="npp-eyebrow"><?php echo esc_html(get_post_meta($id, '_npp_category', true)); ?></div><h3><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3><p><?php echo esc_html(get_post_meta($id, '_npp_tagline', true) ?: get_the_excerpt()); ?></p><div class="npp-card-meta"><?php echo esc_html(get_post_meta($id, '_npp_location', true)); ?></div><a class="npp-button npp-button-primary" href="<?php the_permalink(); ?>">View Project</a></div>
            </article>
        <?php }
        echo '</div>';
        wp_reset_postdata();
        if (!$q->have_posts()) echo '<p class="npp-empty">No projects published yet.</p>';
        return ob_get_clean();
    }

    /** Homepage three-project showcase; shortcode: [khushii_project_showcase limit="3" title="Explore Our Projects"] */
    public function showcase_shortcode($atts) {
        $atts = shortcode_atts(['limit' => 3, 'title' => 'Featured Property Projects in Dholera SIR', 'subtitle' => 'Discover residential plots, townships and emerging property opportunities in Dholera Special Investment Region, Gujarat. Explore project locations, highlights and available details with Khushii Developer.', 'button' => 'Explore All Projects'], $atts, 'khushii_project_showcase');
        $limit = max(1, min(12, absint($atts['limit'])));
        $q = new WP_Query(['post_type' => self::PROJECT, 'post_status' => 'publish', 'posts_per_page' => $limit, 'orderby' => ['menu_order' => 'ASC', 'date' => 'DESC'], 'no_found_rows' => true]);
        $this->enqueue_front();
        $archive = get_post_type_archive_link(self::PROJECT) ?: home_url('/projects/');
        ob_start(); ?>
        <section class="npp-showcase" aria-label="Featured property projects">
          <div class="npp-showcase-wrap">
            <header class="npp-showcase-header">
              <div><span class="npp-showcase-eyebrow"><span></span> EXPLORE OUR COLLECTION · KHUSHII DEVELOPER</span>
              <h2><?php echo esc_html($atts['title']); ?></h2>
              <p><?php echo esc_html($atts['subtitle']); ?></p><div class="npp-showcase-header-note"><span class="npp-showcase-note-icon">✦</span> Explore locations · Compare projects · Request details</div></div>
              <span class="npp-showcase-header-aside" aria-hidden="true">DHOLERA SIR <i>/</i> GUJARAT</span>
            </header>
            <?php if ($q->have_posts()): ?><div class="npp-showcase-grid">
            <?php $index = 0; while ($q->have_posts()): $q->the_post(); $index++; $id = get_the_ID();
                $img = get_the_post_thumbnail_url($id, 'large'); if (!$img) $img = $this->first_gallery_image($id);
                $category = trim((string)get_post_meta($id, '_npp_category', true));
                $location = trim((string)get_post_meta($id, '_npp_location', true));
                $tagline = trim((string)get_post_meta($id, '_npp_tagline', true));
                $status = trim((string)get_post_meta($id, '_npp_status', true)); ?>
              <article class="npp-showcase-card">
                <a class="npp-showcase-photo" href="<?php the_permalink(); ?>" aria-label="View <?php echo esc_attr(get_the_title()); ?>">
                  <?php if ($img): ?><img src="<?php echo esc_url($img); ?>" alt="<?php echo esc_attr(get_the_title() . ($location ? ' in ' . $location : '')); ?>" loading="lazy" decoding="async"><?php else: ?><span class="npp-showcase-placeholder" aria-hidden="true">KHUSHII</span><?php endif; ?>
                  <span class="npp-showcase-photo-overlay"></span>
                  <?php if ($status): ?><span class="npp-showcase-status"><?php echo esc_html($status); ?></span><?php endif; ?>
                  <span class="npp-showcase-number"><?php echo esc_html(sprintf('%02d', $index)); ?> / <?php echo esc_html(sprintf('%02d', $q->post_count)); ?></span>
                  <span class="npp-showcase-arrow" aria-hidden="true">↗</span>
                </a>
                <div class="npp-showcase-body">
                  <div class="npp-showcase-category"><span class="npp-showcase-category-mark"></span><?php echo esc_html($category ?: 'PROPERTY PROJECT'); ?></div>
                  <h3><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
                  <?php if ($location): ?><p class="npp-showcase-location"><span aria-hidden="true">⌖</span> <?php echo esc_html($location); ?></p><?php endif; ?>
                  <?php if ($tagline || get_the_excerpt()): ?><p class="npp-showcase-desc"><?php echo esc_html(wp_trim_words($tagline ?: get_the_excerpt(), 19)); ?></p><?php endif; ?>
                  <a class="npp-showcase-view" href="<?php the_permalink(); ?>">View Project Details <span aria-hidden="true">↗</span></a>
                </div>
              </article>
            <?php endwhile; wp_reset_postdata(); ?></div>
            <?php else: ?><p class="npp-showcase-empty">Projects will appear here once published.</p><?php endif; ?>
            <div class="npp-showcase-bottom"><div><strong>Looking for your next property opportunity?</strong><span>Explore the full collection and connect with our team for project details.</span></div><a class="npp-showcase-all" href="<?php echo esc_url($archive); ?>"><?php echo esc_html($atts['button']); ?> <span aria-hidden="true">↗</span></a></div>
          </div>
        </section>
        <?php return ob_get_clean();
    }

    public function single_project_shortcode($atts) {
        $atts = shortcode_atts(['id' => 0], $atts, 'property_project');
        $id = absint($atts['id']);
        if (!$id || get_post_type($id) !== self::PROJECT) return '<p>Project not found.</p>';
        return $this->render_project($id);
    }

    public function append_project_layout($content) {
        if (!is_singular(self::PROJECT) || !in_the_loop() || !is_main_query()) return $content;
        return $this->render_project(get_the_ID());
    }

    private function first_gallery_image($id) {
        $ids = get_post_meta($id, '_npp_gallery_ids', true);
        if (is_array($ids) && !empty($ids[0])) return wp_get_attachment_image_url($ids[0], 'large');
        return '';
    }

    private function render_project($id) {
        $this->enqueue_front();
        $get = function($key) use ($id) { return get_post_meta($id, '_npp_' . $key, true); };
        $gallery = get_post_meta($id, '_npp_gallery_ids', true);
        $gallery = is_array($gallery) ? array_values(array_filter(array_map('absint', $gallery))) : [];
        $featured = get_post_thumbnail_id($id);
        if ($featured && !in_array($featured, $gallery, true)) array_unshift($gallery, $featured);
        $gallery = array_slice(array_unique($gallery), 0, 20);
        $main_img = !empty($gallery) ? wp_get_attachment_image_url($gallery[0], 'full') : '';
        $settings = wp_parse_args(get_option('npp_settings', []), ['whatsapp' => '', 'email' => get_option('admin_email')]);
        $wa = preg_replace('/\D+/', '', $get('whatsapp') ?: $settings['whatsapp']);
        $highlights = array_filter(array_map('trim', preg_split('/\r\n|\r|\n/', (string)$get('highlights'))));
        ob_start(); ?>
        <div class="npp-project-detail npp-project-detail-premium">
            <nav class="npp-breadcrumb" aria-label="Breadcrumb">
                <a href="<?php echo esc_url(home_url('/')); ?>">Home</a>
                <span class="npp-breadcrumb-separator" aria-hidden="true">/</span>
                <a href="<?php echo esc_url(get_post_type_archive_link(self::PROJECT) ?: home_url('/projects/')); ?>">Projects</a>
                <span class="npp-breadcrumb-separator" aria-hidden="true">/</span>
                <span class="npp-breadcrumb-current" aria-current="page"><?php echo esc_html(get_the_title($id)); ?></span>
            </nav>
            <div class="npp-single-intro">
                <div><div class="npp-single-overline">KHUSHII DEVELOPER <span aria-hidden="true">/</span> FEATURED DEVELOPMENT</div><h1><?php echo esc_html(get_the_title($id)); ?></h1><p>Explore project information, available plot options and enquiry assistance.</p></div>
                <button type="button" class="npp-button npp-button-primary npp-book-trigger" data-project="<?php echo esc_attr(get_the_title($id)); ?>">Enquire About This Project <span aria-hidden="true">↗</span></button>
            </div>
            <div class="npp-project-top">
                <section class="npp-gallery">
                    <div class="npp-main-image">
                        <div class="npp-ribbons"><?php if ($get('status')): ?><span><?php echo esc_html($get('status')); ?></span><?php endif; ?></div>
                        <?php if ($main_img): ?><img id="npp-main-photo" src="<?php echo esc_url($main_img); ?>" alt="<?php echo esc_attr(get_the_title($id)); ?>"><?php else: ?><div class="npp-no-image">Add a featured image or project gallery in WordPress admin</div><?php endif; ?>
                    </div>
                    <?php if ($gallery): ?><div class="npp-thumbnails"><?php foreach ($gallery as $i => $img_id): $thumb = wp_get_attachment_image_url($img_id, 'medium'); $full = wp_get_attachment_image_url($img_id, 'full'); if (!$thumb || !$full) continue; ?><button type="button" class="npp-thumb <?php echo $i === 0 ? 'is-active' : ''; ?>" data-full="<?php echo esc_url($full); ?>" aria-label="View project image <?php echo esc_attr($i+1); ?>"><img src="<?php echo esc_url($thumb); ?>" alt=""></button><?php endforeach; ?></div><?php endif; ?>
                </section>
                <section class="npp-project-summary">
                    <div class="npp-eyebrow"><?php echo esc_html($get('category') ?: 'PROPERTY PROJECT'); ?></div>
                    <h2 class="npp-summary-title"><?php echo esc_html(get_the_title($id)); ?></h2>
                    <?php if ($get('tagline')): ?><p class="npp-tagline"><?php echo esc_html($get('tagline')); ?></p><?php endif; ?>
                    <div class="npp-facts-panel">
                        <div class="npp-status-row"><div><small>PROJECT STATUS</small><strong><?php echo esc_html($get('status') ?: 'Enquire for status'); ?></strong></div><?php if ($get('title_guarantee')): ?><div class="npp-title-clear"><small>PROJECT INFORMATION</small><strong><?php echo esc_html($get('title_guarantee')); ?></strong></div><?php endif; ?></div>
                        <div class="npp-facts-grid">
                            <?php foreach (['plot_sizes'=>'Plot Sizes','approval'=>'Approval','possession'=>'Possession','availability'=>'Availability'] as $key=>$label): if (!$get($key)) continue; ?><div class="npp-fact"><small><?php echo esc_html($label); ?></small><strong><?php echo esc_html($get($key)); ?></strong></div><?php endforeach; ?>
                        </div>
                        <?php if ($get('price')): ?><div class="npp-price"><?php echo esc_html($get('price')); ?></div><?php endif; ?>
                        <button type="button" class="npp-button npp-button-primary npp-book-trigger" data-project="<?php echo esc_attr(get_the_title($id)); ?>">Request Project Details <span aria-hidden="true">↗</span></button>
                        <div class="npp-action-row">
                            <?php if ($get('brochure_url')): ?><a class="npp-button npp-button-outline" href="<?php echo esc_url($get('brochure_url')); ?>" target="_blank" rel="noopener">Download Brochure</a><?php else: ?><button type="button" class="npp-button npp-button-outline npp-book-trigger" data-project="<?php echo esc_attr(get_the_title($id)); ?>">Request Brochure</button><?php endif; ?>
                            <?php if ($wa): ?><a class="npp-button npp-button-whatsapp" target="_blank" rel="noopener" href="<?php echo esc_url('https://wa.me/' . $wa . '?text=' . rawurlencode('Hello, I am interested in ' . get_the_title($id) . '. Please share more details.')); ?>">WhatsApp Info</a><?php endif; ?>
                        </div>
                    </div>
                    <div class="npp-trust-row"><span>✓ Guided enquiries</span><span>✓ Project details</span><span>✓ Site visit assistance</span></div>
                </section>
            </div>
            <?php if ($get('location') || $get('map_url')): ?><div class="npp-location-row"><strong>Project Location</strong><span><?php echo esc_html($get('location')); ?></span><?php if ($get('map_url')): ?><a href="<?php echo esc_url($get('map_url')); ?>" target="_blank" rel="noopener">View Map</a><?php endif; ?></div><?php endif; ?>
            <?php echo $this->npp_plot_section($id); ?>
            <?php if ($highlights): ?><section class="npp-content-section"><h2>Project Highlights</h2><div class="npp-highlight-grid"><?php foreach ($highlights as $item): ?><div class="npp-highlight"><span>✓</span><?php echo esc_html($item); ?></div><?php endforeach; ?></div></section><?php endif; ?>
            <?php $project_description = trim((string)get_post_field('post_content', $id)); if ($project_description !== ''): ?><section class="npp-content-section npp-description"><h2>About This Project</h2><?php echo wpautop(do_shortcode($project_description)); ?></section><?php endif; ?>
            <section class="npp-cta-band"><div><h2>Interested in this property?</h2><p>Share your details and our team will contact you.</p></div><button type="button" class="npp-button npp-button-primary npp-book-trigger" data-project="<?php echo esc_attr(get_the_title($id)); ?>">Enquire Now</button></section>
            <?php echo $this->booking_markup($id, false); ?>
        </div>
        <?php return ob_get_clean();
    }

    public function booking_shortcode($atts) {
        $atts = shortcode_atts(['project_id' => 0], $atts, 'property_booking_form');
        $this->enqueue_front();
        return $this->booking_markup(absint($atts['project_id']), true);
    }

    private function booking_markup($project_id = 0, $inline = false) {
        $project = $project_id ? get_the_title($project_id) : '';
        ob_start(); ?>
        <div class="npp-modal <?php echo $inline ? 'npp-inline-form' : ''; ?>" id="<?php echo $inline ? 'npp-inline-booking' : 'npp-booking-modal'; ?>" aria-hidden="<?php echo $inline ? 'false' : 'true'; ?>">
            <?php if (!$inline): ?><div class="npp-modal-backdrop" data-npp-close></div><?php endif; ?>
            <div class="npp-form-card" role="dialog" aria-modal="<?php echo $inline ? 'false' : 'true'; ?>" aria-labelledby="npp-form-title">
                <?php if (!$inline): ?><button type="button" class="npp-modal-close" data-npp-close aria-label="Close property enquiry form" title="Close enquiry form">&times;</button><?php endif; ?>
                <div class="npp-form-scroll">
                <div class="npp-form-heading"><div class="npp-eyebrow">PROPERTY ENQUIRY</div><h2 id="npp-form-title">Book Your Property</h2><p>Complete the form and our team will get in touch.</p></div>
                <form class="npp-enquiry-form">
                    <input type="hidden" name="action" value="npp_submit_enquiry">
                    <input type="hidden" name="nonce" value="<?php echo esc_attr(wp_create_nonce(self::NONCE_ACTION)); ?>">
                    <input type="hidden" name="project_id" value="<?php echo esc_attr($project_id); ?>">
                    <div class="npp-form-grid">
                        <label>Full Name *<input name="name" type="text" required maxlength="100" autocomplete="name" placeholder="Your full name"></label>
                        <label>Mobile Number *<input name="phone" type="tel" required maxlength="20" autocomplete="tel" placeholder="+91 98765 43210"></label>
                        <label>Email Address<input name="email" type="email" maxlength="150" autocomplete="email" placeholder="you@example.com"></label>
                        <label>Preferred Plot Size<select name="plot_size"><option value="">Select plot size</option><option>100 Sq. Yards</option><option>125 Sq. Yards</option><option>150 Sq. Yards</option><option>200 Sq. Yards</option><option>Other / Not sure</option></select></label>
                        <label>Budget<input name="budget" type="text" maxlength="80" placeholder="Your approximate budget"></label>
                        <label>Preferred Site Visit Date<input name="visit_date" type="date" min="<?php echo esc_attr(wp_date('Y-m-d')); ?>"></label>
                        <label class="npp-full">Message<textarea name="message" rows="3" maxlength="1000" placeholder="Tell us what you are looking for"></textarea></label>
                    </div>
                    <label class="npp-consent"><input type="checkbox" name="consent" value="1" required> I agree to be contacted regarding this property enquiry.</label>
                    <button type="submit" class="npp-button npp-button-primary npp-submit">Submit Enquiry</button>
                    <div class="npp-form-feedback" aria-live="polite"></div>
                    <p class="npp-form-privacy">Your information will be used only to respond to this enquiry.</p>
                </form>
                </div><!-- /.npp-form-scroll -->
            </div>
        </div>
        <?php return ob_get_clean();
    }

    public function handle_enquiry() {
        if (!isset($_POST['nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['nonce'])), self::NONCE_ACTION)) {
            wp_send_json_error(['message' => 'Security check failed. Please refresh and try again.'], 403);
        }
        if (($_POST['consent'] ?? '') !== '1') wp_send_json_error(['message' => 'Contact consent is required.'], 400);
        $name = isset($_POST['name']) ? sanitize_text_field(wp_unslash($_POST['name'])) : '';
        $phone = isset($_POST['phone']) ? sanitize_text_field(wp_unslash($_POST['phone'])) : '';
        $email = isset($_POST['email']) ? sanitize_email(wp_unslash($_POST['email'])) : '';
        $project_id = isset($_POST['project_id']) ? absint($_POST['project_id']) : 0;
        if (!$name || !$phone || !preg_match('/^[0-9+\s().-]{7,20}$/', $phone) || ($email && !is_email($email))) {
            wp_send_json_error(['message' => 'Please enter a valid name, mobile number and email address.'], 400);
        }
        if (!empty($_POST['website'])) wp_send_json_error(['message' => 'Spam detected.'], 400);
        $project = ($project_id && get_post_type($project_id) === self::PROJECT) ? get_the_title($project_id) : 'General Property Enquiry';
        $data = [
            'Name' => $name, 'Phone' => $phone, 'Email' => $email ?: 'Not provided',
            'Project' => $project,
            'Plot Size' => isset($_POST['plot_size']) ? sanitize_text_field(wp_unslash($_POST['plot_size'])) : '',
            'Budget' => isset($_POST['budget']) ? sanitize_text_field(wp_unslash($_POST['budget'])) : '',
            'Preferred Site Visit' => isset($_POST['visit_date']) ? sanitize_text_field(wp_unslash($_POST['visit_date'])) : '',
            'Message' => isset($_POST['message']) ? sanitize_textarea_field(wp_unslash($_POST['message'])) : '',
        ];
        $lead_id = wp_insert_post(['post_type' => self::LEAD, 'post_status' => 'private', 'post_title' => $name . ' — ' . $project . ' — ' . current_time('Y-m-d H:i')], true);
        if (is_wp_error($lead_id)) wp_send_json_error(['message' => 'Could not save your enquiry. Please contact us directly.'], 500);
        foreach ($data as $key => $value) update_post_meta($lead_id, '_npp_lead_' . sanitize_key($key), $value);
        update_post_meta($lead_id, '_npp_lead_project_id', $project_id);
        update_post_meta($lead_id, '_npp_lead_source_url', esc_url_raw(wp_get_referer() ?: home_url('/')));
        update_post_meta($lead_id, '_npp_lead_consent', '1');
        $crm_queued = false;
        if (class_exists('Khushii_CRM_Bridge')) {
            $crm_queued = Khushii_CRM_Bridge::enqueue('npp_enquiry', $lead_id, [
                'name'=>$name, 'phone'=>$phone, 'email'=>$email, 'project'=>$project,
                'plot_size'=>$data['Plot Size'], 'budget'=>$data['Budget'], 'visit_date'=>$data['Preferred Site Visit'],
                'message'=>$data['Message'], 'consent'=>true, 'enquiry_type'=>'Property enquiry',
                'page_url'=>esc_url_raw(wp_get_referer() ?: home_url('/'))
            ]);
        }
        update_post_meta($lead_id, '_npp_crm_queue_id', $crm_queued ?: '');
        $settings = wp_parse_args(get_option('npp_settings', []), ['email' => get_option('admin_email')]);
        $to = sanitize_email($settings['email']);
        $subject = 'New property enquiry: ' . $project;
        $body = "A new property enquiry was submitted.\n\n";
        foreach ($data as $key => $value) $body .= $key . ': ' . $value . "\n";
        $body .= "\nLead ID: " . $lead_id . "\n";
        $headers = ['Content-Type: text/plain; charset=UTF-8'];
        if ($email && is_email($email)) $headers[] = 'Reply-To: ' . $name . ' <' . $email . '>';
        $sent = wp_mail($to, $subject, $body, $headers);
        $message = wp_parse_args(get_option('npp_settings', []), ['success_message' => 'Thank you! Your enquiry has been received.'])['success_message'];
        wp_send_json_success(['message' => $message, 'email_sent' => (bool)$sent, 'lead_id' => $lead_id]);
    }

    public function lead_columns($columns) {
        return ['cb' => $columns['cb'], 'title' => 'Enquiry', 'project' => 'Project', 'phone' => 'Phone', 'email' => 'Email', 'date' => 'Date'];
    }
    public function lead_column_content($column, $post_id) {
        if ($column === 'project') echo esc_html(get_post_meta($post_id, '_npp_lead_project', true));
        if ($column === 'phone') echo esc_html(get_post_meta($post_id, '_npp_lead_phone', true));
        if ($column === 'email') echo esc_html(get_post_meta($post_id, '_npp_lead_email', true));
    }
    public function lead_sortable_columns($columns) { $columns['project'] = 'project'; return $columns; }
}

register_activation_hook(__FILE__, ['NPP_Nestoria_Property_Projects', 'activate']);
register_deactivation_hook(__FILE__, ['NPP_Nestoria_Property_Projects', 'deactivate']);
new NPP_Nestoria_Property_Projects();
