const STORAGE_KEY="ginga-tea-designer:v1";
const elementDefs=[
 {id:"tagline",name:"Contract tagline",kind:"text",text:"The Contract Is In Effect"},
 {id:"cooldown-panel",name:"Cooldown panel",kind:"container",text:""},
 {id:"cooldown-label",name:"Cooldown status",kind:"text",text:"Available now"},
 {id:"cooldown-progress",name:"Cooldown progress bar",kind:"indicator",text:""},
 {id:"main-panel",name:"Main control panel",kind:"container",text:""},
 {id:"heading",name:"Main heading",kind:"text",text:"Tea Available"},
 {id:"description",name:"Main description",kind:"text",text:"You may request a cuppa"},
 {id:"tea-button",name:"TEA button",kind:"button",text:"TEA"},
 {id:"allowance-panel",name:"Tea allowance panel",kind:"container",text:""},
 {id:"allowance-label",name:"Allowance heading",kind:"text",text:"Tea Allowance"},
 {id:"allowance-value",name:"Allowance counter",kind:"text",text:"3/4 Remaining"},
 {id:"cup-indicators",name:"Cup indicators",kind:"indicator",text:""}
];
const states=[
 {id:"available",label:"Available",values:{}},
 {id:"cooldown",label:"Cooldown",values:{"cooldown-label":{text:"01:00:00 Remaining"},"heading":{text:"Tea Available"},"description":{text:"Your next request is available soon."},"tea-button":{enabled:false}}},
 {id:"daily-limit",label:"Daily limit reached",values:{"cooldown-label":{text:"Unavailable"},"heading":{text:"That's enough tea today."},"description":{text:"You've reached today's request limit. Requests reopen at midnight."},"tea-button":{enabled:false},"allowance-value":{text:"0/4 Remaining"}}},
 {id:"closed",label:"Outside opening hours",values:{"cooldown-label":{text:"Outside operating hours"},"heading":{text:"Tea service closed"},"description":{text:"Requests reopen at 07:00."},"tea-button":{enabled:false}}},
 {id:"disabled",label:"System disabled",values:{"cooldown-label":{text:"System offline"},"heading":{text:"Tea requests disabled"},"description":{text:"The administrator has temporarily suspended requests."},"tea-button":{enabled:false}}},
 {id:"pending",label:"Request pending",values:{"cooldown-label":{text:"Request registered"},"heading":{text:"Contract in effect"},"description":{text:"Your tea request has been accepted."},"tea-button":{enabled:false}}},
 {id:"fulfilled",label:"Request fulfilled",values:{"cooldown-label":{text:"Delivery confirmed"},"heading":{text:"Tea delivered"},"description":{text:"The contract has been fulfilled."},"tea-button":{enabled:false}}}
];
const clone=o=>JSON.parse(JSON.stringify(o));
const defaultDesign=()=>({version:1,name:"Tea Contract — Main Interface",states:Object.fromEntries(states.map(s=>[s.id,Object.fromEntries(elementDefs.map(e=>[e.id,{text:e.text,visible:true,enabled:true}]))]))});
let design=defaultDesign(),currentState="available",selectedId="heading";
const $=id=>document.getElementById(id);
function currentConfig(){return design.states[currentState][selectedId];}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2200);}
function markChanged(){ $("save-indicator").textContent="UNSAVED CHANGES";localStorage.setItem(STORAGE_KEY,JSON.stringify(design));}
function loadDraft(){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved&&saved.version===1&&saved.states)design=saved;}catch(err){console.warn("Could not load designer draft",err);}}
function applyStateDefaults(stateId){const state=states.find(s=>s.id===stateId);if(!state)return;for(const [id,patch] of Object.entries(state.values)){Object.assign(design.states[stateId][id],patch);}}
function renderList(){
 const list=$("element-list");list.innerHTML="";
 for(const def of elementDefs){const cfg=design.states[currentState][def.id];const b=document.createElement("button");b.type="button";b.className="element-item"+(selectedId===def.id?" active":"");b.innerHTML="<span>"+def.name+"</span><small>"+(cfg.visible?"VISIBLE":"HIDDEN")+"</small>";b.addEventListener("click",()=>selectElement(def.id));list.appendChild(b);}
 $("element-count").textContent=elementDefs.length;
}
function selectElement(id){
 selectedId=id;const def=elementDefs.find(e=>e.id===id),cfg=currentConfig();
 $("selected-name").textContent=def.name;$("element-text").value=cfg.text;$("element-text").disabled=def.kind==="container"||def.kind==="indicator";
 $("element-visible").checked=cfg.visible;$("element-enabled").checked=cfg.enabled;
 document.querySelectorAll("[data-element]").forEach(el=>el.classList.toggle("selected",el.dataset.element===id));
 renderList();
}
function renderPreview(){
 for(const def of elementDefs){const cfg=design.states[currentState][def.id],el=document.querySelector('[data-element="'+def.id+'"]');if(!el)continue;
 el.classList.toggle("is-hidden",!cfg.visible);el.classList.toggle("is-disabled",!cfg.enabled);
 if(["tagline","cooldown-label","heading","description","tea-button","allowance-label","allowance-value"].includes(def.id)){el.textContent=cfg.text;}
 if(def.id==="tea-button")el.disabled=!cfg.enabled;
 if(def.id==="cooldown-progress")el.querySelector("span").style.width=currentState==="available"?"0%":currentState==="cooldown"?"72%":"100%";
 if(def.id==="cup-indicators"){const used=currentState==="daily-limit"?4:1;[...el.children].forEach((cup,i)=>cup.style.opacity=i<used?".35":"1");}
 }
 $("preview-state").textContent=states.find(s=>s.id===currentState).label.toUpperCase();
 document.querySelectorAll("[data-element]").forEach(el=>el.classList.toggle("selected",el.dataset.element===selectedId));
 renderList();
}
function updateSelectionFromInputs(){
 const cfg=currentConfig();cfg.text=$("element-text").value;cfg.visible=$("element-visible").checked;cfg.enabled=$("element-enabled").checked;renderPreview();markChanged();
}
function exportDesign(){
 design.name=$("layout-name").value.trim()||"Untitled Tea Layout";
 const payload={...clone(design),exportedAt:new Date().toISOString(),states:clone(design.states),elementDefinitions:elementDefs.map(({id,name,kind})=>({id,name,kind}))};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=design.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+".json";a.click();URL.revokeObjectURL(url);
 $("save-indicator").textContent="EXPORTED";toast("Layout exported with all state definitions.");
}
function resetState(){
 const fresh=defaultDesign();design.states[currentState]=fresh.states[currentState];applyStateDefaults(currentState);renderPreview();selectElement(selectedId);markChanged();toast("Selected state reset.");
}
function resetAll(){if(!confirm("Reset every state and discard this design's edits?"))return;design=defaultDesign();for(const s of states)applyStateDefaults(s.id);$("layout-name").value=design.name;renderPreview();selectElement("heading");markChanged();}
function init(){
 loadDraft();$("layout-name").value=design.name;
 for(const s of states)if(!design.states[s.id])design.states[s.id]=defaultDesign().states[s.id];
 for(const s of states)applyStateDefaults(s.id);
 $("state-select").addEventListener("change",e=>{currentState=e.target.value;selectElement(selectedId);renderPreview();});
 $("layout-name").addEventListener("input",e=>{design.name=e.target.value;markChanged();});
 $("element-text").addEventListener("input",updateSelectionFromInputs);
 $("element-visible").addEventListener("change",updateSelectionFromInputs);
 $("element-enabled").addEventListener("change",updateSelectionFromInputs);
 $("export-button").addEventListener("click",exportDesign);
 $("reset-state").addEventListener("click",resetState);$("reset-all").addEventListener("click",resetAll);
 document.querySelectorAll("[data-element]").forEach(el=>{el.addEventListener("click",e=>{e.stopPropagation();selectElement(el.dataset.element);});});
 renderPreview();selectElement(selectedId);$("save-indicator").textContent="LOCAL DRAFT";
}
init();