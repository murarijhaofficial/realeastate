<?php
// Execute production bridge code with deterministic WordPress/HTTP/database doubles.
define('ABSPATH', __DIR__.'/');
$actions=[];$events=[];$requests=[];
function add_action($name,$cb,...$rest){global $actions;$actions[$name][]=$cb;}
function register_activation_hook(...$args){}
function get_option($name,$default=[]){global $config;return $name==='kcb_settings'?$config:$default;}
function wp_parse_args($a,$b){return array_merge($b,$a);}
function esc_url_raw($x){return $x;}
function wp_parse_url($x,$part){return parse_url($x,$part);}
function sanitize_text_field($x){return trim(strip_tags($x));}
function sanitize_key($x){return preg_replace('/[^a-z0-9_\-]/','',strtolower($x));}
function absint($x){return abs((int)$x);}
function current_time(...$args){return gmdate('Y-m-d H:i:s');}
function wp_next_scheduled($hook,$args){global $events;return $events[$args[0]]??false;}
function wp_schedule_single_event($at,$hook,$args){global $events;$events[$args[0]]=$at;}
function wp_clear_scheduled_hook($hook,$args){global $events;unset($events[$args[0]]);}
function wp_json_encode($x){return json_encode($x);}
function is_wp_error($x){return false;}
function wp_safe_remote_post($url,$options){global $requests,$response;$requests[]=[$url,$options];return $response;}
function wp_remote_retrieve_response_code($x){return $x['code'];}
function wp_remote_retrieve_body($x){return json_encode($x['body']);}
class FakeDB {
 public $prefix='wp_';public $row;
 function prepare($sql,...$args){return $sql;}
 function get_row($sql){return clone $this->row;}
 function query($sql){if($this->row->status==='sending')return 0;$this->row->status='sending';return 1;}
 function update($table,$values,$where){foreach($values as $k=>$v)$this->row->$k=$v;return 1;}
}
$wpdb=new FakeDB();
require __DIR__.'/../khushii-crm-bridge-v1.1.0-field-mapping/khushii-crm-bridge/khushii-crm-bridge.php';
function check($value,$message){if(!$value)throw new Exception($message);echo "PASS: $message\n";}
function reset_case(){global $wpdb,$config,$requests,$events,$response;$requests=[];$events=[];$config=['url'=>'https://crm.example/api/v1/integrations/website-leads','key'=>'Bearer ed_live_'.str_repeat('a',43)];$wpdb->row=(object)['id'=>1,'lead_key'=>'chat:1','status'=>'pending','attempts'=>0,'payload'=>json_encode(['name'=>'Example','phone'=>'+910012345678','consent'=>true,'external_id'=>'chat:1'])];$response=['code'=>201,'body'=>['success'=>true,'data'=>['enquiry_id'=>'LD-2026-test']]];}
reset_case();Khushii_CRM_Bridge::deliver(1);
check($wpdb->row->status==='synced','confirmed receipt marks synced');
check($requests[0][1]['headers']['Authorization']==='Bearer ed_live_'.str_repeat('a',43),'Bearer prefix is not duplicated');
$payload=json_decode($requests[0][1]['body'],true);
check($payload['mobile']==='+910012345678'&&$payload['external_id']==='chat:1','phone and retry identity preserved');
check($requests[0][1]['headers']['X-EstateDesk-Format']==='canonical','canonical format declared');
Khushii_CRM_Bridge::deliver(1);check(count($requests)===1,'synced lead not resent');
reset_case();$response=['code'=>200,'body'=>['success'=>true]];Khushii_CRM_Bridge::deliver(1);check($wpdb->row->status==='needs_attention','false success rejected');
reset_case();$response=['code'=>401,'body'=>['error'=>['code'=>'INVALID_API_KEY']]];Khushii_CRM_Bridge::deliver(1);check($wpdb->row->status==='needs_attention'&&!$events,'401 stops automatic retries');
reset_case();$response=['code'=>503,'body'=>[]];Khushii_CRM_Bridge::deliver(1);check($wpdb->row->status==='retrying'&&isset($events[1]),'503 schedules retry');
reset_case();$wpdb->row->payload=json_encode(['name'=>'Example','phone'=>'12345678','consent'=>false]);Khushii_CRM_Bridge::deliver(1);check(!$requests,'no-consent lead never sent');
reset_case();$saved=Khushii_CRM_Bridge::sanitize(['url'=>'https://crm.example','key'=>'']);check($saved['key']===$config['key']&&$saved['url']==='https://crm.example/api/v1/integrations/website-leads','blank key retained and backend base URL expanded');
Khushii_CRM_Bridge::schedule(5,5);check(!empty($actions['shutdown']),'initial queue schedules immediate shutdown delivery');

reset_case();$wpdb->row->status='needs_attention';$wpdb->row->http_code=401;$wpdb->row->last_error='Authentication rejected';
check(Khushii_CRM_Bridge::delivery_status('khushii_chatbot',1)==='Needs Attention (HTTP 401): Authentication rejected','source status shows current bridge failure');
$wpdb->row->status='synced';$wpdb->row->http_code=201;$wpdb->row->last_error='';
check(Khushii_CRM_Bridge::delivery_status('khushii_chatbot',1)==='Synced (HTTP 201)','source status shows successful delivery instead of stale queued label');
