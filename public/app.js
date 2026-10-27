'use strict';
const $=id=>document.getElementById(id), center=[24.1796,120.6495], KEY='campus-move-history-v1', REWARD_KEY='campus-move-rewards-v1', DRAW_METERS=1000;
const PAINTS=[{color:'#d95432',name:'落日橘'},{color:'#2f88b3',name:'海灣藍'},{color:'#6b8f4e',name:'苔蘚綠'},{color:'#8b6aa8',name:'鳶尾紫'},{color:'#d27990',name:'櫻花粉'},{color:'#bd963b',name:'琥珀黃'},{color:'#394b47',name:'石墨灰'},{color:'#e7e1d2',name:'雲霧白'}];
// Base map source is defined in tiles.js (CARTO Voyager, OpenStreetMap data). Change it there for school-wide use.
let records=[];
try{
    records=JSON.parse(localStorage.getItem(KEY)||'[]');
    if(!Array.isArray(records))records=[];
}
catch{}
let rewards;
try{rewards=JSON.parse(localStorage.getItem(REWARD_KEY)||'null');}catch{}
if(!rewards||!Array.isArray(rewards.draws)||!Array.isArray(rewards.pigments))rewards={totalMeters:records.filter(r=>!r.demo).reduce((sum,r)=>sum+(Number(r.meters)||0),0),draws:[],pigments:[],activePaintId:null};
const recordedMeters=records.filter(r=>r&&!r.demo).reduce((sum,r)=>sum+(Number(r.meters)||0),0);rewards.totalMeters=Math.max(0,Number(rewards.totalMeters)||0,recordedMeters);
persistRewards();
let map, route, halo=null, startMarker=null, positionDot, accuracyCircle, targetMarker, targetLine, target=null, current=null;
let session=null, watch=null, demoTimer=null, wake=null, last=null, lastSignal=0, lines=[], storageOK=true;
function message(s){
    $('message').textContent=s;
}
function pinIcon(kind,label){
    return L.divIcon({className:'map-pin-wrap map-pin-'+kind,html:'<span class="pin-body"><b>'+label+'</b></span>',iconSize:[30,30],iconAnchor:[15,30]});
}
function setTrack(lines){
    if(route)route.setLatLngs(lines);if(halo)halo.setLatLngs(lines);
}
function persistRewards(){try{localStorage.setItem(REWARD_KEY,JSON.stringify(rewards));}catch{message('顏料資料無法寫入本機儲存空間。');}}
function activePaint(){return rewards.pigments.find(p=>p.id===rewards.activePaintId)||null;}
function availableDraws(){return Math.max(0,Math.floor(Math.max(0,Number(rewards.totalMeters)||0)/DRAW_METERS)-rewards.draws.length);}
function setRouteColor(color){if(route)route.setStyle({color});const key=document.querySelector('.track-key');if(key)key.style.background=color;const label=$('activePaintLabel');if(label)label.style.setProperty('--active-paint',color);if(session&&session.state!=='finished')session.trackColor=color;}
function renderRewards(){
    const total=Math.max(0,Number(rewards.totalMeters)||0), available=availableDraws(), remainder=total%DRAW_METERS, special=(rewards.draws.length+1)%5===0;
    $('rewardTotal').textContent=(total/1000).toFixed(2);$('rewardAvailable').textContent=available;
    $('rewardProgress').value=available?100:remainder/DRAW_METERS*100;$('rewardProgressLabel').textContent=available?`已解鎖 ${available} 次抽卡`: `再走 ${((DRAW_METERS-remainder)/1000).toFixed(2)} km 解鎖下一抽`;
    $('rewardDrawNo').textContent=choosingColor?`第 ${selectableDrawNo} 抽 · 自選顏色`:`第 ${rewards.draws.length+1} 抽${special?' · 自選顏色':''}`;
    $('rewardDraw').disabled=available===0||drawing||choosingColor;$('rewardDraw').textContent=choosingColor?'選擇這次顏色':drawing?'翻卡中…':available?'開始抽卡':'尚未解鎖';
    $('rewardDrawHint').textContent=choosingColor?'抽卡已完成；可從下方挑選這次要保留的顏色。':available?`你有 ${available} 次抽卡機會，每次抽出一種顏料。`:'每累積步行 1 公里，就能抽一次顏料。';
    $('rewardChooser').hidden=!choosingColor;
    const shelf=$('pigmentShelf');shelf.replaceChildren();
    if(!rewards.pigments.length){const empty=document.createElement('p');empty.className='reward-empty';empty.textContent='完成 1 公里後，來抽取第一份顏料。';shelf.append(empty);}
    for(const paint of rewards.pigments){const button=document.createElement('button');button.type='button';button.className='pigment-chip'+(paint.id===rewards.activePaintId?' selected':'');button.setAttribute('aria-pressed',String(paint.id===rewards.activePaintId));button.title=`套用${paint.name}繪製軌跡`;button.innerHTML=`<i style="--paint:${paint.color}"></i><span>${paint.name}</span>`;button.onclick=()=>{rewards.activePaintId=paint.id;persistRewards();setRouteColor(paint.color);renderRewards();message(`軌跡顏色已套用：${paint.name}。`);};shelf.append(button);}
    const current=activePaint();$('activePaintLabel').textContent=current?`目前軌跡顏色：${current.name}`:'尚未選擇顏料';$('activePaintSwatch').style.background=current?.color||'#d95432';
    const chooser=$('rewardChooser');chooser.replaceChildren();if(choosingColor){for(const paint of PAINTS){const button=document.createElement('button');button.type='button';button.className='paint-option';button.innerHTML=`<i style="--paint:${paint.color}"></i><span>${paint.name}</span>`;button.onclick=()=>selectDrawColor(paint);chooser.append(button);}const keep=document.createElement('button');keep.type='button';keep.className='paint-option';keep.textContent='保留抽中顏色';keep.onclick=()=>selectDrawColor(null);chooser.append(keep);}
    const history=$('drawHistory');history.replaceChildren();if(!rewards.draws.length){const empty=document.createElement('p');empty.className='reward-empty';empty.textContent='抽卡後，紀錄會顯示在這裡。';history.append(empty);}
    for(const draw of [...rewards.draws].reverse()){const row=document.createElement('div');row.className='draw-row';const swatch=document.createElement('i');swatch.style.background=draw.color;const detail=document.createElement('span'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent=`第 ${draw.drawNo} 抽 · ${draw.name}`;meta.textContent=new Date(draw.at).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});detail.append(title,meta);row.append(swatch,detail);history.append(row);}
}
let drawing=false, choosingColor=false, selectableDrawNo=0;
function drawPaint(paint,allowColorChoice=false){
    if(!paint||drawing||choosingColor||availableDraws()===0)return;
    const drawNo=rewards.draws.length+1,at=new Date().toISOString(),id=`paint-${Date.now()}-${drawNo}`;
    const entry={id,color:paint.color,name:paint.name,drawNo,acquiredAt:at};
    rewards.draws.push({drawNo,color:paint.color,name:paint.name,at,totalMeters:rewards.totalMeters});
    rewards.pigments.push(entry);rewards.activePaintId=id;persistRewards();
    drawing=true;choosingColor=allowColorChoice;selectableDrawNo=allowColorChoice?drawNo:0;$('flipCard').classList.remove('revealed');$('flipCard').classList.add('is-flipping');
    setRouteColor(paint.color);renderRewards();
    message(allowColorChoice?'抽卡成功，已扣除一次機會；可從下方自選或保留顏色。':'抽卡成功，顏料已加入並扣除一次機會。');
    setTimeout(()=>{const result=rewards.pigments.find(item=>item.id===id)||entry;$('flipCard').classList.remove('is-flipping');$('flipCard').classList.add('revealed');$('rewardResultName').textContent=result.name;$('rewardResultSwatch').style.background=result.color;drawing=false;renderRewards();if(!allowColorChoice||choosingColor)message(allowColorChoice?`抽到${result.name}，已扣除一次機會；可從下方自選或保留此顏色。`:`抽到${result.name}，已加入顏料庫並套用到軌跡。`);},520);
}
function selectDrawColor(paint){
    if(!choosingColor)return;
    const entry=rewards.pigments.find(item=>item.drawNo===selectableDrawNo);
    if(!entry)return;
    if(paint){entry.name=paint.name;entry.color=paint.color;const draw=rewards.draws.find(item=>item.drawNo===selectableDrawNo);if(draw){draw.name=paint.name;draw.color=paint.color;}}
    rewards.activePaintId=entry.id;persistRewards();choosingColor=false;selectableDrawNo=0;
    $('rewardResultName').textContent=entry.name;$('rewardResultSwatch').style.background=entry.color;setRouteColor(entry.color);renderRewards();
    message(`第 ${entry.drawNo} 抽已完成：${entry.name} 已加入顏料庫。`);
}
function requestDraw(){
    if(drawing||choosingColor||availableDraws()===0)return;
    const special=(rewards.draws.length+1)%5===0;
    drawPaint(PAINTS[Math.floor(Math.random()*PAINTS.length)],special);
}
function clearStart(){
    if(startMarker&&map)map.removeLayer(startMarker);startMarker=null;
}
function setStart(p){
    clearStart();
    if(map)startMarker=L.marker([p.lat,p.lng],{icon:pinIcon('start','起'),zIndexOffset:500}).addTo(map).bindTooltip('起點');
}
try{map=L.map('map',{zoomControl:false}).setView(center,17);L.control.zoom({position:'bottomright'}).addTo(map);addBaseMap(map).on('tileerror',()=>message('底圖載入失敗，請檢查網路；GPS 紀錄仍可繼續。'));halo=L.polyline([],{color:'#fff',weight:9,opacity:.85,lineCap:'round',lineJoin:'round'}).addTo(map);route=L.polyline([],{color:'#d95432',weight:5,lineCap:'round',lineJoin:'round'}).addTo(map);map.on('click',e=>{target=e.latlng;if(targetMarker)map.removeLayer(targetMarker);targetMarker=L.marker(target,{icon:pinIcon('target','集'),zIndexOffset:600}).addTo(map).bindPopup('老師指定的集合點').openPopup();updateTarget();});}catch{$('map').innerHTML='<p class="map-fallback">地圖元件無法載入，請重新整理。GPS 記錄仍可使用。</p>';}
function updateTarget(){
    if(!target){$('navigate').hidden=true;$('targetInfo').textContent='點一下地圖，設定老師指定的集合點。';return;}let info='集合點已設定（依老師現場指示通行）。';if(current){info=`距集合點直線約 ${Math.round(MoveCore.distance(current,{lat:target.lat,lng:target.lng}))} 公尺；虛線不是步行路線。`;if(targetLine)map.removeLayer(targetLine);targetLine=L.polyline([[current.lat,current.lng],target],{color:'#ae703d',dashArray:'6 8',weight:2}).addTo(map);}$('targetInfo').textContent=info;$('navigate').hidden=false;$('navigate').href=`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=walking`;}
