'use strict';
const M=CycleModel, $=id=>document.getElementById(id);
const STORAGE='cycleTrackerStateV6', LEGACY_DATA='cycleTrackerDataV1';
const today=()=>M.iso(new Date());
const format=key=>M.parse(key).toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'});
const short=key=>M.parse(key).toLocaleDateString('es-ES',{day:'numeric',month:'short'});
let state={settings:{cycleLength:28,periodLength:5},data:{}}, loadError='', editing=null;
let view=today().slice(0,7)+'-01';
try {
  const unified=localStorage.getItem(STORAGE);
  if(unified) state=M.validate(JSON.parse(unified),today());
  else {
    let settings={};
    for(const key of ['cycleSettingsV4','cycleSettingsV3','cycleSettingsV2']) {
      const saved=localStorage.getItem(key); if(saved){settings=JSON.parse(saved);break;}
    }
    state=M.validate({settings,data:JSON.parse(localStorage.getItem(LEGACY_DATA)||'{}')},today());
  }
} catch(e) { loadError='No se han podido leer los datos locales. No se sobrescribirán. Importa una copia válida desde Ajustes. '+e.message; }
function showError(id,message){$(id).textContent=message||'';$(id).hidden=!message;}
function notify(message){$('status').textContent=message;$('status').hidden=false;}
function persist(candidate,{restore=false}={}){
  if(loadError&&!restore)throw Error('Primero restaura una copia desde Ajustes para no sobrescribir los datos que no se pueden leer.');
  const valid=M.validate(candidate,today());
  try{localStorage.setItem(STORAGE,JSON.stringify({version:'6.0.0',...valid}));}
  catch{throw Error('No se ha podido guardar. Puede que el almacenamiento esté lleno o bloqueado. Descarga una copia desde Ajustes.');}
  state=valid;loadError='';render();
}
function calculation(m){
  if(m.recent.length) return `Cálculo: media de ${m.recent.length===1?'1 ciclo completo':`los últimos ${m.recent.length} ciclos completos`} (${m.recent.join(', ')} días) = ${m.cycleLength} días. Se mide de inicio a inicio.`;
  return `Aún no hay dos inicios registrados. Se usan ${m.cycleLength} días de ciclo de Ajustes; al añadir otro inicio, se calculará la media real.`;
}
function previewText(candidate){
  const m=M.model(candidate,today());
  return m.next?`Próximo periodo: ${format(m.next)} · ciclo de ${m.cycleLength} días. ${m.recent.length?'Calculado con tu historial.':'Valor inicial de Ajustes.'}`:'Añade un día con sangrado para calcular el próximo periodo.';
}
function switchView(history){
  $('calendarView').hidden=history;$('historyView').hidden=!history;
  $('calendarTab').setAttribute('aria-selected',String(!history));$('historyTab').setAttribute('aria-selected',String(history));
}
function render(){
  const m=M.model(state,today());
  $('heroDate').textContent=m.next?format(m.next):'Añade tu primer periodo';
  $('heroMeta').textContent=!m.next?'Registra las fechas o importa tu copia desde Ajustes.':m.until<0?`La fecha estimada pasó hace ${-m.until} días. Se actualizará con tus registros.`:m.until===0?'La fecha estimada es hoy.':`Dentro de unos ${m.until} días · último inicio: ${short(m.reference)}.`;
  $('calculationSource').textContent=m.reference?calculation(m):'';
  $('mCycle').textContent=m.reference?`${m.cycleLength} días`:'—';$('mPeriod').textContent=m.reference?`${m.periodLength} días`:'—';
  $('activeBox').hidden=!m.active;
  if(m.active)$('activeInfo').textContent=`Periodo en curso · día ${m.active.length}. Empezó el ${short(m.active.start)}.`;
  renderCalendar(m);renderHistory(m);renderForecast(m);
}
function forecasts(m,count=3){
  if(!m.next||m.until<0)return [];
  return Array.from({length:count},(_,i)=>{const start=M.add(m.next,m.cycleLength*i);return {start,end:M.add(start,m.periodLength-1)};});
}
function renderCalendar(m=M.model(state,today())){
  $('monthTitle').textContent=M.parse(view).toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  $('calendar').replaceChildren();
  const first=(M.parse(view).getDay()+6)%7, end=new Date(M.parse(view).getFullYear(),M.parse(view).getMonth()+1,0).getDate();
  const count=m.next?Math.max(3,Math.ceil(M.days(m.next,M.add(view,31))/m.cycleLength)+1):3;
  const predictions=forecasts(m,count);
  for(let i=0;i<first;i++){const el=document.createElement('span');el.className='day empty';$('calendar').append(el);}
  for(let i=1;i<=end;i++){
    const key=view.slice(0,8)+String(i).padStart(2,'0'), period=m.periods.find(p=>p.start<=key&&p.end>=key), record=state.data[key];
    const predicted=!period&&predictions.some(p=>key>=p.start&&key<=p.end);
    const el=document.createElement('button');el.type='button';el.className='day';el.textContent=i;el.dataset.date=key;
    if(period)el.classList.add(record?.periodLevel==='Manchado'?'spotting':'actual');else if(predicted)el.classList.add('predicted');
    if(key===today()){el.classList.add('today');el.setAttribute('aria-current','date');}
    const detail=period?`sangrado ${record?.periodLevel||'Normal'}`:predicted?'periodo estimado':'sin sangrado registrado';
    el.setAttribute('aria-label',`${format(key)} · ${detail}${record?.pain?' · dolor '+record.pain:''}`);
    if(record&&(record.pain||record.notes||record.mood||record.sex)){const dot=document.createElement('span');dot.className='dot';el.append(dot);}
    el.onclick=()=>openDay(key);$('calendar').append(el);
  }
}
function renderForecast(m){
  $('forecast').replaceChildren();
  const predictions=forecasts(m);
  if(!predictions.length){const p=document.createElement('p');p.className='help';p.textContent=m.next?'La fecha esperada ya pasó. Registra el nuevo sangrado cuando empiece; no adelantaremos el ciclo automáticamente.':'Añade tu primer periodo para ver las estimaciones.';$('forecast').append(p);return;}
  for(const p of predictions){const row=document.createElement('div');row.className='row';const title=document.createElement('strong');title.textContent=short(p.start)+' – '+short(p.end);const label=document.createElement('span');label.textContent='Estimado';row.append(title,label);$('forecast').append(row);}
}
function renderHistory(m){
  $('historyList').replaceChildren();
  if(!m.periods.length){const p=document.createElement('p');p.className='help';p.textContent='Todavía no hay periodos registrados. Añade un periodo o registra un día con sangrado.';$('historyList').append(p);return;}
  for(const period of [...m.periods].reverse()){
    const el=document.createElement('div');el.className='historyItem';const row=document.createElement('div');row.className='between';const info=document.createElement('div');const title=document.createElement('strong');title.textContent=short(period.start)+' – '+short(period.end);const desc=document.createElement('p');desc.textContent=period.ongoing?`En curso · ${period.length} días registrados`:`${period.length} días de sangrado · ${period.start.slice(0,4)}`;
    info.append(title,desc);const edit=document.createElement('button');edit.className='button';edit.textContent='Editar';edit.setAttribute('aria-label',`Editar periodo del ${format(period.start)}`);edit.onclick=()=>openPeriod(period);row.append(info,edit);el.append(row);$('historyList').append(el);
  }
}
function periodInput(){return {start:$('periodStart').value,end:$('periodEnd').value,ongoing:$('periodOngoing').checked,level:$('rangeLevel').value,pain:$('rangePain').value,editing};}
function periodPreview(){
  const ongoing=$('periodOngoing').checked;$('periodEndField').hidden=ongoing;$('periodEnd').disabled=ongoing;$('ongoingHelp').hidden=!ongoing;
  try{const candidate=M.savePeriod(state,periodInput(),today());$('periodPreview').textContent='Al guardar · '+previewText(candidate);showError('periodError','');}
  catch(e){$('periodPreview').textContent='Completa las fechas para ver cómo cambia la estimación.';showError('periodError',e.message);}
}
function openPeriod(period=null,date=today()){
  editing=period?.start||null;$('periodTitle').textContent=period?'Editar periodo':'Registrar periodo';
  $('periodStart').value=period?.start||date;$('periodEnd').value=period?.end||date;$('periodOngoing').checked=!!period?.ongoing;
  $('periodDelete').hidden=!period;$('rangeLevel').value='Normal';$('rangePain').value='';
  $('periodStart').max=today();$('periodEnd').max=today();periodPreview();$('periodDlg').showModal();
}
$('periodForm').onsubmit=e=>{
  e.preventDefault();try{const input=periodInput(),candidate=M.savePeriod(state,input,today());persist(candidate);view=input.start.slice(0,7)+'-01';switchView(false);render();$('periodDlg').close();notify('Periodo guardado. Calendario y estimaciones recalculados.');}catch(err){showError('periodError',err.message);}
};
$('periodDelete').onclick=()=>{
  if(!confirm('¿Borrar este periodo? Se conservarán sus notas y los registros de dolor.'))return;
  try{persist(M.deletePeriod(state,editing,today()));$('periodDlg').close();notify('Periodo borrado. Estimaciones recalculadas.');}catch(err){showError('periodError',err.message);}
};
for(const id of ['periodStart','periodEnd','periodOngoing','rangeLevel','rangePain'])$(id).addEventListener('input',periodPreview);
function dayInput(){return {date:$('dayDate').value,level:$('periodLevel').value,pain:$('pain').value,notes:$('notes').value};}
function loadDayFields(){
  const key=$('dayDate').value,record=state.data[key]||{},m=M.model(state,today()),active=m.active&&key>=m.active.start&&key<=m.active.end;
  $('periodLevel').value=record.periodLevel||(record.period||active?'Normal':'');$('pain').value=record.pain||'';$('notes').value=record.notes||'';
  $('dayDelete').hidden=!state.data[key]&&!active;dayPreview();
}
function dayPreview(){
  const key=$('dayDate').value,m=M.model(state,today());$('dayActiveHelp').hidden=!(m.active&&key>=m.active.start&&key<=m.active.end&&!$('periodLevel').value);
  try{const candidate=M.saveDay(state,dayInput(),today());$('dayPreview').textContent='Al guardar · '+previewText(candidate);showError('dayError','');$('daySave').disabled=false;}
  catch(err){$('dayPreview').textContent=key>today()?'Este día todavía no puede registrarse. El color tenue es solo una estimación.':'Elige un día para ver el cálculo.';showError('dayError',err.message);$('daySave').disabled=true;}
}
function openDay(key=today()){
  $('dayDate').value=key;$('dayDate').max=today();loadDayFields();$('dayDlg').showModal();
}
$('dayDate').addEventListener('change',loadDayFields);
for(const id of ['periodLevel','pain','notes'])$(id).addEventListener('input',dayPreview);
$('dayForm').onsubmit=e=>{e.preventDefault();try{const input=dayInput();persist(M.saveDay(state,input,today()));view=input.date.slice(0,7)+'-01';switchView(false);render();$('dayDlg').close();notify('Día guardado. Sangrado, dolor y estimaciones actualizados.');}catch(err){showError('dayError',err.message);}};
$('dayDelete').onclick=()=>{
  if(!confirm('¿Borrar todos los datos de este día?'))return;
  try{const key=$('dayDate').value;let candidate=M.saveDay(state,{date:key,level:'',pain:'',notes:''},today());delete candidate.data[key];persist(candidate);$('dayDlg').close();notify('Día borrado. Estimaciones recalculadas.');}catch(err){showError('dayError',err.message);}
};
$('addPeriodBtn').onclick=()=>openPeriod();$('addDayBtn').onclick=()=>openDay();
$('finishBtn').onclick=()=>{const active=M.model(state,today()).active;openPeriod(active);$('periodOngoing').checked=false;periodPreview();};
$('periodCancel').onclick=()=>$('periodDlg').close();$('dayCancel').onclick=()=>$('dayDlg').close();
$('calendarTab').onclick=()=>switchView(false);$('historyTab').onclick=()=>switchView(true);
function changeMonth(n){const d=M.parse(view);d.setMonth(d.getMonth()+n);view=M.iso(d);renderCalendar();}
$('prev').onclick=()=>changeMonth(-1);$('next').onclick=()=>changeMonth(1);
$('todayBtn').onclick=()=>{view=today().slice(0,7)+'-01';switchView(false);renderCalendar();};
$('settingsBtn').onclick=()=>{$('cycleLength').value=state.settings.cycleLength||28;$('periodLength').value=state.settings.periodLength||5;showError('settingsError','');showError('backupError','');$('settingsDlg').showModal();};
$('settingsCancel').onclick=()=>$('settingsDlg').close();
$('settingsForm').onsubmit=e=>{
  e.preventDefault();try{const cycle=Number($('cycleLength').value),period=Number($('periodLength').value);if(!Number.isInteger(cycle)||cycle<1||cycle>365||!Number.isInteger(period)||period<1||period>60)throw Error('Introduce días de ciclo entre 1 y 365, y días de sangrado entre 1 y 60.');persist({settings:{...state.settings,cycleLength:cycle,periodLength:period},data:state.data});$('settingsDlg').close();notify(M.model(state,today()).recent.length?'Ajustes guardados. La estimación sigue usando la media de tus registros.':'Ajustes guardados. Estimaciones recalculadas.');}catch(err){showError('settingsError',err.message);}
};
$('exportBtn').onclick=()=>{
  try{let backup={version:'6.0.0',exportedAt:new Date().toISOString(),...state};if(loadError)backup={unreadableState:localStorage.getItem(STORAGE),legacyData:localStorage.getItem(LEGACY_DATA),legacySettings:localStorage.getItem('cycleSettingsV4')};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`copia-ciclo-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Copia descargada.');}catch{showError('backupError','No se ha podido descargar la copia.');}
};
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{
  try{const file=e.target.files[0];if(!file)return;if(file.size>2*1024*1024)throw Error('La copia es demasiado grande (máximo 2 MB).');const candidate=M.validate(JSON.parse(await file.text()),today()),m=M.model(candidate,today());if(!confirm(`La copia contiene ${Object.keys(candidate.data).length} días y ${m.periods.length} periodos. Sustituirá los datos actuales de este navegador. ¿Importar?`))return;localStorage.setItem('cycleTrackerBeforeImportV6',localStorage.getItem(STORAGE)||JSON.stringify(state));persist(candidate,{restore:true});view=(m.reference||today()).slice(0,7)+'-01';render();$('settingsDlg').close();notify('Copia importada. Calendario y estimaciones recalculados.');}
  catch(err){showError('backupError','No se ha importado la copia. '+err.message);}finally{e.target.value='';}
};
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();if(loadError)notify(loadError);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();});
