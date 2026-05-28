// Vision Jeans — Dashboard

import { auth, db }                        from './firebase-config.js';
import { onAuthStateChanged, signOut }     from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import {
  collection, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, query, orderBy
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

// ─── CLOUDINARY ───────────────────────────────────────────────
const CLOUDINARY_CLOUD  = 'dbbjqvstb';
const CLOUDINARY_PRESET = 'vision-jeans';

async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_PRESET);
  form.append('folder', 'vision-jeans');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method:'POST', body:form });
  if (!res.ok) throw new Error(`Cloudinary: ${res.status}`);
  return (await res.json()).secure_url;
}

// ─── CONSTANTS ───────────────────────────────────────────────
const VENDEDORAS = ['Beatriz', 'Julia', 'Yasmim'];
const VEND_COLORS = {
  'Yasmim':  '#1D3C8A',
  'Beatriz': '#1A7A4A',
  'Julia':   '#B87000',
};
const STATUS_COLORS = {
  novo:'#1D3C8A', processando:'#B87000', enviado:'#2D52A8', entregue:'#1A7A4A', cancelado:'#C43A3A'
};

// ─── STATE ───────────────────────────────────────────────────
let allOrders       = [];
let allProducts     = [];
let ordersFilter    = 'all';
let editingProduct  = null;
let deletingProduct = null;
let uploadedFile    = null;
let currentOrderId  = null;
let chartInstances  = {};

// ─── AUTH GUARD ───────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = 'login.html'; return; }
  initDashboard(user);
});

function initDashboard(user) {
  document.getElementById('userAvatar').textContent =
    (user.displayName || user.email || 'V')[0].toUpperCase();
  document.getElementById('userEmail').textContent  = user.email || '—';
  document.getElementById('userName').textContent   =
    user.displayName || user.email?.split('@')[0] || 'Vendedora';
  const dateEl = document.getElementById('overviewDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('pt-BR', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
  initNavigation();
  initModals();
  subscribeOrders();
  subscribeProducts();
}

// ─── NAVIGATION ───────────────────────────────────────────────
function initNavigation() {
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('topbarHamburger');
  const closeBtn  = document.getElementById('sidebarClose');

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(item.dataset.page);
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  });
  // also bind "Ver todos" button
  document.querySelector('[data-page="pedidos"]:not(.nav-item)')?.addEventListener('click', () => navigateTo('pedidos'));

  hamburger?.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('show'); });
  closeBtn?.addEventListener('click',  () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
  overlay?.addEventListener('click',   () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut(auth); window.location.href = 'login.html';
  });
  document.querySelectorAll('#ordersFilters .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#ordersFilters .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ordersFilter = chip.dataset.status;
      renderOrdersTable();
    });
  });
  navigateTo('overview');
}