function clearTarget(){
    target=null;for(const l of [targetMarker,targetLine])if(l&&map)map.removeLayer(l);targetMarker=targetLine=null;updateTarget();}
$('clearTarget').onclick=clearTarget;$('campus').onclick=()=>map&&map.setView(center,17);
function displayPosition(p){
    current=p;if(map){const ll=[p.lat,p.lng];if(!positionDot){positionDot=L.circleMarker(ll,{radius:7,color:'white',weight:3,fillColor:'#2f88b3',fillOpacity:1}).addTo(map);accuracyCircle=L.circle(ll,{radius:p.accuracy,color:'#2f88b3',weight:1,fillOpacity:.08}).addTo(map);}else{positionDot.setLatLng(ll);accuracyCircle.setLatLng(ll).setRadius(p.accuracy);}}$('accuracy').textContent=`±${Math.round(p.accuracy)} m`;updateTarget();}
const GEO_REASONS={1:'定位權限被拒絕：請到瀏覽器／手機設定允許位置與精確定位後重試。',2:'目前無法取得位置，請移到戶外空曠處。',3:'定位逾時，請確認 GPS 已開啟後重試。'};
function geoError(err){
    if(session?.state==='running')pause('定位中斷，已暫停。'+(GEO_REASONS[err.code]||'請重試。'));else message(GEO_REASONS[err.code]||'定位失敗。');$('badge').textContent='● 定位不可用';}
