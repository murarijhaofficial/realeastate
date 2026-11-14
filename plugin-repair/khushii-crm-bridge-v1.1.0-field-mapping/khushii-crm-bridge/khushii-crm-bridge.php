<?php
/**
 * Plugin Name: Khushii CRM Lead Bridge
 * Description: Server-side CRM delivery queue for Khushii chatbot and property enquiries, with retries and delivery diagnostics.
 * Version: 1.1.3
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) exit;
require_once __DIR__.'/mapper.php';
require_once __DIR__.'/mapping-admin.php';
final class Khushii_CRM_Bridge {
 private static $shutdown_ids=[];
 const OPT='kcb_settings'; const ACTION='kcb_deliver';
 static function init(){add_action('admin_menu',[__CLASS__,'menu']);add_action('admin_init',[__CLASS__,'register']);add_action(self::ACTION,[__CLASS__,'deliver'],10,1);add_action('admin_post_kcb_retry',[__CLASS__,'retry']);add_action('admin_post_kcb_test',[__CLASS__,'test']);add_action('init',[__CLASS__,'ensure_table']);}
 static function activate(){self::ensure_table();}
 static function table(){global $wpdb;return $wpdb->prefix.'kcb_queue';}
 static function ensure_table(){global $wpdb;require_once ABSPATH.'wp-admin/includes/upgrade.php';$t=self::table();$collate=$wpdb->get_charset_collate();dbDelta("CREATE TABLE $t (id bigint(20) unsigned NOT NULL AUTO_INCREMENT, lead_key varchar(190) NOT NULL, source varchar(80) NOT NULL, payload longtext NOT NULL, status varchar(25) NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0, http_code int NOT NULL DEFAULT 0, last_error text NULL, created_at datetime NOT NULL, updated_at datetime NOT NULL, PRIMARY KEY (id), UNIQUE KEY lead_key (lead_key), KEY status (status)) $collate;");}
 static function register(){register_setting('kcb_group',self::OPT,['sanitize_callback'=>[__CLASS__,'sanitize']]);}
 static function sanitize($in){$old=get_option(self::OPT,[]);$url=esc_url_raw($in['url']??'');$path=rtrim((string)wp_parse_url($url,PHP_URL_PATH),'/');if($path===''||$path==='/api/v1')$url=rtrim($url,'/').($path===''?'/api/v1':'').'/integrations/website-leads';$host=wp_parse_url($url,PHP_URL_HOST);if(!$host||strtolower((string)wp_parse_url($url,PHP_URL_SCHEME))!=='https')$url=$old['url']??'';$mode=in_array($in['auth']??'', ['bearer','x-api-key','api-key'],true)?$in['auth']:'bearer';$mode_payload=in_array($in['format']??'', ['flat','nested'],true)?$in['format']:'flat';return ['url'=>$url,'auth'=>$mode,'format'=>$mode_payload,'key'=>!empty($in['key'])?preg_replace('/^Bearer\s+/i','',trim(sanitize_text_field($in['key']))):($old['key']??'')];}
 static function config(){return wp_parse_args(get_option(self::OPT,[]),['url'=>'','auth'=>'bearer','format'=>'flat','key'=>'']);}
 static function enqueue($source,$id,$lead){global $wpdb;$key=sanitize_key($source).':'.absint($id);if(!$id||empty($lead['name'])||empty($lead['phone']))return false;$now=current_time('mysql',true);$payload=['external_id'=>$key,'source'=>sanitize_key($source),'name'=>sanitize_text_field($lead['name']),'phone'=>sanitize_text_field($lead['phone']),'email'=>sanitize_email($lead['email']??''),'project'=>sanitize_text_field($lead['project']??''),'plot_number'=>sanitize_text_field($lead['plot_number']??''),'enquiry_type'=>sanitize_text_field($lead['enquiry_type']??''),'budget'=>sanitize_text_field($lead['budget']??''),'message'=>sanitize_textarea_field($lead['message']??''),'page_url'=>esc_url_raw($lead['page_url']??''),'consent'=>isset($lead['consent']) && ($lead['consent']===true || $lead['consent']===1 || $lead['consent']==='1'),'location'=>sanitize_text_field($lead['location']??''),'timeline'=>sanitize_text_field($lead['timeline']??''),'visit_date'=>sanitize_text_field($lead['visit_date']??''),'plot_size'=>sanitize_text_field($lead['plot_size']??'')];$t=self::table();$wpdb->query($wpdb->prepare("INSERT IGNORE INTO $t (lead_key,source,payload,status,created_at,updated_at) VALUES (%s,%s,%s,'pending',%s,%s)",$key,sanitize_key($source),wp_json_encode($payload),$now,$now));$qid=(int)$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE lead_key=%s",$key));if($qid){self::schedule($qid,5);return $qid;}return false;}
 static function enqueue_json($source,$json,$batch_id=''){
  // Server-side entry point only; callers must authenticate/authorize their own input.
  global $wpdb;
  $c=KCB_Mapping_Admin::settings();
  if(empty($c['confirmed']))return new WP_Error('mapping_unconfirmed','Administrator must confirm the field mapping.');
  $data=KCB_Field_Mapper::parse($json);if(is_wp_error($data))return $data;
  $items=KCB_Field_Mapper::extract($data,$c['array_path']);if(is_wp_error($items))return $items;
  $source=sanitize_key($source);if(!$source)return new WP_Error('source','Source identifier required.');
  if(strlen($batch_id)>120)return new WP_Error('batch_id','Batch ID too long.');
  // Stable source submission ID is essential for idempotent retries of missing external IDs.
  // Do not hash PII to derive a duplicate key. Require a stable submission ID from the caller.
  if($batch_id==='')return new WP_Error('batch_id','Stable source submission ID required for safe deduplication and retries.');
  $prepared=[];
  foreach($items as $i=>$item){
   $r=KCB_Field_Mapper::normalize($item,$c['fields'],$c['yes']);
   if($r['errors'])return new WP_Error('invalid_lead','Item '.($i+1).': '.implode(' ',$r['errors']));
   $v=$r['payload'];
   $external=$v['external_id']!==''?$v['external_id']:wp_generate_uuid4();
   $key=$source.':'.hash('sha256',$batch_id.':'.$i);
   $lead=['external_id'=>$external,'source'=>$source,'name'=>$v['customer_name'],'phone'=>$v['mobile'],'email'=>$v['email'],'message'=>$v['message'],'consent'=>$v['consent']];
   $prepared[]=['key'=>$key,'payload'=>wp_json_encode($lead)];
  }
  $ids=[];$now=current_time('mysql',true);$t=self::table();
  foreach($prepared as $item){
   $wpdb->query($wpdb->prepare("INSERT IGNORE INTO $t (lead_key,source,payload,status,created_at,updated_at) VALUES (%s,%s,%s,'pending',%s,%s)",$item['key'],$source,$item['payload'],$now,$now));
   $qid=(int)$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE lead_key=%s",$item['key']));
   if(!$qid)return new WP_Error('database','Could not queue a lead.');
   $ids[]=$qid;self::schedule($qid,5);
  }
  return $ids;
 }
 static function schedule($id,$delay){if($delay===5&&!isset(self::$shutdown_ids[$id])){self::$shutdown_ids[$id]=true;add_action('shutdown',static function() use ($id){Khushii_CRM_Bridge::deliver($id);});}if(!wp_next_scheduled(self::ACTION,[$id]))wp_schedule_single_event(time()+$delay,self::ACTION,[$id]);}
 static function deliver($id){
  global $wpdb; $t=self::table(); $id=absint($id);
  $row=$wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id=%d",$id));
  if(!$row || $row->status==='synced')return;
  $c=self::config(); $token=preg_replace('/^Bearer\s+/i','',trim($c['key']));
  if(!preg_match('/^ed_live_[A-Za-z0-9_-]{43}$/D',$token)){self::mark($id,'needs_configuration',$row->attempts,0,'Use a website API key from CRM Integrations (ed_live_), not a login token or server secret.');return;}
  $url=esc_url_raw($c['url']);
  if(strtolower((string)wp_parse_url($url,PHP_URL_SCHEME))!=='https' || rtrim((string)wp_parse_url($url,PHP_URL_PATH),'/')!=='/api/v1/integrations/website-leads'){self::mark($id,'needs_configuration',$row->attempts,0,'Set the HTTPS CRM backend URL ending /api/v1/integrations/website-leads.');return;}
  $claimed=$wpdb->query($wpdb->prepare("UPDATE $t SET status='sending', updated_at=%s WHERE id=%d AND (status NOT IN ('sending','synced') OR (status='sending' AND updated_at < %s))",current_time('mysql',true),$id,gmdate('Y-m-d H:i:s',time()-300)));
  if(!$claimed)return;
  wp_clear_scheduled_hook(self::ACTION,[$id]);
  self::schedule($id,360); // Recover a worker interrupted after claiming the row.
  $attempts=(int)$row->attempts+1; $lead=json_decode($row->payload,true);
  if(!is_array($lead)){self::mark($id,'failed',$attempts,0,'Invalid queued JSON');return;}
  $body=['customer_name'=>$lead['name']??'', 'mobile'=>$lead['phone']??'', 'email'=>$lead['email']??'', 'message'=>$lead['message']??'', 'consent'=>($lead['consent']??false)===true, 'external_id'=>$lead['external_id']??$row->lead_key];
  foreach(['project','budget','timeline','visit_date','plot_size','page_url'] as $field)if(!empty($lead[$field]))$body[$field]=$lead[$field];
  $body['category']=$lead['enquiry_type']??'';
  if(!$body['consent']){self::mark($id,'needs_attention',$attempts,0,'Explicit contact consent is required.');return;}
  $res=wp_safe_remote_post($url,['timeout'=>20,'redirection'=>0,'sslverify'=>true,'headers'=>['Content-Type'=>'application/json','Accept'=>'application/json','Authorization'=>'Bearer '.$token,'X-EstateDesk-Format'=>'canonical'],'body'=>wp_json_encode($body)]);
  $code=is_wp_error($res)?0:(int)wp_remote_retrieve_response_code($res);
  $response=is_wp_error($res)?null:json_decode(wp_remote_retrieve_body($res),true);
  if($code>=200&&$code<300&&($response['success']??false)===true&&isset($response['data']['enquiry_id'])&&is_string($response['data']['enquiry_id'])&&preg_match('/^LD-[A-Za-z0-9-]+$/D',$response['data']['enquiry_id'])){self::mark($id,'synced',$attempts,$code,'');return;}
  $err='HTTP '.$code;
  if($code===401)$err.=': Authentication rejected. Verify backend URL and active ed_live_ website key for an active project.';
  elseif($code===400||$code===422)$err.=': Payload rejected. Check consent, field mapping and field lengths.';
  elseif($code>=200&&$code<300)$err.=': No confirmed CRM enquiry ID. Check endpoint; delivery not confirmed.';
  elseif($code===0)$err='Network request failed; check HTTPS connectivity.';
  if(isset($response['error']['code'])&&is_string($response['error']['code']))$err.=' ['.substr(sanitize_key($response['error']['code']),0,60).']';
  $retryable=$code===0||$code===408||$code===425||$code===429||$code>=500;
  if($retryable&&$attempts<12){self::mark($id,'retrying',$attempts,$code,$err);self::schedule($id,min(21600,60*pow(2,min(8,$attempts-1))));}
  else self::mark($id,'needs_attention',$attempts,$code,$err);
 }
 static function mark($id,$status,$attempts,$code,$err){wp_clear_scheduled_hook(self::ACTION,[$id]);global $wpdb;$wpdb->update(self::table(),['status'=>$status,'attempts'=>$attempts,'http_code'=>$code,'last_error'=>substr($err,0,400),'updated_at'=>current_time('mysql',true)],['id'=>$id]);}
 static function delivery_status($source,$id){
  global $wpdb;
  $key=sanitize_key($source).':'.absint($id);
  $row=$wpdb->get_row($wpdb->prepare('SELECT status,http_code,last_error FROM '.self::table().' WHERE lead_key=%s',$key));
  if(!$row)return 'Not queued in CRM bridge';
  $label=ucwords(str_replace('_',' ',$row->status));
  if($row->http_code)$label.=' (HTTP '.(int)$row->http_code.')';
  if($row->last_error)$label.=': '.$row->last_error;
  return $label;
 }
 static function menu(){add_menu_page('Khushii CRM Sync','Khushii CRM Sync','manage_options','kcb',[__CLASS__,'admin'],'dashicons-cloud-upload',28);}
 static function admin(){if(!current_user_can('manage_options'))return;$c=self::config();echo '<div class="wrap"><h1>Khushii CRM Sync</h1><p>All leads are saved in WordPress before CRM delivery. Retryable failures are queued. This does not guarantee acceptance by a protected or incompatible API.</p><form method="post" action="options.php">';settings_fields('kcb_group');echo '<table class="form-table"><tr><th>CRM endpoint</th><td><input class="large-text" type="url" name="'.self::OPT.'[url]" value="'.esc_attr($c['url']).'" required></td></tr><tr><th>API format</th><td>EstateDesk website API (Bearer authentication, canonical JSON)</td></tr><tr><th>API key</th><td><input type="password" autocomplete="new-password" name="'.self::OPT.'[key]" value="" placeholder="Leave blank to keep existing key"><p>Stored in WordPress options; never exposed in frontend scripts.</p></td></tr></table>';submit_button('Save CRM Settings');echo '</form><h2>Connection test</h2><p>Creates a real test lead at the endpoint. Delete it from your CRM afterwards.</p><form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="kcb_test">';wp_nonce_field('kcb_test');submit_button('Send Test Lead','secondary');echo '</form>';if(isset($_GET['test']))echo '<p><strong>Test result: '.esc_html(sanitize_text_field(wp_unslash($_GET['test']))).'</strong></p>';global $wpdb;$rows=$wpdb->get_results('SELECT id,lead_key,source,status,attempts,http_code,last_error,created_at FROM '.self::table().' ORDER BY id DESC LIMIT 100');echo '<h2>Delivery queue (last 100)</h2><table class="widefat striped"><thead><tr><th>Lead</th><th>Source</th><th>Status</th><th>Attempts</th><th>HTTP</th><th>Last error</th><th>Retry</th></tr></thead><tbody>';foreach($rows as $r){$link=wp_nonce_url(admin_url('admin-post.php?action=kcb_retry&id='.$r->id),'kcb_retry_'.$r->id);echo '<tr><td>'.esc_html($r->lead_key).'</td><td>'.esc_html($r->source).'</td><td>'.esc_html($r->status).'</td><td>'.(int)$r->attempts.'</td><td>'.(int)$r->http_code.'</td><td>'.esc_html($r->last_error).'</td><td><a href="'.esc_url($link).'">Retry</a></td></tr>';}echo '</tbody></table><p>For reliable retries configure a server cron to invoke wp-cron.php. Synced requires a successful CRM response containing an enquiry ID.</p></div>';}
 static function retry(){if(!current_user_can('manage_options'))wp_die('Forbidden');$id=absint($_GET['id']??0);check_admin_referer('kcb_retry_'.$id);global $wpdb;if(!in_array($wpdb->get_var($wpdb->prepare('SELECT status FROM '.self::table().' WHERE id=%d',$id)),['sending','synced'],true)){$wpdb->update(self::table(),['status'=>'pending'],['id'=>$id]);self::deliver($id);}wp_safe_redirect(admin_url('admin.php?page=kcb'));exit;}
 static function test(){if(!current_user_can('manage_options'))wp_die('Forbidden');check_admin_referer('kcb_test');$id=self::enqueue('crm_test',time(),['name'=>'Khushii CRM Test','phone'=>'9999999999','email'=>'crm-test@example.invalid','project'=>'Integration Test','enquiry_type'=>'CRM Test','message'=>'TEST ONLY — please delete this record','consent'=>true]);if($id)self::deliver($id);global $wpdb;$status=$id?$wpdb->get_var($wpdb->prepare('SELECT CONCAT(status, " (HTTP ", http_code, ")") FROM '.self::table().' WHERE id=%d',$id)):'queue_failed';wp_safe_redirect(add_query_arg('test',rawurlencode($status),admin_url('admin.php?page=kcb')));exit;}
}
register_activation_hook(__FILE__,['Khushii_CRM_Bridge','activate']);Khushii_CRM_Bridge::init();
