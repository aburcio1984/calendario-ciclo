(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CycleModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parse = key => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d); };
  const validDate = key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && Number(key.slice(0,4)) >= 1900 && iso(parse(key)) === key;
  const add = (key, n) => { const d = parse(key); d.setDate(d.getDate()+n); return iso(d); };
  const days = (a,b) => { const x = parse(a), y = parse(b); return (Date.UTC(y.getFullYear(),y.getMonth(),y.getDate())-Date.UTC(x.getFullYear(),x.getMonth(),x.getDate()))/86400000; };
  const average = xs => xs.length ? Math.round(xs.reduce((a,b)=>a+b,0)/xs.length) : null;
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const bleeding = record => !!(record && (record.periodLevel || record.period));
  const clone = x => JSON.parse(JSON.stringify(x));
  function validate(state, today) {
    if (!object(state) || !object(state.settings) || !object(state.data)) throw Error('La copia no tiene el formato esperado.');
    for (const key of ['lastPeriod','activePeriodStart']) {
      if (state.settings[key] && (!validDate(state.settings[key]) || state.settings[key] > today)) throw Error('La copia contiene una fecha inválida o futura.');
    }
    for (const [key,max] of [['cycleLength',365],['periodLength',60]]) {
      const n = Number(state.settings[key]);
      if (state.settings[key] !== undefined && (!Number.isInteger(n) || n < 1 || n > max)) throw Error('Revisa las duraciones de la copia.');
    }
    const levels = ['','Manchado','Ligero','Normal','Abundante'];
    for (const [key,record] of Object.entries(state.data)) {
      if (!validDate(key) || key > today || !object(record) || Object.values(record).some(v=>typeof v !== 'string' && typeof v !== 'boolean')) throw Error('La copia contiene un registro inválido.');
      if (record.periodLevel !== undefined && !levels.includes(record.periodLevel)) throw Error('Hay un valor de sangrado desconocido en la copia.');
    }
    return {settings: clone(state.settings), data: clone(state.data)};
  }
  function model(state, today) {
    const marked = new Set(Object.keys(state.data).filter(key=>key<=today && bleeding(state.data[key])));
    const active = state.settings.activePeriodStart;
    if (validDate(active) && active <= today) for (let d=active; d<=today; d=add(d,1)) marked.add(d);
    const keys = [...marked].sort(), periods = [];
    for (const key of keys) {
      const last = periods[periods.length-1];
      if (last && add(last.end,1) === key) { last.end=key; last.length++; }
      else periods.push({start:key,end:key,length:1,ongoing:false});
    }
    for (const p of periods) p.ongoing=!!active && p.start<=active && p.end>=active;
    const cycles = periods.slice(1).map((p,i)=>days(periods[i].start,p.start));
    const recent = cycles.slice(-6), completed = periods.filter(p=>!p.ongoing).slice(-6);
    const cycleLength = average(recent) || Number(state.settings.cycleLength) || 28;
    const periodLength = average(completed.map(p=>p.length)) || Number(state.settings.periodLength) || 5;
    const reference = periods.length ? periods[periods.length-1].start : state.settings.lastPeriod || null;
    const next = reference ? add(reference,cycleLength) : null;
    return {periods,cycles,recent,cycleLength,periodLength,reference,next,active:periods.find(p=>p.ongoing)||null,until:next?days(today,next):null};
  }
  function removeBleeding(state, period) {
    for (let key=period.start; key<=period.end; key=add(key,1)) {
      const record=state.data[key];
      if (record) { delete record.period; delete record.periodLevel; if (!Object.values(record).some(Boolean)) delete state.data[key]; }
    }
    if (period.ongoing) delete state.settings.activePeriodStart;
  }
  function savePeriod(original, input, today) {
    const {start, ongoing, editing} = input, end=ongoing?today:input.end;
    if (!validDate(start)) throw Error('Elige el primer día del periodo.');
    if (start>today) throw Error('El inicio no puede ser una fecha futura.');
    if (!validDate(end)) throw Error('Elige el último día o marca «Sigue en curso».');
    if (end<start) throw Error('El último día debe ser igual o posterior al inicio.');
    if (end>today) throw Error('El último día no puede ser una fecha futura.');
    if (days(start,end)>365) throw Error('Revisa las fechas: el periodo supera los 366 días.');
    const state=clone(original), all=model(state,today).periods;
    const overlaps=all.filter(p=>start<=p.end&&end>=p.start);
    if(!editing&&overlaps.length>1)throw Error('Estas fechas incluyen varios periodos. Revisa las fechas o edítalos por separado en el historial.');
    const old=editing?all.find(p=>p.start===editing):overlaps[0];
    const keep={};
    if (editing && !old) throw Error('Ese periodo ya no existe. Vuelve a abrir el historial.');
    if (old) {
      for(let k=old.start;k<=old.end;k=add(k,1)) if(bleeding(state.data[k])) keep[k]=state.data[k].periodLevel || 'Normal';
      removeBleeding(state,old);
    }
    const others=model(state,today).periods;
    if (ongoing && state.settings.activePeriodStart) throw Error('Ya hay un periodo en curso. Puedes editarlo desde el historial.');
    if (others.some(p=>start<=p.end&&end>=p.start)) throw Error('Estas fechas coinciden con otro periodo. Revisa las fechas o edita ese periodo desde el historial.');
    for(let k=start;k<=end;k=add(k,1)) state.data[k]={...(state.data[k]||{}),periodLevel:keep[k]||state.data[k]?.periodLevel||input.level||'Normal',pain:original.data[k]?.pain??input.pain??''};
    if(ongoing) state.settings.activePeriodStart=start;
    delete state.settings.lastPeriod;
    return state;
  }
  function deletePeriod(original, start, today) {
    const state=clone(original), period=model(state,today).periods.find(p=>p.start===start);
    if(!period) throw Error('No se encuentra el periodo.');
    removeBleeding(state,period); delete state.settings.lastPeriod; return state;
  }
  function saveDay(original,input,today){
    if(!validDate(input.date)||input.date>today)throw Error('Elige una fecha válida, sin días futuros.');
    if(!['','Manchado','Ligero','Normal','Abundante'].includes(input.level))throw Error('Elige un tipo de sangrado válido.');
    const state=clone(original), active=model(state,today).active;
    if(active && input.date>=active.start && input.date<=active.end && !input.level){
      for(let k=active.start;k<=today;k=add(k,1))state.data[k]={...(state.data[k]||{}),periodLevel:state.data[k]?.periodLevel||'Normal'};
      delete state.settings.activePeriodStart;
    }
    const record={...(state.data[input.date]||{}),periodLevel:input.level,pain:input.pain||'',notes:input.notes||''};
    delete record.period;
    if(Object.values(record).some(Boolean))state.data[input.date]=record;else delete state.data[input.date];
    if(input.level||bleeding(original.data[input.date]))delete state.settings.lastPeriod;
    return state;
  }
  return {iso,parse,validDate,add,days,average,bleeding,validate,model,savePeriod,deletePeriod,saveDay};
});
