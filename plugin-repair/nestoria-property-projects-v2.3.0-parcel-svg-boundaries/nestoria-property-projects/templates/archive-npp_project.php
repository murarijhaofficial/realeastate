<?php
/** Premium archive template for Nestoria Property Projects. */
if (!defined('ABSPATH')) { exit; }
wp_enqueue_style('npp-front');
wp_enqueue_script('npp-front');
get_header();
$projects = new WP_Query([
    'post_type' => 'npp_project',
    'post_status' => 'publish',
    'posts_per_page' => 48,
    'orderby' => ['menu_order' => 'ASC', 'date' => 'DESC'],
]);
$total = (int) $projects->found_posts;
$categories = [];
if ($projects->have_posts()) {
    foreach ($projects->posts as $project_post) {
        $cat = trim((string) get_post_meta($project_post->ID, '_npp_category', true));
        if ($cat !== '') $categories[$cat] = $cat;
    }
}
?>
<main class="npp-archive" id="npp-projects-archive">

    <section class="npp-archive-content" id="npp-all-projects">
        <div class="npp-archive-wrap">
            <div class="npp-archive-section-head">
                <div><span class="npp-archive-kicker npp-dark-kicker"><b></b> THE COLLECTION</span><h2>Find your next <em>property project</em></h2><p>Explore project information, locations and available property details before making an enquiry.</p></div>
                <div class="npp-archive-count"><strong><?php echo esc_html($total); ?></strong><span>PROJECTS<br>TO DISCOVER</span></div>
            </div>

            <?php if ($projects->have_posts()): ?>
                <div class="npp-archive-toolbar" <?php echo $total <= 1 ? 'hidden' : ''; ?>>
                    <div class="npp-archive-filters" role="group" aria-label="Filter projects">
                        <button class="is-active" type="button" data-npp-filter="all">All projects <span><?php echo esc_html($total); ?></span></button>
                        <?php foreach ($categories as $category): ?><button type="button" data-npp-filter="<?php echo esc_attr(sanitize_title($category)); ?>"><?php echo esc_html($category); ?></button><?php endforeach; ?>
                    </div>
                    <label class="npp-archive-search"><span aria-hidden="true">⌕</span><input type="search" id="npp-project-search" placeholder="Search by project or location" aria-label="Search projects"><kbd>SEARCH</kbd></label>
                </div>

                <div class="npp-archive-grid <?php echo $total === 1 ? 'npp-single-project' : ''; ?>" id="npp-archive-grid">
                    <?php $index = 0; while ($projects->have_posts()): $projects->the_post(); $id = get_the_ID(); $index++;
                        $image = get_the_post_thumbnail_url($id, 'large');
                        if (!$image) { $ids = get_post_meta($id, '_npp_gallery_ids', true); if (is_array($ids) && !empty($ids[0])) $image = wp_get_attachment_image_url(absint($ids[0]), 'large'); }
                        $category = trim((string) get_post_meta($id, '_npp_category', true));
                        $status = trim((string) get_post_meta($id, '_npp_status', true));
                        $location = trim((string) get_post_meta($id, '_npp_location', true));
                        $price = trim((string) get_post_meta($id, '_npp_price', true));
                        $sizes = trim((string) get_post_meta($id, '_npp_plot_sizes', true));
                        $tagline = trim((string) get_post_meta($id, '_npp_tagline', true));
                        $search_text = strtolower(get_the_title() . ' ' . $category . ' ' . $location . ' ' . $tagline);
                        $is_featured = ($index === 1);
                    ?>
                    <article class="npp-archive-card <?php echo $is_featured ? 'npp-archive-card-featured' : ''; ?>" data-category="<?php echo esc_attr(sanitize_title($category)); ?>" data-search="<?php echo esc_attr($search_text); ?>">
                        <a class="npp-archive-card-media" href="<?php the_permalink(); ?>" aria-label="Explore <?php the_title_attribute(); ?>">
                            <?php if ($image): ?><img src="<?php echo esc_url($image); ?>" alt="<?php echo esc_attr(get_the_title()); ?>" loading="<?php echo $index > 2 ? 'lazy' : 'eager'; ?>"><?php else: ?><div class="npp-archive-image-placeholder"><span>N</span></div><?php endif; ?>
                            <span class="npp-archive-image-shade"></span>
                            <?php if ($status): ?><span class="npp-archive-status"><?php echo esc_html($status); ?></span><?php endif; ?>
                            <span class="npp-archive-image-index"><?php echo esc_html(sprintf('%02d', $index)); ?> <i>/ <?php echo esc_html(sprintf('%02d', $total)); ?></i></span>
                            <span class="npp-archive-round-arrow" aria-hidden="true">↗</span>
                        </a>
                        <div class="npp-archive-card-info">
                            <div class="npp-archive-card-topline"><span><?php echo esc_html($category ?: 'PROPERTY'); ?></span><?php if ($location): ?><span class="npp-archive-location">⌖ <?php echo esc_html($location); ?></span><?php endif; ?></div>
                            <h3><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
                            <?php if ($tagline || get_the_excerpt()): ?><p><?php echo esc_html($tagline ?: wp_trim_words(get_the_excerpt(), 18)); ?></p><?php endif; ?>
                            <div class="npp-archive-card-bottom"><div><?php if ($price): ?><small>STARTING FROM</small><strong><?php echo esc_html($price); ?></strong><?php elseif ($sizes): ?><small>PLOT SIZES</small><strong><?php echo esc_html($sizes); ?></strong><?php else: ?><small>PROPERTY DETAILS</small><strong>Explore this project</strong><?php endif; ?></div><a href="<?php the_permalink(); ?>">View project <span>↗</span></a></div>
                        </div>
                    </article>
                    <?php endwhile; wp_reset_postdata(); ?>
                </div>
                <div class="npp-archive-no-results" id="npp-archive-no-results" hidden><strong>No matching projects found.</strong><span>Try another project name, location or category.</span></div>
            <?php else: ?>
                <div class="npp-archive-empty"><span>01</span><h3>New opportunities are on their way.</h3><p>Our property collection is being updated. Please check back soon or contact our team for assistance.</p><a href="<?php echo esc_url(home_url('/contact-us/')); ?>">Speak to our team ↗</a></div>
            <?php endif; ?>
        </div>
    </section>
</main>
<?php get_footer(); ?>