function navigateTo(page) {
  document.querySelectorAll('.dash-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-page]').forEach(i => i.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  const titles = { overview:'Visão Geral', pedidos:'Pedidos', relatorio:'Relatório', vendedoras:'Vendedoras', produtos:'Produtos' };
  setText('topbarPageName', titles[page] || '');
  if (page === 'relatorio')  renderRelatorio();
  if (page === 'vendedoras') renderVendedorasReport();
}

// ─── ORDERS ───────────────────────────────────────────────────
function subscribeOrders() {
  const q = query(collection(db, 'pedidos'), orderBy('criadoEm', 'desc'));
  onSnapshot(q, snap => {
    allOrders = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderOrdersTable();
    renderRecentOrders();
    updateStats();
  }, err => { console.error(err); showToast('Erro ao carregar pedidos.', 'error'); });
}

function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  const list = ordersFilter === 'all' ? allOrders : allOrders.filter(o => o.status === ordersFilter);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
      <p>Nenhum pedido encontrado.</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(o => `
    <tr style="cursor:pointer;" data-order-id="${o.id}" title="Clique para ver detalhes">
      <td data-label="Cliente" class="td-primary">${esc(o.clienteNome||'—')}</td>
      <td data-label="Telefone"><a href="tel:${o.clienteTelefone}" style="color:var(--navy);" onclick="event.stopPropagation()">${esc(o.clienteTelefone||'—')}</a></td>
      <td data-label="Produto">${esc(o.produto?.nome||'—')}</td>
      <td data-label="Tamanho" class="td-hide-mobile">${o.tamanho&&o.tamanho!=='—'?`<strong style="color:var(--navy);">${esc(o.tamanho)}</strong>`:'—'}</td>
      <td data-label="Qtd"     class="td-hide-mobile">${o.quantidade||1}</td>
      <td data-label="Vendedora">
        ${o.vendedora
          ? `<span style="font-weight:600;color:${VEND_COLORS[o.vendedora]||'var(--navy)'};">${esc(o.vendedora)}</span>`
          : `<span style="color:var(--text-muted);font-size:11px;">Não atribuída</span>`}
      </td>
      <td data-label="Status"><span class="badge badge-${o.status||'novo'}">${statusLabel(o.status)}</span></td>
      <td data-label="Data" class="td-hide-mobile">${o.criadoEm?.toDate?fmtDate(o.criadoEm.toDate()):'—'}</td>
      <td class="td-actions" onclick="event.stopPropagation()">
        <button class="action-btn danger" data-del-order="${o.id}" title="Excluir pedido">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </td>
    </tr>`).join('');

  // Row click → detail modal
  tbody.querySelectorAll('tr[data-order-id]').forEach(row => {
    row.addEventListener('click', () => {
      const order = allOrders.find(o => o.id === row.dataset.orderId);
      if (order) openOrderDetail(order);
    });
  });

  // Delete buttons
  tbody.querySelectorAll('[data-del-order]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este pedido?')) return;
      try {
        await deleteDoc(doc(db, 'pedidos', btn.dataset.delOrder));
        showToast('Pedido excluído.', 'info');
      } catch(e) { console.error(e); showToast('Erro ao excluir.', 'error'); }
    });
  });
}

