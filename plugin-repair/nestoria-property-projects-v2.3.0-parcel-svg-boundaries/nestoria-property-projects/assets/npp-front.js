jQuery(function($){

    // Projects archive: live search and category filters.
    var $archive = $('#npp-projects-archive');
    if ($archive.length) {
        var activeCategory = 'all';
        function filterArchive() {
            var term = (($archive.find('#npp-project-search').val() || '') + '').toLowerCase().trim();
            var visible = 0;
            $archive.find('.npp-archive-card').each(function () {
                var $card = $(this);
                var categoryMatch = activeCategory === 'all' || $card.attr('data-category') === activeCategory;
                var searchMatch = !term || ($card.attr('data-search') || '').indexOf(term) !== -1;
                var show = categoryMatch && searchMatch;
                $card.toggle(show);
                if (show) visible++;
            });
            $archive.find('#npp-archive-no-results').prop('hidden', visible !== 0);
        }
        $archive.on('click', '[data-npp-filter]', function () {
            var $button = $(this);
            activeCategory = $button.attr('data-npp-filter') || 'all';
            $archive.find('[data-npp-filter]').removeClass('is-active');
            $button.addClass('is-active');
            filterArchive();
        });
        $archive.on('input', '#npp-project-search', filterArchive);
    }

    $(document).on('click','.npp-thumb',function(){
        var $b=$(this), src=$b.data('full');
        if(src){$('#npp-main-photo').attr('src',src);$('.npp-thumb').removeClass('is-active');$b.addClass('is-active');}
    });
    function openModal(){var $m=$('#npp-booking-modal');if($m.length){$m.addClass('is-open').attr('aria-hidden','false');$('body').addClass('npp-modal-open');var $first=$m.find('input[name="name"]');setTimeout(function(){$first.trigger('focus');},100);}}
    function closeModal(){var $m=$('#npp-booking-modal');$m.removeClass('is-open').attr('aria-hidden','true');$('body').removeClass('npp-modal-open');}
    function enquirePlot(plot) {
        var $modal=$('#npp-booking-modal');
        var $msg=$modal.find('textarea[name="message"]');
        if ($msg.length) $msg.val('I am interested in Plot ' + plot + '. Please confirm current availability, price and documentation.');
        openModal();
    }
    $(document).on('click','.npp-plot-enquire',function(){enquirePlot($(this).attr('data-plot'));});
    $(document).on('click keydown','.npp-plot-polygon',function(e){
        if(e.type==='keydown' && e.key!=='Enter' && e.key!==' ')return;
        if(e.type==='keydown')e.preventDefault();
        var $p=$(this),$section=$p.closest('.npp-plot-section'),plot=$p.attr('data-plot'),status=$p.attr('data-status'),area=$p.attr('data-area');
        var $panel=$section.find('.npp-plot-selected');
        $panel.find('strong').text('Plot '+plot+' · '+status.charAt(0).toUpperCase()+status.slice(1));
        $panel.find('span').text((area ? 'Listed area: '+area+' sq yd. ' : '')+'Status is administrator-entered and must be confirmed before booking.');
        var $button=$panel.find('.npp-selected-enquire');
        $button.prop('hidden',status!=='available').attr('data-plot',plot);
    });
    $(document).on('click','.npp-selected-enquire',function(){enquirePlot($(this).attr('data-plot'));});
    $(document).on('change','.npp-plot-filter',function(){
        var $section=$(this).closest('.npp-plot-section'),filter=$(this).val(),shown=0;
        $section.find('.npp-plot-card').each(function(){var visible=filter==='all'||$(this).attr('data-status')===filter;$(this).prop('hidden',!visible);if(visible)shown++;});
        $section.find('.npp-plot-polygon').each(function(){$(this).toggleClass('is-filtered-out',filter!=='all'&&$(this).attr('data-status')!==filter);});
        $section.find('.npp-plot-visible').text(shown+' plots');
    });
    $(document).on('click','.npp-book-trigger',function(){openModal();});
    $(document).on('click','[data-npp-close]',function(){closeModal();});
    $(document).on('keydown',function(e){if(e.key==='Escape')closeModal();});
    $(document).on('submit','.npp-enquiry-form',function(e){
        e.preventDefault();
        var $form=$(this),$btn=$form.find('.npp-submit'),$feedback=$form.find('.npp-form-feedback');
        $feedback.removeClass('is-error is-success').text('');
        $btn.prop('disabled',true).text('Submitting…');
        $.ajax({url:NPPData.ajaxUrl,method:'POST',data:$form.serialize()})
        .done(function(res){
            if(res&&res.success){$feedback.addClass('is-success').text(res.data.message||NPPData.success);$form[0].reset();if(res.data.email_sent===false){$feedback.append(' (Your enquiry is saved, but the notification email could not be sent. Please check WordPress email/SMTP settings.)');}}
            else{$feedback.addClass('is-error').text(res&&res.data&&res.data.message?res.data.message:'Something went wrong. Please try again.');}
        }).fail(function(xhr){var msg=xhr.responseJSON&&xhr.responseJSON.data&&xhr.responseJSON.data.message?xhr.responseJSON.data.message:'Unable to submit right now. Please try again.';$feedback.addClass('is-error').text(msg);})
        .always(function(){$btn.prop('disabled',false).text('Submit Enquiry');});
    });
});

