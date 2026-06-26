'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  page: 'dashboard',
  vehicles: [], customers: [], expenses: [], stakeholders: [], income: [],
  bookings: [], payments: [],            // legacy, unused — kept to avoid stray refs
  loading: false,
  incomeSearch: '',
  vehicleFilter: 'all',
  customerSearch: '',
  finPeriod: 'month',
};

// ── API ────────────────────────────────────────────────────────────────────
function callApi(params, opts = {}) {
  const url = GAS_URL + '?' + new URLSearchParams(params);
  return Promise.race([
    fetch(url).then(r => r.json()),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), opts.timeout || 55000)),
  ]);
}

async function fetchAll() {
  if (GAS_URL.includes('YOUR_DEPLOYMENT_ID')) { renderPage(); return; }
  state.loading = true; renderPage();
  try {
    const d = await callApi({ action: 'getAll' });
    if (d.error) throw new Error(d.error);
    state.vehicles    = d.vehicles    || [];
    state.customers   = d.customers   || [];
    state.expenses    = d.expenses    || [];
    state.stakeholders = d.stakeholders || [];
    state.income      = d.income      || [];
  } catch (e) { toast('Failed to load: ' + e.message, 'error'); }
  state.loading = false; renderPage();
}

// ── Utilities ──────────────────────────────────────────────────────────────
function amd(n)  { n = Number(n)||0; return n.toLocaleString() + ' ֏'; }
function amdK(n) {
  n = Number(n)||0;
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M ֏';
  if (Math.abs(n) >= 1e3) return Math.round(n/1e3) + 'K ֏';
  return n + ' ֏';
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d); if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function todayStr() { return new Date().toISOString().slice(0,10); }
function currentTimeStr() { const n=new Date(); return ('0'+n.getHours()).slice(-2)+':'+('0'+n.getMinutes()).slice(-2); }
function diffDays(a, b) { return Math.max(1, Math.round((new Date(b)-new Date(a))/86400000)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ── Lookups ────────────────────────────────────────────────────────────────
function customerById(id)     { return state.customers.find(c => c.id===id); }
function vehicleById(id)      { return state.vehicles.find(v => v.id===id); }
function customerName(id)     { const c=customerById(id); return c?c.name:'—'; }
function vehicleLabelShort(id){
  const v=vehicleById(id); if(!v)return '—';
  const model=[v.make,v.model].filter(Boolean).join(' ');
  return v.plate?`${v.plate} · ${model}`:(model||'—');
}
function vehicleLabel(id)     { return vehicleLabelShort(id); }
function vehicleDisplayStatus(v) { return v.status || 'Available'; }

function vehicleBadge(st) {
  const m={Available:'badge-available',Rented:'badge-rented',Maintenance:'badge-maint',Inactive:'badge-inactive'};
  return `<span class="badge ${m[st]||'badge-available'}">${st}</span>`;
}

function periodFilter(dateStr) {
  if (!dateStr) return false;
  const d=new Date(dateStr), now=new Date();
  if (state.finPeriod==='month')      return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  if (state.finPeriod==='last_month') { const lm=new Date(now.getFullYear(),now.getMonth()-1,1); return d.getFullYear()===lm.getFullYear()&&d.getMonth()===lm.getMonth(); }
  if (state.finPeriod==='year')       return d.getFullYear()===now.getFullYear();
  return true;
}

// Horizontal labelled bar list, shared by Dashboard and Finances.
function barList(obj,total,color){
  const entries=Object.entries(obj).sort((a,b)=>b[1]-a[1]);
  if(!entries.length) return '<div style="color:var(--muted);font-size:13px;padding:8px 0">No data</div>';
  return `<div class="fin-bar-wrap">${entries.map(([k,v])=>{const pct=total>0?Math.round(v/total*100):0;return `<div class="fin-bar-row"><div class="fin-bar-label">${k}</div><div class="fin-bar-bg"><div class="fin-bar-fill" style="width:${pct}%;background:${color}"></div></div><div class="fin-bar-amt">${amd(v)}</div></div>`;}).join('')}</div>`;
}

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(msg, type='info') {
  const el=document.createElement('div');
  el.className=`toast toast-${type}`; el.textContent=msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(()=>el.remove(), 3500);
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openModal(html) {
  const root=document.getElementById('modal-root');
  root.innerHTML=html;
  root.querySelector('.modal-overlay')?.addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
}
function closeModal() { document.getElementById('modal-root').innerHTML=''; }

const CLOSE_BTN = `<button class="modal-close" onclick="closeModal()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;

// ── Navigation ─────────────────────────────────────────────────────────────
const PAGE_TITLES = { dashboard:'Dashboard', income:'Income', fleet:'Fleet', customers:'Customers', finances:'Finances' };

function navigate(page) {
  state.page=page;
  document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page===page));
  document.getElementById('page-title').textContent = PAGE_TITLES[page]||page;
  renderPage();
}
document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', ()=>navigate(el.dataset.page)));

// ── Router ─────────────────────────────────────────────────────────────────
function renderPage() {
  const body=document.getElementById('page-body'), actions=document.getElementById('topbar-actions');
  if (state.loading) { body.innerHTML='<div class="loading-overlay"><div class="loading-spinner"></div> Loading…</div>'; actions.innerHTML=''; return; }
  ({ dashboard:renderDashboard, income:renderIncome, fleet:renderFleet, customers:renderCustomers, finances:renderFinances }[state.page]||renderDashboard)(body, actions);
}

// ──────────────────────────────────────────────────────────────────────────
// DASHBOARD (income-focused)
// ──────────────────────────────────────────────────────────────────────────
function renderDashboard(body, actions) {
  actions.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="fetchAll()">↺ Refresh</button>`;

  const monthInc = state.income.filter(it=>periodFilter(it.date));
  const income   = monthInc.reduce((s,it)=>s+(Number(it.amount)||0),0);
  const monthExp = state.expenses.filter(e=>periodFilter(e.date));
  const expTotal = monthExp.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const net      = income-expTotal;
  const available= state.vehicles.filter(v=>vehicleDisplayStatus(v)==='Available').length;
  const fleet    = state.vehicles.filter(v=>v.status!=='Inactive').length;

  const byVehicle={};
  monthInc.forEach(it=>{ if(it.vehicleId){const k=vehicleLabelShort(it.vehicleId);byVehicle[k]=(byVehicle[k]||0)+(Number(it.amount)||0);} });
  const recent=[...state.income].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:(b.createdAt>a.createdAt?1:-1)).slice(0,8);

  body.innerHTML = `
    <div class="kpi-row">
      <div class="kpi kpi-ok"><div class="kpi-icon">💰</div><div class="kpi-label">Income (month)</div><div class="kpi-value">${amdK(income)}</div><div class="kpi-sub">${monthInc.length} entr${monthInc.length===1?'y':'ies'}</div></div>
      <div class="kpi kpi-bad"><div class="kpi-icon">💸</div><div class="kpi-label">Expenses (month)</div><div class="kpi-value">${amdK(expTotal)}</div><div class="kpi-sub">${monthExp.length} item${monthExp.length!==1?'s':''}</div></div>
      <div class="kpi ${net>=0?'kpi-ok':'kpi-bad'}"><div class="kpi-icon">${net>=0?'📈':'📉'}</div><div class="kpi-label">Net (month)</div><div class="kpi-value" style="color:${net>=0?'var(--success)':'var(--danger)'}">${amdK(net)}</div><div class="kpi-sub">${net>=0?'profit':'loss'}</div></div>
      <div class="kpi kpi-info"><div class="kpi-icon">🚗</div><div class="kpi-label">Available Cars</div><div class="kpi-value">${available}</div><div class="kpi-sub">of ${fleet} in fleet</div></div>
    </div>

    <div class="dash-grid">
      <div class="card dash-full">
        <div class="card-header">
          <div class="card-title">Recent Income</div>
          <button class="btn btn-primary btn-sm" onclick="openIncomeModal()">+ Income</button>
        </div>
        <div class="table-wrap">
          ${recent.length ? `<table><thead><tr><th>Date</th><th>Customer</th><th>Vehicle</th><th>Amount</th><th>Method</th></tr></thead><tbody>
          ${recent.map(it=>`<tr><td>${fmtDate(it.date)}</td><td class="td-bold">${it.customerName||customerName(it.customerId)}</td><td>${it.vehicleId?vehicleLabelShort(it.vehicleId):'—'}</td><td class="td-mono" style="color:var(--success);font-weight:600">${amd(it.amount)}</td><td>${it.method||'—'}</td></tr>`).join('')}
          </tbody></table>` : `<div class="empty-state"><div>No income recorded yet</div></div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Income by Vehicle (month)</div></div>
        <div class="card-body">${barList(byVehicle,income,'var(--success)')}</div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Fleet Overview</div></div>
        <div class="card-body">
          ${['Available','Maintenance','Inactive'].map(st=>{
            const count=state.vehicles.filter(v=>vehicleDisplayStatus(v)===st).length;
            const pct=fleet>0?Math.round(count/fleet*100):0;
            const colors={Available:'var(--success)',Maintenance:'var(--danger)',Inactive:'var(--muted)'};
            return `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:var(--text2)">${st}</span><span style="font-size:12px;color:var(--muted)">${count}</span></div><div class="fin-bar-bg"><div class="fin-bar-fill" style="width:${pct}%;background:${colors[st]}"></div></div></div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// INCOME LEDGER
// ──────────────────────────────────────────────────────────────────────────
function renderIncome(body, actions) {
  actions.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openIncomeModal()">+ Income</button>`;
  const search=(state.incomeSearch||'').toLowerCase();
  const filtered=state.income.filter(it=>{
    if(!search) return true;
    const cn=(it.customerName||customerName(it.customerId)||'').toLowerCase();
    const vp=(vehicleById(it.vehicleId)?.plate||'').toLowerCase();
    const vn=vehicleLabelShort(it.vehicleId).toLowerCase();
    return cn.includes(search)||vp.includes(search)||vn.includes(search);
  }).sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:(b.createdAt>a.createdAt?1:-1));
  const total=filtered.reduce((s,it)=>s+(Number(it.amount)||0),0);

  body.innerHTML=`
    <div class="list-controls">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" placeholder="Search customer or plate…" value="${state.incomeSearch||''}" oninput="state.incomeSearch=this.value;renderPage()">
      </div>
      <div style="margin-left:auto;font-size:13px;color:var(--muted)">Total: <strong style="color:var(--success)">${amd(total)}</strong> · ${filtered.length} entr${filtered.length===1?'y':'ies'}</div>
    </div>
    <div class="card">
      <div class="table-wrap">
        ${filtered.length?`<table><thead><tr><th>Date</th><th>Customer</th><th>Vehicle</th><th>Period</th><th>Days</th><th>Amount</th><th>Method</th><th>Type</th><th></th></tr></thead><tbody>
        ${filtered.map(it=>{
          const period=(it.fromDate&&it.toDate)?`${fmtDate(it.fromDate)} → ${fmtDate(it.toDate)}`:'—';
          return `<tr>
            <td>${fmtDate(it.date)}</td>
            <td class="td-bold">${it.customerName||customerName(it.customerId)}</td>
            <td>${it.vehicleId?vehicleLabelShort(it.vehicleId):'—'}</td>
            <td>${period}</td>
            <td>${it.days||'—'}</td>
            <td class="td-mono" style="color:var(--success);font-weight:600">${amd(it.amount)}</td>
            <td>${it.method||'—'}</td>
            <td>${it.type||'—'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="openIncomeModal('${it.id}')">Edit</button>
              <button class="btn btn-ghost btn-sm" onclick="deleteIncome('${it.id}')">Delete</button>
            </td>
          </tr>`;
        }).join('')}
        </tbody></table>`:`<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;opacity:.25"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><div class="empty-state-title">No income recorded yet</div><button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openIncomeModal()">Record first income</button></div>`}
      </div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// FLEET
// ──────────────────────────────────────────────────────────────────────────
function renderFleet(body, actions) {
  actions.innerHTML=`<button class="btn btn-primary btn-sm" onclick="openVehicleModal()">+ Add Vehicle</button>`;
  const counts={};
  ['all','available','maintenance','inactive'].forEach(f=>{
    counts[f]=f==='all'?state.vehicles.length:state.vehicles.filter(v=>vehicleDisplayStatus(v).toLowerCase()===f).length;
  });
  const filtered=state.vehicles.filter(v=>state.vehicleFilter==='all'||vehicleDisplayStatus(v).toLowerCase()===state.vehicleFilter);

  body.innerHTML=`
    <div class="list-controls">
      <div class="filter-tabs">
        ${['all','available','maintenance','inactive'].map(f=>`<div class="filter-tab${state.vehicleFilter===f?' active':''}" onclick="state.vehicleFilter='${f}';renderPage()">${f[0].toUpperCase()+f.slice(1)} (${counts[f]})</div>`).join('')}
      </div>
    </div>
    <div class="fleet-grid">
      ${filtered.length?filtered.map(v=>{
        const st=vehicleDisplayStatus(v);
        const today=todayStr();
        const monthInc=state.income.filter(it=>it.vehicleId===v.id&&periodFilter(it.date)).reduce((s,it)=>s+(Number(it.amount)||0),0);
        const expiring=[];
        if(v.insuranceExpiry&&v.insuranceExpiry<new Date(Date.now()+30*86400000).toISOString().slice(0,10)) expiring.push('Insurance exp. '+fmtDate(v.insuranceExpiry));
        if(v.regExpiry&&v.regExpiry<new Date(Date.now()+30*86400000).toISOString().slice(0,10)) expiring.push('Reg exp. '+fmtDate(v.regExpiry));
        return `<div class="vehicle-card" onclick="openVehicleModal('${v.id}')">
          <div class="vehicle-card-header"><div><div class="vehicle-make">${v.make} ${v.model}</div><div class="vehicle-plate">${v.plate}${v.year?' · '+v.year:''}${v.color?' · '+v.color:''}</div></div>${vehicleBadge(st)}</div>
          <div class="vehicle-body">
            ${monthInc?`<div class="vehicle-meta"><span class="vehicle-meta-key">Income (month)</span><strong style="color:var(--success)">${amd(monthInc)}</strong></div>`:''}
            ${v.mileage?`<div class="vehicle-meta"><span class="vehicle-meta-key">Mileage</span>${Number(v.mileage).toLocaleString()} km</div>`:''}
            ${expiring.map(e=>`<div class="vehicle-meta" style="color:var(--warning);font-size:11px">⚠ ${e}</div>`).join('')}
          </div>
          <div class="vehicle-footer"><div class="vehicle-rate">${amd(v.dailyRate)} <span>/ day</span></div><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openExpenseModal(null,'${v.id}')">+ Expense</button></div>
        </div>`;
      }).join(''):`<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-title">No vehicles</div><button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openVehicleModal()">Add first vehicle</button></div>`}
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// CUSTOMERS
// ──────────────────────────────────────────────────────────────────────────
function renderCustomers(body, actions) {
  actions.innerHTML=`<button class="btn btn-primary btn-sm" onclick="openCustomerModal()">+ Add Customer</button>`;
  const search=(state.customerSearch||'').toLowerCase();
  const filtered=state.customers.filter(c=>!search||c.name?.toLowerCase().includes(search)||c.phone?.includes(search)||c.idNumber?.toLowerCase().includes(search)).sort((a,b)=>a.name>b.name?1:-1);

  body.innerHTML=`
    <div class="list-controls">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" placeholder="Search name, phone, ID…" value="${state.customerSearch||''}" oninput="state.customerSearch=this.value;renderPage()">
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        ${filtered.length?`<table><thead><tr><th>Name</th><th>Phone</th><th>ID / Passport</th><th>License</th><th>Entries</th><th>Total Paid</th><th>Last</th><th></th></tr></thead><tbody>
        ${filtered.map(c=>{
          const cinc=state.income.filter(it=>it.customerId===c.id);
          const spent=cinc.reduce((s,it)=>s+(Number(it.amount)||0),0);
          const last=[...cinc].sort((a,b)=>b.date>a.date?1:-1)[0];
          return `<tr>
            <td class="td-bold">${c.name}</td>
            <td>${c.phone||'—'}</td>
            <td>${c.idNumber||'—'}</td>
            <td>${c.licenseNumber||'—'}</td>
            <td>${cinc.length}</td>
            <td class="td-mono">${amd(spent)}</td>
            <td>${last?fmtDate(last.date):'—'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="openCustomerModal('${c.id}')">Edit</button>
              <button class="btn btn-ghost btn-sm" onclick="openIncomeModal(null,'${c.id}')">+ Income</button>
            </td>
          </tr>`;
        }).join('')}
        </tbody></table>`:`<div class="empty-state"><div class="empty-state-title">No customers yet</div><button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openCustomerModal()">Add first customer</button></div>`}
      </div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// FINANCES
// ──────────────────────────────────────────────────────────────────────────
function stakeholderName(id) { const s=state.stakeholders.find(x=>x.id===id); return s?s.name:'—'; }

function stakeholderStats(stakeholderId) {
  const exps=state.expenses.filter(e=>e.stakeholderId===stakeholderId);
  const total=exps.reduce((sum,e)=>sum+(Number(e.amount)||0),0);
  return {count:exps.length,total};
}

function renderFinances(body, actions) {
  actions.innerHTML=`
    <select class="form-control" style="width:auto;font-size:12px" onchange="state.finPeriod=this.value;renderPage()">
      <option value="month" ${state.finPeriod==='month'?'selected':''}>This Month</option>
      <option value="last_month" ${state.finPeriod==='last_month'?'selected':''}>Last Month</option>
      <option value="year" ${state.finPeriod==='year'?'selected':''}>This Year</option>
      <option value="all" ${state.finPeriod==='all'?'selected':''}>All Time</option>
    </select>
    <button class="btn btn-secondary btn-sm" onclick="openStakeholderModal()">Stakeholders</button>
    <button class="btn btn-primary btn-sm" onclick="openExpenseModal()">+ Expense</button>`;

  const inc=state.income.filter(it=>periodFilter(it.date));
  const exps=state.expenses.filter(e=>periodFilter(e.date));
  const income=inc.reduce((s,it)=>s+(Number(it.amount)||0),0);
  const expTotal=exps.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const net=income-expTotal;

  const byMethod={},byType={},byVehicleInc={},byVehicleExp={},byStakeholder={};
  inc.forEach(it=>{
    const m=it.method||'Other';byMethod[m]=(byMethod[m]||0)+(Number(it.amount)||0);
    if(it.vehicleId){const k=vehicleLabelShort(it.vehicleId);byVehicleInc[k]=(byVehicleInc[k]||0)+(Number(it.amount)||0);}
  });
  exps.forEach(e=>{
    const t=e.type||e.category||'Other';
    byType[t]=(byType[t]||0)+(Number(e.amount)||0);
    if(e.vehicleId){const k=vehicleLabelShort(e.vehicleId);byVehicleExp[k]=(byVehicleExp[k]||0)+(Number(e.amount)||0);}
    if(e.stakeholderId){const k=stakeholderName(e.stakeholderId);byStakeholder[k]=(byStakeholder[k]||0)+(Number(e.amount)||0);}
  });

  const recentInc=[...inc].sort((a,b)=>b.date>a.date?1:-1).slice(0,8);
  const recentExp=[...exps].sort((a,b)=>b.date>a.date?1:-1);

  body.innerHTML=`
    <div class="kpi-row">
      <div class="kpi kpi-ok"><div class="kpi-icon">💰</div><div class="kpi-label">Income</div><div class="kpi-value">${amdK(income)}</div><div class="kpi-sub">${inc.length} entr${inc.length===1?'y':'ies'}</div></div>
      <div class="kpi kpi-bad"><div class="kpi-icon">💸</div><div class="kpi-label">Expenses</div><div class="kpi-value">${amdK(expTotal)}</div><div class="kpi-sub">${exps.length} item${exps.length!==1?'s':''}</div></div>
      <div class="kpi ${net>=0?'kpi-ok':'kpi-bad'}"><div class="kpi-icon">${net>=0?'📈':'📉'}</div><div class="kpi-label">Net Profit</div><div class="kpi-value" style="color:${net>=0?'var(--success)':'var(--danger)'}">${amdK(net)}</div><div class="kpi-sub">${net>=0?'profit':'loss'}</div></div>
    </div>
    <div class="dash-grid">
      <div class="card"><div class="card-header"><div class="card-title">Income by Method</div></div><div class="card-body">${barList(byMethod,income,'var(--success)')}</div></div>
      <div class="card"><div class="card-header"><div class="card-title">Expenses by Type</div></div><div class="card-body">${barList(byType,expTotal,'var(--danger)')}</div></div>
      ${Object.keys(byVehicleInc).length?`<div class="card"><div class="card-header"><div class="card-title">Income by Vehicle</div></div><div class="card-body">${barList(byVehicleInc,income,'var(--success)')}</div></div>`:''}
      ${Object.keys(byVehicleExp).length?`<div class="card"><div class="card-header"><div class="card-title">Expenses by Vehicle</div></div><div class="card-body">${barList(byVehicleExp,expTotal,'var(--warning)')}</div></div>`:''}
      ${Object.keys(byStakeholder).length?`<div class="card"><div class="card-header"><div class="card-title">Expenses by Stakeholder</div><button class="btn btn-secondary btn-sm" onclick="openStakeholderModal()">Manage</button></div><div class="card-body">${barList(byStakeholder,expTotal,'var(--primary)')}</div></div>`:''}
      <div class="card">
        <div class="card-header"><div class="card-title">Recent Income</div></div>
        <div class="table-wrap">${recentInc.length?`<table><thead><tr><th>Date</th><th>Customer</th><th>Vehicle</th><th>Method</th><th>Type</th><th>Amount</th></tr></thead><tbody>${recentInc.map(it=>`<tr><td>${fmtDate(it.date)}</td><td>${it.customerName||customerName(it.customerId)}</td><td>${it.vehicleId?vehicleLabelShort(it.vehicleId):'—'}</td><td>${it.method||'—'}</td><td>${it.type||'—'}</td><td class="td-mono" style="color:var(--success);font-weight:600">${amd(it.amount)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty-state">No income in period</div>'}</div>
      </div>
      <div class="card dash-full">
        <div class="card-header"><div class="card-title">Expenses</div></div>
        <div class="table-wrap">${recentExp.length?`<table><thead><tr><th>Date</th><th>Type</th><th>Vehicle</th><th>Stakeholder</th><th>Description</th><th>Part info</th><th>Amount</th><th></th></tr></thead><tbody>${recentExp.map(e=>{
            const partCatColors={'New':'var(--success)','Used':'var(--warning)','From our storage':'#8b5cf6'};
            const partInfo=(e.type==='Part'&&e.partName)?`<small style="display:block"><b>${e.partName}</b>${e.partCategory?` <span style="color:${partCatColors[e.partCategory]||'var(--muted)'};font-size:10px;font-weight:700">[${e.partCategory}]</span>`:''}${e.replacedPartCondition&&e.replacedPartCondition!=='—'?` · old: ${e.replacedPartCondition}`:''}${e.replacedPartDisposition&&e.replacedPartDisposition!=='—'?' · '+e.replacedPartDisposition:''}</small>`:'—';
            const stakeCell=e.stakeholderId?`<strong>${stakeholderName(e.stakeholderId)}</strong>`:'—';
            return `<tr><td>${fmtDate(e.date)}</td><td><span class="badge ${e.type==='Part'?'badge-upcoming':e.type==='Service'?'badge-active':'badge-completed'}">${e.type||e.category||'—'}</span></td><td>${e.vehicleId?vehicleLabelShort(e.vehicleId):'—'}</td><td>${stakeCell}</td><td>${e.description||'—'}</td><td style="max-width:160px">${partInfo}</td><td class="td-mono" style="color:var(--danger);font-weight:600">${amd(e.amount)}</td><td><button class="btn btn-ghost btn-sm" onclick="openExpenseModal('${e.id}')">Edit</button></td></tr>`;
          }).join('')}</tbody></table>`:'<div class="empty-state">No expenses in period</div>'}</div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL: INCOME (post-factum). Amount can be typed, or auto = rate × days.
// ──────────────────────────────────────────────────────────────────────────
function openIncomeModal(incomeId, prefillCustomerId) {
  const it=incomeId?state.income.find(x=>x.id===incomeId):null;
  const custOpts=state.customers.map(c=>`<option value="${c.id}" ${(it?.customerId===c.id||prefillCustomerId===c.id)?'selected':''}>${c.name} — ${c.phone||''}</option>`).join('');
  const vehOpts=state.vehicles.filter(v=>v.status!=='Inactive').map(v=>`<option value="${v.id}" ${it?.vehicleId===v.id?'selected':''} data-rate="${v.dailyRate}">${v.plate} · ${v.make} ${v.model} (${amd(v.dailyRate)}/d)</option>`).join('');
  const meth=it?.method||'Cash', typ=it?.type||'Rental';

  openModal(`<div class="modal-overlay"><div class="modal modal-wide">
    <div class="modal-header"><div class="modal-title">${it?'Edit Income':'Record Income'}</div>${CLOSE_BTN}</div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Date received <span class="req">*</span></label>
          <input type="date" class="form-control" id="in-date" value="${it?.date||todayStr()}">
        </div>
        <div class="form-group">
          <label class="form-label">Customer</label>
          <select class="form-control" id="in-cust"><option value="">— none —</option>${custOpts}</select>
          <div style="margin-top:6px"><button class="btn btn-ghost btn-sm" onclick="openCustomerModal(null,true)">+ New customer</button></div>
        </div>
        <div class="form-group">
          <label class="form-label">Vehicle</label>
          <select class="form-control" id="in-veh" onchange="calcIncomeTotal()"><option value="">— none —</option>${vehOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Rented from</label>
          <input type="date" class="form-control" id="in-from" value="${it?.fromDate||''}" onchange="calcIncomeTotal()">
        </div>
        <div class="form-group">
          <label class="form-label">Rented to</label>
          <input type="date" class="form-control" id="in-to" value="${it?.toDate||''}" onchange="calcIncomeTotal()">
        </div>
        <div class="form-group">
          <label class="form-label">Daily rate (֏)</label>
          <input type="number" class="form-control" id="in-rate" value="${it?.rate||''}" placeholder="auto from vehicle" oninput="calcIncomeTotal()">
        </div>
        <div class="form-group">
          <label class="form-label">Amount (֏) <span class="req">*</span></label>
          <input type="number" class="form-control" id="in-amount" value="${it?.amount||''}" placeholder="type, or auto = rate × days">
        </div>
        <div class="form-group">
          <label class="form-label">Method</label>
          <select class="form-control" id="in-meth">${['Cash','Card','Transfer'].map(m=>`<option ${meth===m?'selected':''}>${m}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-control" id="in-type">${['Rental','Deposit','Extra','Other'].map(t=>`<option ${typ===t?'selected':''}>${t}</option>`).join('')}</select>
        </div>
        <div class="form-group form-full">
          <label class="form-label">Notes</label>
          <textarea class="form-control" id="in-notes">${it?.notes||''}</textarea>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">Leave the amount blank and fill rate + dates to auto-calculate it. You can always override the amount.</div>
    </div>
    <div class="modal-footer">
      ${it?`<button class="btn btn-danger" onclick="deleteIncome('${it.id}')">Delete</button>`:''}
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveIncome('${it?.id||''}')">Save</button>
    </div>
  </div></div>`);
}

// Auto-fill amount from the vehicle's set daily rate × the rented period.
function calcIncomeTotal() {
  const from=document.getElementById('in-from')?.value, to=document.getElementById('in-to')?.value;
  const vSel=document.getElementById('in-veh'), rateEl=document.getElementById('in-rate'), amtEl=document.getElementById('in-amount');
  if(!amtEl) return;
  let rate=Number(rateEl?.value);
  if(!rate && vSel?.value){ rate=Number(vSel.options[vSel.selectedIndex]?.dataset?.rate)||0; if(rate&&rateEl) rateEl.value=rate; }
  if(rate && from && to && to>=from) amtEl.value = rate*diffDays(from,to);
}

async function saveIncome(id) {
  const customerId=document.getElementById('in-cust').value;
  const vehicleId=document.getElementById('in-veh').value;
  const fromDate=document.getElementById('in-from').value, toDate=document.getElementById('in-to').value;
  if(fromDate&&toDate&&toDate<fromDate){toast('“Rented to” must be after “rented from”','error');return;}
  const rate=Number(document.getElementById('in-rate').value)||0;
  const amount=Number(document.getElementById('in-amount').value)||0;
  if(!amount){toast('Enter an amount (or fill rate + dates)','error');return;}
  const days=(fromDate&&toDate)?diffDays(fromDate,toDate):'';
  const entry={
    id:id||uid(),
    date:document.getElementById('in-date').value||todayStr(),
    customerId, customerName:customerId?customerName(customerId):'',
    vehicleId, fromDate, toDate, days, rate, amount,
    method:document.getElementById('in-meth').value,
    type:document.getElementById('in-type').value,
    notes:document.getElementById('in-notes').value.trim(),
    createdAt:id?(state.income.find(x=>x.id===id)?.createdAt||todayStr()):todayStr(),
  };
  closeModal();
  try{
    if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID')){const r=await callApi({action:'saveIncome',data:JSON.stringify(entry)});if(r.error)throw new Error(r.error);entry.id=r.id||entry.id;}
    const idx=state.income.findIndex(x=>x.id===id);
    if(idx>=0)state.income[idx]=entry;else state.income.push(entry);
    toast(id?'Income updated':'Income recorded','success');
  }catch(e){toast('Save failed: '+e.message,'error');}
  renderPage();
}

async function deleteIncome(id) {
  if(!confirm('Delete this income entry?'))return;
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID'))await callApi({action:'deleteIncome',id});state.income=state.income.filter(x=>x.id!==id);toast('Deleted','success');}catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL: VEHICLE
// ──────────────────────────────────────────────────────────────────────────
function openVehicleModal(vehicleId) {
  const v=vehicleId?state.vehicles.find(x=>x.id===vehicleId):null;
  openModal(`<div class="modal-overlay"><div class="modal modal-wide">
    <div class="modal-header"><div class="modal-title">${v?'Edit Vehicle':'Add Vehicle'}</div>${CLOSE_BTN}</div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Make <span class="req">*</span></label><input type="text" class="form-control" id="v-make" value="${v?.make||''}" placeholder="Toyota"></div>
        <div class="form-group"><label class="form-label">Model <span class="req">*</span></label><input type="text" class="form-control" id="v-model" value="${v?.model||''}" placeholder="Camry"></div>
        <div class="form-group"><label class="form-label">Year</label><input type="number" class="form-control" id="v-year" value="${v?.year||''}" placeholder="2022"></div>
        <div class="form-group"><label class="form-label">License Plate <span class="req">*</span></label><input type="text" class="form-control" id="v-plate" value="${v?.plate||''}" placeholder="AB 123 CD"></div>
        <div class="form-group"><label class="form-label">Color</label><input type="text" class="form-control" id="v-color" value="${v?.color||''}" placeholder="Black"></div>
        <div class="form-group"><label class="form-label">Daily Rate (֏) <span class="req">*</span></label><input type="number" class="form-control" id="v-rate" value="${v?.dailyRate||''}" placeholder="15000"></div>
        <div class="form-group"><label class="form-label">Mileage (km)</label><input type="number" class="form-control" id="v-mileage" value="${v?.mileage||''}"></div>
        <div class="form-group"><label class="form-label">Status</label><select class="form-control" id="v-status">${['Available','Maintenance','Inactive'].map(s=>`<option ${(v?.status||'Available')===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Insurance Expiry</label><input type="date" class="form-control" id="v-ins" value="${v?.insuranceExpiry||''}"></div>
        <div class="form-group"><label class="form-label">Registration Expiry</label><input type="date" class="form-control" id="v-reg" value="${v?.regExpiry||''}"></div>
        <div class="form-group form-full"><label class="form-label">Notes</label><textarea class="form-control" id="v-notes">${v?.notes||''}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      ${v?`<button class="btn btn-danger" onclick="deleteVehicle('${v.id}')">Delete</button>`:''}
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveVehicle('${v?.id||''}')">Save</button>
    </div>
  </div></div>`);
}

// Vehicle IDs are the plate number. New vehicles derive their id from the
// plate (uppercased, made unique). Existing vehicles keep their id on edit so
// linked income/expenses are never orphaned — even if the plate is changed.
function uniqueVehicleId(plate){
  const base=plate.trim().toUpperCase();
  let candidate=base, n=1;
  while(state.vehicles.some(v=>v.id===candidate)){ n++; candidate=base+'-'+n; }
  return candidate;
}

async function saveVehicle(id) {
  const make=document.getElementById('v-make').value.trim(),model=document.getElementById('v-model').value.trim(),plate=document.getElementById('v-plate').value.trim().toUpperCase(),dailyRate=Number(document.getElementById('v-rate').value)||0;
  if(!plate){toast('Plate number is required','error');return;}
  const vid=id||uniqueVehicleId(plate);
  const vehicle={id:vid,make,model,plate,dailyRate,year:document.getElementById('v-year').value,color:document.getElementById('v-color').value.trim(),mileage:Number(document.getElementById('v-mileage').value)||'',status:document.getElementById('v-status').value,insuranceExpiry:document.getElementById('v-ins').value,regExpiry:document.getElementById('v-reg').value,notes:document.getElementById('v-notes').value.trim()};
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID')){const r=await callApi({action:'saveVehicle',data:JSON.stringify(vehicle)});if(r.error)throw new Error(r.error);vehicle.id=r.id||vehicle.id;}const idx=state.vehicles.findIndex(v=>v.id===id);if(idx>=0)state.vehicles[idx]=vehicle;else state.vehicles.push(vehicle);toast(id?'Vehicle updated':'Vehicle added','success');}catch(e){toast('Save failed: '+e.message,'error');}
  renderPage();
}

async function deleteVehicle(id) {
  if(!confirm('Delete this vehicle?'))return;
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID'))await callApi({action:'deleteVehicle',id});state.vehicles=state.vehicles.filter(v=>v.id!==id);toast('Vehicle deleted','success');}catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL: CUSTOMER
// ──────────────────────────────────────────────────────────────────────────
function openCustomerModal(customerId, fromIncome) {
  const c=customerId?state.customers.find(x=>x.id===customerId):null;
  openModal(`<div class="modal-overlay"><div class="modal">
    <div class="modal-header"><div class="modal-title">${c?'Edit Customer':'New Customer'}</div>${CLOSE_BTN}</div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group form-full"><label class="form-label">Full Name <span class="req">*</span></label><input type="text" class="form-control" id="cu-name" value="${c?.name||''}" placeholder="Ara Petrosyan"></div>
        <div class="form-group"><label class="form-label">Phone <span class="req">*</span></label><input type="tel" class="form-control" id="cu-phone" value="${c?.phone||''}" placeholder="+374 91 000000"></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-control" id="cu-email" value="${c?.email||''}"></div>
        <div class="form-group"><label class="form-label">ID / Passport №</label><input type="text" class="form-control" id="cu-id" value="${c?.idNumber||''}"></div>
        <div class="form-group"><label class="form-label">Driver's License №</label><input type="text" class="form-control" id="cu-lic" value="${c?.licenseNumber||''}"></div>
        <div class="form-group form-full"><label class="form-label">Address</label><input type="text" class="form-control" id="cu-addr" value="${c?.address||''}"></div>
        <div class="form-group form-full"><label class="form-label">Notes</label><textarea class="form-control" id="cu-notes">${c?.notes||''}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      ${c?`<button class="btn btn-danger" onclick="deleteCustomer('${c.id}')">Delete</button>`:''}
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveCustomer('${c?.id||''}',${!!fromIncome})">Save</button>
    </div>
  </div></div>`);
}

async function saveCustomer(id, fromIncome) {
  const name=document.getElementById('cu-name').value.trim(),phone=document.getElementById('cu-phone').value.trim();
  const customer={id:id||uid(),name,phone,email:document.getElementById('cu-email').value.trim(),idNumber:document.getElementById('cu-id').value.trim(),licenseNumber:document.getElementById('cu-lic').value.trim(),address:document.getElementById('cu-addr').value.trim(),notes:document.getElementById('cu-notes').value.trim(),createdAt:id?(state.customers.find(c=>c.id===id)?.createdAt||todayStr()):todayStr()};
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID')){const r=await callApi({action:'saveCustomer',data:JSON.stringify(customer)});if(r.error)throw new Error(r.error);customer.id=r.id||customer.id;}const idx=state.customers.findIndex(c=>c.id===id);if(idx>=0)state.customers[idx]=customer;else state.customers.push(customer);toast(id?'Customer updated':'Customer added','success');}catch(e){toast('Save failed: '+e.message,'error');}
  if(fromIncome)openIncomeModal(null,customer.id);else renderPage();
}

async function deleteCustomer(id) {
  if(!confirm('Delete this customer?'))return;
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID'))await callApi({action:'deleteCustomer',id});state.customers=state.customers.filter(c=>c.id!==id);toast('Customer deleted','success');}catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL: EXPENSE (Part / Service / other with stakeholder tracking)
// ──────────────────────────────────────────────────────────────────────────
const EX_TYPES = ['Part','Service','Fuel','Insurance','Registration','Fine','Cleaning','Other'];
const OLD_PART_CONDITIONS = ['—','Good (removed for other reason)','Worn','Damaged / Broken','Missing'];
const OLD_PART_DISPOSITIONS = ['—','Stored in garage','Discarded','Returned to supplier','Sold'];

function openExpenseModal(expenseId, prefillVehicleId) {
  const e=expenseId?state.expenses.find(x=>x.id===expenseId):null;
  const curType=e?.type||e?.category||'Part';
  const vOpts=state.vehicles.map(v=>`<option value="${v.id}" ${(e?.vehicleId===v.id||prefillVehicleId===v.id)?'selected':''}>${v.plate} · ${v.make} ${v.model}</option>`).join('');
  const sOpts=state.stakeholders.map(s=>`<option value="${s.id}" ${e?.stakeholderId===s.id?'selected':''}>${s.name}${s.type?' ('+s.type+')':''}</option>`).join('');
  const showPart=curType==='Part';
  const showStake=curType==='Part'||curType==='Service';

  openModal(`<div class="modal-overlay"><div class="modal modal-wide">
    <div class="modal-header"><div class="modal-title">${e?'Edit Expense':'Add Expense'}</div>${CLOSE_BTN}</div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-control" id="ex-type" onchange="toggleExpenseFields()">
            ${EX_TYPES.map(t=>`<option ${curType===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Amount (֏)</label>
          <input type="number" class="form-control" id="ex-amt" value="${e?.amount||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" class="form-control" id="ex-date" value="${e?.date||todayStr()}">
        </div>
        <div class="form-group">
          <label class="form-label">Vehicle</label>
          <select class="form-control" id="ex-veh"><option value="">— general —</option>${vOpts}</select>
        </div>

        <!-- Part fields -->
        <div id="ex-part-section" class="form-full" style="display:${showPart?'block':'none'}">
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:2px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:10px">Part / Detail Info</div>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Part / Detail name</label>
                <input type="text" class="form-control" id="ex-partname" value="${e?.partName||''}" placeholder="Brake pads, oil filter, timing belt…">
              </div>
              <div class="form-group">
                <label class="form-label">Part category</label>
                <select class="form-control" id="ex-partcat">
                  ${['New','Used','From our storage'].map(c=>`<option ${(e?.partCategory||'New')===c?'selected':''}>${c}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Old part condition</label>
                <select class="form-control" id="ex-oldcond">
                  ${OLD_PART_CONDITIONS.map(c=>`<option ${e?.replacedPartCondition===c?'selected':''}>${c}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Old part disposition</label>
                <select class="form-control" id="ex-olddisp">
                  ${OLD_PART_DISPOSITIONS.map(d=>`<option ${e?.replacedPartDisposition===d?'selected':''}>${d}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Stakeholder (mechanic / supplier) -->
        <div id="ex-stake-section" class="form-full" style="display:${showStake?'block':'none'}">
          <div style="background:var(--primary-l);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:2px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary);margin-bottom:10px">Paid to (Stakeholder)</div>
            <div style="display:flex;gap:8px;align-items:flex-end">
              <div class="form-group" style="flex:1;margin:0">
                <select class="form-control" id="ex-stakeholder">
                  <option value="">— none / not tracked —</option>${sOpts}
                </select>
              </div>
              <button class="btn btn-ghost btn-sm" style="white-space:nowrap" onclick="openStakeholderModal(null,true)">+ New</button>
            </div>
          </div>
        </div>

        <div class="form-group form-full">
          <label class="form-label">Description</label>
          <input type="text" class="form-control" id="ex-desc" value="${e?.description||''}" placeholder="What was done / bought…">
        </div>
        <div class="form-group form-full">
          <label class="form-label">Notes</label>
          <textarea class="form-control" id="ex-notes" style="min-height:50px">${e?.notes||''}</textarea>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      ${e?`<button class="btn btn-danger" onclick="deleteExpense('${e.id}')">Delete</button>`:''}
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveExpense('${e?.id||''}')">Save</button>
    </div>
  </div></div>`);
}

function toggleExpenseFields() {
  const type=document.getElementById('ex-type')?.value;
  const partSec=document.getElementById('ex-part-section');
  const stakeSec=document.getElementById('ex-stake-section');
  if(partSec)  partSec.style.display  = type==='Part' ? 'block' : 'none';
  if(stakeSec) stakeSec.style.display = (type==='Part'||type==='Service') ? 'block' : 'none';
}

async function saveExpense(id) {
  const type=document.getElementById('ex-type').value;
  const amount=Number(document.getElementById('ex-amt').value)||0;
  const date=document.getElementById('ex-date').value;
  const vehicleId=document.getElementById('ex-veh').value;
  const stakeholderId=document.getElementById('ex-stakeholder')?.value||'';
  const partName=(type==='Part'?document.getElementById('ex-partname')?.value.trim():'') ||'';
  const partCategory=(type==='Part'?document.getElementById('ex-partcat')?.value:'') ||'';
  const replacedPartCondition=(type==='Part'?document.getElementById('ex-oldcond')?.value:'') ||'';
  const replacedPartDisposition=(type==='Part'?document.getElementById('ex-olddisp')?.value:'') ||'';
  const description=document.getElementById('ex-desc').value.trim();
  const notes=document.getElementById('ex-notes').value.trim();

  const expense={id:id||uid(),recordType:'expense',type,amount,date,vehicleId,stakeholderId,partName,partCategory,replacedPartCondition,replacedPartDisposition,description,notes};
  closeModal();
  try{
    if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID')){const r=await callApi({action:'saveExpense',data:JSON.stringify(expense)});if(r.error)throw new Error(r.error);expense.id=r.id||expense.id;}
    const idx=state.expenses.findIndex(e=>e.id===id);
    if(idx>=0)state.expenses[idx]=expense;else state.expenses.push(expense);
    toast(id?'Expense updated':'Expense added','success');
  }catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

async function deleteExpense(id) {
  if(!confirm('Delete this expense?'))return;
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID'))await callApi({action:'deleteExpense',id});state.expenses=state.expenses.filter(e=>e.id!==id);toast('Deleted','success');}catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL: STAKEHOLDER
// ──────────────────────────────────────────────────────────────────────────
function openStakeholderModal(stakeholderId, fromExpense) {
  const s=stakeholderId?state.stakeholders.find(x=>x.id===stakeholderId):null;

  // If no specific ID and not from expense → show the management list
  if(!stakeholderId && !fromExpense) {
    openModal(`<div class="modal-overlay"><div class="modal modal-wide">
      <div class="modal-header"><div class="modal-title">Stakeholders</div>${CLOSE_BTN}</div>
      <div class="modal-body">
        ${state.stakeholders.length?`<table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;text-transform:uppercase">Name</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;text-transform:uppercase">Type</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;text-transform:uppercase">Phone</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;text-transform:uppercase">Expenses</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;text-transform:uppercase">Total Spent</th>
            <th></th>
          </tr></thead>
          <tbody>${state.stakeholders.map(st=>{
            const stats=stakeholderStats(st.id);
            return `<tr>
              <td style="padding:10px 8px;font-weight:600">${st.name}</td>
              <td style="padding:10px 8px;color:var(--muted)">${st.type||'—'}</td>
              <td style="padding:10px 8px">${st.phone||'—'}</td>
              <td style="padding:10px 8px;text-align:right">${stats.count}</td>
              <td style="padding:10px 8px;text-align:right;font-weight:600">${amd(stats.total)}</td>
              <td style="padding:10px 8px;white-space:nowrap">
                <button class="btn btn-ghost btn-sm" onclick="openStakeholderModal('${st.id}')">Edit</button>
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>`:`<div class="empty-state"><div class="empty-state-title">No stakeholders yet</div></div>`}
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="openStakeholderModal(null,true)">+ Add New</button>
      </div>
    </div></div>`);
    return;
  }

  // Create / edit form
  openModal(`<div class="modal-overlay"><div class="modal">
    <div class="modal-header"><div class="modal-title">${s?'Edit Stakeholder':'New Stakeholder'}</div>${CLOSE_BTN}</div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group form-full">
          <label class="form-label">Name</label>
          <input type="text" class="form-control" id="sk-name" value="${s?.name||''}" placeholder="Armen, Garage Nord, State Tax Service…">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-control" id="sk-type">
            ${['Mechanic','Parts Shop','Insurance Company','State / Government','Bank','Other'].map(t=>`<option ${s?.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="tel" class="form-control" id="sk-phone" value="${s?.phone||''}" placeholder="+374 91 000000">
        </div>
        <div class="form-group form-full">
          <label class="form-label">Notes</label>
          <textarea class="form-control" id="sk-notes" style="min-height:50px">${s?.notes||''}</textarea>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      ${s?`<button class="btn btn-danger" onclick="deleteStakeholder('${s.id}')">Delete</button>`:''}
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveStakeholder('${s?.id||''}',${!!fromExpense})">Save</button>
    </div>
  </div></div>`);
}

async function saveStakeholder(id, fromExpense) {
  const name=document.getElementById('sk-name').value.trim();
  const stakeholder={
    id:id||uid(),
    name:name||'Unnamed',
    type:document.getElementById('sk-type').value,
    phone:document.getElementById('sk-phone').value.trim(),
    notes:document.getElementById('sk-notes').value.trim(),
  };
  closeModal();
  try{
    if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID')){const r=await callApi({action:'saveStakeholder',data:JSON.stringify(stakeholder)});if(r.error)throw new Error(r.error);stakeholder.id=r.id||stakeholder.id;}
    const idx=state.stakeholders.findIndex(s=>s.id===id);
    if(idx>=0)state.stakeholders[idx]=stakeholder;else state.stakeholders.push(stakeholder);
    toast(id?'Updated':'Saved','success');
  }catch(e){toast('Error: '+e.message,'error');}
  if(fromExpense) openExpenseModal();
  else renderPage();
}

async function deleteStakeholder(id) {
  const usedInExpenses=state.expenses.some(e=>e.stakeholderId===id);
  if(usedInExpenses&&!confirm('This stakeholder has expenses linked. Delete anyway?'))return;
  else if(!usedInExpenses&&!confirm('Delete this stakeholder?'))return;
  closeModal();
  try{
    if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID'))await callApi({action:'deleteStakeholder',id});
    state.stakeholders=state.stakeholders.filter(s=>s.id!==id);
    toast('Deleted','success');
  }catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

// ──────────────────────────────────────────────────────────────────────────
// BOOT
// ──────────────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
fetchAll();
