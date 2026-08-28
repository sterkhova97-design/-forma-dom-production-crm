
const KP_API_URL = ""; // production: URL вида https://.../api/kp
const STORAGE_KEY = "formaDomProductionCRM.v1";
const STATUS = ["Каркас","Паралонка","Пошив","Обивка","Готов к отгрузке","Отгружен"];

const demoKp = [
  {
    id:"КП-2026-081", date:"2026-08-25", client:"Проект Ордынка", manager:"Екатерина",
    items:[
      {id:"kp81-1", name:"Диван Nube", qty:1, image:""},
      {id:"kp81-2", name:"Кресло Core", qty:2, image:""}
    ]
  },
  {
    id:"КП-2026-079", date:"2026-08-22", client:"Квартира Садовые кварталы", manager:"Анна",
    items:[
      {id:"kp79-1", name:"Кровать LO-RA", qty:1, image:""},
      {id:"kp79-2", name:"Банкетка", qty:1, image:""}
    ]
  },
  {
    id:"КП-2026-074", date:"2026-08-17", client:"Загородный дом", manager:"Екатерина",
    items:[
      {id:"kp74-1", name:"Диван Sora", qty:1, image:""}
    ]
  }
];

let state = {
  tab:"work",
  items:[],
  kp:demoKp,
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
async function loadKp(){
  if(!KP_API_URL) return;
  try{
    const r=await fetch(KP_API_URL,{credentials:"include"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const data=await r.json();
    if(Array.isArray(data)) state.kp=data;
  }catch(e){
    console.warn("KP API недоступен, показана тестовая история.",e);
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
function openKp(){ state.modal="kp"; render(); }
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
        <div class="progress-note">Выберите изделия из истории КП калькулятора.</div>
        <div class="kp-list">${state.kp.map(kp=>`
          <div class="kp-row">
            <div class="kp-head">
              <div><strong>${esc(kp.id)}</strong><div class="kp-meta">${formatDate(kp.date)} · ${esc(kp.client||"Без клиента")} · ${esc(kp.manager||"")}</div></div>
            </div>
            <div class="kp-items">
              ${kp.items.map(i=>`<label class="kp-item"><input type="checkbox" data-kp="${esc(kp.id)}" data-item="${esc(i.id)}"> <strong>${esc(i.name)}</strong> <span class="kp-meta">${i.qty||1} шт.</span></label>`).join("")}
            </div>
            <div style="margin-top:12px"><button class="crm-btn small primary" onclick="startOrder('${esc(kp.id)}')">Продолжить с выбранными</button></div>
          </div>`).join("")}
        </div>
      </div>
    </div>
  </div>`;
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
function orderModal(){
  const d=state.draftOrder, i=state.draftIndex, item=d.items[i];
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
loadKp().finally(render);
