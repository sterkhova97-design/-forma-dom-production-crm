
const KP_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwSvtr0hpyQjqsm4CEM3ZawXCAsMqJ7Ai2CbAEIwSoQCbQCH_xSRSbmj2lauIgOyygj/exec"; 
// После публикации Google Apps Script сюда вставляется URL вида:
// https://script.google.com/macros/s/XXXXXXXX/exec

const STORAGE_KEY = "formaDomProductionCRM.v2";
const STATUS = ["Каркас","Паралонка","Пошив","Обивка","Готов к отгрузке","Отгружен"];

let state = {
  tab:"work",
  items:[],
  kp:[],
  kpLoading:false,
  kpError:"",
  openedKp:null,
  openedKpLoading:false,
  modal:null,
  draftOrder:null,
  draftIndex:0,
  specItemId:null
};

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function esc(v){ return String(v ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function load(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    if(saved?.items) state.items=saved.items;
  }catch{}
}
function persist(){ localStorage.setItem(STORAGE_KEY,JSON.stringify({items:state.items})); }
function formatDate(v){
  if(!v) return "—";
  const [y,m,d]=v.split("-");
  return `${d}.${m}.${y}`;
}
function daysTo(dateStr){
  if(!dateStr) return null;
  const today=new Date(); today.setHours(0,0,0,0);
  const d=new Date(dateStr+"T00:00:00");
  return Math.ceil((d-today)/86400000);
}
function deadlineClass(item){
  if(item.status==="Отгружен" || !item.planDate) return "";
  const d=daysTo(item.planDate);
  if(d<0) return "deadline-overdue";
  if(d<=5) return "deadline-warning";
  return "";
}
function deadlineTextClass(item){
  const c=deadlineClass(item);
  return c==="deadline-overdue"?"overdue":c==="deadline-warning"?"warning":"";
}
function isArchived(item){
  const contractItems=state.items.filter(x=>x.contract===item.contract);
  return contractItems.length>0 && contractItems.every(x=>x.status==="Отгружен");
}
function visibleItems(){
  return state.items.filter(x=>state.tab==="archive" ? isArchived(x) : !isArchived(x));
}
function jsonp(params){
  return new Promise((resolve,reject)=>{
    if(!KP_WEBAPP_URL){
      reject(new Error("Не указан URL Google Apps Script"));
      return;
    }
    const cb="fdcrm_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script");
    const timeout=setTimeout(()=>{
      cleanup();
      reject(new Error("Нет ответа от Google Apps Script"));
    },20000);

    function cleanup(){
      clearTimeout(timeout);
      try{delete window[cb]}catch{}
      script.remove();
    }

    window[cb]=(data)=>{
      cleanup();
      if(data && data.ok===false) reject(new Error(data.error||"Ошибка Apps Script"));
      else resolve(data);
    };

    const q=new URLSearchParams({...params,callback:cb,_:Date.now()});
    script.src=KP_WEBAPP_URL+(KP_WEBAPP_URL.includes("?")?"&":"?")+q.toString();
    script.onerror=()=>{
      cleanup();
      reject(new Error("Не удалось загрузить данные КП"));
    };
    document.head.appendChild(script);
  });
}

