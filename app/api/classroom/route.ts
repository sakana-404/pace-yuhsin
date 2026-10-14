import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { classroom,ApiError,isSameSiteWrite } from '../../../lib/classroom';
export const dynamic='force-dynamic';
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}})}
async function handle(request:Request){try{
 const user=await getChatGPTUser();if(!user)return json({error:'請先登入以使用班級功能。',signedIn:false},401);
 if(!env.DB)return json({error:'班級資料庫尚未連接。'},503);
 if(request.method==='POST'){
  if(!isSameSiteWrite(request.headers.get('origin'),request.headers.get('host')))return json({error:'不允許跨網站提交。'},403);
  if(!(request.headers.get('content-type')||'').startsWith('application/json'))return json({error:'僅接受 JSON。'},415);
 }
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 let data:Record<string,any>={};let op='me';if(request.method==='GET'){data=Object.fromEntries(new URL(request.url).searchParams);op=data.op||'me';}else{const raw=await request.text();if(raw.length>16000)return json({error:'資料過大。'},413);try{data=JSON.parse(raw);op=data.op;}catch{return json({error:'無效資料格式。'},400)}}
 const teachers=String(env.TEACHER_EMAILS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);const teacher=teachers.includes(user.email.toLowerCase());
 return json(await classroom(env.DB,user,teacher,request.method,op,data));
 }catch(e){if(e instanceof ApiError)return json({error:e.message},e.status);if(String(e).includes('UNIQUE constraint'))return json({error:'代號重複，或本堂課已繳交過紀錄。請先刪除原繳交紀錄再重新提交。'},409);console.error('Classroom operation failed');return json({error:'資料庫操作失敗，請稍後重試。'},500)}}
export const GET=handle;export const POST=handle;