function renderRecentOrders() {
  const tbody = document.getElementById('recentOrdersBody');
  if (!tbody) return;
  const list = allOrders.slice(0, 6);
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Nenhum pedido ainda.</p></div></td></tr>`; return; }
  tbody.innerHTML = list.map(o => `
    <tr>
      <td class="td-primary">${esc(o.clienteNome||'—')}</td>
      <td>${esc(o.produto?.nome||'—')}</td>
      <td>${o.vendedora?`<span style="font-weight:600;color:${VEND_COLORS[o.vendedora]||'var(--navy)'};">${esc(o.vendedora)}</span>`:'—'}</td>
      <td><span class="badge badge-${o.status||'novo'}">${statusLabel(o.status)}</span></td>
      <td>${o.criadoEm?.toDate?fmtDate(o.criadoEm.toDate()):'—'}</td>
    </tr>`).join('');
}

// ─── ORDER DETAIL MODAL ───────────────────────────────────────
function openOrderDetail(order) {
  currentOrderId = order.id;
  setText('odNome',    order.clienteNome    || '—');
  setText('odProduto', order.produto?.nome  || '—');
  setText('odPreco',   `R$ ${fmtPrice(order.produto?.preco)}`);
  setText('odTamanho', order.tamanho && order.tamanho !== '—' ? order.tamanho : '—');
  setText('odQtd',     order.quantidade || 1);
  setText('odObs',     order.observacoes || 'Sem observações');
  setText('odData',    order.criadoEm?.toDate ? fmtDate(order.criadoEm.toDate()) : '—');

  const telLink = document.getElementById('odTelLink');
  if (telLink) {
    telLink.textContent = order.clienteTelefone || '—';
    telLink.href = `tel:${order.clienteTelefone}`;
  }
  document.getElementById('odVendedora').value = order.vendedora || '';
  document.getElementById('odStatus').value    = order.status    || 'novo';
  openModal('orderDetailModal');
}

// ─── VENDEDORAS REPORT ────────────────────────────────────────
function renderVendedorasReport() {
  const grid = document.getElementById('vendedorasGrid');
  if (!grid) return;

  grid.innerHTML = VENDEDORAS.map(nome => {
    const pedidos    = allOrders.filter(o => o.vendedora === nome);
    const entregues  = pedidos.filter(o => o.status === 'entregue').length;
    const total      = pedidos.reduce((s, o) => s + (Number(o.produto?.preco)||0), 0);
    const cv         = VEND_COLORS[nome] || '#1D3C8A';
    return `
      <div class="dash-card" style="cursor:pointer;display:flex;flex-direction:column;" data-vend="${nome}"
           onmouseenter="this.style.boxShadow='var(--shadow-md)'" onmouseleave="this.style.boxShadow=''">
        <div style="background:${cv}10;border-bottom:1px solid ${cv}22;padding:20px 22px;display:flex;align-items:center;gap:14px;flex-shrink:0;">
          <div style="width:44px;height:44px;border-radius:50%;background:${cv};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0;">${nome[0]}</div>
          <div>
            <div style="font-size:16px;font-weight:600;color:var(--text-primary);">${nome}</div>
            <div style="font-size:12px;color:${cv};font-weight:500;">${pedidos.length} pedido${pedidos.length!==1?'s':''} atribuído${pedidos.length!==1?'s':''}</div>
          </div>
          <div style="margin-left:auto;">
            <svg viewBox="0 0 24 24" fill="none" stroke="${cv}" stroke-width="2" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </div>
        <div style="padding:18px 22px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;flex:1;align-content:start;">
          <div><div style="font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Total</div><div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:${cv};">R$ ${fmtPrice(total)}</div></div>
          <div><div style="font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Entregues</div><div style="font-family:var(--font-display);font-size:20px;font-weight:700;">${entregues}</div></div>
          <div><div style="font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Pendentes</div><div style="font-family:var(--font-display);font-size:20px;font-weight:700;">${pedidos.length-entregues}</div></div>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-vend]').forEach(card => {
    card.addEventListener('click', () => openVendedoraDetail(card.dataset.vend));
  });

  // Equalizar alturas após o browser renderizar
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const cards = grid.querySelectorAll(':scope > .dash-card');
      let maxH = 0;
      cards.forEach(c => { c.style.minHeight = ''; if (c.offsetHeight > maxH) maxH = c.offsetHeight; });
      cards.forEach(c => { c.style.minHeight = maxH + 'px'; });
    });
  });

  // Table
  const tbody = document.getElementById('vendedorasTableBody');
  if (!tbody) return;
  const com = allOrders.filter(o => o.vendedora);
  if (!com.length) { tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Nenhum pedido atribuído ainda.</p></div></td></tr>`; return; }
  tbody.innerHTML = com.map(o => `
    <tr>
      <td style="font-weight:700;color:${VEND_COLORS[o.vendedora]||'var(--navy)'};">${esc(o.vendedora)}</td>
      <td class="td-primary">${esc(o.clienteNome||'—')}</td>
      <td>${esc(o.produto?.nome||'—')}</td>
      <td style="font-weight:600;color:var(--navy);">R$ ${fmtPrice(o.produto?.preco)}</td>
      <td><span class="badge badge-${o.status||'novo'}">${statusLabel(o.status)}</span></td>
    </tr>`).join('');
}

function openVendedoraDetail(nome) {
  const pedidos    = allOrders.filter(o => o.vendedora === nome);
  const total      = pedidos.reduce((s, o) => s + (Number(o.produto?.preco)||0), 0);
  const entregues  = pedidos.filter(o => o.status === 'entregue').length;
  const andamento  = pedidos.filter(o => !['entregue','cancelado'].includes(o.status)).length;
  const c          = VEND_COLORS[nome] || '#1D3C8A';

  // Header
  const avatarEl = document.getElementById('vdAvatar');
  avatarEl.textContent         = nome[0];
  avatarEl.style.background    = c;
  setText('vdModalTitle', `Relatório — ${nome}`);
  setText('vdNome',    nome);
  setText('vdSub',     `${pedidos.length} pedido${pedidos.length!==1?'s':''} · R$ ${fmtPrice(total)} em vendas`);
  setText('vdTotal',   `R$ ${fmtPrice(total)}`);
  setText('vdCount',   pedidos.length);
  setText('vdEntregues', entregues);
  setText('vdAndamento', andamento);

  // Destroy old charts
  ['vdStatus','vdMonthly'].forEach(k => { chartInstances[k]?.destroy(); delete chartInstances[k]; });

  // Status doughnut
  const statusCounts = {};
  pedidos.forEach(o => {
    const s = statusLabel(o.status);
    statusCounts[s] = (statusCounts[s]||0) + 1;
  });
  if (Object.keys(statusCounts).length > 0) {
    chartInstances.vdStatus = makeDoughnut('chartVdStatus',
      Object.keys(statusCounts), Object.values(statusCounts));
  } else {
    const ctx = document.getElementById('chartVdStatus');
    if (ctx) { const p = ctx.parentElement; p.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:160px;font-size:13px;color:var(--text-muted);">Sem dados</div>`; }
  }

  // Monthly bar (last 6 months)
  const mData = getMonthlyData(pedidos);
  chartInstances.vdMonthly = makeBar('chartVdMonthly',
    Object.keys(mData), Object.values(mData).map(d => d.valor), c);

  // Orders list
  const list = document.getElementById('vdOrdersList');
  if (!pedidos.length) {
    list.innerHTML = `<div class="empty-state" style="padding:32px;"><p>Nenhum pedido atribuído ainda.</p></div>`;
  } else {
    list.innerHTML = pedidos.map(o => `
      <div class="vd-order-row">
        <div>
          <div class="vd-order-nome">${esc(o.clienteNome||'—')}</div>
          <div class="vd-order-prod">${esc(o.produto?.nome||'—')}${o.tamanho&&o.tamanho!=='—'?` · ${o.tamanho}`:''} · Qtd ${o.quantidade||1}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div class="vd-order-price">R$ ${fmtPrice(o.produto?.preco)}</div>
          <span class="badge badge-${o.status||'novo'}" style="margin-top:4px;">${statusLabel(o.status)}</span>
        </div>
      </div>`).join('');
  }

  openModal('vendedoraDetailModal');
}

