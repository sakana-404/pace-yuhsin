export type Identity={userId:string;email:string};
export class ApiError extends Error{constructor(public status:number,message:string){super(message)}}
function fail(status:number,message:string):never{throw new ApiError(status,message)}
const str=(v:unknown,max=80)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max?v.trim():fail(400,'文字欄位格式不正確。');
const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail(400,'數值超出允許範圍。');
const id=()=>crypto.randomUUID();const now=()=>new Date().toISOString();
// Compares the browser's Origin host with the Host header the client targeted. Do not compare with request.url:
// behind Cloudflare Tunnel or a reverse proxy the app sees its local address and scheme, not the public one.
export function isSameSiteWrite(origin:string|null,host:string|null){if(!origin||!host)return false;try{return new URL(origin).host.toLowerCase()===host.toLowerCase();}catch{return false;}}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function classroom(db:D1Database,user:Identity,teacher:boolean,method:string,op:string,data:Record<string,any>){
 const uid=user.userId;
 const own=async(cid:string)=>{const c=await db.prepare('SELECT * FROM classes WHERE id=? AND owner_id=?').bind(cid,uid).first();if(!c)fail(403,'無權管理此班級。');return c;};
 const member=async(cid:string)=>{const m=await db.prepare("SELECT * FROM members WHERE class_id=? AND user_id=? AND status='active'").bind(cid,uid).first();if(!m)fail(403,'請先加入班級並等待老師核准。');return m;};
 if(method==='GET'){
  if(op==='me')return {signedIn:true,teacher,email:user.email};
  if(op==='classes')return {classes:teacher?(await db.prepare('SELECT *, (SELECT COUNT(*) FROM members WHERE class_id=classes.id) AS enrolled FROM classes WHERE owner_id=? ORDER BY created_at DESC').bind(uid).all()).results:(await db.prepare('SELECT c.id,c.title,c.capacity,m.status,m.alias FROM classes c JOIN members m ON m.class_id=c.id WHERE m.user_id=? ORDER BY c.created_at DESC').bind(uid).all()).results};
  if(op==='lessons'){const cid=str(data.classId);if(teacher)await own(cid);else await member(cid);return {lessons:(await db.prepare('SELECT * FROM lessons WHERE class_id=? ORDER BY created_at DESC LIMIT 100').bind(cid).all()).results};}
  if(op==='dashboard'){const cid=str(data.classId);await own(cid);const lessonId=str(data.lessonId);const l=await db.prepare('SELECT * FROM lessons WHERE id=? AND class_id=?').bind(lessonId,cid).first();if(!l)fail(404,'找不到課程。');const students=(await db.prepare('SELECT m.id,m.alias,m.status,m.joined_at,a.id AS activity_id,a.started_at,a.seconds,a.meters,a.kcal,a.met,a.height,a.weight,a.age,a.point_count,a.created_at AS submitted_at FROM members m LEFT JOIN activities a ON a.member_id=m.id AND a.lesson_id=? WHERE m.class_id=? ORDER BY m.alias').bind(lessonId,cid).all()).results;return {lesson:l,students};}
  if(op==='myActivities')return {activities:(await db.prepare('SELECT a.*,c.title AS class_title,l.title AS lesson_title FROM activities a JOIN classes c ON c.id=a.class_id JOIN lessons l ON l.id=a.lesson_id WHERE a.user_id=? ORDER BY a.created_at DESC LIMIT 200').bind(uid).all()).results};
  fail(404,'找不到操作。');
 }
 if(op==='createClass'){
  if(!teacher)fail(403,'此帳號沒有教師權限。');
  const title=str(data.title,60),capacity=number(data.capacity??60,1,60);if(!Number.isInteger(capacity))fail(400,'人數需為整數。');
  const count=await db.prepare('SELECT COUNT(*) AS n FROM classes WHERE owner_id=?').bind(uid).first<{n:number}>();if((count?.n||0)>=30)fail(409,'班級數量已達 30 個上限。');
  const cid=id(),lid=id(),code=crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),date=now();
  await db.batch([db.prepare('INSERT INTO classes(id,owner_id,title,join_code,capacity,created_at) VALUES(?,?,?,?,?,?)').bind(cid,uid,title,code,capacity,date),db.prepare('INSERT INTO lessons(id,class_id,title,target_minutes,created_at) VALUES(?,?,?,?,?)').bind(lid,cid,'第一次校園探索',20,date)]);return {classId:cid,joinCode:code};
 }
 if(op==='join'){
  const code=str(data.code,12).toUpperCase(),alias=str(data.alias,24);const c=await db.prepare('SELECT id,capacity FROM classes WHERE join_code=?').bind(code).first<{id:string;capacity:number}>();if(!c)fail(404,'班級碼不正確。');
  const existing=await db.prepare('SELECT id,status FROM members WHERE class_id=? AND user_id=?').bind(c.id,uid).first();if(existing)return existing;
  const result=await db.prepare('INSERT INTO members(id,class_id,user_id,alias,status,joined_at) SELECT ?,?,?,?,\'pending\',? WHERE (SELECT COUNT(*) FROM members WHERE class_id=?) < ?').bind(id(),c.id,uid,alias,now(),c.id,c.capacity).run();if(!result.meta.changes)fail(409,'班級已滿，請聯絡老師。');return {status:'pending'};
 }
 if(op==='approve'||op==='removeMember'){
  const cid=str(data.classId);await own(cid);const mid=str(data.memberId);if(op==='approve')await db.prepare("UPDATE members SET status='active' WHERE id=? AND class_id=?").bind(mid,cid).run();else await db.prepare('DELETE FROM members WHERE id=? AND class_id=?').bind(mid,cid).run();return {ok:true};
 }
 if(op==='createLesson'){
  const cid=str(data.classId);await own(cid);const title=str(data.title,80),mins=number(data.targetMinutes??20,1,180),lid=id();await db.prepare('INSERT INTO lessons(id,class_id,title,target_minutes,created_at) VALUES(?,?,?,?,?)').bind(lid,cid,title,mins,now()).run();return {id:lid};
 }
 if(op==='closeLesson'){
  const cid=str(data.classId);await own(cid);await db.prepare('UPDATE lessons SET closed_at=? WHERE id=? AND class_id=?').bind(now(),str(data.lessonId),cid).run();return {ok:true};
 }
 if(op==='submit'){
  if(data.consent!==true)fail(400,'請先同意提交運動摘要。');const r=data.record;if(!r||r.demo!==false||r.state!=='finished')fail(400,'只接受已結束的真實 GPS 紀錄，示範不能繳交。');
  const cid=str(data.classId),lid=str(data.lessonId),m=await member(cid);const lesson=await db.prepare('SELECT * FROM lessons WHERE id=? AND class_id=?').bind(lid,cid).first();if(!lesson)fail(404,'找不到課程。');
  const clientId=str(String(r.id),80);const existing=await db.prepare('SELECT id,class_id,lesson_id FROM activities WHERE user_id=? AND client_id=?').bind(uid,clientId).first();if(existing){if(existing.class_id!==cid||existing.lesson_id!==lid)fail(409,'此紀錄已繳交到另一堂課。');return {id:existing.id,duplicate:true};}
  if(lesson.closed_at)fail(409,'老師已關閉此課程繳交。');
  const seconds=number(r.seconds,10,43200),meters=number(r.meters,0,100000),met=number(r.met,3.5,7.5),weight=number(r.weight,20,250),height=number(r.height,80,230),age=number(r.age,6,100),points=number(r.pointCount,1,100000);if(!Number.isInteger(age)||!Number.isInteger(points)||![3.5,4.8,7.5].includes(met)||meters/seconds>8)fail(400,'運動數據格式或速度異常。');
  const date=str(r.date,40),dateMs=Date.parse(date);if(!Number.isFinite(dateMs)||dateMs>Date.now()+300000||dateMs<Date.parse(String(lesson.created_at))-300000)fail(400,'運動時間須在課程建立之後。');
  const aid=id(),kcal=met*3.5*weight/200*seconds/60;
  await db.prepare('INSERT INTO activities(id,class_id,lesson_id,member_id,user_id,client_id,started_at,seconds,meters,kcal,met,height,weight,age,point_count,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(aid,cid,lid,m.id,uid,clientId,date,seconds,meters,kcal,met,height,weight,age,points,now()).run();return {id:aid};
 }
 if(op==='deleteActivity'){const aid=str(data.activityId);const row=await db.prepare('SELECT class_id,user_id FROM activities WHERE id=?').bind(aid).first();if(!row)fail(404,'找不到紀錄。');if(row.user_id!==uid)await own(String(row.class_id));await db.prepare('DELETE FROM activities WHERE id=?').bind(aid).run();return {ok:true};}
 if(op==='deleteClass'){const cid=str(data.classId);await own(cid);await db.prepare('DELETE FROM classes WHERE id=?').bind(cid).run();return {ok:true};}
 fail(404,'找不到操作。');
}
