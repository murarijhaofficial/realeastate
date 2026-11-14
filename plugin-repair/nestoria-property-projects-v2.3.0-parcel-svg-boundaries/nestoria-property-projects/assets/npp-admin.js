jQuery(function($){
    var frame;
    $('#npp_gallery_select').on('click',function(e){
        e.preventDefault();
        if(frame){frame.open();return;}
        frame=wp.media({title:'Select project gallery images',button:{text:'Use selected images'},multiple:true,library:{type:'image'}});
        frame.on('select',function(){
            var ids=[],preview='';
            frame.state().get('selection').each(function(att){var a=att.toJSON();ids.push(a.id);var src=(a.sizes&&a.sizes.thumbnail)?a.sizes.thumbnail.url:a.url;preview+='<img src="'+src+'" style="width:84px;height:64px;object-fit:cover;border:1px solid #ccd0d4;border-radius:5px">';});
            $('#npp_gallery_ids').val(ids.join(','));$('#npp_gallery_preview').html(preview);
        });
        frame.open();
    });
    $('#npp_gallery_clear').on('click',function(e){e.preventDefault();$('#npp_gallery_ids').val('');$('#npp_gallery_preview').empty();});
});