// ─── REPORT ───────────────────────────────────────────────────
function renderRelatorio() {
  // Summary
  const total      = allOrders.reduce((s, o) => s + (Number(o.produto?.preco)||0), 0);
  const weekOrders = getOrdersInPeriod(7);
  const monthOrders= getOrdersInPeriod(30);
  const thisWeek   = weekOrders.reduce((s, o) => s + (Number(o.produto?.preco)||0), 0);
  const thisMonth  = monthOrders.reduce((s, o) => s + (Number(o.produto?.preco)||0), 0);
  const avg        = allOrders.length > 0 ? total / allOrders.length : 0;

  setText('reportTotal',    `R$ ${fmtPrice(total)}`);
  setText('reportTotalSub', `${allOrders.length} pedido${allOrders.length!==1?'s':''}`);
  setText('reportWeek',     `R$ ${fmtPrice(thisWeek)}`);
  setText('reportWeekSub',  `${weekOrders.length} pedido${weekOrders.length!==1?'s':''}`);
  setText('reportMonth',    `R$ ${fmtPrice(thisMonth)}`);
  setText('reportMonthSub', `${monthOrders.length} pedido${monthOrders.length!==1?'s':''}`);
  setText('reportAvg',      `R$ ${fmtPrice(avg)}`);

  // Destroy old charts
  ['monthly','statusChart','vendors','weekly'].forEach(k => { chartInstances[k]?.destroy(); delete chartInstances[k]; });

  // Monthly bar
  const mData = getMonthlyData(allOrders);
  chartInstances.monthly = makeBar('chartMonthly',
    Object.keys(mData), Object.values(mData).map(d => d.valor));

  // Status doughnut
  const sCounts = {};
  allOrders.forEach(o => { const s=statusLabel(o.status); sCounts[s]=(sCounts[s]||0)+1; });
  chartInstances.statusChart = makeDoughnut('chartStatus', Object.keys(sCounts), Object.values(sCounts));

  // Vendors bar
  const vData = {};
  VENDEDORAS.forEach(v => vData[v] = 0);
  allOrders.filter(o=>o.vendedora).forEach(o => { if(vData[o.vendedora]!==undefined) vData[o.vendedora]+=(Number(o.produto?.preco)||0); });
  chartInstances.vendors = makeBarMultiColor('chartVendedoras',
    Object.keys(vData), Object.values(vData), Object.keys(vData).map(v=>VEND_COLORS[v]||'#1D3C8A'));

  // Weekly line
  const wData = getWeeklyData();
  chartInstances.weekly = makeLine('chartWeekly', Object.keys(wData), Object.values(wData).map(d=>d.count));
}

