(function(root){
const rad=n=>n*Math.PI/180;

function distance(a,b){
    const dlat=rad(b.lat-a.lat),dlon=rad(b.lng-a.lng);
    const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}

function schofieldBmr(profile){
    if(!Number.isFinite(profile.age)||profile.age<3||profile.age>18||!Number.isFinite(profile.weight)||!['male','female'].includes(profile.sex))return null;
    // The supplied 3–10 and 10–18 bands overlap at age 10; use 10–18 from the 10th birthday onward.
    // These coefficients produce kcal/day; /1440 is only needed when converting to kcal/min.
    const underTen=profile.age<10;
    if(profile.sex==='male')return underTen?22.706*profile.weight+504.3:17.686*profile.weight+658.2;
    return underTen?20.315*profile.weight+485.9:13.384*profile.weight+692.6;
}

function bmrMethod(profile){
    if(Number.isFinite(profile.bodyFatPercent))return '體脂率去脂體重公式';
    if(schofieldBmr(profile)!==null){
        const young=profile.age<10,sex=profile.sex==='male'?'男':'女';
        const coefficient=profile.sex==='male'?(young?'22.706':'17.686'):(young?'20.315':'13.384');
        const constant=profile.sex==='male'?(young?'504.3':'658.2'):(young?'485.9':'692.6');
        return `Schofield 青少年公式（${sex}，${young?'3–9':'10–18'} 歲）：${coefficient} × 體重 + ${constant} kcal/日`;
    }
    return '成人 Mifflin–St Jeor 公式';
}

function bmr(profile){
    if(Number.isFinite(profile.bodyFatPercent)){
        const leanMass=profile.weight*(1-profile.bodyFatPercent/100);
        return 370+21.6*leanMass;
    }
    const juvenile=schofieldBmr(profile);
    if(juvenile!==null)return juvenile;
    return 10*profile.weight+6.25*profile.height-5*profile.age+(profile.sex==='male'?5:-161);
}

function calories(met,profile,seconds){
    const basalPerHour=bmr(profile)/24;
    const durationHours=seconds/3600;
    return basalPerHour*met*durationHours;
}

function slope(previous,p){
    if(!previous||!Number.isFinite(previous.altitude)||!Number.isFinite(p.altitude))return 0;
    const meters=distance(previous,p);
    if(meters<20)return 0;
    const gradePercent=Math.max(0,(p.altitude-previous.altitude)/meters*100);
    // Use the configured uphill tiers; slopes above 15% stay at the highest defined value.
    if(gradePercent<1)return 0;
    if(gradePercent<6)return 2;
    return 5.3;
}

function accept(previous,p){
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(p.t)||!Number.isFinite(p.accuracy)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||p.accuracy<0||p.accuracy>35)
        return {ok:false,reason:'定位精度較差，等待較穩定的訊號（≤ 35 公尺）。'};
    if(!previous)
        return {ok:true,meters:0,break:true};
    const dt=(p.t-previous.t)/1000;if(dt<=0)
        return {ok:false,reason:'略過重複的定位時間。'};
    if(dt>30)
        return {ok:true,meters:0,break:true};
    const d=distance(previous,p);if(d/dt>8)
        return {ok:false,reason:'偵測到定位跳動，已略過這個點。'};
    if(d<Math.max(4,Math.min(12,(p.accuracy+previous.accuracy)*0.25)))
        return {ok:false,reason:'位置變化很小，已過濾可能的 GPS 飄移。'};
    return {ok:true,meters:d,break:false};
}
const api={distance,schofieldBmr,bmr,bmrMethod,calories,slope,accept};
if(typeof module!=='undefined')
    module.exports=api;
else
    root.MoveCore=api;
})(typeof window!=='undefined'?window:globalThis);
