'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  page: 'dashboard',
  vehicles: [], customers: [], bookings: [], payments: [], expenses: [], stakeholders: [],
  loading: false,
  bookingFilter: 'all', bookingSearch: '',
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
    state.bookings    = d.bookings    || [];
    state.payments    = d.payments    || [];
    state.expenses    = d.expenses    || [];
    state.stakeholders = d.stakeholders || [];
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
function fmtDateTime(date, time) {
  const d = fmtDate(date);
  if (!d || d === '—') return '—';
  if (!time) return d;
  return `${d}<br><small style="color:var(--muted);font-size:11px">${time}</small>`;
}
function todayStr() { return new Date().toISOString().slice(0,10); }
function currentTimeStr() { const n=new Date(); return ('0'+n.getHours()).slice(-2)+':'+('0'+n.getMinutes()).slice(-2); }
function diffDays(a, b) { return Math.max(1, Math.round((new Date(b)-new Date(a))/86400000)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ── Business logic ─────────────────────────────────────────────────────────
function bookingStatus(b) {
  if (b.cancelled===true || String(b.cancelled).toLowerCase()==='true') return 'Cancelled';
  if (b.returnDate) return 'Completed';
  const nowDate = todayStr();
  if (b.startDate > nowDate) return 'Upcoming';
  if (b.endDate   < nowDate) return 'Overdue';
  // Same day: if return time is set and has passed, mark Overdue
  if (b.endDate === nowDate && b.endTime && currentTimeStr() > b.endTime) return 'Overdue';
  return 'Active';
}

function vehicleDisplayStatus(v) {
  const rented = state.bookings.some(b => b.vehicleId===v.id && bookingStatus(b)==='Active');
  return rented ? 'Rented' : (v.status || 'Available');
}

function bookingPaid(bookingId) {
  return state.payments.filter(p => p.bookingId===bookingId).reduce((s,p) => s+(Number(p.amount)||0), 0);
}

function customerById(id)     { return state.customers.find(c => c.id===id); }
function vehicleById(id)      { return state.vehicles.find(v => v.id===id); }
function customerName(id)     { const c=customerById(id); return c?c.name:'—'; }
function vehicleLabelShort(id){
  const v=vehicleById(id); if(!v)return '—';
  const model=[v.make,v.model].filter(Boolean).join(' ');
  return v.plate?`${v.plate} · ${model}`:(model||'—');
}
function vehicleLabel(id)     { return vehicleLabelShort(id); }

function statusBadge(st) {
  const m={Active:'badge-active',Upcoming:'badge-upcoming',Completed:'badge-completed',Cancelled:'badge-cancelled',Overdue:'badge-overdue'};
  return `<span class="badge ${m[st]||'badge-completed'}">${st}</span>`;
}
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
const PAGE_TITLES = { dashboard:'Dashboard', bookings:'Bookings', fleet:'Fleet', customers:'Customers', finances:'Finances' };

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
  ({ dashboard:renderDashboard, bookings:renderBookings, fleet:renderFleet, customers:renderCustomers, finances:renderFinances }[state.page]||renderDashboard)(body, actions);
}

// ──────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ──────────────────────────────────────────────────────────────────────────
function renderDashboard(body, actions) {
  actions.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="fetchAll()">↺ Refresh</button>`;

  const enriched   = state.bookings.map(b=>({...b,_st:bookingStatus(b)}));
  const active     = enriched.filter(b=>b._st==='Active');
  const overdue    = enriched.filter(b=>b._st==='Overdue');
  const upcoming   = enriched.filter(b=>b._st==='Upcoming');
  const monthPay   = state.payments.filter(p=>periodFilter(p.date));
  const income     = monthPay.reduce((s,p)=>s+(Number(p.amount)||0),0);
  const outstanding= [...active,...overdue,...upcoming].reduce((s,b)=>s+Math.max(0,(Number(b.totalAmount)||0)-bookingPaid(b.id)),0);
  const available  = state.vehicles.filter(v=>vehicleDisplayStatus(v)==='Available').length;
  const fleet      = state.vehicles.filter(v=>v.status!=='Inactive').length;

  const setupBanner = GAS_URL.includes('YOUR_DEPLOYMENT_ID')
    ? `<div class="card" style="margin-bottom:16px;border-left:4px solid var(--warning)"><div class="card-body" style="color:var(--warning);font-weight:600">⚠ Setup: open config.js and replace YOUR_DEPLOYMENT_ID with your Google Apps Script URL to connect data.</div></div>` : '';

  const activeSorted = [...active,...overdue].sort((a,b)=>a.endDate>b.endDate?1:-1);

  body.innerHTML = `
    ${setupBanner}
    <div class="kpi-row">
      <div class="kpi kpi-warn"><div class="kpi-icon">🚗</div><div class="kpi-label">Active Rentals</div><div class="kpi-value">${active.length}</div><div class="kpi-sub">${overdue.length?`<span style="color:var(--danger)">${overdue.length} overdue</span>`:'all on time'}</div></div>
      <div class="kpi kpi-ok"><div class="kpi-icon">✅</div><div class="kpi-label">Available Cars</div><div class="kpi-value">${available}</div><div class="kpi-sub">of ${fleet} in fleet</div></div>
      <div class="kpi kpi-info"><div class="kpi-icon">💰</div><div class="kpi-label">Income This Month</div><div class="kpi-value">${amdK(income)}</div><div class="kpi-sub">${monthPay.length} payment${monthPay.length!==1?'s':''}</div></div>
      <div class="kpi kpi-bad"><div class="kpi-icon">⏳</div><div class="kpi-label">Outstanding</div><div class="kpi-value">${amdK(outstanding)}</div><div class="kpi-sub">${active.length+overdue.length+upcoming.length} bookings</div></div>
    </div>

    <div class="dash-grid">
      <div class="card dash-full">
        <div class="card-header">
          <div class="card-title">Active & Overdue Rentals</div>
          <button class="btn btn-primary btn-sm" onclick="openBookingModal()">+ New Booking</button>
        </div>
        <div class="table-wrap">
          ${activeSorted.length ? `<table><thead><tr><th>Customer</th><th>Vehicle</th><th>Return Due</th><th>Days</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>
          ${activeSorted.map(b=>{
            const paid=bookingPaid(b.id), bal=(Number(b.totalAmount)||0)-paid;
            const days = b._st==='Overdue' ? `<span style="color:var(--danger)">+${diffDays(b.endDate,todayStr())}d</span>` : diffDays(todayStr(),b.endDate)+'d left';
            return `<tr><td class="td-bold">${customerName(b.customerId)}</td><td>${vehicleLabelShort(b.vehicleId)}</td><td>${fmtDateTime(b.endDate,b.endTime)}</td><td>${days}</td><td class="td-mono">${amd(b.totalAmount)}</td><td class="td-mono" style="${bal>0?'color:var(--danger);font-weight:700':'color:var(--success)'}">${amd(bal)}</td><td>${statusBadge(b._st)}</td><td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="openBookingModal('${b.id}')">Edit</button> <button class="btn btn-ghost btn-sm" onclick="openPaymentModal('${b.id}')">Pay</button></td></tr>`;
          }).join('')}
          </tbody></table>` : `<div class="empty-state"><div>No active rentals right now</div></div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Upcoming (${upcoming.length})</div></div>
        <div class="card-body">
          ${upcoming.length ? upcoming.slice(0,6).map(b=>`
            <div class="activity-item">
              <div class="activity-dot activity-dot-primary"></div>
              <div class="activity-text"><strong>${customerName(b.customerId)}</strong> — ${vehicleLabelShort(b.vehicleId)}<br><span style="font-size:11px;color:var(--muted)">${fmtDate(b.startDate)} → ${fmtDate(b.endDate)}</span></div>
              <div class="activity-time">${amd(b.totalAmount)}</div>
            </div>`).join('') : `<div style="color:var(--muted);font-size:13px">No upcoming bookings</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Fleet Overview</div></div>
        <div class="card-body">
          ${['Available','Rented','Maintenance','Inactive'].map(st=>{
            const count=state.vehicles.filter(v=>vehicleDisplayStatus(v)===st).length;
            const pct=fleet>0?Math.round(count/fleet*100):0;
            const colors={Available:'var(--success)',Rented:'var(--warning)',Maintenance:'var(--danger)',Inactive:'var(--muted)'};
            return `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:var(--text2)">${st}</span><span style="font-size:12px;color:var(--muted)">${count}</span></div><div class="fin-bar-bg"><div class="fin-bar-fill" style="width:${pct}%;background:${colors[st]}"></div></div></div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// BOOKINGS
// ──────────────────────────────────────────────────────────────────────────
function renderBookings(body, actions) {
  actions.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openBookingModal()">+ New Booking</button>`;
  const enriched = state.bookings.map(b=>({...b,_st:bookingStatus(b)}));
  const search=(state.bookingSearch||'').toLowerCase();
  const counts={};
  ['all','active','upcoming','overdue','completed','cancelled'].forEach(f=>{
    counts[f]=f==='all'?enriched.length:enriched.filter(b=>b._st.toLowerCase()===f).length;
  });
  const filtered=enriched.filter(b=>{
    if(state.bookingFilter!=='all'&&b._st.toLowerCase()!==state.bookingFilter) return false;
    if(search){const cn=customerName(b.customerId).toLowerCase(),vp=(vehicleById(b.vehicleId)?.plate||'').toLowerCase(),vn=vehicleLabelShort(b.vehicleId).toLowerCase();return cn.includes(search)||vp.includes(search)||vn.includes(search);}
    return true;
  }).sort((a,b)=>b.createdAt>a.createdAt?1:-1);

  body.innerHTML=`
    <div class="list-controls">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" placeholder="Search customer or plate…" value="${state.bookingSearch||''}" oninput="state.bookingSearch=this.value;renderPage()">
      </div>
      <div class="filter-tabs">
        ${['all','active','upcoming','overdue','completed','cancelled'].map(f=>`<div class="filter-tab${state.bookingFilter===f?' active':''}" onclick="state.bookingFilter='${f}';renderPage()">${f[0].toUpperCase()+f.slice(1)}${counts[f]?' ('+counts[f]+')':''}</div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        ${filtered.length?`<table><thead><tr><th>Customer</th><th>Vehicle</th><th>Pickup</th><th>Return Due</th><th>Days</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>
        ${filtered.map(b=>{
          const paid=bookingPaid(b.id),bal=(Number(b.totalAmount)||0)-paid;
          const days=diffDays(b.startDate,b.returnDate||b.endDate);
          const returnDisplay = b.returnDate
            ? fmtDateTime(b.returnDate, b.returnTime) + ' <small style="color:var(--success)">(ret)</small>'
            : fmtDateTime(b.endDate, b.endTime);
          return `<tr>
            <td class="td-bold">${customerName(b.customerId)}</td>
            <td>${vehicleLabelShort(b.vehicleId)}</td>
            <td>${fmtDateTime(b.startDate, b.startTime)}</td>
            <td>${returnDisplay}</td>
            <td>${days}</td>
            <td class="td-mono">${amd(b.totalAmount)}</td>
            <td class="td-mono" style="color:var(--success)">${amd(paid)}</td>
            <td class="td-mono" style="${bal>0?'color:var(--danger);font-weight:700':''}">${amd(bal)}</td>
            <td>${statusBadge(b._st)}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="openBookingModal('${b.id}')">Edit</button>
              ${b._st==='Active'||b._st==='Overdue'?`<button class="btn btn-ghost btn-sm" onclick="openReturnModal('${b.id}')">Return</button>`:''}
              ${b._st!=='Completed'&&b._st!=='Cancelled'?`<button class="btn btn-ghost btn-sm" onclick="openPaymentModal('${b.id}')">Pay</button>`:''}
            </td>
          </tr>`;
        }).join('')}
        </tbody></table>`:`<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;opacity:.25"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg><div class="empty-state-title">No bookings found</div></div>`}
      </div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// FLEET
// ──────────────────────────────────────────────────────────────────────────
function renderFleet(body, actions) {
  actions.innerHTML=`<button class="btn btn-primary btn-sm" onclick="openVehicleModal()">+ Add Vehicle</button>`;
  const counts={};
  ['all','available','rented','maintenance','inactive'].forEach(f=>{
    counts[f]=f==='all'?state.vehicles.length:state.vehicles.filter(v=>vehicleDisplayStatus(v).toLowerCase()===f).length;
  });
  const filtered=state.vehicles.filter(v=>state.vehicleFilter==='all'||vehicleDisplayStatus(v).toLowerCase()===state.vehicleFilter);

  body.innerHTML=`
    <div class="list-controls">
      <div class="filter-tabs">
        ${['all','available','rented','maintenance','inactive'].map(f=>`<div class="filter-tab${state.vehicleFilter===f?' active':''}" onclick="state.vehicleFilter='${f}';renderPage()">${f[0].toUpperCase()+f.slice(1)} (${counts[f]})</div>`).join('')}
      </div>
    </div>
    <div class="fleet-grid">
      ${filtered.length?filtered.map(v=>{
        const st=vehicleDisplayStatus(v);
        const ab=state.bookings.find(b=>b.vehicleId===v.id&&bookingStatus(b)==='Active');
        const expiring=[];
        const today=todayStr();
        if(v.insuranceExpiry&&v.insuranceExpiry<new Date(Date.now()+30*86400000).toISOString().slice(0,10)) expiring.push('Insurance exp. '+fmtDate(v.insuranceExpiry));
        if(v.regExpiry&&v.regExpiry<new Date(Date.now()+30*86400000).toISOString().slice(0,10)) expiring.push('Reg exp. '+fmtDate(v.regExpiry));
        return `<div class="vehicle-card" onclick="openVehicleModal('${v.id}')">
          <div class="vehicle-card-header"><div><div class="vehicle-make">${v.make} ${v.model}</div><div class="vehicle-plate">${v.plate}${v.year?' · '+v.year:''}${v.color?' · '+v.color:''}</div></div>${vehicleBadge(st)}</div>
          <div class="vehicle-body">
            ${ab?`<div class="vehicle-meta"><span class="vehicle-meta-key">Rented to</span><strong>${customerName(ab.customerId)}</strong></div><div class="vehicle-meta"><span class="vehicle-meta-key">Until</span>${fmtDate(ab.endDate)}</div>`:''}
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
        ${filtered.length?`<table><thead><tr><th>Name</th><th>Phone</th><th>ID / Passport</th><th>License</th><th>Rentals</th><th>Total Spent</th><th>Last Rental</th><th></th></tr></thead><tbody>
        ${filtered.map(c=>{
          const cbooks=state.bookings.filter(b=>b.customerId===c.id&&bookingStatus(b)!=='Cancelled');
          const spent=state.payments.filter(p=>cbooks.some(b=>b.id===p.bookingId)).reduce((s,p)=>s+(Number(p.amount)||0),0);
          const last=cbooks.sort((a,b)=>b.createdAt>a.createdAt?1:-1)[0];
          return `<tr>
            <td class="td-bold">${c.name}</td>
            <td>${c.phone||'—'}</td>
            <td>${c.idNumber||'—'}</td>
            <td>${c.licenseNumber||'—'}</td>
            <td>${cbooks.length}</td>
            <td class="td-mono">${amd(spent)}</td>
            <td>${last?fmtDate(last.startDate):'—'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="openCustomerModal('${c.id}')">Edit</button>
              <button class="btn btn-ghost btn-sm" onclick="openBookingModal(null,'${c.id}')">Book</button>
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

  const pays=state.payments.filter(p=>periodFilter(p.date));
  const exps=state.expenses.filter(e=>periodFilter(e.date));
  const income=pays.reduce((s,p)=>s+(Number(p.amount)||0),0);
  const expTotal=exps.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const net=income-expTotal;
  const outstanding=state.bookings.filter(b=>{const st=bookingStatus(b);return st==='Active'||st==='Overdue'||st==='Upcoming';}).reduce((s,b)=>s+Math.max(0,(Number(b.totalAmount)||0)-bookingPaid(b.id)),0);

  const byMethod={},byType={},byVehicle={},byStakeholder={};
  pays.forEach(p=>{const m=p.method||'Other';byMethod[m]=(byMethod[m]||0)+(Number(p.amount)||0);});
  exps.forEach(e=>{
    const t=e.type||e.category||'Other';
    byType[t]=(byType[t]||0)+(Number(e.amount)||0);
    if(e.vehicleId){const k=vehicleLabelShort(e.vehicleId);byVehicle[k]=(byVehicle[k]||0)+(Number(e.amount)||0);}
    if(e.stakeholderId){const k=stakeholderName(e.stakeholderId);byStakeholder[k]=(byStakeholder[k]||0)+(Number(e.amount)||0);}
  });

  function barList(obj,total,color){
    const entries=Object.entries(obj).sort((a,b)=>b[1]-a[1]);
    if(!entries.length) return '<div style="color:var(--muted);font-size:13px;padding:8px 0">No data</div>';
    return `<div class="fin-bar-wrap">${entries.map(([k,v])=>{const pct=total>0?Math.round(v/total*100):0;return `<div class="fin-bar-row"><div class="fin-bar-label">${k}</div><div class="fin-bar-bg"><div class="fin-bar-fill" style="width:${pct}%;background:${color}"></div></div><div class="fin-bar-amt">${amd(v)}</div></div>`;}).join('')}</div>`;
  }

  const recentPay=[...pays].sort((a,b)=>b.date>a.date?1:-1).slice(0,8);
  const recentExp=[...exps].sort((a,b)=>b.date>a.date?1:-1);

  body.innerHTML=`
    <div class="kpi-row">
      <div class="kpi kpi-ok"><div class="kpi-icon">💰</div><div class="kpi-label">Income</div><div class="kpi-value">${amdK(income)}</div><div class="kpi-sub">${pays.length} payments</div></div>
      <div class="kpi kpi-bad"><div class="kpi-icon">💸</div><div class="kpi-label">Expenses</div><div class="kpi-value">${amdK(expTotal)}</div><div class="kpi-sub">${exps.length} items</div></div>
      <div class="kpi ${net>=0?'kpi-ok':'kpi-bad'}"><div class="kpi-icon">${net>=0?'📈':'📉'}</div><div class="kpi-label">Net Profit</div><div class="kpi-value" style="color:${net>=0?'var(--success)':'var(--danger)'}">${amdK(net)}</div><div class="kpi-sub">${net>=0?'profit':'loss'}</div></div>
      <div class="kpi kpi-warn"><div class="kpi-icon">⏳</div><div class="kpi-label">Outstanding</div><div class="kpi-value">${amdK(outstanding)}</div><div class="kpi-sub">uncollected</div></div>
    </div>
    <div class="dash-grid">
      <div class="card"><div class="card-header"><div class="card-title">Income by Method</div></div><div class="card-body">${barList(byMethod,income,'var(--success)')}</div></div>
      <div class="card"><div class="card-header"><div class="card-title">Expenses by Type</div></div><div class="card-body">${barList(byType,expTotal,'var(--danger)')}</div></div>
      ${Object.keys(byStakeholder).length?`<div class="card"><div class="card-header"><div class="card-title">Expenses by Stakeholder</div><button class="btn btn-secondary btn-sm" onclick="openStakeholderModal()">Manage</button></div><div class="card-body">${barList(byStakeholder,expTotal,'var(--primary)')}</div></div>`:''}
      ${Object.keys(byVehicle).length?`<div class="card"><div class="card-header"><div class="card-title">Expenses by Vehicle</div></div><div class="card-body">${barList(byVehicle,expTotal,'var(--warning)')}</div></div>`:''}
      <div class="card">
        <div class="card-header"><div class="card-title">Recent Payments</div></div>
        <div class="table-wrap">${recentPay.length?`<table><thead><tr><th>Date</th><th>Customer</th><th>Vehicle</th><th>Method</th><th>Type</th><th>Amount</th></tr></thead><tbody>${recentPay.map(p=>{const b=state.bookings.find(x=>x.id===p.bookingId);return `<tr><td>${fmtDate(p.date)}</td><td>${b?customerName(b.customerId):'—'}</td><td>${b?vehicleLabelShort(b.vehicleId):'—'}</td><td>${p.method||'—'}</td><td>${p.type||'—'}</td><td class="td-mono" style="color:var(--success);font-weight:600">${amd(p.amount)}</td></tr>`;}).join('')}</tbody></table>`:'<div class="empty-state">No payments in period</div>'}</div>
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
// MODAL: BOOKING
// ──────────────────────────────────────────────────────────────────────────
function openBookingModal(bookingId, prefillCustomerId) {
  const b=bookingId?state.bookings.find(x=>x.id===bookingId):null;
  const custOpts=state.customers.map(c=>`<option value="${c.id}" ${(b?.customerId===c.id||prefillCustomerId===c.id)?'selected':''}>${c.name} — ${c.phone||''}</option>`).join('');
  const vehOpts=state.vehicles.filter(v=>v.status!=='Inactive').map(v=>`<option value="${v.id}" ${b?.vehicleId===v.id?'selected':''} data-rate="${v.dailyRate}">${v.plate} · ${v.make} ${v.model} (${amd(v.dailyRate)}/d)</option>`).join('');

  openModal(`<div class="modal-overlay"><div class="modal modal-wide">
    <div class="modal-header"><div class="modal-title">${b?'Edit Booking':'New Booking'}</div>${CLOSE_BTN}</div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Customer <span class="req">*</span></label>
          <select class="form-control" id="bk-cust"><option value="">— select —</option>${custOpts}</select>
          <div style="margin-top:6px"><button class="btn btn-ghost btn-sm" onclick="openCustomerModal(null,true)">+ New customer</button></div>
        </div>
        <div class="form-group">
          <label class="form-label">Vehicle <span class="req">*</span></label>
          <select class="form-control" id="bk-veh" onchange="calcBookingTotal()"><option value="">— select —</option>${vehOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Pickup Date & Time</label>
          <div style="display:flex;gap:6px">
            <input type="date" class="form-control" id="bk-start" style="flex:1.5" value="${b?.startDate||todayStr()}" onchange="calcBookingTotal()">
            <input type="time" class="form-control" id="bk-start-time" style="flex:1" value="${b?.startTime||''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Return Due Date & Time</label>
          <div style="display:flex;gap:6px">
            <input type="date" class="form-control" id="bk-end" style="flex:1.5" value="${b?.endDate||''}" onchange="calcBookingTotal()">
            <input type="time" class="form-control" id="bk-end-time" style="flex:1" value="${b?.endTime||''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Daily Rate (֏)</label>
          <input type="number" class="form-control" id="bk-rate" value="${b?.dailyRate||''}" placeholder="auto from vehicle" oninput="calcBookingTotal()">
        </div>
        <div class="form-group">
          <label class="form-label">Total Amount (֏)</label>
          <input type="number" class="form-control" id="bk-total" value="${b?.totalAmount||''}" placeholder="auto calculated">
        </div>
        <div class="form-group">
          <label class="form-label">Deposit (֏)</label>
          <input type="number" class="form-control" id="bk-deposit" value="${b?.deposit||''}">
        </div>
        ${b?`<div class="form-group">
          <label class="form-label">Actual Return Date & Time</label>
          <div style="display:flex;gap:6px">
            <input type="date" class="form-control" id="bk-return" style="flex:1.5" value="${b?.returnDate||''}">
            <input type="time" class="form-control" id="bk-return-time" style="flex:1" value="${b?.returnTime||''}">
          </div>
        </div>`:'<div></div>'}
        <div class="form-group form-full">
          <label class="form-label">Notes</label>
          <textarea class="form-control" id="bk-notes">${b?.notes||''}</textarea>
        </div>
        ${b?`<div class="form-group form-full"><label class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="bk-cancel" ${b.cancelled===true||String(b.cancelled).toLowerCase()==='true'?'checked':''}> Mark as Cancelled</label></div>`:''}
      </div>
    </div>
    <div class="modal-footer">
      ${b?`<button class="btn btn-danger" onclick="deleteBooking('${b.id}')">Delete</button>`:''}
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveBooking('${b?.id||''}')">Save</button>
    </div>
  </div></div>`);
}

function calcBookingTotal() {
  const start=document.getElementById('bk-start')?.value, end=document.getElementById('bk-end')?.value;
  const vSel=document.getElementById('bk-veh'), rateEl=document.getElementById('bk-rate'), totEl=document.getElementById('bk-total');
  if(!start||!end||!totEl) return;
  let rate=Number(rateEl?.value);
  if(!rate&&vSel?.value){rate=Number(vSel.options[vSel.selectedIndex]?.dataset?.rate)||0;if(rate&&rateEl)rateEl.value=rate;}
  if(rate&&end>=start) totEl.value=rate*diffDays(start,end);
}

async function saveBooking(id) {
  const customerId=document.getElementById('bk-cust').value, vehicleId=document.getElementById('bk-veh').value;
  const startDate=document.getElementById('bk-start').value, endDate=document.getElementById('bk-end').value;
  if(startDate&&endDate&&endDate<startDate){toast('End date must be after start','error');return;}
  const booking={
    id:id||uid(), customerId, vehicleId, startDate, endDate,
    returnDate:document.getElementById('bk-return')?.value||'',
    startTime:document.getElementById('bk-start-time')?.value||'',
    endTime:document.getElementById('bk-end-time')?.value||'',
    returnTime:document.getElementById('bk-return-time')?.value||'',
    dailyRate:Number(document.getElementById('bk-rate').value)||0,
    totalAmount:Number(document.getElementById('bk-total').value)||0,
    deposit:Number(document.getElementById('bk-deposit').value)||0,
    cancelled:document.getElementById('bk-cancel')?.checked||false,
    notes:document.getElementById('bk-notes').value.trim(),
    createdAt:id?(state.bookings.find(b=>b.id===id)?.createdAt||todayStr()):todayStr(),
  };
  closeModal();
  try {
    if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID')){const r=await callApi({action:'saveBooking',data:JSON.stringify(booking)});if(r.error)throw new Error(r.error);booking.id=r.id||booking.id;}
    const idx=state.bookings.findIndex(b=>b.id===id);
    if(idx>=0)state.bookings[idx]=booking;else state.bookings.push(booking);
    toast(id?'Booking updated':'Booking created','success');
  }catch(e){toast('Save failed: '+e.message,'error');}
  renderPage();
}

async function deleteBooking(id) {
  if(!confirm('Delete this booking?'))return;
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID'))await callApi({action:'deleteBooking',id});state.bookings=state.bookings.filter(b=>b.id!==id);state.payments=state.payments.filter(p=>p.bookingId!==id);toast('Deleted','success');}catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL: RETURN
// ──────────────────────────────────────────────────────────────────────────
function openReturnModal(bookingId) {
  const b=state.bookings.find(x=>x.id===bookingId); if(!b)return;
  const paid=bookingPaid(bookingId), bal=(Number(b.totalAmount)||0)-paid;
  openModal(`<div class="modal-overlay"><div class="modal">
    <div class="modal-header"><div class="modal-title">Return Vehicle</div>${CLOSE_BTN}</div>
    <div class="modal-body">
      <div class="info-list" style="margin-bottom:16px">
        <div class="info-row"><span class="info-key">Customer</span><span class="info-val">${customerName(b.customerId)}</span></div>
        <div class="info-row"><span class="info-key">Vehicle</span><span class="info-val">${vehicleLabel(b.vehicleId)}</span></div>
        <div class="info-row"><span class="info-key">Planned return</span><span class="info-val">${fmtDateTime(b.endDate, b.endTime)}</span></div>
        <div class="info-row"><span class="info-key">Total</span><span class="info-val">${amd(b.totalAmount)}</span></div>
        <div class="info-row"><span class="info-key">Paid</span><span class="info-val" style="color:var(--success)">${amd(paid)}</span></div>
        <div class="info-row"><span class="info-key">Balance</span><span class="info-val" style="color:${bal>0?'var(--danger)':'var(--success)'}">${amd(bal)}</span></div>
      </div>
      <div class="form-group">
        <label class="form-label">Actual Return Date & Time</label>
        <div style="display:flex;gap:6px">
          <input type="date" class="form-control" id="ret-date" style="flex:1.5" value="${todayStr()}">
          <input type="time" class="form-control" id="ret-time" style="flex:1" value="${currentTimeStr()}">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmReturn('${b.id}')">Confirm Return</button>
    </div>
  </div></div>`);
}

async function confirmReturn(bookingId) {
  const returnDate=document.getElementById('ret-date').value;
  const returnTime=document.getElementById('ret-time').value;
  const b=state.bookings.find(x=>x.id===bookingId); if(!b)return;
  const updated={...b,returnDate,returnTime};
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID')){const r=await callApi({action:'saveBooking',data:JSON.stringify(updated)});if(r.error)throw new Error(r.error);}const idx=state.bookings.findIndex(x=>x.id===bookingId);if(idx>=0)state.bookings[idx]=updated;toast('Vehicle returned','success');}catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL: PAYMENT
// ──────────────────────────────────────────────────────────────────────────
function openPaymentModal(bookingId) {
  const b=state.bookings.find(x=>x.id===bookingId); if(!b)return;
  const bal=Math.max(0,(Number(b.totalAmount)||0)-bookingPaid(bookingId));
  openModal(`<div class="modal-overlay"><div class="modal">
    <div class="modal-header"><div class="modal-title">Record Payment · ${vehicleLabelShort(b.vehicleId)}</div>${CLOSE_BTN}</div>
    <div class="modal-body">
      <div class="info-list" style="margin-bottom:16px">
        <div class="info-row"><span class="info-key">Customer</span><span class="info-val">${customerName(b.customerId)}</span></div>
        <div class="info-row"><span class="info-key">Vehicle</span><span class="info-val">${vehicleLabelShort(b.vehicleId)}</span></div>
        <div class="info-row"><span class="info-key">Balance due</span><span class="info-val" style="color:var(--danger)">${amd(bal)}</span></div>
      </div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Amount (֏) <span class="req">*</span></label><input type="number" class="form-control" id="pay-amt" value="${bal||''}"></div>
        <div class="form-group"><label class="form-label">Date <span class="req">*</span></label><input type="date" class="form-control" id="pay-date" value="${todayStr()}"></div>
        <div class="form-group"><label class="form-label">Method</label><select class="form-control" id="pay-meth"><option>Cash</option><option>Card</option><option>Transfer</option></select></div>
        <div class="form-group"><label class="form-label">Type</label><select class="form-control" id="pay-type"><option>Rental</option><option>Deposit</option><option>Extra</option></select></div>
        <div class="form-group form-full"><label class="form-label">Notes</label><input type="text" class="form-control" id="pay-notes" placeholder="Optional"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePayment('${bookingId}')">Save Payment</button>
    </div>
  </div></div>`);
}

async function savePayment(bookingId) {
  const amount=Number(document.getElementById('pay-amt').value)||0, date=document.getElementById('pay-date').value;
  const payment={id:uid(),bookingId,amount,date,method:document.getElementById('pay-meth').value,type:document.getElementById('pay-type').value,notes:document.getElementById('pay-notes').value.trim()};
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID')){const r=await callApi({action:'savePayment',data:JSON.stringify(payment)});if(r.error)throw new Error(r.error);payment.id=r.id||payment.id;}state.payments.push(payment);toast('Payment recorded','success');}catch(e){toast('Error: '+e.message,'error');}
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
// linked bookings/expenses are never orphaned — even if the plate is changed.
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
  if(state.bookings.some(b=>b.vehicleId===id&&(bookingStatus(b)==='Active'||bookingStatus(b)==='Upcoming'))){toast('Cannot delete: vehicle has active bookings','error');return;}
  if(!confirm('Delete this vehicle?'))return;
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID'))await callApi({action:'deleteVehicle',id});state.vehicles=state.vehicles.filter(v=>v.id!==id);toast('Vehicle deleted','success');}catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL: CUSTOMER
// ──────────────────────────────────────────────────────────────────────────
function openCustomerModal(customerId, fromBooking) {
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
      <button class="btn btn-primary" onclick="saveCustomer('${c?.id||''}',${!!fromBooking})">Save</button>
    </div>
  </div></div>`);
}

async function saveCustomer(id, fromBooking) {
  const name=document.getElementById('cu-name').value.trim(),phone=document.getElementById('cu-phone').value.trim();
  const customer={id:id||uid(),name,phone,email:document.getElementById('cu-email').value.trim(),idNumber:document.getElementById('cu-id').value.trim(),licenseNumber:document.getElementById('cu-lic').value.trim(),address:document.getElementById('cu-addr').value.trim(),notes:document.getElementById('cu-notes').value.trim(),createdAt:id?(state.customers.find(c=>c.id===id)?.createdAt||todayStr()):todayStr()};
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID')){const r=await callApi({action:'saveCustomer',data:JSON.stringify(customer)});if(r.error)throw new Error(r.error);customer.id=r.id||customer.id;}const idx=state.customers.findIndex(c=>c.id===id);if(idx>=0)state.customers[idx]=customer;else state.customers.push(customer);toast(id?'Customer updated':'Customer added','success');}catch(e){toast('Save failed: '+e.message,'error');}
  if(fromBooking)openBookingModal(null,customer.id);else renderPage();
}

async function deleteCustomer(id) {
  if(state.bookings.some(b=>b.customerId===id&&(bookingStatus(b)==='Active'||bookingStatus(b)==='Upcoming'))){toast('Cannot delete: customer has active bookings','error');return;}
  if(!confirm('Delete this customer?'))return;
  closeModal();
  try{if(!GAS_URL.includes('YOUR_DEPLOYMENT_ID'))await callApi({action:'deleteCustomer',id});state.customers=state.customers.filter(c=>c.id!==id);toast('Customer deleted','success');}catch(e){toast('Error: '+e.message,'error');}
  renderPage();
}

// ──────────────────────────────────────────────────────────────────────────
// MODAL: EXPENSE
// ──────────────────────────────────────────────────────────────────────────
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