async function loadKp(){
  if(!KP_WEBAPP_URL){
    state.kp=[];
    state.kpError="CRM ещё не подключена к Google Apps Script.";
    return;
  }
  state.kpLoading=true;
  state.kpError="";
  render();
  try{
    const data=await jsonp({action:"list"});
    state.kp=Array.isArray(data?.items)?data.items:[];
  }catch(e){
    state.kpError=e.message||String(e);
  }finally{
    state.kpLoading=false;
    render();
  }
}
function toast(text){
  const old=document.querySelector(".toast"); if(old) old.remove();
  const el=document.createElement("div"); el.className="toast"; el.textContent=text;
  document.body.appendChild(el); setTimeout(()=>el.remove(),2300);
}
function render(){
  const rows=visibleItems();
  document.getElementById("app").innerHTML=`
    <main class="crm-shell">
      <div class="crm-top">
        <div class="crm-brand">
          <h1>Forma Dom · Производство</h1>
          <p>Изделия в работе</p>
        </div>
        <div class="crm-actions">
          <button class="crm-btn primary" onclick="openKp()">Добавить заказ</button>
        </div>
      </div>

      <div class="crm-tabs">
        <button class="crm-tab ${state.tab==="work"?"active":""}" onclick="setTab('work')">В работе</button>
        <button class="crm-tab ${state.tab==="archive"?"active":""}" onclick="setTab('archive')">Архив</button>
      </div>

      <section class="crm-card">
        ${rows.length ? `
        <div class="crm-table-wrap">
          <table>
            <thead><tr>
              <th>Изделие</th>
              <th>Картинка</th>
              <th>Дата готовности</th>
              <th>№ договора</th>
              <th>Характеристики изделия</th>
              <th>Чертёж</th>
              <th>Статус в производстве</th>
              <th>Дата плановой готовности</th>
            </tr></thead>
            <tbody>${rows.map(rowHtml).join("")}</tbody>
          </table>
        </div>` : `<div class="empty">Здесь пока нет изделий.</div>`}
      </section>
    </main>
    ${modalHtml()}
  `;
}
function rowHtml(item){
  const dc=deadlineClass(item);
  const archived=isArchived(item);
  const shipped=item.status==="Отгружен" && !archived;
  return `<tr class="${dc} ${shipped?"shipped":""}">
    <td><strong>${esc(item.name)}</strong>${item.qty>1?`<div class="kp-meta">${item.qty} шт.</div>`:""}</td>
    <td>${item.productImage?`<img class="product-img" src="${item.productImage}">`:`<div class="product-img product-placeholder">нет фото</div>`}</td>
    <td><span class="deadline-text ${deadlineTextClass(item)}">${formatDate(item.readyDate)}</span></td>
    <td>${esc(item.contract||"—")}</td>
    <td><button class="link-btn" onclick="openSpec('${item.id}')">Открыть</button></td>
    <td>${item.drawingData?`<button class="link-btn" onclick="openDrawing('${item.id}')">${esc(item.drawingName||"Открыть файл")}</button>`:"—"}</td>
    <td>
      <select class="status-select" onchange="changeStatus('${item.id}',this.value)">
        ${STATUS.map(s=>`<option ${s===item.status?"selected":""}>${s}</option>`).join("")}
      </select>
    </td>
    <td><input class="date-input" type="date" value="${esc(item.planDate||"")}" onchange="changePlanDate('${item.id}',this.value)"></td>
  </tr>`;
}
function setTab(tab){ state.tab=tab; render(); }
function openKp(){
  state.modal="kp";
  state.openedKp=null;
  render();
  if(!state.kp.length && !state.kpLoading) loadKp();
}
function closeModal(){ state.modal=null; state.draftOrder=null; state.specItemId=null; render(); }
function modalHtml(){
  if(state.modal==="kp") return kpModal();
  if(state.modal==="order") return orderModal();
  if(state.modal==="spec") return specModal();
  return "";
}
function kpModal(){
  return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-head"><h2>Добавить заказ</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        ${state.openedKp ? openedKpHtml() : kpHistoryHtml()}
      </div>
    </div>
  </div>`;
}

function kpHistoryHtml(){
  if(state.kpLoading) return `<div class="empty">Загружаю историю КП…</div>`;
  if(state.kpError) return `<div class="empty"><strong>Не удалось загрузить историю КП</strong><br><br>${esc(state.kpError)}<br><br><button class="crm-btn" onclick="loadKp()">Повторить</button></div>`;
  if(!state.kp.length) return `<div class="empty">В истории пока нет КП.</div>`;

  return `
    <div class="progress-note">История КП из рабочего калькулятора Forma Dom. Откройте нужное КП и выберите изделия для производства.</div>
    <div class="kp-history">
      <div class="kp-history-head">
        <div>Дата</div><div>Клиент / проект</div><div>Менеджер</div><div></div>
      </div>
      ${state.kp.map(kp=>`
        <div class="kp-history-row">
          <div>${esc(kp.created_at||kp.updated_at||"—")}</div>
          <div><strong>${esc(kp.client_name||kp.kp_name||"Без названия")}</strong>${kp.project_name?`<div class="kp-meta">${esc(kp.project_name)}</div>`:""}</div>
          <div>${esc(kp.manager||"—")}</div>
          <div><button class="crm-btn small primary" onclick="openKpDetails('${esc(kp.kp_id)}')">Открыть</button></div>
        </div>`).join("")}
    </div>`;
}

async function openKpDetails(kpId){
  state.openedKpLoading=true;
  state.openedKp={header:{kp_id:kpId},items:[]};
  render();
  try{
    const data=await jsonp({action:"get",kpId});
    state.openedKp=data?.kp||null;
    if(!state.openedKp) throw new Error("КП не найдено");
  }catch(e){
    state.openedKp=null;
    state.kpError=e.message||String(e);
    toast("Не удалось открыть КП");
  }finally{
    state.openedKpLoading=false;
    render();
  }
}

function backToKpHistory(){
  state.openedKp=null;
  render();
}

function openedKpHtml(){
  if(state.openedKpLoading) return `<div class="empty">Открываю КП…</div>`;
  const kp=state.openedKp;
  if(!kp) return "";
  const h=kp.header||{};
  const items=kp.items||[];
  return `
    <button class="link-btn" onclick="backToKpHistory()">← Назад к истории КП</button>
    <div class="kp-open-title">
      <h3>${esc(h.client_name||h.kp_name||"КП")}</h3>
      <div class="kp-meta">${esc(h.manager||"")} ${h.project_name?`· ${esc(h.project_name)}`:""}</div>
    </div>
    <div class="progress-note">Выберите изделия, которые нужно передать в производство.</div>
    <div class="kp-selected-items">
      ${items.map((i,idx)=>`
        <label class="kp-item kp-item-large">
          <input type="checkbox" data-open-item="${idx}">
          ${firstImage(i.values)?`<img class="product-img" src="${firstImage(i.values)}">`:`<div class="product-img product-placeholder">нет фото</div>`}
          <span><strong>${esc(i.productName||"Изделие")}</strong><small>${Number(i.summary?.quantity||1)} шт.</small></span>
        </label>`).join("")}
    </div>
    <div style="margin-top:18px">
      <button class="crm-btn primary" onclick="startOrderFromOpenedKp()">Продолжить с выбранными</button>
    </div>`;
}

function firstImage(obj){
  const found=[];
  function walk(v){
    if(found.length) return;
    if(typeof v==="string" && (/^data:image\//.test(v) || /^https?:\/\/.+\.(png|jpe?g|webp)(\?|$)/i.test(v) || /drive\.google\.com/.test(v))) found.push(v);
    else if(v && typeof v==="object") Object.values(v).forEach(walk);
  }
  walk(obj);
  return found[0]||"";
}

function startOrderFromOpenedKp(){
  const kp=state.openedKp;
  const indexes=[...document.querySelectorAll("[data-open-item]:checked")].map(x=>Number(x.dataset.openItem));
  if(!indexes.length){toast("Выберите хотя бы одно изделие");return;}
  const picked=(kp.items||[]).filter((_,idx)=>indexes.includes(idx));
  const h=kp.header||{};
  state.draftOrder={
    kpId:h.kp_id||"",
    client:h.client_name||"",
    items:picked.map((i,idx)=>({
      sourceItemId:`${h.kp_id||"kp"}-${idx}`,
      name:i.productName||"Изделие",
      qty:Number(i.summary?.quantity||1),
      productImage:firstImage(i.values),
      sourceValues:i.values||{},
      contract:"",readyDate:"",planDate:"",status:"Каркас",deliveryAddress:"",
      fabric:"",dimensions:"",supports:"",seams:"",rigidity:"",
      decorativeComment:"",decorativeImage:"",
      pillowComment:"",pillowImage:"",
      plinthComment:"",plinthImage:"",
      mechanismComment:"",mechanismImage:"",
      needMeasure:false,needSockets:false,
      drawingData:"",drawingName:""
    }))
  };
  state.draftIndex=0;
  state.modal="order";
  render();
}

function startOrder(kpId){
  const kp=state.kp.find(x=>x.id===kpId);
  const selected=[...document.querySelectorAll(`input[data-kp="${CSS.escape(kpId)}"]:checked`)].map(x=>x.dataset.item);
  if(!selected.length){ toast("Выберите хотя бы одно изделие"); return; }
  const picked=kp.items.filter(x=>selected.includes(x.id));
  state.draftOrder={kpId, client:kp.client, items:picked.map(i=>({
    sourceItemId:i.id,name:i.name,qty:i.qty||1,productImage:i.image||"",
    contract:"",readyDate:"",planDate:"",status:"Каркас",deliveryAddress:"",
    fabric:"",dimensions:"",supports:"",seams:"",rigidity:"",
    decorativeComment:"",decorativeImage:"",
    pillowComment:"",pillowImage:"",
    plinthComment:"",plinthImage:"",
    mechanismComment:"",mechanismImage:"",
    needMeasure:false,needSockets:false,
    drawingData:"",drawingName:""
  }))};
  state.draftIndex=0; state.modal="order"; render();
}

function valueText(v){
  if(v===null || v===undefined || v==="") return "";
  if(Array.isArray(v)) return v.filter(Boolean).join(", ");
  if(typeof v==="object"){
    if("width" in v || "depth" in v || "height" in v){
      return [v.width,v.depth,v.height].filter(x=>x!==""&&x!=null).join(" × ");
    }
    return "";
  }
  return String(v);
}
function sourceValue(item, keys){
  const vals=item.sourceValues||{};
  for(const key of keys){
    if(vals[key]!==undefined && vals[key]!==null && vals[key]!=="") return valueText(vals[key]);
  }
  return "";
}
function prefillFromKp(item){
  if(!item.fabric) item.fabric=sourceValue(item,["fabric","tkan","cloth","material"]);
  if(!item.dimensions) item.dimensions=sourceValue(item,["dimensions","size","dimensions_general","overall_dimensions"]);
  if(!item.supports) item.supports=sourceValue(item,["legs","supports","opory"]);
  return item;
}
function orderModal(){
  const d=state.draftOrder, i=state.draftIndex, item=prefillFromKp(d.items[i]);
  return `<div class="modal-backdrop">
    <div class="modal">
      <div class="modal-head"><h2>${esc(item.name)}</h2><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="progress-note">КП ${esc(d.kpId)} · изделие ${i+1} из ${d.items.length}. После сохранения откроется следующее.</div>
        <div class="form-grid">
          ${field("№ договора","contract",item.contract)}
          ${field("Дата готовности","readyDate",item.readyDate,"date")}
          ${field("Ткань","fabric",item.fabric)}
          ${field("Габариты","dimensions",item.dimensions)}
          ${field("Опоры","supports",item.supports)}
          ${field("Швы","seams",item.seams)}
          ${field("Тип жесткости","rigidity",item.rigidity)}
          ${field("Адрес доставки","deliveryAddress",item.deliveryAddress)}
          ${commentImageField("Декоративные элементы","decorative",item)}
          ${commentImageField("Тип подушек","pillow",item)}
          ${commentImageField("Тип царги","plinth",item)}
          ${commentImageField("Механизм","mechanism",item)}
          <div class="field full">
            <span class="label">Дополнительно</span>
            <div class="checks">
              <label class="check"><input type="checkbox" data-f="needMeasure" ${item.needMeasure?"checked":""}> Нужен замер</label>
              <label class="check"><input type="checkbox" data-f="needSockets" ${item.needSockets?"checked":""}> Врезка розеток / бра</label>
            </div>
          </div>
          <div class="field full">
            <span class="label">Чертёж</span>
            <div class="upload-box"><input type="file" accept=".pdf,image/*" onchange="readDrawing(this)">
              <div class="upload-preview">${item.drawingName?`Прикреплено: ${esc(item.drawingName)}`:"PDF или изображение"}</div>
            </div>
          </div>
          <div class="field full">
            <span class="label">Картинка изделия</span>
            <div class="upload-box"><input type="file" accept="image/*" onchange="readProductImage(this)">
              ${item.productImage?`<div class="upload-preview"><img src="${item.productImage}">Картинка прикреплена</div>`:`<div class="upload-preview">Необязательно</div>`}
            </div>
          </div>
        </div>
        <div class="form-footer">
          <button class="crm-btn" onclick="closeModal()">Отмена</button>
          <button class="crm-btn primary" onclick="saveAndNext()">Сохранить данные и заполнить следующее</button>
        </div>
      </div>
    </div>
  </div>`;
}
function field(label,key,val,type="text"){
  return `<label class="field"><span class="label">${label}</span><input class="text-input" type="${type}" data-f="${key}" value="${esc(val)}"></label>`;
}
function commentImageField(label,prefix,item){
  return `<div class="field full">
    <span class="label">${label}</span>
    <textarea class="textarea" data-f="${prefix}Comment" placeholder="Комментарий">${esc(item[prefix+"Comment"])}</textarea>
    <div class="upload-box" style="margin-top:8px"><input type="file" accept="image/*" onchange="readCommentImage('${prefix}',this)">
      ${item[prefix+"Image"]?`<div class="upload-preview"><img src="${item[prefix+"Image"]}">Изображение прикреплено</div>`:`<div class="upload-preview">Добавить картинку</div>`}
    </div>
  </div>`;
}
function syncFormToDraft(){
  const item=state.draftOrder.items[state.draftIndex];
  document.querySelectorAll("[data-f]").forEach(el=>{
    item[el.dataset.f]=el.type==="checkbox"?el.checked:el.value;
  });
}
function fileToData(file, cb){
  if(!file) return;
  const r=new FileReader(); r.onload=()=>cb(r.result); r.readAsDataURL(file);
}
function readDrawing(inp){
  syncFormToDraft(); const item=state.draftOrder.items[state.draftIndex], f=inp.files[0];
  if(!f) return; fileToData(f,data=>{item.drawingData=data;item.drawingName=f.name;render();});
}
function readProductImage(inp){
  syncFormToDraft(); const item=state.draftOrder.items[state.draftIndex], f=inp.files[0];
  fileToData(f,data=>{item.productImage=data;render();});
}
function readCommentImage(prefix,inp){
  syncFormToDraft(); const item=state.draftOrder.items[state.draftIndex], f=inp.files[0];
  fileToData(f,data=>{item[prefix+"Image"]=data;render();});
}
function saveAndNext(){
  syncFormToDraft();
  const item=state.draftOrder.items[state.draftIndex];
  if(!item.contract){toast("Введите № договора");return;}
  if(!item.readyDate){toast("Введите дату готовности");return;}
  if(state.draftIndex < state.draftOrder.items.length-1){
    const next=state.draftOrder.items[state.draftIndex+1];
    if(!next.contract) next.contract=item.contract;
    if(!next.deliveryAddress) next.deliveryAddress=item.deliveryAddress;
    state.draftIndex++; render(); return;
  }
  const created=state.draftOrder.items.map(x=>({...x,id:uid(),kpId:state.draftOrder.kpId}));
  state.items.push(...created); persist(); state.modal=null; state.draftOrder=null; render();
  toast("Заказ добавлен в производство");
}
function findItem(id){return state.items.find(x=>x.id===id);}
function changeStatus(id,value){
  const item=findItem(id); item.status=value; persist(); render();
  if(value==="Отгружен"){
    const all=state.items.filter(x=>x.contract===item.contract);
    if(all.every(x=>x.status==="Отгружен")) toast("Все изделия договора отгружены — договор перенесён в архив");
  }
}
function changePlanDate(id,value){const item=findItem(id);item.planDate=value;persist();render();}
function openDrawing(id){
  const item=findItem(id); if(!item?.drawingData)return;
  const w=window.open();
  w.document.write(`<iframe src="${item.drawingData}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`);
}
function openSpec(id){state.specItemId=id;state.modal="spec";render();}
function specModal(){
  const x=findItem(state.specItemId); if(!x)return"";
  const specs=[
    ["Изделие",x.name],["№ договора",x.contract],["КП",x.kpId],["Дата готовности",formatDate(x.readyDate)],
    ["Ткань",x.fabric],["Габариты",x.dimensions],["Опоры",x.supports],["Швы",x.seams],
    ["Декоративные элементы",x.decorativeComment],["Тип подушек",x.pillowComment],["Тип жесткости",x.rigidity],
    ["Нужен замер",x.needMeasure?"Да":"Нет"],["Врезка розеток / бра",x.needSockets?"Да":"Нет"],
    ["Тип царги",x.plinthComment],["Механизм",x.mechanismComment],["Адрес доставки",x.deliveryAddress]
  ];
  const imgs=[["Декоративные элементы",x.decorativeImage],["Тип подушек",x.pillowImage],["Тип царги",x.plinthImage],["Механизм",x.mechanismImage]].filter(x=>x[1]);
  return `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-head no-print"><h2>Характеристики изделия</h2><div style="display:flex;gap:8px"><button class="crm-btn small primary" onclick="window.print()">Распечатать A4</button><button class="modal-close" onclick="closeModal()">×</button></div></div>
      <div class="modal-body" id="print-area">
        <div class="print-sheet">
          <div class="print-title"><div><h2>${esc(x.name)}</h2><div>Forma Dom · Производственное ТЗ</div></div><div><strong>Договор ${esc(x.contract)}</strong><br>${formatDate(x.readyDate)}</div></div>
          <div class="spec-grid">${specs.map(s=>`<div class="spec-key">${esc(s[0])}</div><div>${esc(s[1]||"—")}</div>`).join("")}</div>
          ${imgs.length?`<div class="spec-images">${imgs.map(i=>`<div><strong>${esc(i[0])}</strong><img src="${i[1]}"></div>`).join("")}</div>`:""}
        </div>
      </div>
    </div>
  </div>`;
}
load();
render();
