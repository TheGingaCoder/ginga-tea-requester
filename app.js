const SUPABASE_URL = "https://goqdqneuwaxoyxyopfdl.supabase.co";
const SUPABASE_KEY = "sb_publishable_ri3ecPVbIE9gsrvggZm-pQ_DeKQ1mUZ";
const PREF_KEY = "ginga-tea-requester:preferences";
const $ = id => document.getElementById(id);
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let data = {settings:{open:"07:00",close:"22:00",cooldown:60,limit:4,enabled:true,hoursOverride:false,sound:false},requests:[]};
let admin = false, channel = null, toastTimer, audioContext;
let settingsDirty = false;

const personality = {
 ready:["ALL SYSTEMS OPERATIONAL.","KETTLE LINK ESTABLISHED. AWAITING AUTHORISATION.","BEVERAGE RESPONSE UNIT STANDING BY."],
 cooldown:["PLEASE STAND BY. THE KETTLE IS BUSY.","COOLDOWN ACTIVE. IMPATIENCE WILL NOT BOIL WATER FASTER.","YOUR REQUEST HAS BEEN LOGGED. THE KETTLE NEEDS A MOMENT."],
 limit:["YOUR GREED HAS BEEN RECORDED.","DAILY ALLOWANCE EXHAUSTED. THIS INCIDENT WILL BE REVIEWED.","THAT IS QUITE ENOUGH TEA FOR ONE DAY."],
 closed:["BEVERAGE OPERATIONS SUSPENDED.","OUTSIDE OPERATING HOURS. THE TEA DEPARTMENT IS OFF DUTY."],
 disabled:["SYSTEM DISABLED BY ADMINISTRATOR.","BEVERAGE OPERATIONS SUSPENDED BY COMMAND."],
 accepted:["CONTRACTUAL OBLIGATION INITIATED.","REQUEST ACCEPTED. THE TEA DEBT IS NOW ACTIVE.","A NEW TEA CONTRACT HAS BEEN REGISTERED."],
 fulfilled:["DELIVERY CONFIRMED. EXCELLENT WORK.","CONTRACT SATISFIED. RECORDS UPDATED.","TEA DELIVERY VERIFIED. STAND DOWN."]
};
function setPersonality(state){const a=personality[state]||personality.ready;$("system-message-text").textContent=a[Math.floor(Math.random()*a.length)];$("system-message").dataset.state=state;}
function toast(message){const e=$("toast");e.textContent=message;e.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove("show"),2600);}
function ukDate(d=new Date()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);}
function ukMinutes(){const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());return Number(p.find(x=>x.type==="hour").value)*60+Number(p.find(x=>x.type==="minute").value);}
function mins(v){const a=v.split(":").map(Number);return a[0]*60+a[1];}
function isOpen(){if(data.settings.hoursOverride)return true;const n=ukMinutes(),o=mins(data.settings.open),c=mins(data.settings.close);return o<c?n>=o&&n<c:n>=o||n<c;}
function todayRequests(){const k=ukDate();return data.requests.filter(r=>ukDate(new Date(r.createdAt))===k);}
function latestRequest(){return data.requests.length?data.requests.reduce((a,b)=>Date.parse(a.createdAt)>Date.parse(b.createdAt)?a:b):null;}
function cooldownMs(){const r=latestRequest();return r?Math.max(0,Date.parse(r.createdAt)+data.settings.cooldown*60000-Date.now()):0;}
function canRequest(){return data.settings.enabled&&isOpen()&&todayRequests().length<data.settings.limit&&cooldownMs()===0;}
function duration(ms){const s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return h?h+"h "+String(m).padStart(2,"0")+"m "+String(r).padStart(2,"0")+"s":m+"m "+String(r).padStart(2,"0")+"s";}
function dateLabel(v){return new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(v));}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function playTones(notes){if(!data.settings.sound)return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audioContext=audioContext||new C();if(audioContext.state==="suspended")audioContext.resume();notes.forEach(n=>{const o=audioContext.createOscillator(),g=audioContext.createGain(),f=n[0],s=n[1],d=n[2],t=n[3]||"sine",v=n[4]||.05;o.type=t;o.frequency.setValueAtTime(f,audioContext.currentTime+s);g.gain.setValueAtTime(.0001,audioContext.currentTime+s);g.gain.exponentialRampToValueAtTime(v,audioContext.currentTime+s+.025);g.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+s+d);o.connect(g);g.connect(audioContext.destination);o.start(audioContext.currentTime+s);o.stop(audioContext.currentTime+s+d+.04);});}catch(e){console.warn(e);}}
function playActivation(){playTones([[440,0,.13,"square"],[660,.14,.16,"square"],[880,.32,.25,"sawtooth",.035],[1320,.55,.32]]);}
function playFulfilled(){playTones([[660,0,.12],[880,.13,.16],[1100,.3,.22]]);}
function playDenied(){playTones([[180,0,.22,"triangle"],[130,.2,.3,"triangle"]]);}
function saveSound(){localStorage.setItem(PREF_KEY,JSON.stringify({sound:data.settings.sound}));}
function loadSound(){try{data.settings.sound=Boolean(JSON.parse(localStorage.getItem(PREF_KEY)||"{}").sound);}catch{}$("sound-enabled").checked=data.settings.sound;}
function showConnectionError(e){console.error("Supabase error:",e);$("availability-label").textContent="Connection issue";$("system-message-text").textContent="DATABASE CONNECTION INTERRUPTED. RETRYING.";}
function fromRequest(r){return {id:r.id,createdAt:r.created_at,status:r.status,fulfilledAt:r.fulfilled_at};}
async function loadState(){
 const results=await Promise.all([db.from("tea_settings").select("*").eq("id",1).single(),db.from("tea_requests").select("*").order("created_at",{ascending:true})]);
 if(results[0].error)throw results[0].error;if(results[1].error)throw results[1].error;
 const s=results[0].data;data.settings={open:s.opens_at.slice(0,5),close:s.closes_at.slice(0,5),cooldown:s.cooldown_minutes,limit:s.daily_limit,enabled:s.requests_enabled,hoursOverride:Boolean(s.hours_override),sound:data.settings.sound};
 data.requests=results[1].data.map(fromRequest);render();
}
async function verifyAdmin(user){
 admin=false;if(!user)return false;
 const r=await db.from("tea_admins").select("user_id").eq("user_id",user.id).maybeSingle();
 if(r.error)throw r.error;admin=Boolean(r.data);return admin;
}
function subscribe(){
 if(channel)db.removeChannel(channel);
 channel=db.channel("tea-requester-updates")
 .on("postgres_changes",{event:"*",schema:"public",table:"tea_settings"},()=>loadState().catch(showConnectionError))
 .on("postgres_changes",{event:"*",schema:"public",table:"tea_requests"},()=>loadState().catch(showConnectionError))
 .subscribe(s=>{if(s==="CHANNEL_ERROR")console.error("Realtime channel error");});
}
function clockText(ms){const s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return [h,m,r].map(v=>String(v).padStart(2,"0")).join(":");}
function untilMidnightMs(){const m=ukMinutes();return Math.max(1000,(1440-m)*60000);}
function untilOpeningMs(){const now=ukMinutes(),opening=mins(data.settings.open);let delta=(opening-now+1440)%1440;if(delta===0)delta=1440;return delta*60000;}
function render(){
 const open=isOpen(),remaining=Math.max(0,data.settings.limit-todayRequests().length),cooldown=cooldownMs(),allowed=canRequest(),latest=latestRequest();
 const pending=Boolean(latest&&latest.status==="Pending");
 const fulfilled=Boolean(latest&&latest.status==="Fulfilled"&&cooldown>0);
 const state=!data.settings.enabled?"disabled":!open?"closed":remaining===0?"limit":pending?"accepted":fulfilled?"fulfilled":cooldown>0?"cooldown":"ready";
 if($("system-message")&&$("system-message").dataset.state!==state)setPersonality(state);

 const layouts={
  ready:{label:"Available now",heading:"Tea Available",description:"You may request a cuppa",lock:false},
  cooldown:{label:"On Cooldown",heading:"On Cooldown",description:"Seems like you've recently requested a cuppa, please wait ##:##",lock:true},
  limit:{label:"Daily Allowance Reached",heading:"Limit Reached",description:"You've ran out of Tea Allowance for today. Your Limit resets at 12:00am",lock:true},
  closed:{label:"Outside Hours",heading:"Outside Hours",description:"Come back at 7:00am for your next Tea",lock:true},
  disabled:{label:"System Disabled",heading:"System Disabled",description:"The Administrator has manually locked the system.",lock:true},
  accepted:{label:"On Cooldown",heading:"The Tea Is Brewing",description:"Your request has been noted and in in progress.",lock:true},
  fulfilled:{label:"On Cooldown",heading:"Tea Fulfilled",description:"Your last request was fulfilled, please wait for your cooldown to finish.",lock:true}
 };
 const layout=layouts[state];
 $("availability-label").textContent=!data.settings.enabled?"System disabled":open?"Requests are open":"Requests are closed";
 $("contract-tagline").textContent="The Contract Is In Effect";
 $("cooldown-label").textContent=layout.label;
 $("request-heading").textContent=layout.heading;
 let description=layout.description;
 if(state==="cooldown")description=description.replace("##:##",clockText(cooldown).slice(3,8));
 $("request-description").textContent=description;

 const timer=state==="limit"?untilMidnightMs():state==="closed"?untilOpeningMs():cooldown;
 $("cooldown-value").textContent=state==="disabled"?"SYSTEM OFFLINE":state==="ready"?"Available now":clockText(timer)+" Remaining";
 $("cooldown-detail").textContent=state==="limit"?"Time until the daily allowance resets":state==="closed"?"Time until tea service reopens":cooldown>0?"Time remaining before the next request":"No cooldown active";
 const progressStates=["cooldown","accepted","fulfilled"];
 const pct=progressStates.includes(state)?Math.max(0,Math.min(100,cooldown/Math.max(1,data.settings.cooldown*60000)*100)):0;
 $("cooldown-progress").style.width=pct+"%";
 $("cooldown-progress").parentElement.setAttribute("aria-valuenow",String(Math.round(pct)));

 const button=$("request-button"),label=button.querySelector(".request-button-label"),lock=button.querySelector(".request-lock");
 label.hidden=layout.lock;lock.hidden=!layout.lock;label.textContent="TEA";
 button.disabled=!allowed;button.setAttribute("aria-label",allowed?"Request tea":"Tea request unavailable");
 $("request-card").classList.toggle("activated",pending);
 $("remaining-label").textContent="Tea Allowance";
 $("remaining-value").textContent=remaining+"/"+data.settings.limit+" Remaining";
 $("remaining-detail").textContent=remaining===0?"All today's requests have been used.":remaining+" request"+(remaining===1?"":"s")+" still available today.";
 $("tea-indicators").innerHTML=Array.from({length:data.settings.limit},(_,i)=>'<span class="tea-icon '+(i>=remaining?"used":"unused")+'" aria-hidden="true"><i class="fa-solid fa-mug-hot"></i></span>').join("");
 $("tea-indicators").setAttribute("aria-label",remaining+" of "+data.settings.limit+" tea requests remaining");
 $("current-request").hidden=!latest;
 if(latest){$("request-status").textContent=latest.status;$("request-status").className="status-pill "+(latest.status==="Fulfilled"?"fulfilled":"pending");$("current-request-title").textContent=latest.status==="Fulfilled"?"Tea fulfilled.":"Tea requested!";$("current-request-time").textContent="Accepted "+dateLabel(latest.createdAt);$("current-request-note").textContent=latest.status==="Fulfilled"?"A job well steeped.":"The tea is officially owed.";}
 if(admin)renderAdmin();
}
async function submitRequest(){
 if(!canRequest()){render();playDenied();toast("REQUEST REJECTED. THE SYSTEM HAS SPOKEN.");return;}
 $("request-button").disabled=true;
 const r=await db.rpc("submit_tea_request");
 if(r.error){playDenied();toast(r.error.message||"Request rejected.");await loadState().catch(showConnectionError);return;}
 setPersonality("accepted");playActivation();await loadState();
 $("request-heading").textContent="CONTRACT IN EFFECT";$("request-description").textContent="Request accepted. Tea is now contractually owed.";
 $("request-card").classList.add("activated","just-accepted");$("request-button").classList.add("just-pressed");
 setTimeout(()=>{$("request-button").classList.remove("just-pressed");$("request-card").classList.remove("just-accepted");},850);
 toast("Tea request accepted. The contract is active.");
}
function requestRow(r){return '<div class="request-row"><div><strong><i class="fa-solid fa-mug-hot" aria-hidden="true"></i> Tea request · '+escapeHtml(r.status)+'</strong><small>'+dateLabel(r.createdAt)+'</small></div>'+(r.status==="Pending"?'<button class="fulfil-button" data-fulfil="'+r.id+'"><i class="fa-solid fa-check" aria-hidden="true"></i> Fulfil request</button>':'<span class="status-pill fulfilled"><i class="fa-solid fa-check" aria-hidden="true"></i> Fulfilled</span>')+'</div>';}
function countRecent(days){const cutoff=Date.now()-days*86400000;return data.requests.filter(r=>Date.parse(r.createdAt)>=cutoff).length;}
function renderStatistics(){
 const total=data.requests.length,first=total?Math.min(...data.requests.map(r=>Date.parse(r.createdAt))):Date.now(),elapsed=Math.max(1,(Date.now()-first)/86400000);
 $("stat-total").textContent=total;$("stat-week").textContent=(total/(elapsed/7)).toFixed(1);$("stat-month").textContent=(total/(elapsed/30.4375)).toFixed(1);$("recent-week").textContent=(countRecent(30)/30*7).toFixed(1);$("recent-month").textContent=(countRecent(90)/90*30.4375).toFixed(1);
 const weeks={},months={};data.requests.forEach(r=>{const d=new Date(r.createdAt),x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));const ys=new Date(Date.UTC(x.getUTCFullYear(),0,1));const w=x.getUTCFullYear()+" W"+String(Math.ceil((((x-ys)/86400000)+1)/7)).padStart(2,"0");const m=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"long"}).format(d);weeks[w]=(weeks[w]||0)+1;months[m]=(months[m]||0)+1;});
 const bw=Object.entries(weeks).sort((a,b)=>b[1]-a[1])[0],bm=Object.entries(months).sort((a,b)=>b[1]-a[1])[0];$("busiest-week").textContent=bw?bw[0]+" · "+bw[1]+" teas":"—";$("busiest-month").textContent=bm?bm[0]+" · "+bm[1]+" teas":"—";
 const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d;}),counts=days.map(d=>data.requests.filter(r=>ukDate(new Date(r.createdAt))===ukDate(d)).length),max=Math.max(1,...counts);
 $("activity-chart").innerHTML=days.map((d,i)=>'<div class="chart-day"><strong>'+counts[i]+'</strong><div class="chart-bar" style="height:'+Math.max(4,counts[i]/max*78)+'px"></div><small>'+d.toLocaleDateString("en-GB",{weekday:"short"})+"</small></div>").join("");
}
function renderAdmin(){
 const today=todayRequests(),pending=data.requests.filter(r=>r.status==="Pending"),fulfilled=data.requests.filter(r=>r.status==="Fulfilled");
 $("metric-today").textContent=today.length;$("metric-pending").textContent=pending.length;$("metric-fulfilled").textContent=fulfilled.length;
 $("admin-availability").textContent=!data.settings.enabled?"Disabled":data.settings.hoursOverride?"Override active":isOpen()?"Open":"Closed";$("admin-availability").className="status-pill "+(data.settings.enabled&&isOpen()?"fulfilled":"pending");
 $("admin-availability-detail").textContent=data.settings.hoursOverride?"Opening-hours restriction is bypassed. Cooldown and daily limit still apply.":"Requests are accepted between "+data.settings.open+" and "+data.settings.close+" UK time.";
 $("hours-override-toggle").textContent=data.settings.hoursOverride?"Turn override off":"Override opening hours";$("hours-override-toggle").classList.toggle("override-active",data.settings.hoursOverride);$("hours-override-detail").textContent=data.settings.hoursOverride?"ACTIVE — requests can be made at any time, subject to the other rules.":"Allow requests outside "+data.settings.open+"–"+data.settings.close+" UK time.";
 $("pending-count-pill").textContent=pending.length+" PENDING";
 if(!settingsDirty){
  $("open-time").value=data.settings.open;
  $("close-time").value=data.settings.close;
  $("cooldown-setting").value=data.settings.cooldown;
  $("limit-setting").value=data.settings.limit;
 }
 $("system-toggle").innerHTML=data.settings.enabled?'<i class="fa-solid fa-power-off"></i> Disable requests':'<i class="fa-solid fa-power-off"></i> Enable requests';
 $("pending-list").innerHTML=pending.length?pending.slice().reverse().map(requestRow).join(""):'<p class="muted">No outstanding requests. A rare moment of peace.</p>';
 $("history-list").innerHTML=data.requests.length?data.requests.slice().reverse().map(requestRow).join(""):'<p class="muted">No requests yet.</p>';renderStatistics();
}
async function fulfil(id){
 const r=await db.rpc("fulfil_tea_request",{p_request_id:id});if(r.error){toast(r.error.message||"Could not fulfil request.");return;}
 setPersonality("fulfilled");playFulfilled();await loadState();toast("CONTRACT SATISFIED. DELIVERY CONFIRMED.");
}
function openAdmin(){ $("request-view").hidden=true;$("admin-view").hidden=false;$("auth-gate").hidden=admin;$("admin-console").hidden=!admin;if(admin)renderAdmin();}
function closeAdmin(){ $("admin-view").hidden=true;$("request-view").hidden=false;render();}
function switchPanel(name){document.querySelectorAll(".admin-tab").forEach(b=>b.classList.toggle("active",b.dataset.panel===name));document.querySelectorAll(".admin-panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+name));}
async function login(e){
 e.preventDefault();$("login-feedback").textContent="Authenticating…";
 const r=await db.auth.signInWithPassword({email:$("login-email").value.trim(),password:$("login-password").value});
 if(r.error){$("login-feedback").textContent="Sign-in failed. Check your email and password.";return;}
 try{const ok=await verifyAdmin(r.data.user);if(!ok){await db.auth.signOut();$("login-feedback").textContent="This account is not registered as a tea administrator.";return;}
 $("login-feedback").textContent="Access granted.";$("auth-gate").hidden=true;$("admin-console").hidden=false;await loadState();subscribe();toast("ADMINISTRATOR SESSION ESTABLISHED.");
 }catch(err){$("login-feedback").textContent="Could not verify administrator access.";console.error(err);}
}
async function logout(){await db.auth.signOut();admin=false;$("admin-console").hidden=true;$("auth-gate").hidden=false;$("login-feedback").textContent="Signed out.";}
async function saveSettings(e){
 e.preventDefault();if(!admin)return;
 const open=$("open-time").value,close=$("close-time").value,cooldown=Number($("cooldown-setting").value),limit=Number($("limit-setting").value);
 if(!open||!close||open===close||!Number.isInteger(cooldown)||cooldown<1||cooldown>1440||!Number.isInteger(limit)||limit<1||limit>100){$("settings-feedback").textContent="Please enter valid hours, cooldown and daily limit.";return;}
 const r=await db.from("tea_settings").update({opens_at:open,closes_at:close,cooldown_minutes:cooldown,daily_limit:limit,updated_at:new Date().toISOString()}).eq("id",1);
 if(r.error){$("settings-feedback").textContent="Could not save rules. Check administrator permissions.";return;}
 settingsDirty=false;
 data.settings.sound=$("sound-enabled").checked;saveSound();$("settings-feedback").textContent="Rules saved to the shared database.";await loadState();toast("SYSTEM PARAMETERS UPDATED.");
}
async function toggleHoursOverride(){
 if(!admin)return;const next=!data.settings.hoursOverride;
 const r=await db.from("tea_settings").update({hours_override:next,updated_at:new Date().toISOString()}).eq("id",1);
 if(r.error){toast("Could not change opening-hours override.");return;}
 await loadState();toast(next?"OPENING-HOURS OVERRIDE ENABLED.":"OPENING-HOURS OVERRIDE DISABLED.");
}
async function toggleSystem(){
 if(!admin)return;const r=await db.from("tea_settings").update({requests_enabled:!data.settings.enabled,updated_at:new Date().toISOString()}).eq("id",1);
 if(r.error){toast("Could not change system status.");return;}await loadState();setPersonality(data.settings.enabled?"ready":"disabled");toast(data.settings.enabled?"BEVERAGE OPERATIONS RESTORED.":"BEVERAGE OPERATIONS SUSPENDED.");
 if(!data.settings.enabled)playDenied();else playTones([[740,0,.22,"sine"]]);
}
$("request-button").addEventListener("click",submitRequest);
$("admin-open").addEventListener("click",openAdmin);
$("admin-back").addEventListener("click",closeAdmin);
$("admin-back-login").addEventListener("click",closeAdmin);
$("login-form").addEventListener("submit",login);
$("admin-logout").addEventListener("click",logout);
$("system-toggle").addEventListener("click",toggleSystem);
$("hours-override-toggle").addEventListener("click",toggleHoursOverride);
$("settings-form").addEventListener("input",()=>{settingsDirty=true;$("settings-feedback").textContent="Unsaved changes." ;});
$("settings-form").addEventListener("change",()=>{settingsDirty=true;$("settings-feedback").textContent="Unsaved changes.";});
$("settings-form").addEventListener("submit",saveSettings);
$("sound-enabled").addEventListener("change",()=>{data.settings.sound=$("sound-enabled").checked;saveSound();});
document.querySelectorAll(".admin-tab").forEach(b=>b.addEventListener("click",()=>switchPanel(b.dataset.panel)));
document.addEventListener("click",e=>{const b=e.target.closest("[data-fulfil]");if(b)fulfil(b.dataset.fulfil);});
$("notification-test").addEventListener("click",async()=>{const f=$("notification-feedback");if(!("Notification"in window)){f.textContent="This browser does not support notifications.";return;}let p=Notification.permission;if(p==="default")p=await Notification.requestPermission();if(p!=="granted"){f.textContent="Notification permission was not granted.";return;}new Notification("Ginga Tea Requester",{body:"Notification test successful. The tea system is listening."});f.textContent="Local browser notification sent. Remote push delivery is not connected yet.";});
window.addEventListener("focus",()=>loadState().catch(showConnectionError));
async function init(){
 loadSound();setPersonality("ready");
 try{await loadState();const s=await db.auth.getSession();if(s.error)throw s.error;await verifyAdmin(s.data.session?s.data.session.user:null);subscribe();if(admin){$("auth-gate").hidden=true;$("admin-console").hidden=false;}}
 catch(e){showConnectionError(e);}
 render();setInterval(render,1000);
}
init();