/* Premium plot map zoom. Keeps the map's SVG and image perfectly aligned. */
(function(){
 document.addEventListener('click',function(ev){
  var button=ev.target.closest('.npp-map-zoom-in,.npp-map-zoom-out,.npp-map-reset');
  if(!button)return;
  var section=button.closest('.npp-plot-section'),scroll=section&&section.querySelector('.npp-plot-map-scroller'),map=scroll&&scroll.querySelector('.npp-plot-map');
  if(!map)return;
  if(!map.dataset.baseWidth)map.dataset.baseWidth=String(Math.max(map.getBoundingClientRect().width,1150));
  var scale=Number(map.dataset.zoom||1);
  if(button.classList.contains('npp-map-reset'))scale=1;
  else scale=Math.min(2.6,Math.max(1,scale+(button.classList.contains('npp-map-zoom-in')?.25:-.25)));
  var centerX=(scroll.scrollLeft+scroll.clientWidth/2)/Math.max(map.offsetWidth,1);
  map.style.setProperty('width',(Number(map.dataset.baseWidth)*scale)+'px','important');
  map.style.setProperty('min-width',(Number(map.dataset.baseWidth)*scale)+'px','important');
  map.dataset.zoom=String(scale);
  scroll.scrollLeft=Math.max(0,centerX*map.offsetWidth-scroll.clientWidth/2);
 });
})();

/* Plot hover/focus details: client identity is already masked server-side. */
(function(){
 function show(el){
  var map=el.closest('.npp-plot-map'),tip=map&&map.querySelector('.npp-map-tooltip');if(!tip)return;
  var status=el.getAttribute('data-status')||'unknown',plot=el.getAttribute('data-plot')||'',area=el.getAttribute('data-area')||'',client=el.getAttribute('data-client')||'';
  tip.replaceChildren();
  var title=document.createElement('strong');title.textContent='Plot '+plot;tip.appendChild(title);
  var line=document.createElement('div');line.textContent='Status: ';
  var badge=document.createElement('span');badge.className='npp-status '+status;badge.textContent=status.charAt(0).toUpperCase()+status.slice(1);line.appendChild(badge);tip.appendChild(line);
  if(area){var a=document.createElement('div');a.textContent='Listed area: '+area+' sq yd';tip.appendChild(a)}
  if(client && status!=='available'){var c=document.createElement('div');c.textContent='Client: '+client;tip.appendChild(c)}
  var note=document.createElement('small');note.textContent='Status subject to project-team confirmation';tip.appendChild(note);
  tip.hidden=false;
  var r=el.getBoundingClientRect(),m=map.getBoundingClientRect();
  var x=(r.left+r.width/2-m.left),y=(r.top-m.top)-tip.offsetHeight-9;
  tip.style.left=Math.max(8,Math.min(x-tip.offsetWidth/2,map.clientWidth-tip.offsetWidth-8))+'px';
  tip.style.top=(y>=5?y:r.bottom-m.top+10)+'px';
 }
 document.addEventListener('pointerover',function(e){var p=e.target.closest&&e.target.closest('.npp-plot-hotspot');if(p)show(p)});
 document.addEventListener('focusin',function(e){var p=e.target.closest&&e.target.closest('.npp-plot-hotspot');if(p)show(p)});
 document.addEventListener('pointerout',function(e){var p=e.target.closest&&e.target.closest('.npp-plot-hotspot');if(!p)return;if(e.relatedTarget&&p.contains(e.relatedTarget))return;var t=p.closest('.npp-plot-map').querySelector('.npp-map-tooltip');if(t)t.hidden=true});
 document.addEventListener('focusout',function(e){var p=e.target.closest&&e.target.closest('.npp-plot-hotspot');if(p){var t=p.closest('.npp-plot-map').querySelector('.npp-map-tooltip');if(t)t.hidden=true}});
})();