function locateError(err){
    message(GEO_REASONS[err.code]||'定位失敗。');if(!session||session.state!=='running')$('badge').textContent='● 定位不可用';}
function available(){
    if(!window.isSecureContext){
        message('GPS 需要 HTTPS 網址（電腦本機 localhost 例外），請依部署說明開啟。');
        return false;}if(!navigator.geolocation){message('此瀏覽器不支援定位，請改用 Safari 或 Chrome。');return false;}return true;}
$('locate').onclick=()=>{if(session?.demo){message('示範模式使用模擬位置；結束後可取得真實定位。');return;}if(!available())return;message('正在取得你的定位…');navigator.geolocation.getCurrentPosition(pos=>{const p=normalize(pos);displayPosition(p);map&&map.setView([p.lat,p.lng],18);$('badge').textContent='● 已定位';message('已顯示目前位置。開始運動才會記錄軌跡。');},locateError,{enableHighAccuracy:true,timeout:15000,maximumAge:0});};
function normalize(pos){return {lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,altitude:Number.isFinite(pos.coords.altitude)?pos.coords.altitude:null,t:pos.timestamp};}
function seconds(){return session?session.seconds+(session.state==='running'&&session.runStart?(Date.now()-session.runStart)/1000:0):0;}
function fmt(n){const s=Math.floor(n);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function settleEnergy(){if(!session)return;const elapsed=seconds();if(session.state==='running'){session.metSeconds+=Math.max(0,elapsed-session.energySeconds)*session.actualMet;}session.energySeconds=elapsed;}
function averageMet(){if(!session)return 0;const elapsed=seconds();if(elapsed<=0)return session.metBase;const accumulated=session.metSeconds+(session.state==='running'?Math.max(0,elapsed-session.energySeconds)*session.actualMet:0);return accumulated/elapsed;}
function render(){if(session?.state==='running')settleEnergy();document.body.classList.toggle('is-active',!!session&&session.state!=='finished');$('activityLabel').textContent=session?.demo?'示範運動':session?.mode?.split(' · ')[0]||'舒適步行';const s=seconds(),d=session?.meters||0;$('elapsed').textContent=fmt(s);$('distance').textContent=(d/1000).toFixed(2);$('calories').textContent=session?MoveCore.calories(averageMet(),session,s).toFixed(1):'0.0';$('speed').textContent=s>0?(d/s*3.6).toFixed(1):'0.0';$('points').textContent=`${session?.points.length||0} 個有效點`;$('fields').disabled=!!session&&session.state!=='finished';$('start').disabled=!!session&&session.state!=='finished';$('demo').disabled=$('start').disabled;$('pause').disabled=!session||session.state==='finished';$('finish').disabled=!session||session.state==='finished';$('pause').textContent=session?.state==='paused'?'▶ 繼續':'Ⅱ 暫停';}
async function holdScreen(){try{if('wakeLock'in navigator)wake=await navigator.wakeLock.request('screen');}catch{}}
function stopWatch(){if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}clearInterval(demoTimer);demoTimer=null;wake?.release().catch(()=>{});wake=null;}
function receive(p){if(!session||session.state!=='running')return;lastSignal=Date.now();displayPosition(p);const result=MoveCore.accept(last,p);if(!result.ok){message(result.reason);return;}settleEnergy();if(!session.runStart&&!session.demo)session.runStart=Date.now();if(result.break){session.slope=0;session.actualMet=session.metBase;session.slopeAnchor=Number.isFinite(p.altitude)?p:null;session.slopeDistance=0;}else if(Number.isFinite(p.altitude)){if(session.slopeAnchor){session.slopeDistance+=result.meters;if(session.slopeDistance>=20){session.slope=MoveCore.slope(session.slopeAnchor,p);session.slopeAnchor=p;session.slopeDistance=0;session.actualMet=session.metBase+session.slope;}}else{session.slopeAnchor=p;session.slopeDistance=0;}}else{session.slope=0;session.actualMet=session.metBase;session.slopeAnchor=null;session.slopeDistance=0;}if(result.break||!lines.length)lines.push([]);lines[lines.length-1].push([p.lat,p.lng]);session.meters+=result.meters;session.points.push({...p,segment:lines.length-1});last=p;setTrack(lines);if(session.points.length===1&&map){map.setView([p.lat,p.lng],17);setStart(p);}$('badge').textContent=session.demo?'● 示範資料':'● GPS 記錄中';message(session.demo?'示範模式：使用模擬座標與時間，紀錄不代表真實運動。':'記錄中。保持頁面在前景；停下來休息時請按暫停。');render();}
function run(){session.state='running';session.runStart=0;last=null;session.actualMet=session.metBase;session.slope=0;session.slopeAnchor=null;session.slopeDistance=0;lastSignal=Date.now();if(session.demo){demoTick();demoTimer=setInterval(demoTick,1000);}else{watch=navigator.geolocation.watchPosition(pos=>receive(normalize(pos)),geoError,{enableHighAccuracy:true,maximumAge:0,timeout:15000});holdScreen();}render();}
function begin(demo){const fields=demo?['height','weight','age'].map($):[$('profile')];if(!fields.every(el=>el.reportValidity()))return;if(!demo&&!available())return;$('setupDialog').close();stopWatch();const baseMet=+$('mode').value;session={id:Date.now(),date:new Date().toISOString(),trackColor:activePaint()?.color||'#d95432',alias:$('alias').value.trim(),height:+$('height').value,weight:+$('weight').value,age:+$('age').value,sex:$('sex').value||'male',bodyFatPercent:$('bodyFat').value===''?null:+$('bodyFat').value,met:baseMet,metBase:baseMet,actualMet:baseMet,slope:0,metSeconds:0,energySeconds:0,mode:$('mode').selectedOptions[0].textContent,demo,seconds:0,meters:0,points:[],runStart:0,state:'running',demoIndex:0,slopeAnchor:null,slopeDistance:0};lines=[];setTrack([]);setRouteColor(session.trackColor);clearStart();message(demo?'正在啟動示範…':'等待第一個有效 GPS 點後開始計時…');$('badge').textContent=demo?'● 示範模式':'● 等待 GPS';run();}
$('profile').onsubmit=e=>{e.preventDefault();begin(false);};$('demo').onclick=()=>begin(true);
function demoTick(){const i=session.demoIndex++,angle=i*.12;session.seconds+=5;receive({lat:center[0]+.00062*Math.sin(angle),lng:center[1]+.00085*Math.cos(angle),accuracy:6,t:session.id+i*6000});}
function pause(reason){if(!session||session.state!=='running')return;settleEnergy();session.seconds=seconds();session.runStart=0;session.state='paused';stopWatch();last=null;$('badge').textContent='● 已暫停';message(reason||'已暫停；暫停期間不累計時間與距離。');render();}
$('pause').onclick=()=>{if(session.state==='running')pause();else {message('等待新的有效定位後繼續…');run();}};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(records));storageOK=true;}catch{storageOK=false;message('裝置儲存空間不足或儲存被封鎖。紀錄暫留本頁，請先匯出 CSV 再離開。');}}
$('finish').onclick=()=>{if(!session||session.state==='finished')return;settleEnergy();session.seconds=seconds();session.runStart=0;session.state='finished';stopWatch();session.met=session.seconds>0?session.metSeconds/session.seconds:session.metBase;session.kcal=MoveCore.calories(session.met,session,session.seconds);records.unshift({...session,points:[...session.points],target:target?{lat:target.lat,lng:target.lng}:null});if(!session.demo){rewards.totalMeters+=session.meters;persistRewards();renderRewards();}persist();renderHistory();render();$('badge').textContent='● 運動已結束';if(storageOK)message(`已儲存${session.demo?'示範':''}紀錄：${(session.meters/1000).toFixed(2)} km，${fmt(session.seconds)}。可匯出摘要或 GPS 軌跡。`);};
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function cell(v){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function exportCSV(items){if(!items.length){message('目前沒有可匯出的紀錄。');return;}const rows=[['時間 ISO','課堂代號','類型','活動','性別','體脂率 %','身高 cm','體重 kg','年齡','平均 MET','時間 sec','距離 m','總熱量 kcal','有效 GPS 點'],...items.map(r=>[r.date,r.alias,r.demo?'示範':'GPS',r.mode,r.sex||'',r.bodyFatPercent??'',r.height,r.weight,r.age,r.met,Math.round(r.seconds),r.meters.toFixed(1),r.kcal.toFixed(1),r.points.length])];download('campus-move.csv','\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
let historyFilter='all';
function routeThumbnail(r){const box=document.createElement('div');box.className='route-thumb';const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 100 67');svg.setAttribute('aria-label','此筆運動軌跡縮圖');const ps=r.points||[];if(ps.length>1){const xs=ps.map(p=>p.lng),ys=ps.map(p=>p.lat),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);const scale=Math.min(76/Math.max(maxX-minX,.00001),43/Math.max(maxY-minY,.00001));const groups=new Map();for(const p of ps){const k=p.segment||0;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(`${50+(p.lng-(minX+maxX)/2)*scale},${33.5-(p.lat-(minY+maxY)/2)*scale}`);}for(const points of groups.values()){const poly=document.createElementNS(ns,'polyline');poly.setAttribute('points',points.join(' '));poly.setAttribute('fill','none');poly.setAttribute('stroke',r.trackColor||'#d95432');svg.append(poly);}}else{const t=document.createElementNS(ns,'text');t.setAttribute('x','50');t.setAttribute('y','38');t.setAttribute('text-anchor','middle');t.setAttribute('stroke','none');t.setAttribute('fill','#9aa987');t.setAttribute('font-size','9');t.textContent='尚無軌跡';svg.append(t);}box.append(svg);return box;}
function renderHistory(){const root=$('records');root.replaceChildren();const actual=records.filter(r=>!r.demo);$('historyTotal').textContent=actual.length?`${actual.length} 次運動 · ${(actual.reduce((s,r)=>s+r.meters,0)/1000).toFixed(2)} km`:'尚無 GPS 運動紀錄';const shown=records.filter(r=>historyFilter==='all'||(historyFilter==='demo'?r.demo:!r.demo));if(!shown.length){root.innerHTML='<div class="empty"><div class="empty-art"><svg><use href="#i-route"/></svg></div><div><h3>從第一段路，開始累積。</h3><p>完成運動後，你的距離、時間與軌跡會留在這裡。</p></div></div>';return;}shown.forEach(r=>{const row=document.createElement('div');row.className='record';row.append(routeThumbnail(r));const info=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('small');title.textContent=`${r.demo?'示範 · ':''}${r.alias||r.mode.split(' · ')[0]}`;sub.textContent=new Date(r.date).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});info.append(title,sub);row.append(info);const stats=document.createElement('div');stats.className='record-stats';for(const [value,label]of [[(r.meters/1000).toFixed(2),'公里'],[fmt(r.seconds),'運動時間']]){const item=document.createElement('span');item.textContent=value;const unit=document.createElement('small');unit.textContent=label;item.append(unit);stats.append(item);}row.append(stats);const actions=document.createElement('div');actions.className='record-actions';for(const [label,handler]of [...(!r.demo?[['繳交',()=>window.PaceSubmit?.(r)]]:[]),['摘要',()=>exportCSV([r])],['軌跡',()=>download('campus-track.json',JSON.stringify(r,null,2),'application/json')],['刪除',()=>{if(confirm('刪除此筆運動紀錄？')){records=records.filter(x=>x.id!==r.id);persist();renderHistory();}}]]){const button=document.createElement('button');button.textContent=label;button.onclick=handler;if(label==='繳交')button.dataset.cloudOnly='';actions.append(button);}row.append(actions);root.append(row);});}
$('openSetup').onclick=()=>$('setupDialog').showModal();$('closeSetup').onclick=()=>$('setupDialog').close();$('energyInfo').onclick=()=>$('energyDialog').showModal();$('closeEnergy').onclick=()=>$('energyDialog').close();
$('todayDate').textContent=new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{historyFilter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});renderHistory();});
$('exportAll').onclick=()=>exportCSV(records);$('deleteAll').onclick=()=>{if(records.length&&confirm('永久刪除此裝置全部運動紀錄？')){records=[];persist();renderHistory();}};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.state==='running')pause('頁面已離開前景，為避免漏記與錯估已自動暫停。回到頁面後按「繼續」。');});
window.addEventListener('beforeunload',e=>{if(session&&session.state!=='finished'){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(session?.state==='running'&&!session.demo&&Date.now()-lastSignal>30000)pause('超過 30 秒沒有 GPS 更新，已自動暫停。請檢查定位後按繼續。');render();},1000);
function refreshHistoryFromStorage(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved)){records=saved;renderHistory();}}catch{}}
function refreshRewardsFromStorage(){try{const saved=JSON.parse(localStorage.getItem(REWARD_KEY)||'null');if(saved&&Array.isArray(saved.draws)&&Array.isArray(saved.pigments))rewards=saved;const recordedMeters=records.filter(r=>r&&!r.demo).reduce((sum,r)=>sum+(Number(r.meters)||0),0);rewards.totalMeters=Math.max(0,Number(rewards.totalMeters)||0,recordedMeters);persistRewards();renderRewards();}catch{}}
window.addEventListener('storage',event=>{if(event.key===KEY)refreshHistoryFromStorage();if(event.key===REWARD_KEY)refreshRewardsFromStorage();});
window.addEventListener('pageshow',event=>{if(event.persisted){refreshHistoryFromStorage();refreshRewardsFromStorage();}});
renderHistory();render();renderRewards();setRouteColor(activePaint()?.color||'#d95432');if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});

$('rewardDraw').onclick=requestDraw;
document.querySelectorAll('.sidenav a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.sidenav a').forEach(n=>n.classList.toggle('active',n===a));document.querySelector('.breadcrumb strong').textContent=a.textContent.trim();}));