// ─── DATA HELPERS ─────────────────────────────────────────────
function getOrdersInPeriod(days) {
  const now = Date.now();
  return allOrders.filter(o => {
    const d = o.criadoEm?.toDate?.();
    return d && (now - d.getTime()) < days*24*60*60*1000;
  });
}

function getMonthlyData(orders = allOrders) {
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const data  = {};
  const now   = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    data[`${names[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`] = { valor:0, count:0 };
  }
  orders.forEach(o => {
    const d = o.criadoEm?.toDate?.();
    if (!d) return;
    const mAgo = (now.getFullYear()-d.getFullYear())*12 + now.getMonth()-d.getMonth();
    if (mAgo < 6) {
      const key = `${names[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      if (data[key]) { data[key].valor += Number(o.produto?.preco)||0; data[key].count++; }
    }
  });
  return data;
}

function getWeeklyData() {
  const data = {};
  const now  = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i*7);
    const label = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    data[label] = { valor:0, count:0 };
  }
  const keys = Object.keys(data);
  allOrders.forEach(o => {
    const d = o.criadoEm?.toDate?.();
    if (!d) return;
    const daysAgo = Math.floor((now-d)/(1000*60*60*24));
    if (daysAgo > 56) return;
    const weekIdx = 7 - Math.floor(daysAgo/7);
    if (keys[weekIdx]) { data[keys[weekIdx]].valor += Number(o.produto?.preco)||0; data[keys[weekIdx]].count++; }
  });
  return data;
}

// ─── CHART FACTORIES ──────────────────────────────────────────
const CHART_DEFAULTS = {
  responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{ display:false } },
  scales:{
    y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,0.04)' }, ticks:{ font:{size:10}, color:'#8A9BB8' }},
    x:{ grid:{ display:false }, ticks:{ font:{size:10}, color:'#8A9BB8' }}
  }
};

function makeBar(id, labels, data, color='#1D3C8A') {
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ data, backgroundColor:`${color}20`, borderColor:color, borderWidth:1.5, borderRadius:6, borderSkipped:false }] },
    options:{ ...CHART_DEFAULTS }
  });
}

function makeBarMultiColor(id, labels, data, colors) {
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ data, backgroundColor:colors.map(c=>`${c}25`), borderColor:colors, borderWidth:1.5, borderRadius:6, borderSkipped:false }] },
    options:{ ...CHART_DEFAULTS }
  });
}

function makeDoughnut(id, labels, data) {
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return null;
  const bgColors = labels.map(l => {
    const map = { 'Novo':'#1D3C8A','Processando':'#B87000','Enviado':'#2D52A8','Entregue':'#1A7A4A','Cancelado':'#C43A3A' };
    return map[l] || '#8A9BB8';
  });
  return new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:bgColors, borderWidth:0, hoverOffset:4 }] },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{ legend:{ position:'right', labels:{ font:{size:11}, color:'#4A5F85', boxWidth:10, padding:10 } } }
    }
  });
}

function makeLine(id, labels, data) {
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ data, borderColor:'#1D3C8A', backgroundColor:'rgba(29,60,138,0.08)', borderWidth:2, pointRadius:4, pointBackgroundColor:'#1D3C8A', fill:true, tension:0.3 }] },
    options:{ ...CHART_DEFAULTS, scales:{ ...CHART_DEFAULTS.scales, y:{ ...CHART_DEFAULTS.scales.y, ticks:{ ...CHART_DEFAULTS.scales.y.ticks, stepSize:1 } } } }
  });
}

// ─── PRODUCTS ─────────────────────────────────────────────────
function subscribeProducts() {
  const q = query(collection(db, 'produtos'), orderBy('criadoEm', 'desc'));
  onSnapshot(q, snap => {
    allProducts = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderAdminProducts();
    updateStats();
  }, err => console.error(err));
}

function renderAdminProducts() {
  const grid = document.getElementById('adminProductsGrid');
  if (!grid) return;
  if (!allProducts.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg><p>Nenhum produto. Clique em "Novo Produto".</p></div>`;
    return;
  }
  grid.innerHTML = allProducts.map(p => `
    <div class="admin-card">
      <div class="admin-card-img">
        ${p.imagemUrl?`<img src="${p.imagemUrl}" alt="${esc(p.nome)}" loading="lazy">`:
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`}
      </div>
      <div class="admin-card-body">
        ${p.categoria?`<div class="admin-card-cat">${esc(p.categoria)}</div>`:''}
        <div class="admin-card-name">${esc(p.nome)}</div>
        <div class="admin-card-price">R$ ${fmtPrice(p.preco)}</div>
        ${typeof p.estoque==='number'?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${p.estoque} em estoque</div>`:''}
        ${p.tamanhos?.length?`<div class="admin-card-sizes">${p.tamanhos.map(t=>`<span>${t}</span>`).join('')}</div>`:''}
      </div>
      <div class="admin-card-footer">
        <button class="btn btn-ghost btn-sm" data-edit="${p.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </button>
        <button class="btn btn-danger btn-sm" data-delete="${p.id}" data-name="${esc(p.nome)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          Excluir
        </button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => { const p=allProducts.find(x=>x.id===btn.dataset.edit); if(p) openProductModal(p); });
  });
  grid.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      deletingProduct = allProducts.find(x=>x.id===btn.dataset.delete);
      document.getElementById('deleteProductName').textContent = btn.dataset.name;
      openModal('deleteModal');
    });
  });
}

// ─── STATS ────────────────────────────────────────────────────
function updateStats() {
  setText('statTotal',    allOrders.length);
  setText('statNovos',    allOrders.filter(o=>o.status==='novo').length);
  setText('statEntregues',allOrders.filter(o=>o.status==='entregue').length);
  setText('statProdutos', allProducts.filter(p=>p.ativo!==false).length);
  const novos = allOrders.filter(o=>o.status==='novo').length;
  const badge = document.getElementById('newOrdersBadge');
  if (badge) { badge.textContent=novos; badge.style.display=novos>0?'flex':'none'; }
}

// ─── MODALS ───────────────────────────────────────────────────
function initModals() {
  // Product
  document.getElementById('newProductBtn')?.addEventListener('click', () => openProductModal(null));
  document.getElementById('closeProductModal')?.addEventListener('click', closeProductModal);
  document.getElementById('cancelProductBtn')?.addEventListener('click', closeProductModal);
  document.getElementById('saveProductBtn')?.addEventListener('click', saveProduct);
  document.getElementById('productModal')?.addEventListener('click', e => { if(e.target.id==='productModal') closeProductModal(); });

  // Delete
  document.getElementById('closeDeleteModal')?.addEventListener('click', () => closeModal('deleteModal'));
  document.getElementById('cancelDeleteBtn')?.addEventListener('click',  () => closeModal('deleteModal'));
  document.getElementById('confirmDeleteBtn')?.addEventListener('click', confirmDelete);
  document.getElementById('deleteModal')?.addEventListener('click', e => { if(e.target.id==='deleteModal') closeModal('deleteModal'); });

  // Order detail
  document.getElementById('closeOrderDetail')?.addEventListener('click',  () => closeModal('orderDetailModal'));
  document.getElementById('cancelOrderDetail')?.addEventListener('click', () => closeModal('orderDetailModal'));
  document.getElementById('saveOrderDetail')?.addEventListener('click', saveOrderDetail);
  document.getElementById('orderDetailModal')?.addEventListener('click', e => { if(e.target.id==='orderDetailModal') closeModal('orderDetailModal'); });

  // Vendedora detail
  document.getElementById('closeVendedoraDetail')?.addEventListener('click',  () => closeModal('vendedoraDetailModal'));
  document.getElementById('cancelVendedoraDetail')?.addEventListener('click', () => closeModal('vendedoraDetailModal'));
  document.getElementById('vendedoraDetailModal')?.addEventListener('click', e => { if(e.target.id==='vendedoraDetailModal') closeModal('vendedoraDetailModal'); });

  // Upload zone
  const fi = document.getElementById('productImage');
  const uz = document.getElementById('uploadZone');
  fi?.addEventListener('change', e => { const f=e.target.files[0]; if(f) previewFile(f); });
  uz?.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('drag-over'); });
  uz?.addEventListener('dragleave', () => uz.classList.remove('drag-over'));
  uz?.addEventListener('drop', e => {
    e.preventDefault(); uz.classList.remove('drag-over');
    const f=e.dataTransfer.files[0]; if(f?.type.startsWith('image/')) previewFile(f);
  });
}

async function saveOrderDetail() {
  if (!currentOrderId) return;
  const btn = document.getElementById('saveOrderDetail');
  setLoading(btn, true, 'Salvando...');
  try {
    await updateDoc(doc(db, 'pedidos', currentOrderId), {
      vendedora: document.getElementById('odVendedora').value || null,
      status:    document.getElementById('odStatus').value,
    });
    showToast('Pedido atualizado!', 'success');
    closeModal('orderDetailModal');
  } catch(e) { console.error(e); showToast('Erro ao salvar.', 'error'); }
  finally    { setLoading(btn, false); }
}

function openProductModal(p) {
  editingProduct=p; uploadedFile=null;
  document.getElementById('productModalTitle').textContent = p?'Editar Produto':'Novo Produto';
  document.getElementById('productId').value       = p?.id        || '';
  document.getElementById('productName').value     = p?.nome      || '';
  document.getElementById('productPrice').value    = p?.preco     || '';
  document.getElementById('productStock').value    = typeof p?.estoque==='number'?p.estoque:'';
  document.getElementById('productCategory').value = p?.categoria || '';
  document.getElementById('productDesc').value     = p?.descricao || '';
  document.querySelectorAll('.size-cb').forEach(cb => { cb.checked=p?.tamanhos?.includes(cb.value)||false; });
  document.getElementById('uploadPreview').classList.remove('show');
  document.getElementById('previewImg').src='';
  document.getElementById('productImage').value='';
  const cw=document.getElementById('currentImageWrap'), cim=document.getElementById('currentImage');
  if(p?.imagemUrl){cw.style.display='block';cim.src=p.imagemUrl;}
  else{cw.style.display='none';cim.src='';}
  openModal('productModal');
}
function closeProductModal() { closeModal('productModal'); editingProduct=null; uploadedFile=null; }

function previewFile(file) {
  if(file.size>5*1024*1024){showToast('Imagem muito grande. Máx 5MB.','error');return;}
  uploadedFile=file;
  const reader=new FileReader();
  reader.onload=e=>{
    document.getElementById('previewImg').src=e.target.result;
    document.getElementById('uploadPreview').classList.add('show');
    document.getElementById('currentImageWrap').style.display='none';
  };
  reader.readAsDataURL(file);
}

async function saveProduct() {
  const nome=document.getElementById('productName').value.trim();
  const preco=parseFloat(document.getElementById('productPrice').value);
  const categoria=document.getElementById('productCategory').value.trim();
  const descricao=document.getElementById('productDesc').value.trim();
  if(!nome){showToast('Informe o nome do produto.','error');return;}
  if(isNaN(preco)||preco<0){showToast('Informe um preço válido.','error');return;}
  const btn=document.getElementById('saveProductBtn');
  setLoading(btn,true,'Salvando...');
  try {
    let imagemUrl=editingProduct?.imagemUrl||'';
    if(uploadedFile){
      try{ imagemUrl=await uploadImage(uploadedFile); }
      catch(e){ console.warn(e); showToast('Imagem não enviada. Produto salvo sem imagem.','info'); }
    }
    const tamanhos=[...document.querySelectorAll('.size-cb:checked')].map(cb=>cb.value);
    const estoqueRaw=document.getElementById('productStock').value;
    const estoque=estoqueRaw!==''?parseInt(estoqueRaw):null;
    const data={nome,preco,categoria,descricao,imagemUrl,ativo:true,tamanhos,...(estoque!==null&&{estoque})};
    if(editingProduct){
      await updateDoc(doc(db,'produtos',editingProduct.id),data);
      showToast('Produto atualizado!','success');
    } else {
      await addDoc(collection(db,'produtos'),{...data,criadoEm:serverTimestamp()});
      showToast('Produto criado!','success');
    }
    closeProductModal();
  } catch(err){
    console.error(err);
    showToast(err.code==='permission-denied'?'Sem permissão. Verifique se está logado.':`Erro: ${err.message}`,'error');
  } finally { setLoading(btn,false); }
}

async function confirmDelete() {
  if(!deletingProduct) return;
  const btn=document.getElementById('confirmDeleteBtn');
  setLoading(btn,true,'Excluindo...');
  try {
    await deleteDoc(doc(db,'produtos',deletingProduct.id));
    showToast('Produto excluído.','info');
    closeModal('deleteModal');
  } catch(e){ console.error(e); showToast('Erro ao excluir.','error'); }
  finally  { setLoading(btn,false); deletingProduct=null; }
}

function openModal(id)  { document.getElementById(id)?.classList.add('open');    document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); document.body.style.overflow=''; }

// ─── UTILS ────────────────────────────────────────────────────
function statusLabel(s) {
  return {novo:'Novo',processando:'Processando',enviado:'Enviado',entregue:'Entregue',cancelado:'Cancelado'}[s]||'Novo';
}
function fmtPrice(v) { return Number(v||0).toFixed(2).replace('.',','); }
function fmtDate(d)  { return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function esc(s)      { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function setText(id,v){ const el=document.getElementById(id); if(el) el.textContent=v; }
function setLoading(btn,on,label='...') {
  if(!btn) return;
  if(on)  {btn._h=btn.innerHTML;btn.innerHTML=`<div class="spinner"></div> ${label}`;btn.disabled=true;}
  else    {btn.innerHTML=btn._h;btn.disabled=false;}
}
function showToast(msg,type='info') {
  const c=document.getElementById('toast-container'); if(!c) return;
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  t.innerHTML=`<span class="toast-dot"></span>${msg}`;
  c.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300);},4000);
}
