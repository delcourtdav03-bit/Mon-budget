

const KEY='monBudgetV24_1';
const baseCats=['Logement','Courses','Transport','Enfant','Abonnements','Loisirs','Shopping','Travail','Autres'];
function baseDisplayName(c){return state?.categoryRenames?.[c]||c}
function isBaseDisplay(name){return baseCats.some(c=>baseDisplayName(c)===name)}
function allCats(){return [...new Set([...baseCats.map(baseDisplayName),...(state?.customCategories||[])])]} 
let cats=baseCats.slice();

function escHTML(v){
  return String(v??'').replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);
}


function migrateSavingsImpactV1(targetState){
  if(!targetState||typeof targetState!=='object')return targetState;
  if(targetState.savingsImpactMigrationV1)return targetState;
  if(!Array.isArray(targetState.savingsEntries))targetState.savingsEntries=[];
  targetState.savingsEntries.forEach(e=>{
    // Envelope feature existed before "monthly impact" distinction.
    // Treat legacy envelope amounts as pre-existing savings so they don't
    // suddenly destroy the current month's available balance.
    if(e && e.envelopeId && e.budgetImpact===undefined){
      e.budgetImpact=false;
      e.savingsOrigin='existing';
    }
  });
  targetState.savingsImpactMigrationV1=true;
  return targetState;
}


function moneyNumber(v){
  const n=typeof v==='string'?Number(v.replace(',','.')):Number(v);
  return Number.isFinite(n)?n:0;
}
function nonNegativeMoney(v){
  return Math.max(0,moneyNumber(v));
}
function clampNumber(v,min,max){
  return Math.min(max,Math.max(min,moneyNumber(v)));
}
function stabilizeFinancialData(targetState){
  if(!targetState||typeof targetState!=='object')return targetState;

  // Operations: browser forms already create positive amounts, but old/imported
  // versions may contain strings, NaN-like values or negatives.
  if(Array.isArray(targetState.ops)){
    targetState.ops=targetState.ops.map(o=>({
      ...o,
      amount:nonNegativeMoney(o?.amount)
    }));
  }

  // Recurring expenses.
  if(Array.isArray(targetState.recurring)){
    targetState.recurring=targetState.recurring.map(r=>({
      ...r,
      amount:nonNegativeMoney(r?.amount),
      day:Math.round(clampNumber(r?.day||1,1,28))
    }));
  }

  // Savings entries are intentionally signed: a withdrawal can be negative.
  if(Array.isArray(targetState.savingsEntries)){
    targetState.savingsEntries=targetState.savingsEntries.map(e=>({
      ...e,
      amount:moneyNumber(e?.amount)
    }));
  }

  // Goals and plans cannot contain negative targets/budgets.
  if(Array.isArray(targetState.goals)){
    targetState.goals=targetState.goals.map(g=>{
      const target=nonNegativeMoney(g?.target);
      const saved=nonNegativeMoney(g?.saved);
      return {
        ...g,
        target,
        saved:target>0?Math.min(saved,target):saved,
        monthly:nonNegativeMoney(g?.monthly)
      };
    });
  }

  if(targetState.monthlyPlans&&typeof targetState.monthlyPlans==='object'){
    Object.keys(targetState.monthlyPlans).forEach(k=>{
      const p=targetState.monthlyPlans[k]||{};
      targetState.monthlyPlans[k]={
        ...p,
        income:nonNegativeMoney(p.income),
        fixed:nonNegativeMoney(p.fixed),
        savings:nonNegativeMoney(p.savings)
      };
    });
  }

  if(targetState.budgets&&typeof targetState.budgets==='object'){
    Object.keys(targetState.budgets).forEach(accountId=>{
      const b=targetState.budgets[accountId];
      if(!b||typeof b!=='object')return;
      Object.keys(b).forEach(cat=>b[cat]=nonNegativeMoney(b[cat]));
    });
  }

  if(targetState.freeSavingsBalances&&typeof targetState.freeSavingsBalances==='object'){
    Object.keys(targetState.freeSavingsBalances).forEach(accountId=>{
      targetState.freeSavingsBalances[accountId]=nonNegativeMoney(targetState.freeSavingsBalances[accountId]);
    });
  }

  if(targetState.patrimony&&typeof targetState.patrimony==='object'){
    ['assets','debts'].forEach(type=>{
      if(!Array.isArray(targetState.patrimony[type]))targetState.patrimony[type]=[];
      targetState.patrimony[type]=targetState.patrimony[type].map(x=>({
        ...x,
        amount:nonNegativeMoney(x?.amount)
      }));
    });
  }

  targetState.financialStabilityV1=true;
  return targetState;
}

const eur=n=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(+n||0);
function findExistingBudgetData(){
  // 1) Exact key already used by the installed V24.x app.
  const preferred=[
    KEY,
    'monBudgetV24_3_PREMIUM',
    'monBudgetV24_3',
    'monBudgetV24_2_FINAL',
    'monBudgetV24_2',
    'monBudgetV24_1',
    'monBudgetV24',
    'monBudgetV23_1','monBudgetV23','monBudgetV22','monBudgetV21','monBudgetV20',
    'monBudgetV19','monBudgetV18','monBudgetV17','monBudgetV16','monBudgetV15',
    'monBudgetV14','monBudgetV13','monBudgetV12','monBudgetV11','monBudgetV10',
    'monBudgetV9','monBudgetV8','monBudgetV7','monBudgetV6','monBudgetV5','monBudgetV1'
  ];

  for(const k of preferred){
    const v=localStorage.getItem(k);
    if(v){
      try{
        const parsed=JSON.parse(v);
        if(parsed && typeof parsed==='object') return {raw:v,key:k};
      }catch(e){}
    }
  }

  // 2) Safety net: scan any Mon Budget-like localStorage entry and choose
  // the one that appears to contain the most user data.
  let best=null;
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k || !/monbudget/i.test(k)) continue;
    const v=localStorage.getItem(k);
    if(!v) continue;
    try{
      const x=JSON.parse(v);
      if(!x || typeof x!=='object') continue;
      const score=
        (Array.isArray(x.ops)?x.ops.length*5:0)+
        (Array.isArray(x.savingsEntries)?x.savingsEntries.length*4:0)+
        (Array.isArray(x.goals)?x.goals.length*3:0)+
        (Array.isArray(x.recurring)?x.recurring.length*2:0)+
        (x.budgets?Object.keys(x.budgets).length:0);
      if(!best || score>best.score) best={raw:v,key:k,score};
    }catch(e){}
  }
  return best;
}
const existingBudget=findExistingBudgetData();
let raw=existingBudget?.raw||null;
if(existingBudget?.key && existingBudget.key!==KEY){
  try{
    localStorage.setItem(KEY, existingBudget.raw);
    localStorage.setItem('monBudgetLastMigrationSource', existingBudget.key);
  }catch(e){}
}
let state=raw?JSON.parse(raw):{accounts:[{id:'main',name:'Compte principal'}],activeAccount:'main',ops:[],budgets:{main:{}},recurring:[],goals:[]};
if(!state.accounts)state.accounts=[{id:'main',name:'Compte principal'}];if(!state.activeAccount)state.activeAccount='main';if(!state.budgets)state.budgets={};if(!state.recurring)state.recurring=[];if(!state.goals)state.goals=[];if(!state.monthlyPlans)state.monthlyPlans={};if(!state.dashboardPrefs)state.dashboardPrefs={donut:true,insights:true,anomalies:true,upcoming:true,predictions:true};if(!state.templates)state.templates=[];if(!state.rules)state.rules=[];if(!state.savingsEntries)state.savingsEntries=[];if(!state.savingsEnvelopes)state.savingsEnvelopes=[];if(!state.freeSavingsBalances)state.freeSavingsBalances={};if(!state.freeSavingsMovements)state.freeSavingsMovements=[];if(!state.patrimony)state.patrimony={assets:[{name:'Compte courant',amount:0},{name:'Épargne',amount:0}],debts:[]};if(!state.uxPrefs)state.uxPrefs={compact:false};if(!state.customCategories)state.customCategories=[];if(!state.categoryRenames)state.categoryRenames={};
state.ops=(state.ops||[]).map(x=>({...x,id:x.id||'op_'+Date.now()+Math.random(),accountId:x.accountId||'main',scope:x.scope||'personal',tags:Array.isArray(x.tags)?x.tags:[]}));
state=migrateSavingsImpactV1(state);
state=stabilizeFinancialData(state);
try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
let view=new Date();view.setDate(1);
const savedTheme=localStorage.getItem('monBudgetTheme')||'light';
if(savedTheme==='dark')document.body.classList.add('dark');
function toggleTheme(){
  document.body.classList.toggle('dark');
  localStorage.setItem('monBudgetTheme',document.body.classList.contains('dark')?'dark':'light');
}

const cfg=window.MON_BUDGET_CONFIG||{};
const cloudConfigured=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const sb=cloudConfigured?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
let currentUser=null;
let autoSync=localStorage.getItem('monBudgetAutoSync')===null?true:localStorage.getItem('monBudgetAutoSync')==='1';
let syncTimer=null;

function userCacheKey(){return currentUser?`monBudgetV23:user:${currentUser.id}`:KEY}
function save(){
  localStorage.setItem(userCacheKey(),JSON.stringify(state));
  if(autoSync&&cloudConfigured&&currentUser){clearTimeout(syncTimer);syncTimer=setTimeout(()=>pushCloud(true),900)}
}
function budgets(){return state.budgets[state.activeAccount]||(state.budgets[state.activeAccount]={})}
function mk(d=view){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function mo(){return monthActuals(mk(),state.activeAccount).ops}
function monthlySave(){return state.goals.reduce((s,g)=>s+(+g.monthly||0),0)}
function recTotal(){return state.recurring.filter(r=>r.accountId===state.activeAccount).reduce((s,r)=>s+nonNegativeMoney(r.amount),0)}
function fullMonthLabel(){let s=view.toLocaleDateString('fr-BE',{month:'long',year:'numeric'});return s[0].toUpperCase()+s.slice(1)}



function monthActuals(key=mk(),accountId=state.activeAccount){
  const ops=(state.ops||[]).filter(x=>x.accountId===accountId&&String(x.date||'').startsWith(key));
  const income=ops
    .filter(x=>x.type==='income')
    .reduce((s,x)=>s+nonNegativeMoney(x.amount),0);
  const expenses=ops
    .filter(x=>x.type==='expense')
    .reduce((s,x)=>s+nonNegativeMoney(x.amount),0);
  const savings=(state.savingsEntries||[])
    .filter(x=>x.accountId===accountId&&String(x.date||'').startsWith(key)&&x.budgetImpact!==false)
    .reduce((s,x)=>s+moneyNumber(x.amount),0);
  return {
    ops,
    income,
    expenses,
    savings,
    realBalance:income-expenses-savings
  };
}

function previousMonthKey(){
  let d=new Date(view); d.setMonth(d.getMonth()-1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function renderComparison(){
  const cur=mo().filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);
  const prev=state.ops.filter(x=>x.accountId===state.activeAccount&&x.type==='expense'&&x.date.startsWith(previousMonthKey())).reduce((s,x)=>s+x.amount,0);
  const deltaEl=document.getElementById('monthDelta'), textEl=document.getElementById('monthDeltaText'), scoreEl=document.getElementById('budgetScore');
  if(prev>0){
    const pct=(cur-prev)/prev*100;
    deltaEl.textContent=(pct>0?'+':'')+Math.round(pct)+' %';
    deltaEl.style.color=pct<=0?'#87e3a7':'#ffaaa4';
    textEl.textContent=pct<=0?'Tu dépenses moins que le mois précédent':'Tu dépenses plus que le mois précédent';
  }else{
    deltaEl.textContent='—';
    deltaEl.style.color='';
    textEl.textContent='Pas encore assez de données';
  }
  const totalBudget=cats.reduce((s,c)=>s+(+budgets()[c]||0),0);
  let score=100;
  if(totalBudget>0){
    const ratio=cur/totalBudget;
    score=Math.max(0,Math.min(100,Math.round(100-(Math.max(0,ratio-.55)*120))));
  } else if(cur>0) score=70;
  scoreEl.textContent=score+'/100';
}
function renderUpcoming(){
  const el=document.getElementById('upcomingList'); if(!el)return;
  const now=new Date(), same=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const today=same?now.getDate():1;
  const future=state.recurring
    .filter(r=>r.accountId===state.activeAccount && r.day>=today)
    .sort((a,b)=>a.day-b.day)
    .slice(0,5);
  el.innerHTML=future.length?future.map(r=>`<div class="upcoming"><div class="datepill">${r.day}</div><div class="upcoming-main"><strong>${r.name}</strong><div class="muted">${r.cat}</div></div><b>${eur(r.amount)}</b></div>`).join(''):'<div class="muted">Aucune charge récurrente restante pour ce mois.</div>';
}
function setAutoSync(v){
  autoSync=!!v;
  localStorage.setItem('monBudgetAutoSync',autoSync?'1':'0');
  if(autoSync&&cloudConfigured&&currentUser) pushCloud(true);
}


function renderPremium(a,inc,exp){
  const fixed=a.filter(x=>x.type==='expense'&&x.nature==='fixed').reduce((s,x)=>s+x.amount,0);
  const variable=a.filter(x=>x.type==='expense'&&x.nature!=='fixed').reduce((s,x)=>s+x.amount,0);
  const now=new Date(),same=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const days=Math.max(1,same?now.getDate():new Date(view.getFullYear(),view.getMonth()+1,0).getDate());
  const fd=document.getElementById('fixedSpend'),vd=document.getElementById('variableSpend'),ad=document.getElementById('avgDaySpend');
  if(fd)fd.textContent=eur(fixed); if(vd)vd.textContent=eur(variable); if(ad)ad.textContent=eur(exp/days);

  const insight=document.getElementById('smartInsight');
  const prevKey=previousMonthKey();
  const prev=state.ops.filter(x=>x.accountId===state.activeAccount&&x.type==='expense'&&x.date.startsWith(prevKey)).reduce((s,x)=>s+x.amount,0);
  let msg='Ton budget est sous contrôle.';
  if(prev>0){
    const pct=(exp-prev)/prev*100;
    msg=pct<=-10?`Bonne tendance : ${Math.abs(Math.round(pct))} % de dépenses en moins.`:
        pct>=10?`À surveiller : ${Math.round(pct)} % de dépenses en plus.`:
        'Tes dépenses sont proches du mois précédent.';
  }else if(exp===0){msg='Ajoute tes premières dépenses pour obtenir des insights.'}
  if(insight)insight.textContent=msg;

  renderDonut(a);
}
function renderDonut(a){
  const entries={};
  a.filter(x=>x.type==='expense').forEach(x=>entries[x.cat]=(entries[x.cat]||0)+x.amount);
  const rows=Object.entries(entries).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const total=rows.reduce((s,[,v])=>s+v,0);
  const chart=document.getElementById('donutChart'),legend=document.getElementById('donutLegend'),totalEl=document.getElementById('donutTotal');
  if(totalEl)totalEl.textContent=eur(total);
  const cols=['#17181b','#555b66','#888e98','#b1b5bc','#d2d5da'];
  if(!rows.length){
    if(chart)chart.style.background='conic-gradient(#e6e8eb 0 100%)';
    if(legend)legend.innerHTML='<div class="muted">Aucune dépense ce mois-ci.</div>';
    return;
  }
  let angle=0,parts=[];
  rows.forEach(([name,val],i)=>{
    const next=angle+(val/total*100);
    parts.push(`${cols[i]} ${angle}% ${next}%`);
    angle=next;
  });
  if(chart)chart.style.background=`conic-gradient(${parts.join(',')})`;
  if(legend)legend.innerHTML=rows.map(([name,val],i)=>`<div class="legendrow"><span class="legendlabel"><i class="legenddot" style="background:${cols[i]}"></i>${name}</span><b>${Math.round(val/total*100)} %</b></div>`).join('');
}


function openQuickAdd(){document.getElementById('quickSheet')?.classList.remove('hidden')}
function closeQuickAdd(e){
  if(e && e.target && e.target.id!=='quickSheet') return;
  document.getElementById('quickSheet')?.classList.add('hidden')
}
function quickNav(formId){
  const opsBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('ops'"));
  if(opsBtn) nav('ops',opsBtn);
  const tabButtons=[...document.querySelectorAll('.tab')],map={expenseForm:0,incomeForm:1,transferForm:2};
  showForm(formId,tabButtons[map[formId]]||tabButtons[0]);
  document.getElementById('quickSheet')?.classList.add('hidden');
  setTimeout(()=>document.getElementById(formId)?.scrollIntoView({behavior:'smooth',block:'start'}),80);
}


function renderSmartInsights(){
  const el=document.getElementById('smartInsightsList'); if(!el)return;
  const current=mo().filter(x=>x.type==='expense');
  const currentTotal=current.reduce((s,x)=>s+x.amount,0);
  const prevKey=previousMonthKey();
  const prev=state.ops.filter(x=>x.accountId===state.activeAccount&&x.type==='expense'&&x.date.startsWith(prevKey));
  const prevTotal=prev.reduce((s,x)=>s+x.amount,0);
  const insights=[];

  if(prevTotal>0){
    const pct=(currentTotal-prevTotal)/prevTotal*100;
    if(pct<=-10)insights.push(['Bonne tendance',`Tu dépenses ${Math.abs(Math.round(pct))} % de moins que le mois précédent.`]);
    else if(pct>=10)insights.push(['Attention',`Tes dépenses sont ${Math.round(pct)} % plus élevées que le mois précédent.`]);
    else insights.push(['Stable',`Tes dépenses sont proches du mois précédent.`]);
  }

  const byCat={};
  current.forEach(x=>byCat[x.cat]=(byCat[x.cat]||0)+x.amount);
  const top=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  if(top && currentTotal>0){
    insights.push(['Catégorie principale',`${top[0]} représente ${Math.round(top[1]/currentTotal*100)} % de tes dépenses ce mois-ci.`]);
  }

  const weekend=current.filter(x=>{
    const d=new Date(x.date); return d.getDay()===0||d.getDay()===6;
  }).reduce((s,x)=>s+x.amount,0);
  if(currentTotal>0 && weekend/currentTotal>=.35){
    insights.push(['Habitude',`${Math.round(weekend/currentTotal*100)} % de tes dépenses sont faites le week-end.`]);
  }

  const recurring=recTotal();
  if(currentTotal>0 && recurring/currentTotal>=.5){
    insights.push(['Charges fixes',`Tes charges récurrentes représentent une grande partie de ton budget mensuel.`]);
  }

  el.innerHTML=insights.length?insights.map(([t,m])=>`<div class="insight-card"><span class="tag">${t}</span><strong>${m}</strong></div>`).join(''):'<div class="muted">Ajoute davantage d’opérations pour obtenir des analyses utiles.</div>';
}

function renderAnomalies(){
  const el=document.getElementById('anomalyList'); if(!el)return;
  const expenses=state.ops.filter(x=>x.accountId===state.activeAccount&&x.type==='expense');
  const current=mo().filter(x=>x.type==='expense');
  const vals=expenses.map(x=>x.amount).filter(v=>v>0);
  const avg=vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:0;
  const anomalies=[];
  current.forEach(x=>{
    if(avg>0 && x.amount>=avg*2.5 && x.amount>=40) anomalies.push(`${x.name} · ${eur(x.amount)} semble élevée par rapport à tes habitudes.`);
  });
  for(let i=0;i<current.length;i++){
    for(let j=i+1;j<current.length;j++){
      const a=current[i],b=current[j];
      if(a.name.toLowerCase()===b.name.toLowerCase() && Math.abs(a.amount-b.amount)<0.01 && a.date.slice(0,10)===b.date.slice(0,10)){
        anomalies.push(`Possible doublon : ${a.name} · ${eur(a.amount)} le ${a.date.slice(0,10)}.`);
      }
    }
  }
  el.innerHTML=anomalies.length?[...new Set(anomalies)].slice(0,4).map(x=>`<div class="anomaly">${x}</div>`).join(''):'<div class="notice good">Aucune dépense inhabituelle détectée.</div>';
}

function renderCalendar(){
  const el=document.getElementById('calendarList'); if(!el)return;
  const rows=state.recurring.filter(r=>r.accountId===state.activeAccount).sort((a,b)=>a.day-b.day);
  el.innerHTML=rows.length?rows.map(r=>`<div class="calendar-item"><div class="calday">${r.day}</div><div><strong>${r.name}</strong><div class="muted">${r.cat}</div></div><b>${eur(r.amount)}</b></div>`).join(''):'<div class="muted">Aucune charge fixe enregistrée.</div>';
}

function applyRules(name,cat){
  const low=(name||'').toLowerCase();
  const rule=state.rules.find(r=>low.includes(r.keyword.toLowerCase()));
  return rule?rule.cat:cat;
}
function renderTemplates(){
  const el=document.getElementById('templatesList'); if(!el)return;
  el.innerHTML=state.templates.length?state.templates.map(t=>`<div class="template"><div class="meta"><strong>${t.name}</strong><div class="muted">${t.cat} · ${eur(t.amount)}</div></div><button onclick="useTemplate('${t.id}')">Ajouter</button><button onclick="deleteTemplate('${t.id}')">×</button></div>`).join(''):'<div class="muted">Aucun modèle rapide.</div>';
}
function addTemplate(){
  const n=tplName.value.trim(),a=+tplAmount.value||0;
  if(!n||!a)return;
  state.templates.push({id:'tpl_'+Date.now(),name:n,amount:a,cat:tplCat.value});
  tplName.value='';tplAmount.value='';render();save();
}
function useTemplate(id){
  const t=state.templates.find(x=>x.id===id); if(!t)return;
  const d=new Date().toISOString().slice(0,10);
  state.ops.push({id:'op_'+Date.now(),type:'expense',name:t.name,amount:t.amount,cat:applyRules(t.name,t.cat),nature:'variable',scope:'personal',tags:[],date:d+'T12:00:00',accountId:state.activeAccount});
  render();save();
}
function deleteTemplate(id){state.templates=state.templates.filter(x=>x.id!==id);render();save()}

function renderRules(){
  const el=document.getElementById('rulesList'); if(!el)return;
  el.innerHTML=state.rules.length?state.rules.map(r=>`<div class="rule"><span><strong>${r.keyword}</strong><br><span class="muted">→ ${r.cat}</span></span><button onclick="deleteRule('${r.id}')">Suppr.</button></div>`).join(''):'<div class="muted">Aucune règle automatique.</div>';
}
function addRule(){
  const k=ruleKeyword.value.trim();if(!k)return;
  state.rules.push({id:'rule_'+Date.now(),keyword:k,cat:ruleCat.value});
  ruleKeyword.value='';render();save();
}
function deleteRule(id){state.rules=state.rules.filter(x=>x.id!==id);render();save()}


let receiptFile=null;

function openScanner(){
  const opsBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('ops'"));
  if(opsBtn)nav('ops',opsBtn);
  document.getElementById('quickSheet')?.classList.add('hidden');
  setTimeout(()=>document.querySelector('.scan-card')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
}

function handleReceipt(file){
  if(!file)return;
  receiptFile=file;
  const url=URL.createObjectURL(file);
  receiptPreview.src=url;
  scanArea.classList.remove('hidden');
  scanResult.classList.add('hidden');
  scanProgress.className='scan-progress';
  scanProgress.textContent='Photo prête. Appuie sur Analyser.';
}

function resetScanner(){
  receiptFile=null;
  receiptInput.value='';
  receiptPreview.removeAttribute('src');
  scanArea.classList.add('hidden');
  scanResult.classList.add('hidden');
  scanRawText.textContent='';
}

function normalizeReceiptText(text){
  return (text||'')
    .replace(/\r/g,'\n')
    .replace(/[ \t]+/g,' ')
    .replace(/[|]/g,'I')
    .replace(/[“”]/g,'"')
    .trim();
}

function receiptAmountNumbers(line){
  if(!line)return [];
  let s=line
    .replace(/(\d)\s*[,.]\s*(\d{2})\b/g,'$1,$2')
    .replace(/\b(\d{1,5})\s+(\d{2})\s*€?\b/g,'$1,$2');

  const out=[];
  for(const m of s.matchAll(/(?:€\s*)?(\d{1,5})[,.](\d{2})(?:\s*€)?/g)){
    const v=parseFloat(`${m[1]}.${m[2]}`);
    if(Number.isFinite(v) && v>=0 && v<100000)out.push(v);
  }
  return out;
}

function merchantScore(line,index){
  const l=line.trim();
  const low=l.toLowerCase();
  if(!/[A-Za-zÀ-ÿ]{3}/.test(l))return -999;
  if(/\b(ticket|receipt|reçu|facture|duplicata|date|heure|total|tva|vat|merci|caisse|terminal|bancontact|visa|mastercard|adresse|tel|tél|www\.|http|be\d{8,})\b/i.test(l))return -15;
  if(/^\s*\d[\d\s./-]{4,}\s*$/.test(l))return -15;
  let score=18-index*1.3;
  if(/[A-ZÀ-Ý]{3,}/.test(l))score+=3;
  if(l.length>=4 && l.length<=35)score+=3;
  if(/\b(sa|sprl|srl|nv|bv|store|market|shop|restaurant|cafe|café|supermarkt)\b/i.test(l))score+=2;
  if(/[@]|(?:\d{4}\s?[A-Z]{2})/.test(l))score-=5;
  return score;
}

function extractReceiptData(text){
  const raw=normalizeReceiptText(text);
  const lines=raw.split('\n').map(x=>x.trim()).filter(Boolean);

  // MERCHANT: score the first visible lines rather than blindly taking line 1.
  const merchantCandidates=lines.slice(0,12)
    .map((line,i)=>({line,score:merchantScore(line,i)}))
    .sort((a,b)=>b.score-a.score);
  let merchant=(merchantCandidates[0]?.score>0?merchantCandidates[0].line:'')||'';
  merchant=merchant
    .replace(/[^\wÀ-ÿ&' .-]/g,' ')
    .replace(/\s{2,}/g,' ')
    .trim()
    .slice(0,60);

  // DATE
  let date='';
  const datePatterns=[
    /\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](20\d{2}|\d{2})\b/,
    /\b(20\d{2})[\/\-.](0?[1-9]|1[0-2])[\/\-.](0?[1-9]|[12]\d|3[01])\b/
  ];
  const dm=raw.match(datePatterns[0]);
  const ym=raw.match(datePatterns[1]);
  if(dm){
    const y=dm[3].length===2?'20'+dm[3]:dm[3];
    date=`${y}-${String(dm[2]).padStart(2,'0')}-${String(dm[1]).padStart(2,'0')}`;
  }else if(ym){
    date=`${ym[1]}-${String(ym[2]).padStart(2,'0')}-${String(ym[3]).padStart(2,'0')}`;
  }

  // TOTAL: rank candidates by wording. Do not assume the largest number is correct.
  const ranked=[];
  lines.forEach((line,i)=>{
    const low=line.toLowerCase();
    const vals=receiptAmountNumbers(line);
    if(!vals.length)return;

    let score=0;
    if(/\b(total\s*ttc|total\s+à\s+payer|total\s+a\s+payer|net\s+à\s+payer|net\s+a\s+payer|montant\s+à\s+payer|montant\s+a\s+payer)\b/i.test(line))score+=100;
    else if(/\b(à\s+payer|a\s+payer|total|amount due|grand total)\b/i.test(line))score+=75;
    else if(/\b(carte|bancontact|visa|mastercard|payment|paiement)\b/i.test(line))score+=38;

    if(/\b(sous[- ]?total|subtotal|tva|vat|taxe|tax|htva|hors taxe|remise|discount|rendu|monnaie|change|esp[eè]ces|cash reçu|cash recu)\b/i.test(line))score-=70;
    if(/\b(total tva|tva total)\b/i.test(line))score-=90;

    // Totals are often located in the lower half of a receipt.
    score += Math.min(15, i/Math.max(1,lines.length)*15);

    vals.forEach(v=>ranked.push({value:v,score,line,index:i}));
  });

  let amount=null;
  if(ranked.length){
    ranked.sort((a,b)=>b.score-a.score || b.index-a.index || b.value-a.value);
    if(ranked[0].score>15){
      amount=ranked[0].value;
    }else{
      // Fallback: prefer a plausible amount from the last third of the receipt.
      const late=ranked.filter(x=>x.index>=Math.floor(lines.length*.55) && x.value>0);
      const pool=late.length?late:ranked;
      amount=pool.sort((a,b)=>b.index-a.index || b.value-a.value)[0]?.value??null;
    }
  }

  let category='Autres';
  const low=(merchant+' '+raw).toLowerCase();
  const rules=[
    [['carrefour','delhaize','aldi','lidl','colruyt','intermarch','okay','match','supermarch','market'],'Courses'],
    [['shell','q8','totalenergies','esso','texaco','fuel','station'],'Transport'],
    [['ikea','brico','gamma','hubo'],'Shopping'],
    [['netflix','spotify','youtube','proximus','orange','telenet'],'Abonnements'],
    [['restaurant','pizza','burger','cafe','café','mcdonald','quick'],'Loisirs'],
    [['h&m','zara','primark','decathlon','nike','adidas'],'Shopping']
  ];
  for(const [keys,cat] of rules){
    if(keys.some(k=>low.includes(k))){category=cat;break}
  }
  category=applyRules(merchant,category);

  return {merchant,amount,date,category,raw};
}

async function preprocessReceiptImage(file){
  const bitmap=await createImageBitmap(file);
  const maxW=1800;
  const scale=Math.min(2.2,maxW/bitmap.width);
  const w=Math.max(bitmap.width,Math.round(bitmap.width*scale));
  const h=Math.round(bitmap.height*(w/bitmap.width));

  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,0,0,w,h);

  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;

  // grayscale + contrast + slight thresholding while preserving anti-aliasing
  for(let i=0;i<d.length;i+=4){
    const gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];
    let v=(gray-128)*1.55+128;
    if(v>210)v=255;
    else if(v<55)v=0;
    v=Math.max(0,Math.min(255,v));
    d[i]=d[i+1]=d[i+2]=v;
  }
  ctx.putImageData(img,0,0);
  return canvas;
}

async function analyzeReceipt(){
  if(!receiptFile)return alert('Choisis d’abord une photo.');
  if(typeof Tesseract==='undefined')return alert('Le module de lecture du ticket n’est pas disponible. Vérifie ta connexion internet.');

  scanProgress.className='scan-progress active';
  scanProgress.textContent='Préparation de l’image…';
  scanResult.classList.add('hidden');

  try{
    const processed=await preprocessReceiptImage(receiptFile);
    scanProgress.textContent='Analyse du ticket… 0 %';

    const result=await Tesseract.recognize(processed,'fra+eng',{
      logger:m=>{
        if(m.status==='recognizing text'){
          scanProgress.textContent='Lecture du ticket… '+Math.round((m.progress||0)*100)+' %';
        }else if(m.status){
          scanProgress.textContent='Analyse : '+m.status;
        }
      }
    });

    const data=extractReceiptData(result.data.text||'');
    scanMerchant.value=data.merchant||'';
    scanAmount.value=data.amount!=null?Number(data.amount).toFixed(2):'';
    scanDate.value=data.date||entryDateForView();
    scanCategory.value=data.category||'Autres';
    scanRawText.textContent=data.raw||'Aucun texte détecté.';
    scanResult.classList.remove('hidden');
    scanProgress.className='scan-progress';

    const missing=[];
    if(!data.merchant)missing.push('commerçant');
    if(data.amount==null)missing.push('montant');
    if(!data.date)missing.push('date');

    scanProgress.textContent=missing.length
      ? 'Lecture terminée. Vérifie surtout : '+missing.join(', ')+'.'
      : 'Lecture terminée. Vérifie les informations avant de valider.';
  }catch(err){
    scanProgress.className='scan-progress';
    scanProgress.textContent='Impossible de lire ce ticket. Essaie une photo prise bien à plat et plus nette.';
    console.error(err);
  }
}

function useScanResult(){
  const name=scanMerchant.value.trim()||'Ticket';
  const amount=+scanAmount.value||0;
  const date=scanDate.value||new Date().toISOString().slice(0,10);
  if(!amount)return alert('Vérifie le montant.');
  state.ops.push({
    id:'op_'+Date.now(),
    type:'expense',
    name,
    amount,
    cat:applyRules(name,scanCategory.value||'Autres'),
    nature:'variable',
    scope:scanScope.value||'personal',
    tags:scanTags.value.split(',').map(x=>x.trim()).filter(Boolean),
    date:date+'T12:00:00',
    accountId:state.activeAccount,
    source:'receipt_scan'
  });
  save();render();resetScanner();
  showToast('Ticket ajouté aux dépenses ✨');
}


function renderPredictions(){
  const el=document.getElementById('predictionList'); if(!el)return;
  const current=mo().filter(x=>x.type==='expense');
  const now=new Date();
  const currentMonth=new Date(now.getFullYear(),now.getMonth(),1);
  const viewedMonth=new Date(view.getFullYear(),view.getMonth(),1);
  const same=viewedMonth.getTime()===currentMonth.getTime();
  const totalBudget=cats.reduce((s,c)=>s+(+budgets()[c]||0),0);
  const spent=current.reduce((s,x)=>s+x.amount,0);

  if(!same){
    if(viewedMonth<currentMonth){
      if(totalBudget>0){
        const diff=spent-totalBudget;
        el.innerHTML=`<div class="prediction ${diff>0?'warnx':''}"><strong>Bilan du mois</strong><div>${diff>0?`Budget dépassé de ${eur(diff)}.`:`Tu as terminé ${eur(totalBudget-spent)} sous ton budget.`}</div></div>`;
      }else{
        el.innerHTML='<div class="muted">Mois clôturé. Ajoute un budget pour obtenir un bilan comparatif.</div>';
      }
    }else{
      el.innerHTML='<div class="muted">Les projections de rythme s’activent sur le mois en cours. Pour ce mois futur, le plan et les charges prévues restent réservés.</div>';
    }
    return;
  }

  const day=Math.max(1,now.getDate());
  const last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
  const rate=spent/day,projected=rate*last;
  const rows=[];
  if(totalBudget>0){
    const diff=projected-totalBudget;
    rows.push(diff>0?['Budget global',`À ce rythme, tu risques de dépasser ton budget d’environ ${eur(diff)}.`,'warnx']:['Budget global',`À ce rythme, tu terminerais environ ${eur(totalBudget-projected)} sous ton budget.`,'']);
  }
  const byCat={};current.forEach(x=>byCat[x.cat]=(byCat[x.cat]||0)+x.amount);
  cats.forEach(c=>{
    const lim=+budgets()[c]||0,spentCat=byCat[c]||0;
    if(!lim||spentCat<=0)return;
    const proj=spentCat/day*last;
    if(proj>lim*1.05)rows.push([c,`Projection : ${eur(proj)} pour un plafond de ${eur(lim)}.`,'warnx']);
  });
  el.innerHTML=rows.length?rows.slice(0,5).map(([t,m,cl])=>`<div class="prediction ${cl}"><strong>${escHTML(t)}</strong><div>${escHTML(m)}</div></div>`).join(''):'<div class="muted">Ajoute des budgets et quelques dépenses pour activer les prévisions.</div>';
}

function recurringCandidates(){
  const exp=state.ops.filter(x=>x.accountId===state.activeAccount&&x.type==='expense');
  const groups={};
  exp.forEach(x=>{
    const key=(x.name||'').trim().toLowerCase();
    if(!key)return;
    (groups[key]||(groups[key]=[])).push(x);
  });
  const out=[];
  Object.entries(groups).forEach(([k,arr])=>{
    if(arr.length<2)return;
    const months=[...new Set(arr.map(x=>x.date.slice(0,7)))];
    const amounts=arr.map(x=>x.amount),avg=amounts.reduce((s,v)=>s+v,0)/amounts.length;
    const spread=Math.max(...amounts)-Math.min(...amounts);
    const already=state.recurring.some(r=>r.name.toLowerCase()===k);
    if(months.length>=2 && spread<=Math.max(2,avg*.08) && !already){
      const latest=arr.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
      out.push({name:latest.name,amount:Math.round(avg*100)/100,cat:latest.cat||'Autres',day:+latest.date.slice(8,10)||1});
    }
  });
  return out;
}
function renderAutomationSuggestions(){
  const el=document.getElementById('automationSuggestions');if(!el)return;
  const cands=recurringCandidates();
  el.innerHTML=cands.length?cands.slice(0,4).map((c,i)=>`<div class="suggestion"><strong>${c.name} semble récurrent</strong><div class="muted">Environ ${eur(c.amount)} chaque mois · ${c.cat}</div><div class="actions"><button onclick="acceptRecurringSuggestion(${i})">Passer en récurrent</button></div></div>`).join(''):'<div class="muted">Aucune automatisation suggérée pour le moment.</div>';
  window._recCands=cands;
}
function acceptRecurringSuggestion(i){
  const c=(window._recCands||[])[i];if(!c)return;
  state.recurring.push({id:'rec_'+Date.now(),name:c.name,amount:c.amount,cat:c.cat,day:c.day,accountId:state.activeAccount});
  save();render();
}


function renderHeroTrend(){
  const el=document.getElementById('heroTrend');if(!el)return;
  const cur=mo().filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);
  const prev=state.ops.filter(x=>x.accountId===state.activeAccount&&x.type==='expense'&&x.date.startsWith(previousMonthKey())).reduce((s,x)=>s+x.amount,0);
  if(prev<=0){el.textContent='Nouveau mois';return}
  const pct=(cur-prev)/prev*100;
  el.textContent=(pct<=0?'↓ ':'↑ ')+Math.abs(Math.round(pct))+' %';
  el.style.color=pct<=0?'#8ff0cb':'#ffb3ac';
  el.style.background=pct<=0?'#103326':'#351c1e';
  el.style.borderColor=pct<=0?'#25513f':'#5d2b30';
}
function renderGoalShowcase(){
  const el=document.getElementById('goalShowcase');if(!el)return;
  el.innerHTML=state.goals.length?state.goals.slice(0,4).map(g=>{
    const p=Math.min(100,(g.saved/g.target)*100||0);
    const remain=Math.max(0,g.target-g.saved);
    const months=monthsUntil(g.targetDate);
    const recommended=months?remain/months:(g.monthly||0);
    const deadline=g.targetDate?new Date(g.targetDate+'T12:00:00').toLocaleDateString('fr-BE',{month:'long',year:'numeric'}):'Sans date cible';
    return `<div class="goal-card-lux">
      <div class="label">Objectif</div>
      <h4>${g.name}</h4>
      <div class="big">${eur(g.saved)}</div>
      <div class="goal-meta">sur ${eur(g.target)} · ${Math.round(p)} % atteint</div>
      <div class="deadline">${deadline}</div>
      ${recommended>0?`<div class="recommended">${eur(recommended)} / mois conseillé</div>`:''}
      <div class="progress"><div style="width:${p}%"></div></div>
    </div>`;
  }).join(''):'<div class="muted">Ajoute un objectif pour commencer à construire ton prochain projet.</div>';
}


let onboardingStep=1;

function showToast(msg){
  const el=document.getElementById('toast');if(!el)return;
  el.textContent=msg;el.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer=setTimeout(()=>el.classList.add('hidden'),2200);
}
function animateNumberEl(el){
  if(!el)return;
  el.classList.remove('count-animate');
  void el.offsetWidth;
  el.classList.add('count-animate');
}
function setupOnboarding(){
  const done=localStorage.getItem('monBudgetOnboardingDone')==='1';
  const el=document.getElementById('onboarding');
  if(!done && el)el.classList.remove('hidden');
  const co=cats.map(c=>`<option>${c}</option>`).join('');
  const s=document.getElementById('obFixedCat');if(s)s.innerHTML=co;
  updateOnboardingUI();
}
function updateOnboardingUI(){
  for(let i=1;i<=3;i++)document.getElementById('onboardStep'+i)?.classList.toggle('hidden',i!==onboardingStep);
  const p=document.getElementById('onboardProgress');if(p)p.style.width=(onboardingStep/3*100)+'%';
  const b=document.getElementById('onboardNext');if(b)b.textContent=onboardingStep===3?'Terminer':'Continuer';
}
function nextOnboarding(){
  if(onboardingStep===1){
    const inc=+obIncome.value||0,bud=+obBudget.value||0;
    if(inc>0){
      const d=new Date().toISOString().slice(0,10);
      state.ops.push({id:'op_'+Date.now(),type:'income',name:'Revenu principal',amount:inc,cat:'',date:d+'T12:00:00',accountId:state.activeAccount,scope:'personal',tags:[]});
    }
    if(bud>0){
      const split=Math.round((bud/cats.length)*100)/100;
      cats.forEach(c=>budgets()[c]=split);
    }
    if(inc>0){state.monthlyPlans[mk()]={income:inc,fixed:0,savings:Math.max(0,inc-bud)};}
  }
  if(onboardingStep===2){
    const n=obFixedName.value.trim(),a=+obFixedAmount.value||0;
    if(n&&a){
      state.recurring.push({id:'rec_'+Date.now(),name:n,amount:a,cat:obFixedCat.value||'Autres',day:1,accountId:state.activeAccount});
    }
  }
  if(onboardingStep===3){
    const n=obGoalName.value.trim(),t=+obGoalTarget.value||0;
    if(n&&t){
      state.goals.push({id:'g_'+Date.now(),name:n,target:t,saved:0,monthly:0,targetDate:obGoalDate.value||''});
    }
    localStorage.setItem('monBudgetOnboardingDone','1');
    document.getElementById('onboarding')?.classList.add('hidden');
    save();render();showToast('Ton budget est prêt ✨');return;
  }
  onboardingStep++;
  updateOnboardingUI();
}
function skipOnboarding(){
  localStorage.setItem('monBudgetOnboardingDone','1');
  document.getElementById('onboarding')?.classList.add('hidden');
}
function monthsUntil(dateStr){
  if(!dateStr)return 0;
  const now=new Date(),d=new Date(dateStr+'T12:00:00');
  return Math.max(1,(d.getFullYear()-now.getFullYear())*12+(d.getMonth()-now.getMonth()));
}


function currentPlan(){return state.monthlyPlans[mk()]||{income:0,fixed:0,savings:0}}
function saveMonthlyPlan(){
  state.monthlyPlans[mk()]={income:+planIncome.value||0,fixed:+planFixed.value||0,savings:+planSavings.value||0};
  save();render();showToast('Plan du mois enregistré');
}
function loadMonthlyPlanInputs(){
  const p=currentPlan();
  if(document.getElementById('planIncome'))planIncome.value=p.income||'';
  if(document.getElementById('planFixed'))planFixed.value=p.fixed||'';
  if(document.getElementById('planSavings'))planSavings.value=p.savings||'';
}
function renderMonthlyPilot(){
  const s=financialSnapshot();
  const now=new Date(),same=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
  const today=same?now.getDate():1,daysLeft=Math.max(1,last-today+1),weeksLeft=Math.max(1,daysLeft/7);
  const weekly=Math.max(0,s.safeAvailable)/weeksLeft;
  const spendableMonth=Math.max(0,s.incomeBase-s.plannedSaved-s.pendingRecurring);
  const expectedSpent=spendableMonth*((today-1)/last);
  const paceDiff=expectedSpent-s.expenses;
  const ratio=spendableMonth?Math.min(100,s.expenses/spendableMonth*100):0;

  if(document.getElementById('weeklyBudget'))weeklyBudget.textContent=eur(weekly);
  if(document.getElementById('livingLeft'))livingLeft.textContent=eur(s.safeAvailable);
  if(document.getElementById('extraSavings'))extraSavings.textContent=eur(Math.max(0,s.safeAvailable));
  if(document.getElementById('paceFill'))paceFill.style.width=ratio+'%';
  if(document.getElementById('daysLeftText'))daysLeftText.textContent=`${daysLeft} jours restants`;

  const status=document.getElementById('monthStatus'),pace=document.getElementById('paceText'),txt=document.getElementById('weeklyBudgetText');
  if(!s.incomeBase){
    if(status){status.textContent='À configurer';status.style.background='#2a2418';status.style.color='#f3d8a8'}
    if(txt)txt.textContent='Configure ton plan mensuel ou ajoute ton revenu.';
    if(pace)pace.textContent='Plan du mois non défini';
    return;
  }
  if(s.safeAvailable<0){
    if(status){status.textContent='Dépassé';status.style.background='#351c1e';status.style.color='#ffb3ac'}
    if(pace)pace.textContent=`Il manque ${eur(Math.abs(s.safeAvailable))} pour couvrir ton plan prudent`;
    if(txt)txt.textContent='Les charges à venir et l’épargne prévue sont déjà réservées.';
    return;
  }
  if(paceDiff>=0){
    if(status){status.textContent='En avance';status.style.background='#132b24';status.style.color='#91e8c9'}
    if(pace)pace.textContent=`Tu es environ ${eur(paceDiff)} sous ton rythme cible`;
    if(txt)txt.textContent='Tu peux garder ce rythme ou renforcer ton épargne.';
  }else{
    if(status){status.textContent='À surveiller';status.style.background='#351c1e';status.style.color='#ffb3ac'}
    if(pace)pace.textContent=`Tu es environ ${eur(Math.abs(paceDiff))} au-dessus du rythme cible`;
    if(txt)txt.textContent='Réduis légèrement les dépenses variables cette semaine.';
  }
}
function saveDashboardPrefs(){
  state.dashboardPrefs={donut:!!showDonut.checked,insights:!!showInsights.checked,anomalies:!!showAnomalies.checked,upcoming:!!showUpcoming.checked,predictions:!!showPredictions.checked};
  save();applyDashboardPrefs();
}
function applyDashboardPrefs(){
  const p=state.dashboardPrefs||{};
  [['donutCard','donut'],['insightsCard','insights'],['anomaliesCard','anomalies'],['upcomingCard','upcoming'],['predictionsCard','predictions']].forEach(([id,key])=>{const el=document.getElementById(id);if(el)el.style.display=p[key]===false?'none':''});
  if(document.getElementById('showDonut'))showDonut.checked=p.donut!==false;
  if(document.getElementById('showInsights'))showInsights.checked=p.insights!==false;
  if(document.getElementById('showAnomalies'))showAnomalies.checked=p.anomalies!==false;
  if(document.getElementById('showUpcoming'))showUpcoming.checked=p.upcoming!==false;
  if(document.getElementById('showPredictions'))showPredictions.checked=p.predictions!==false;
}




function freeSavingsBalanceValue(){
  if(!state.freeSavingsBalances)state.freeSavingsBalances={};
  return Math.max(0,+state.freeSavingsBalances[state.activeAccount]||0);
}
function setFreeSavingsBalanceValue(value){
  if(!state.freeSavingsBalances)state.freeSavingsBalances={};
  state.freeSavingsBalances[state.activeAccount]=Math.max(0,+value||0);
}
function logFreeSavingsMovement(amount,note,source='manual'){
  if(!state.freeSavingsMovements)state.freeSavingsMovements=[];
  state.freeSavingsMovements.push({
    id:'fsm_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    amount:+amount||0,
    note:note||'Mouvement',
    source,
    date:new Date().toISOString(),
    accountId:state.activeAccount
  });
}
function changeFreeSavingsBalance(delta,note,source='manual',log=true){
  const current=freeSavingsBalanceValue();
  const next=Math.max(0,current+(+delta||0));
  const actual=next-current;
  setFreeSavingsBalanceValue(next);
  if(log && actual!==0)logFreeSavingsMovement(actual,note,source);
  return actual;
}
function addFreeSavings(){
  const raw=prompt('Montant à ajouter à ton épargne libre');
  if(raw===null)return;
  const amount=+String(raw).replace(',','.')||0;
  if(amount<=0)return showToast('Entre un montant supérieur à 0 €');
  changeFreeSavingsBalance(amount,'Ajout manuel','manual',true);
  save();render();showToast(`+ ${eur(amount)} en épargne libre`);
}
function withdrawFreeSavings(){
  const current=freeSavingsBalanceValue();
  if(current<=0)return showToast('Ton épargne libre est déjà à 0 €');
  const raw=prompt(`Montant à retirer (maximum ${eur(current)})`);
  if(raw===null)return;
  const amount=+String(raw).replace(',','.')||0;
  if(amount<=0)return showToast('Entre un montant supérieur à 0 €');
  if(amount>current)return showToast('Tu ne peux pas retirer plus que ton solde libre');
  changeFreeSavingsBalance(-amount,'Retrait manuel','manual',true);
  save();render();showToast(`− ${eur(amount)} retiré`);
}
function setFreeSavingsExact(){
  const current=freeSavingsBalanceValue();
  const raw=prompt('Quel est ton solde réel d’épargne libre ?',String(current.toFixed(2)));
  if(raw===null)return;
  const target=+String(raw).replace(',','.');
  if(!Number.isFinite(target)||target<0)return showToast('Entre un montant valide');
  const delta=target-current;
  setFreeSavingsBalanceValue(target);
  if(delta!==0)logFreeSavingsMovement(delta,'Ajustement du solde réel','adjustment');
  save();render();showToast(`Épargne libre réglée à ${eur(target)}`);
}
function renderFreeSavings(){
  const balance=freeSavingsBalanceValue();
  const totalEl=document.getElementById('freeSavingsBalance');
  const overviewEl=document.getElementById('envelopeFreeTotal');
  if(totalEl)totalEl.textContent=eur(balance);
  if(overviewEl)overviewEl.textContent=eur(balance);

  const el=document.getElementById('freeSavingsMovements');
  if(!el)return;
  const moves=(state.freeSavingsMovements||[])
    .filter(x=>x.accountId===state.activeAccount)
    .slice()
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)))
    .slice(0,4);

  el.innerHTML=moves.length?moves.map(x=>{
    const positive=(+x.amount||0)>=0;
    let d='';
    try{d=new Date(x.date).toLocaleDateString('fr-BE',{day:'2-digit',month:'2-digit'})}catch(_){}
    return `<div class="free-move">
      <div class="meta">${escHTML(x.note||'Mouvement')} · ${d}</div>
      <b class="${positive?'plus':'minus'}">${positive?'+':'−'} ${eur(Math.abs(+x.amount||0))}</b>
    </div>`;
  }).join(''):'';
}

function activeSavingEnvelopes(){
  return (state.savingsEnvelopes||[]).filter(e=>!e.accountId||e.accountId===state.activeAccount);
}
function envelopeSavedTotal(id){
  return (state.savingsEntries||[])
    .filter(e=>e.accountId===state.activeAccount&&e.envelopeId===id)
    .reduce((s,e)=>s+(+e.amount||0),0);
}
function envelopeMonthTotal(id){
  return monthSavingsEntries()
    .filter(e=>e.envelopeId===id&&e.budgetImpact!==false)
    .reduce((s,e)=>s+(+e.amount||0),0);
}
function addEnvelopePreset(icon,name){
  if(activeSavingEnvelopes().some(e=>e.name.toLowerCase()===name.toLowerCase())){
    return showToast('Cette enveloppe existe déjà');
  }
  state.savingsEnvelopes.push({
    id:'env_'+Date.now(),
    icon,name,target:0,monthly:0,targetDate:'',
    accountId:state.activeAccount
  });
  save();render();showToast(`Enveloppe ${name} créée`);
}
function addSavingEnvelope(){
  const name=(document.getElementById('envelopeName')?.value||'').trim();
  if(!name)return showToast('Donne un nom à l’enveloppe');
  if(activeSavingEnvelopes().some(e=>e.name.toLowerCase()===name.toLowerCase())){
    return showToast('Cette enveloppe existe déjà');
  }
  state.savingsEnvelopes.push({
    id:'env_'+Date.now(),
    icon:document.getElementById('envelopeIcon')?.value||'💰',
    name,
    target:+document.getElementById('envelopeTarget')?.value||0,
    monthly:+document.getElementById('envelopeMonthly')?.value||0,
    targetDate:document.getElementById('envelopeDate')?.value||'',
    accountId:state.activeAccount
  });
  ['envelopeName','envelopeTarget','envelopeMonthly','envelopeDate'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('savingEnvelopeForm')?.classList.add('hidden');
  save();render();showToast('Enveloppe créée ✨');
}
function editSavingEnvelope(id){
  const e=(state.savingsEnvelopes||[]).find(x=>x.id===id);if(!e)return;
  const name=prompt('Nom de l’enveloppe',e.name);
  if(name===null)return;
  const clean=name.trim();if(!clean)return;
  const target=prompt('Objectif total (€) — 0 si aucun',String(+e.target||0));
  if(target===null)return;
  const monthly=prompt('Montant prévu par mois (€)',String(+e.monthly||0));
  if(monthly===null)return;
  e.name=clean;
  e.target=Math.max(0,+target||0);
  e.monthly=Math.max(0,+monthly||0);
  save();render();showToast('Enveloppe modifiée');
}
function deleteSavingEnvelope(id){
  const e=(state.savingsEnvelopes||[]).find(x=>x.id===id);if(!e)return;
  if(!confirm(`Supprimer l’enveloppe "${e.name}" ? Son solde sera transféré vers l’épargne libre.`))return;
  const linked=(state.savingsEntries||[]).filter(x=>x.accountId===state.activeAccount&&x.envelopeId===id);
  const moved=linked.reduce((s,x)=>s+(+x.amount||0),0);
  state.savingsEnvelopes=state.savingsEnvelopes.filter(x=>x.id!==id);
  linked.forEach(x=>{x.envelopeId='';x.freeBalanceTracked=true});
  if(moved>0)changeFreeSavingsBalance(moved,`Transfert depuis ${e.name}`,'envelope_delete',true);
  save();render();showToast('Enveloppe supprimée');
}
function addMoneyToEnvelope(id){
  const e=(state.savingsEnvelopes||[]).find(x=>x.id===id);if(!e)return;
  const raw=prompt(`Montant épargné CE MOIS dans ${e.name}`);
  if(raw===null)return;
  const amount=+String(raw).replace(',','.')||0;
  if(amount<=0)return showToast('Entre un montant supérieur à 0 €');
  state.savingsEntries.push({
    id:'sav_'+Date.now(),amount,
    date:entryDateForView(),
    note:`Épargne du mois · ${e.name}`,
    goalId:'',envelopeId:id,freeBalanceTracked:false,
    budgetImpact:true,savingsOrigin:'monthly',
    accountId:state.activeAccount
  });
  save();render();showToast(`+ ${eur(amount)} épargné ce mois`);
}
function addExistingMoneyToEnvelope(id){
  const e=(state.savingsEnvelopes||[]).find(x=>x.id===id);if(!e)return;
  const raw=prompt(`Montant que tu avais DÉJÀ de côté dans ${e.name}`);
  if(raw===null)return;
  const amount=+String(raw).replace(',','.')||0;
  if(amount<=0)return showToast('Entre un montant supérieur à 0 €');
  state.savingsEntries.push({
    id:'sav_'+Date.now(),amount,
    date:entryDateForView(),
    note:`Solde déjà existant · ${e.name}`,
    goalId:'',envelopeId:id,freeBalanceTracked:false,
    budgetImpact:false,savingsOrigin:'existing',
    accountId:state.activeAccount
  });
  save();render();showToast(`${eur(amount)} ajouté au solde existant`);
}
function withdrawMoneyFromEnvelope(id){
  const e=(state.savingsEnvelopes||[]).find(x=>x.id===id);if(!e)return;
  const available=Math.max(0,envelopeSavedTotal(id));
  if(available<=0)return showToast(`L’enveloppe ${e.name} est vide`);

  const raw=prompt(`Montant à retirer de ${e.name} (maximum ${eur(available)})`);
  if(raw===null)return;

  const amount=+String(raw).replace(',','.')||0;
  if(amount<=0)return showToast('Entre un montant supérieur à 0 €');
  if(amount>available)return showToast(`Tu ne peux pas retirer plus de ${eur(available)}`);

  state.savingsEntries.push({
    id:'sav_'+Date.now(),
    amount:-amount,
    date:entryDateForView(),
    note:`Retrait de ${e.name}`,
    goalId:'',
    envelopeId:id,
    freeBalanceTracked:false,
    budgetImpact:false,savingsOrigin:'withdrawal',
    movement:'withdrawal',
    accountId:state.activeAccount
  });

  save();render();showToast(`− ${eur(amount)} retiré de ${e.name}`);
}
function renderSavingEnvelopeSelects(){
  const envs=activeSavingEnvelopes();
  const opts='<option value="">Épargne libre</option>'+envs.map(e=>`<option value="${e.id}">${escHTML(e.icon||'💰')} ${escHTML(e.name)}</option>`).join('');
  const a=document.getElementById('savingEnvelope');
  const q=document.getElementById('savingEnvelopeQuick');
  if(a){
    const v=a.value;
    a.innerHTML=opts;
    if([...a.options].some(o=>o.value===v))a.value=v;
  }
  if(q){
    const v=q.value;
    q.innerHTML=opts;
    if([...q.options].some(o=>o.value===v))q.value=v;
  }
}
function renderSavingEnvelopes(){
  const el=document.getElementById('savingEnvelopesList');
  if(!el)return;
  const envs=activeSavingEnvelopes();
  const allocated=(state.savingsEntries||[])
    .filter(e=>e.accountId===state.activeAccount&&e.envelopeId&&envs.some(x=>x.id===e.envelopeId))
    .reduce((s,e)=>s+(+e.amount||0),0);
  if(document.getElementById('envelopeAllocatedTotal'))envelopeAllocatedTotal.textContent=eur(allocated);
  renderFreeSavings();

  if(!envs.length){
    el.innerHTML=emptyState('◇','Aucune enveloppe','Crée par exemple une enveloppe Enfant, Vacances ou Urgences.');
    return;
  }
  el.innerHTML=envs.map(e=>{
    const saved=envelopeSavedTotal(e.id);
    const month=envelopeMonthTotal(e.id);
    const target=+e.target||0;
    const monthly=+e.monthly||0;
    const pct=target?Math.min(100,saved/target*100):0;
    let meta=[];
    if(monthly)meta.push(`${eur(month)} / ${eur(monthly)} ce mois`);
    if(e.targetDate){
      try{meta.push(`cible ${new Date(e.targetDate+'T12:00:00').toLocaleDateString('fr-BE',{month:'short',year:'numeric'})}`)}catch(_){}
    }
    return `<div class="envelope-card">
      <div class="envelope-head">
        <div class="envelope-icon">${escHTML(e.icon||'💰')}</div>
        <div>
          <div class="envelope-name">${escHTML(e.name)}</div>
          <div class="envelope-meta">${meta.length?meta.join(' · '):'Enveloppe personnalisée'}</div>
        </div>
        <div class="envelope-value">${eur(saved)}${target?`<div class="muted">sur ${eur(target)}</div>`:''}</div>
      </div>
      ${target?`<div class="envelope-progress"><i style="width:${pct}%"></i></div>`:''}
      <div class="envelope-foot">
        <div class="muted">${target?`${Math.round(pct)} % atteint`:(monthly?`${eur(month)} ajouté ce mois`:'Sans objectif défini')}</div>
        <div class="envelope-actions">
          <button class="secondary envelope-monthly" onclick="addMoneyToEnvelope('${e.id}')">+ Ce mois</button>
          <button class="secondary envelope-existing" onclick="addExistingMoneyToEnvelope('${e.id}')">Déjà de côté</button>
          <button class="secondary envelope-withdraw" onclick="withdrawMoneyFromEnvelope('${e.id}')">− Retirer</button>
          <button class="secondary" onclick="editSavingEnvelope('${e.id}')">Modifier</button>
          <button class="secondary" onclick="deleteSavingEnvelope('${e.id}')">×</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function monthlyPlannedSavings(){
  return (+currentPlan().savings||0) || monthlySave();
}
function monthSavingsEntries(){
  return (state.savingsEntries||[]).filter(x=>x.accountId===state.activeAccount&&String(x.date||'').startsWith(mk()));
}
function monthlySavedActual(){
  return monthSavingsEntries()
    .filter(x=>x.budgetImpact!==false)
    .reduce((s,x)=>s+moneyNumber(x.amount),0);
}
function openSavingPanel(){
  const planBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('plan'"));
  if(planBtn) nav('plan',planBtn);
  document.getElementById('quickSheet')?.classList.add('hidden');
  setTimeout(()=>document.getElementById('savingsTrackerCard')?.scrollIntoView({behavior:'smooth',block:'start'}),90);
}
function entryDateForView(){
  const now=new Date();
  if(now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth())return now.toISOString().slice(0,10);
  const last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
  const d=new Date(view.getFullYear(),view.getMonth(),Math.min(now.getDate(),last));
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function adjustGoalFromSaving(entry,delta){
  if(!entry?.goalId||!delta)return;
  const g=state.goals.find(x=>x.id===entry.goalId);if(!g)return;
  g.saved=Math.max(0,Math.min(+g.target||Infinity,(+g.saved||0)+delta));
}
function deleteSavingEntry(id){
  const e=state.savingsEntries.find(x=>x.id===id);if(!e)return;
  if(!confirm('Supprimer cette épargne ?'))return;
  adjustGoalFromSaving(e,-(+e.amount||0));
  if(!e.envelopeId && e.freeBalanceTracked){
    changeFreeSavingsBalance(-(+e.amount||0),'Suppression d’une épargne libre','saving_entry_delete',true);
  }
  state.savingsEntries=state.savingsEntries.filter(x=>x.id!==id);
  save();render();showToast('Épargne supprimée');
}
function editSavingEntry(id){
  const e=state.savingsEntries.find(x=>x.id===id);if(!e)return;
  const wasWithdrawal=(+e.amount||0)<0;
  const raw=prompt(wasWithdrawal?'Nouveau montant du retrait':'Nouveau montant',String(Math.abs(+e.amount||0)));
  if(raw===null)return;
  const entered=+String(raw).replace(',','.')||0;
  if(entered<=0)return showToast('Entre un montant supérieur à 0 €');

  if(wasWithdrawal && e.envelopeId){
    const currentEnvelopeTotal=envelopeSavedTotal(e.envelopeId);
    const oldAbs=Math.abs(+e.amount||0);
    const maxAllowed=currentEnvelopeTotal+oldAbs;
    if(entered>maxAllowed)return showToast(`Retrait maximum : ${eur(maxAllowed)}`);
  }

  const old=+e.amount||0;
  const amount=wasWithdrawal?-entered:entered;
  e.amount=amount;
  const delta=amount-old;
  adjustGoalFromSaving(e,delta);

  if(!e.envelopeId && e.freeBalanceTracked && delta!==0){
    changeFreeSavingsBalance(delta,'Modification d’une épargne libre','saving_entry_edit',true);
  }

  const note=prompt('Note',e.note||'');
  if(note!==null)e.note=note.trim();
  save();render();showToast(wasWithdrawal?'Retrait modifié':'Épargne modifiée');
}
function addSavingEntry(fromQuick=false){
  const amount=+(fromQuick?(document.getElementById('savingAmountQuick')?.value||0):(document.getElementById('savingAmount')?.value||0));
  if(!amount)return;
  const date=fromQuick?entryDateForView():(document.getElementById('savingDate')?.value||entryDateForView());
  const note=(fromQuick?(document.getElementById('savingNoteQuick')?.value||''):(document.getElementById('savingNote')?.value||'')).trim();
  const goalId=fromQuick?'':(document.getElementById('savingGoal')?.value||'');
  const envelopeId=fromQuick?(document.getElementById('savingEnvelopeQuick')?.value||''):(document.getElementById('savingEnvelope')?.value||'');
  const newSaving={id:'sav_'+Date.now(),amount,date,note,goalId,envelopeId,accountId:state.activeAccount,freeBalanceTracked:!envelopeId,budgetImpact:true,savingsOrigin:'monthly'};
  state.savingsEntries.push(newSaving);
  if(!envelopeId){
    changeFreeSavingsBalance(amount,note||'Épargne libre ajoutée','saving_entry',true);
  }
  if(goalId){
    const g=state.goals.find(x=>x.id===goalId);
    if(g)g.saved=Math.min(+g.target||Infinity,(+g.saved||0)+amount);
  }
  if(fromQuick){
    if(document.getElementById('savingAmountQuick'))savingAmountQuick.value='';
    if(document.getElementById('savingNoteQuick'))savingNoteQuick.value='';
    if(document.getElementById('savingEnvelopeQuick'))savingEnvelopeQuick.value='';
    document.getElementById('savingQuickForm')?.classList.add('hidden');
  }else{
    if(document.getElementById('savingAmount'))savingAmount.value='';
    if(document.getElementById('savingDate'))savingDate.value='';
    if(document.getElementById('savingNote'))savingNote.value='';
    if(document.getElementById('savingGoal'))savingGoal.value='';
    if(document.getElementById('savingEnvelope'))savingEnvelope.value='';
  }
  save();render();showToast('Épargne ajoutée ✨');
}
function renderSavingsModule(){
  const planned=monthlyPlannedSavings();
  const actual=monthlySavedActual();
  const remaining=Math.max(0,planned-actual);
  const bonus=Math.max(0,actual-planned);
  const pct=planned>0?Math.max(0,Math.min(100,Math.round(actual/planned*100))):0;
  if(document.getElementById('savingPlanned'))savingPlanned.textContent=eur(planned);
  if(document.getElementById('savingActual'))savingActual.textContent=eur(actual);
  if(document.getElementById('savingRemaining'))savingRemaining.textContent=eur(remaining);
  if(document.getElementById('savingBonus'))savingBonus.textContent=eur(bonus);
  if(document.getElementById('savingPercent'))savingPercent.textContent=(planned>0?pct:0)+' %';
  if(document.getElementById('savingProgress'))savingProgress.style.width=(planned>0?Math.max(0,Math.min(100,actual/planned*100)):0)+'%';
  if(document.getElementById('savingHint')){
    if(planned<=0 && actual<=0) savingHint.textContent='Définis une épargne prévue dans “Plan du mois” ou ajoute une épargne réelle.';
    else if(planned<=0 && actual>0) savingHint.textContent='Tu as déjà mis '+eur(actual)+' de côté ce mois-ci.';
    else if(actual<planned) savingHint.textContent='Il te reste '+eur(remaining)+' à mettre de côté ce mois-ci.';
    else if(actual===planned) savingHint.textContent='Objectif d’épargne atteint. Bien joué.';
    else savingHint.textContent='Tu dépasses ton objectif d’épargne de '+eur(bonus)+'.';
  }
}
function renderSavingsHistory(){
  const el=document.getElementById('savingsHistory'); if(!el)return;
  const entries=monthSavingsEntries().slice().sort((a,b)=>b.date.localeCompare(a.date));
  if(document.getElementById('savingGoal')){
    savingGoal.innerHTML='<option value="">Aucun objectif lié</option>'+state.goals.map(g=>`<option value="${g.id}">${escHTML(g.name)}</option>`).join('');
  }
  renderSavingEnvelopeSelects();
  el.innerHTML=entries.length?entries.map(x=>{
    const goal=x.goalId?state.goals.find(g=>g.id===x.goalId):null;
    const envelope=x.envelopeId?(state.savingsEnvelopes||[]).find(e=>e.id===x.envelopeId):null;
    const impactTag=x.budgetImpact===false
      ? '<div class="savings-origin-tag existing">Hors budget mensuel</div>'
      : '<div class="savings-origin-tag monthly">Épargne du mois</div>';
    return `<div class="savingsHistoryItem">
      <div class="meta"><strong>${escHTML(x.note||'Épargne')}</strong><div class="muted">${x.date}</div>${impactTag}${envelope?`<div class="envelope-tag">${escHTML(envelope.icon||'💰')} ${escHTML(envelope.name)}</div>`:''}${goal?`<div class="goalpill">${escHTML(goal.name)}</div>`:''}</div>
      <div>
        <b class="${(+x.amount||0)>=0?'income':'danger'}">${(+x.amount||0)>=0?'+':'−'} ${eur(Math.abs(+x.amount||0))}</b>
        <div class="entry-actions">
          <button class="secondary" onclick="editSavingEntry('${x.id}')">Modifier</button>
          <button class="secondary" onclick="deleteSavingEntry('${x.id}')">Supprimer</button>
        </div>
      </div>
    </div>`;
  }).join(''):emptyState('◇','Aucune épargne enregistrée','Ajoute un montant quand tu mets réellement de l’argent de côté.');
}


function scoreMonth(data){
  let score=100;
  if(data.income<=0)return 50;
  const spendRatio=data.expenses/data.income;
  if(spendRatio>.95)score-=35;
  else if(spendRatio>.85)score-=20;
  else if(spendRatio>.75)score-=10;
  const planned=monthlyPlannedSavings();
  if(planned>0){
    const savedRatio=data.savings/planned;
    if(savedRatio>=1)score+=5;
    else if(savedRatio<.5)score-=15;
    else if(savedRatio<.8)score-=7;
  }
  if(data.remaining<0)score-=20;
  return Math.max(0,Math.min(100,Math.round(score)));
}
function monthDataForKey(key){
  const x=monthActuals(key,state.activeAccount);
  return {ops:x.ops,income:x.income,expenses:x.expenses,savings:x.savings,remaining:x.realBalance};
}
function renderMonthlyReport(){
  if(!document.getElementById('reportMonth'))return;
  const key=mk();
  const data=monthDataForKey(key);
  const score=scoreMonth(data);
  reportMonth.textContent=fullMonthLabel();
  reportScore.textContent=score;
  reportIncome.textContent=eur(data.income);
  reportExpenses.textContent=eur(data.expenses);
  reportSavings.textContent=eur(data.savings);
  reportRemaining.textContent=eur(data.remaining);

  let scoreText='Mois équilibré.';
  if(score>=90)scoreText='Excellent mois : tes dépenses et ton épargne sont très bien maîtrisées.';
  else if(score>=75)scoreText='Bon mois : quelques ajustements peuvent encore améliorer ton équilibre.';
  else if(score>=60)scoreText='Mois correct, mais certains postes méritent d’être surveillés.';
  else scoreText='Mois difficile : réduis les dépenses variables et revois ton plan du mois.';
  reportScoreText.textContent=scoreText;

  const byCat={};
  data.ops.filter(x=>x.type==='expense').forEach(x=>byCat[x.cat]=(byCat[x.cat]||0)+x.amount);
  const sorted=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const top=sorted[0];
  const low=sorted.slice().reverse().find(([k,v])=>v>0);
  const planned=monthlyPlannedSavings();
  const highlights=[];
  if(top)highlights.push(['Poste principal',`${top[0]} est ton plus gros poste avec ${eur(top[1])}.`]);
  if(low && low[0]!==top?.[0])highlights.push(['Poste le plus léger',`${low[0]} est le poste le plus bas avec ${eur(low[1])}.`]);
  if(planned>0){
    const diff=data.savings-planned;
    highlights.push(diff>=0?['Épargne',`Objectif atteint avec ${eur(diff)} de bonus.`]:['Épargne',`Il manquait ${eur(Math.abs(diff))} pour atteindre l’objectif prévu.`]);
  }
  const prev=monthDataForKey(previousMonthKey());
  if(prev.expenses>0){
    const pct=(data.expenses-prev.expenses)/prev.expenses*100;
    highlights.push(['Évolution',pct<=0?`Dépenses en baisse de ${Math.abs(Math.round(pct))} % par rapport au mois précédent.`:`Dépenses en hausse de ${Math.round(pct)} % par rapport au mois précédent.`]);
  }
  reportHighlights.innerHTML=highlights.length?highlights.map(([t,m])=>`<div class="report-highlight"><strong>${t}</strong><div class="muted">${m}</div></div>`).join(''):'<div class="muted">Pas encore assez de données.</div>';

  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date(view);d.setMonth(d.getMonth()-i);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    months.push(monthDataForKey(k));
  }
  const avgExp=months.reduce((s,m)=>s+m.expenses,0)/Math.max(1,months.length);
  const avgSav=months.reduce((s,m)=>s+m.savings,0)/Math.max(1,months.length);
  const plan=currentPlan();
  const nextIncome=plan.income||data.income;
  nextMonthExpenses.textContent=eur(avgExp);
  nextMonthSavings.textContent=eur(monthlyPlannedSavings()>0?monthlyPlannedSavings():avgSav);
  nextMonthText.textContent=`Projection basée sur tes derniers mois et ton plan actuel.`;

  const annual=[];
  for(let i=11;i>=0;i--){
    const d=new Date(view);d.setMonth(d.getMonth()-i);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    annual.push({d, ...monthDataForKey(k)});
  }
  const max=Math.max(1,...annual.map(x=>x.expenses));
  annualMiniChart.innerHTML=annual.map(x=>`<div class="annual-col"><i style="height:${Math.max(3,x.expenses/max*125)}px"></i>${x.d.toLocaleDateString('fr-BE',{month:'short'}).replace('.','')}</div>`).join('');
}



function pendingRecurringAmount(key=mk(),accountId=state.activeAccount){
  const monthOps=monthActuals(key,accountId).ops;
  const appliedIds=new Set(monthOps.filter(x=>x.recurringId).map(x=>x.recurringId));
  return (state.recurring||[])
    .filter(r=>r.accountId===accountId&&!appliedIds.has(r.id))
    .reduce((s,r)=>s+nonNegativeMoney(r.amount),0);
}
function financialSnapshot(){
  const p=currentPlan();
  const actuals=monthActuals(mk(),state.activeAccount);
  const a=actuals.ops;
  const realIncome=actuals.income;
  const expenses=actuals.expenses;
  const actualSaved=actuals.savings;
  const plannedSaved=nonNegativeMoney(monthlyPlannedSavings());
  const incomeBase=realIncome>0?realIncome:nonNegativeMoney(p.income);
  const savingsStillToReserve=Math.max(0,plannedSaved-actualSaved);
  const pendingRecurring=pendingRecurringAmount(mk(),state.activeAccount);

  // Prudence rule:
  // - existing savings (budgetImpact=false) never affects the month;
  // - current-month savings does;
  // - if the savings target is not reached yet, the missing part stays reserved;
  // - recurring expenses not yet posted stay reserved exactly once.
  const safeAvailable=incomeBase-expenses-actualSaved-savingsStillToReserve-pendingRecurring;
  return {
    p,a,realIncome,incomeBase,expenses,actualSaved,plannedSaved,
    savingsStillToReserve,pendingRecurring,safeAvailable,
    actualBalance:realIncome-expenses-actualSaved
  };
}

function renderFocusCard(){
  const s=financialSnapshot();
  const now=new Date();
  const last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
  const same=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const today=same?now.getDate():1;
  const daysLeft=Math.max(1,last-today+1);
  const weekBudget=Math.max(0,s.safeAvailable)/(daysLeft/7||1);

  if(document.getElementById('focusAvailable'))focusAvailable.textContent=eur(s.safeAvailable);
  if(document.getElementById('focusWeek'))focusWeek.textContent=eur(weekBudget);
  if(document.getElementById('focusSaved'))focusSaved.textContent=eur(s.actualSaved);

  let msg='Ton budget est bien cadré.';
  if(s.incomeBase<=0)msg='Ajoute ton revenu ou configure ton plan du mois pour obtenir un vrai pilotage.';
  else if(s.safeAvailable<0)msg='Ton budget prudent est dépassé : épargne prévue et charges à venir sont déjà réservées.';
  else if(s.savingsStillToReserve>0)msg=`${eur(s.savingsStillToReserve)} restent réservés pour ton épargne prévue.`;
  else if(s.pendingRecurring>0)msg=`${eur(s.pendingRecurring)} de charges récurrentes restent réservés.`;
  else msg=`Tu peux utiliser environ ${eur(weekBudget)} cette semaine en gardant ce rythme.`;
  if(document.getElementById('focusMessage'))focusMessage.textContent=msg;
}
function openQuickExpense(){
  document.getElementById('quickSheet')?.classList.add('hidden');
  const modal=document.getElementById('quickExpenseModal');if(!modal)return;
  modal.classList.remove('hidden');
  if(document.getElementById('qeCat')){
    qeCat.innerHTML=cats.map(c=>`<option>${c}</option>`).join('');
  }
  setTimeout(()=>document.getElementById('qeAmount')?.focus(),100);
}
function closeQuickExpense(){document.getElementById('quickExpenseModal')?.classList.add('hidden')}
function saveQuickExpense(){
  const amount=+document.getElementById('qeAmount').value||0;
  if(!amount)return;
  const date=entryDateForView()+'T12:00:00';
  state.ops.push({
    id:'op_'+Date.now(),type:'expense',name:document.getElementById('qeCat').value||'Dépense',
    amount,cat:document.getElementById('qeCat').value||'Autres',nature:'variable',
    date,accountId:state.activeAccount,scope:'personal',tags:[]
  });
  qeAmount.value='';
  closeQuickExpense();save();render();showToast('Dépense ajoutée');
}
function openAdvancedExpense(){
  closeQuickExpense();
  const opsBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('ops'"));
  if(opsBtn)nav('ops',opsBtn);
  const firstTab=document.querySelector('#ops .tab');
  if(firstTab)showForm('expenseForm',firstTab);
  setTimeout(()=>document.getElementById('eAmount')?.focus(),100);
}
function openReport(){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.getElementById('report')?.classList.add('active');
  renderMonthlyReport();
  window.scrollTo({top:0,behavior:'smooth'});
}


function refreshCats(){
  cats=allCats();
}
function togglePrivacy(){
  const hidden=document.body.classList.toggle('money-hidden');
  localStorage.setItem('monBudgetPrivacy',hidden?'1':'0');
  document.querySelector('.privacybtn')?.classList.toggle('active',hidden);
}
function initPrivacy(){
  const hidden=localStorage.getItem('monBudgetPrivacy')==='1';
  document.body.classList.toggle('money-hidden',hidden);
  document.querySelector('.privacybtn')?.classList.toggle('active',hidden);
}
function toggleAlertsPanel(){
  document.getElementById('alertsPanel')?.classList.toggle('hidden');
  renderAlerts();
}
function buildAlerts(){
  const alerts=[];
  const expenses=mo().filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);
  const inc=mo().filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);
  const plan=currentPlan();
  const plannedSavings=monthlyPlannedSavings();
  const actualSavings=monthlySavedActual();

  if(inc>0 && expenses/inc>.9)alerts.push({type:'bad',icon:'!',title:'Dépenses élevées',text:'Tu as utilisé plus de 90 % de tes revenus du mois.'});
  if(plannedSavings>0 && actualSavings>=plannedSavings)alerts.push({type:'good',icon:'✓',title:'Objectif d’épargne atteint',text:`Tu as mis de côté ${eur(actualSavings)} ce mois-ci.`});
  if(plannedSavings>0 && actualSavings<plannedSavings*.5)alerts.push({type:'warn',icon:'↗',title:'Épargne à surveiller',text:`Il reste ${eur(plannedSavings-actualSavings)} à mettre de côté.`});

  const now=new Date();
  const isCurrentView=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  if(isCurrentView){
    const day=now.getDate();
    state.recurring.filter(r=>r.accountId===state.activeAccount).forEach(r=>{
      const delta=(+r.day||1)-day;
      if(delta>=0 && delta<=3)alerts.push({type:'warn',icon:'⌛',title:`${r.name} arrive bientôt`,text:`${eur(r.amount)} prévu${delta===0?" aujourd’hui":` dans ${delta} jour${delta>1?'s':''}`}.`});
    });
  }

  const budgetsObj=budgets();
  cats.forEach(c=>{
    const limit=+budgetsObj[c]||0;
    if(!limit)return;
    const spent=mo().filter(x=>x.type==='expense'&&x.cat===c).reduce((s,x)=>s+x.amount,0);
    if(spent/limit>=.9)alerts.push({type:spent>limit?'bad':'warn',icon:'%',title:`Budget ${c}`,text:`${eur(spent)} utilisés sur ${eur(limit)}.`});
  });
  return alerts.slice(0,12);
}
function renderAlerts(){
  const list=document.getElementById('alertsList'),count=document.getElementById('alertCount');
  if(!list||!count)return;
  const alerts=buildAlerts();
  count.textContent=alerts.length;
  count.classList.toggle('hidden',alerts.length===0);
  list.innerHTML=alerts.length?alerts.map(a=>`<div class="alert-item ${a.type}">
    <div class="alert-icon">${a.icon}</div>
    <div><strong>${a.title}</strong><small>${a.text}</small></div>
  </div>`).join(''):`<div class="empty-state"><div class="empty-icon">✓</div><strong>Tout est calme</strong><small>Aucune alerte importante pour le moment.</small></div>`;
}
function addCustomCategory(){
  const el=document.getElementById('newCategoryName');if(!el)return;
  const name=el.value.trim();
  if(!name)return;
  if(allCats().some(c=>c.toLowerCase()===name.toLowerCase()))return showToast('Cette catégorie existe déjà');
  state.customCategories.push(name);
  el.value='';refreshCats();save();render();showToast('Catégorie ajoutée');
}
function renameCategory(oldName){
  const next=prompt('Nouveau nom de catégorie',oldName);
  if(!next||next.trim()===oldName)return;
  const name=next.trim();
  if(allCats().some(c=>c!==oldName&&c.toLowerCase()===name.toLowerCase()))return showToast('Ce nom existe déjà');

  const baseKey=baseCats.find(c=>baseDisplayName(c)===oldName);
  if(baseKey){
    state.categoryRenames[baseKey]=name;
  }else{
    state.customCategories=state.customCategories.map(c=>c===oldName?name:c);
  }

  state.ops.forEach(o=>{if(o.cat===oldName)o.cat=name});
  state.recurring.forEach(r=>{if(r.cat===oldName)r.cat=name});
  state.templates.forEach(t=>{if(t.cat===oldName)t.cat=name});
  state.rules.forEach(r=>{if(r.cat===oldName)r.cat=name});
  Object.values(state.budgets||{}).forEach(b=>{
    if(b&&b[oldName]!==undefined){b[name]=b[oldName];delete b[oldName]}
  });

  refreshCats();save();render();showToast('Catégorie renommée');
}
function deleteCustomCategory(name){
  if(isBaseDisplay(name))return showToast('Les catégories de base ne peuvent pas être supprimées');
  if(!confirm(`Supprimer la catégorie "${name}" ?`))return;
  state.customCategories=state.customCategories.filter(c=>c!==name);
  state.ops.forEach(o=>{if(o.cat===name)o.cat=baseDisplayName('Autres')});
  state.recurring.forEach(r=>{if(r.cat===name)r.cat=baseDisplayName('Autres')});
  state.templates.forEach(t=>{if(t.cat===name)t.cat=baseDisplayName('Autres')});
  state.rules.forEach(r=>{if(r.cat===name)r.cat=baseDisplayName('Autres')});
  Object.values(state.budgets||{}).forEach(b=>{if(b&&b[name]!==undefined)delete b[name]});
  refreshCats();save();render();showToast('Catégorie supprimée');
}
function renderCategoryManager(){
  const el=document.getElementById('categoryManager');if(!el)return;
  el.innerHTML=allCats().map(c=>{
    const enc=encodeURIComponent(c);
    return `<div class="category-row">
      <span>${escHTML(c)}</span>
      <div class="category-actions">
        <button class="secondary" onclick="renameCategory(decodeURIComponent('${enc}'))">Renommer</button>
        ${isBaseDisplay(c)?'':`<button class="secondary" onclick="deleteCustomCategory(decodeURIComponent('${enc}'))">Supprimer</button>`}
      </div>
    </div>`;
  }).join('');
}
function emptyState(icon,title,text){
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${title}</strong><small>${text}</small></div>`;
}


function renderFinalToday(){
  const title=document.getElementById('finalTodayTitle');
  const text=document.getElementById('finalTodayText');
  if(!title||!text)return;

  const s=financialSnapshot();
  const alerts=buildAlerts();

  if(!s.incomeBase){
    title.textContent='Configure ton revenu';
    text.textContent='Ajoute ton revenu ou ton plan mensuel pour activer le pilotage complet.';
    return;
  }
  if(s.safeAvailable<0){
    title.textContent='Budget à surveiller';
    text.textContent=`Il manque ${eur(Math.abs(s.safeAvailable))} pour couvrir ton plan prudent.`;
    return;
  }
  if(alerts.length){
    title.textContent=alerts[0].title;
    text.textContent=alerts[0].text;
    return;
  }
  if(s.savingsStillToReserve>0){
    title.textContent='Épargne à compléter';
    text.textContent=`Il reste ${eur(s.savingsStillToReserve)} à mettre de côté ce mois-ci.`;
    return;
  }
  if(s.pendingRecurring>0){
    title.textContent='Charges à venir';
    text.textContent=`${eur(s.pendingRecurring)} restent réservés pour les prochaines charges.`;
    return;
  }

  title.textContent='Tout va bien';
  text.textContent='Ton budget est sous contrôle pour le moment.';
}


function monthKeyFromDate(d){
  const dt=new Date(d);
  if(Number.isNaN(dt.getTime()))return '';
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
}
function premiumMonthStats(key){
  const x=monthActuals(key,state.activeAccount);
  return {income:x.income,expenses:x.expenses,saved:x.savings,balance:x.realBalance};
}
function renderPremiumProjection(){
  if(!document.getElementById('premiumProjectionAmount'))return;
  const snap=financialSnapshot();
  const now=new Date();
  const currentMonth=new Date(now.getFullYear(),now.getMonth(),1);
  const viewedMonth=new Date(view.getFullYear(),view.getMonth(),1);
  const same=viewedMonth.getTime()===currentMonth.getTime();
  const lastDay=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();

  const key=mk();
  const ops=(state.ops||[]).filter(o=>o.accountId===state.activeAccount&&monthKeyFromDate(o.date)===key&&o.type==='expense');
  const variableSpent=ops
    .filter(o=>o.nature!=='fixed')
    .reduce((s,o)=>s+nonNegativeMoney(o.amount),0);

  let daily=0,daysLeft=0,projected=snap.safeAvailable;
  let risk='Faible',stateLabel='Stable',pct=72,txt='';

  if(same){
    const day=Math.max(1,now.getDate());
    daysLeft=Math.max(0,lastDay-day);
    daily=variableSpent/day;
    projected=snap.safeAvailable-(daily*daysLeft);
    if(projected<0){risk='Élevé';stateLabel='À corriger';pct=22;txt=`À ce rythme, tu pourrais finir le mois à ${eur(projected)}.`}
    else if(projected<Math.max(100,snap.incomeBase*.08)){risk='Moyen';stateLabel='À surveiller';pct=48;txt=`La marge de sécurité devient faible : environ ${eur(projected)} en fin de mois.`}
    else txt=`À ce rythme, tu finirais le mois avec environ ${eur(projected)} disponibles.`;
  }else if(viewedMonth<currentMonth){
    stateLabel='Clôturé';
    risk=projected<0?'Élevé':'—';
    pct=projected<0?25:100;
    txt=`Solde prudent constaté pour ce mois : ${eur(projected)}.`;
  }else{
    stateLabel='Prévu';
    risk=projected<0?'Élevé':projected<Math.max(100,snap.incomeBase*.08)?'Moyen':'Faible';
    pct=projected<0?22:risk==='Moyen'?48:72;
    daysLeft=lastDay;
    txt=`Prévision basée sur ton plan, ton épargne et tes charges récurrentes : ${eur(projected)} disponibles.`;
  }

  premiumProjectionAmount.textContent=eur(projected);
  premiumDailyRate.textContent=same?eur(daily):'—';
  premiumDaysLeft.textContent=same?daysLeft:'—';
  premiumRisk.textContent=risk;
  premiumProjectionState.textContent=stateLabel;
  premiumProjectionBar.style.width=`${pct}%`;
  premiumProjectionText.textContent=txt;
}
function renderAnnualPremium(){
  if(!document.getElementById('annualIncome'))return;
  const y=view.getFullYear();
  annualPremiumTitle.textContent=String(y);
  const months=[];
  let ti=0,te=0,ts=0;
  for(let m=0;m<12;m++){
    const key=`${y}-${String(m+1).padStart(2,'0')}`;
    const s=premiumMonthStats(key);
    months.push(s);ti+=s.income;te+=s.expenses;ts+=s.saved;
  }
  annualIncome.textContent=eur(ti);
  annualExpenses.textContent=eur(te);
  annualSaved.textContent=eur(ts);
  annualBalance.textContent=eur(ti-te-ts);

  const maxVal=Math.max(1,...months.map(x=>Math.max(x.income,x.expenses)));
  const labels=['J','F','M','A','M','J','J','A','S','O','N','D'];
  annualChart.innerHTML=months.map((x,i)=>{
    const h=Math.max(3,Math.round((x.expenses/maxVal)*90));
    return `<div class="annual-bar-wrap" title="${eur(x.expenses)} dépensés"><div class="annual-bar" style="height:${h}px"></div><span>${labels[i]}</span></div>`;
  }).join('');

  const active=months.filter(x=>x.income||x.expenses||x.saved);
  if(active.length<2){
    annualInsight.textContent='Encore trop peu de données pour comparer tes mois.';
  }else{
    const avgExp=te/active.length;
    const best=months.map((x,i)=>({i,b:x.income-x.expenses-x.saved})).sort((a,b)=>b.b-a.b)[0];
    annualInsight.textContent=`Dépense moyenne : ${eur(avgExp)} par mois. Ton meilleur solde de l’année est en ${new Date(y,best.i,1).toLocaleDateString('fr-BE',{month:'long'})} avec ${eur(best.b)}.`;
  }
}
function addPatrimonyItem(type){
  if(!state.patrimony)state.patrimony={assets:[],debts:[]};
  state.patrimony[type].push({name:type==='assets'?'Nouvel actif':'Nouvelle dette',amount:0});
  save();renderPatrimony();
}
function updatePatrimonyItem(type,index,field,value){
  const item=state.patrimony?.[type]?.[index];if(!item)return;
  item[field]=field==='amount'?(+value||0):String(value);
  save();renderPatrimony();
}
function removePatrimonyItem(type,index){
  state.patrimony?.[type]?.splice(index,1);
  save();renderPatrimony();
}
function patrimonyRow(type,item,i){
  return `<div class="patrimony-row">
    <input value="${String(item.name||'').replace(/"/g,'&quot;')}" onchange="updatePatrimonyItem('${type}',${i},'name',this.value)">
    <input type="number" step="0.01" value="${+item.amount||0}" onchange="updatePatrimonyItem('${type}',${i},'amount',this.value)">
    <button onclick="removePatrimonyItem('${type}',${i})">×</button>
  </div>`;
}
function renderPatrimony(){
  if(!document.getElementById('assetRows'))return;
  if(!state.patrimony)state.patrimony={assets:[],debts:[]};
  assetRows.innerHTML=(state.patrimony.assets||[]).map((x,i)=>patrimonyRow('assets',x,i)).join('');
  debtRows.innerHTML=(state.patrimony.debts||[]).map((x,i)=>patrimonyRow('debts',x,i)).join('');
  const assets=(state.patrimony.assets||[]).reduce((s,x)=>s+(+x.amount||0),0);
  const debts=(state.patrimony.debts||[]).reduce((s,x)=>s+(+x.amount||0),0);
  patrimonyNet.textContent=eur(assets-debts);
}



function runFinancialIntegrityCheck(){
  const issues=[];
  try{
    const s=financialSnapshot();
    const vals=[
      ['revenu',s.realIncome],['dépenses',s.expenses],['épargne',s.actualSaved],
      ['épargne prévue',s.plannedSaved],['récurrents',s.pendingRecurring],
      ['disponible',s.safeAvailable]
    ];
    vals.forEach(([name,v])=>{
      if(!Number.isFinite(Number(v)))issues.push(`${name}: valeur invalide`);
    });

    // Existing savings must never reduce the monthly available amount.
    const existing=(state.savingsEntries||[])
      .filter(e=>e.accountId===state.activeAccount&&String(e.date||'').startsWith(mk())&&e.budgetImpact===false)
      .reduce((sum,e)=>sum+moneyNumber(e.amount),0);
    if(existing && !Number.isFinite(existing))issues.push('épargne existante invalide');

    if(issues.length)console.warn('[Mon Budget] Diagnostic financier:',issues);
  }catch(err){
    console.warn('[Mon Budget] Diagnostic financier impossible:',err);
  }
  return issues;
}

function showDataMigrationNotice(){
  const source=localStorage.getItem('monBudgetLastMigrationSource');
  if(!source)return;
  localStorage.removeItem('monBudgetLastMigrationSource');
  setTimeout(()=>showToast('Tes données existantes ont bien été récupérées ✓'),350);
}

function render(){
  refreshCats();
  applyRecurring();
  accountSelect.innerHTML=state.accounts.map(a=>`<option value="${a.id}" ${a.id===state.activeAccount?'selected':''}>${a.name}</option>`).join('');
  accountSelect.onchange=e=>{state.activeAccount=e.target.value;render()};
  const co=cats.map(c=>`<option>${c}</option>`).join('');eCat.innerHTML=co;rCat.innerHTML=co;filterCat.innerHTML='<option value="">Toutes catégories</option>'+co;if(document.getElementById('tplCat'))tplCat.innerHTML=co;if(document.getElementById('ruleCat'))ruleCat.innerHTML=co;if(document.getElementById('scanCategory'))scanCategory.innerHTML=co;if(document.getElementById('savingDate')&&!savingDate.value)savingDate.value=new Date().toISOString().slice(0,10);
  rDay.innerHTML=Array.from({length:28},(_,i)=>`<option value="${i+1}">Le ${i+1}</option>`).join('');
  tFrom.innerHTML=state.accounts.map(a=>`<option value="${a.id}" ${a.id===state.activeAccount?'selected':''}>${a.name}</option>`).join('');
  tTo.innerHTML=state.accounts.map(a=>`<option value="${a.id}" ${a.id!==state.activeAccount?'selected':''}>${a.name}</option>`).join('');
  month.textContent=fullMonthLabel();

  let a=mo(),inc=a.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0),exp=a.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0),sav=monthlySavedActual(),snap=financialSnapshot(),rem=snap.safeAvailable;
  income.textContent=eur(inc);expenses.textContent=eur(exp);savingReserve.textContent=eur(sav);remaining.textContent=eur(rem);[income,expenses,savingReserve,remaining].forEach(animateNumberEl);const sa=document.getElementById('summaryAvailable'),sf=document.getElementById('summaryForecast');if(sa)sa.textContent=eur(rem);renderPremium(a,inc,exp);
  let p=inc?Math.min(100,exp/inc*100):0;fill.style.width=p+'%';percent.textContent=Math.round(p)+' % des revenus dépensés';
  let tb=cats.reduce((s,c)=>s+(+budgets()[c]||0),0);globalNotice.innerHTML=!tb?'<div class="notice warn">Définis tes budgets pour activer les alertes.</div>':exp/tb<.75?`<div class="notice good">Budget OK · ${eur(tb-exp)} restant.</div>`:exp/tb<=1?`<div class="notice warn">${Math.round(exp/tb*100)} % du budget utilisé.</div>`:`<div class="notice bad">Dépassé de ${eur(exp-tb)}.</div>`;

  let future=snap.pendingRecurring,forecast=snap.safeAvailable;
  forecastAmount.textContent=eur(forecast);forecastText.textContent=`Après ${eur(future)} de charges récurrentes restantes et ${eur(Math.max(snap.plannedSaved,snap.actualSaved))} d’épargne réservée.`;if(sf)sf.textContent=eur(forecast);
  let now=new Date(),same=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth(),last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate(),day=same?now.getDate():1,days=Math.max(1,last-day+1);
  if(same){
    dailyAmount.textContent=eur(Math.max(0,forecast)/days)+' / jour';
    dailyText.textContent=`${days} jours restants dans le mois.`;
  }else{
    dailyAmount.textContent='—';
    dailyText.textContent=view<new Date(now.getFullYear(),now.getMonth(),1)?'Mois clôturé.':'Le rythme quotidien apparaîtra au début de ce mois.';
  }

  renderCats(a);renderFiltered();renderBudgets();renderRecurring();renderGoals();renderStats();renderComparison();renderUpcoming();renderSmartInsights();renderAnomalies();renderCalendar();renderTemplates();renderRules();renderPredictions();renderAutomationSuggestions();renderHeroTrend();renderGoalShowcase();renderMonthlyPilot();renderSavingsModule();renderSavingEnvelopes();renderSavingsHistory();renderMonthlyReport();renderFocusCard();renderCategoryManager();renderAlerts();renderFinalToday();renderPremiumProjection();renderAnnualPremium();renderPatrimony();loadMonthlyPlanInputs();applyDashboardPrefs();renderCloudStatus();
  let td=new Date().toISOString().slice(0,10);if(!eDate.value)eDate.value=td;if(!iDate.value)iDate.value=td;if(!tDate.value)tDate.value=td;save();runFinancialIntegrityCheck();
}
function renderCats(a){
  const totals={};
  a.filter(x=>x.type==='expense').forEach(x=>totals[x.cat]=(totals[x.cat]||0)+x.amount);

  const el=document.getElementById('cats');
  if(!el)return;

  const visible=cats.filter(c=>(totals[c]||0)>0||(budgets()[c]||0)>0);
  if(!visible.length){
    el.innerHTML=emptyState('◌','Aucune dépense ici','Tes dépenses apparaîtront ici dès que tu en ajoutes une.');
    return;
  }

  el.innerHTML=visible.map(c=>{
    const spent=+(totals[c]||0);
    const limit=+(budgets()[c]||0);
    const pct=limit?Math.max(0,Math.min(100,spent/limit*100)):0;
    const remaining=Math.max(0,limit-spent);
    const over=Math.max(0,spent-limit);
    const label=baseDisplayName(c);

    let pillText='Sans plafond';
    let pillClass='';
    let subText='Aucun budget défini pour cette catégorie.';
    let percentText='Libre';

    if(limit>0){
      percentText=Math.round(spent/limit*100)+' % utilisé';
      if(over>0){
        pillText=eur(over)+' dépassé';
        pillClass='bad';
        subText='Budget dépassé sur cette catégorie.';
      }else if(spent/limit>=0.85){
        pillText=eur(remaining)+' restant';
        pillClass='warn';
        subText='Tu approches de la limite prévue.';
      }else{
        pillText=eur(remaining)+' restant';
        pillClass='good';
        subText='Tu restes dans ton budget prévu.';
      }
    }

    return `<div class="cat">
      <div class="row">
        <div class="cat-left">
          <span class="cat-name">${escHTML(label)}</span>
          <span class="cat-sub">${subText}</span>
        </div>
        <div class="cat-amounts">
          <span class="cat-current">${eur(spent)}</span>
          <span class="cat-limit">${limit?('sur '+eur(limit)):'Pas de plafond'}</span>
        </div>
      </div>
      <div class="catbar"><div class="catfill" style="width:${limit?Math.min(100,pct):12}%"></div></div>
      <div class="catfooter">
        <span class="cat-pill ${pillClass}">${pillText}</span>
        <span class="cat-percent">${percentText}</span>
      </div>
    </div>`;
  }).join('');
}
function renderFiltered(){
  let a=mo(),q=(searchInput?.value||'').toLowerCase(),fc=filterCat?.value||'',scope=document.getElementById('filterScope')?.value||'',tag=(document.getElementById('filterTag')?.value||'').toLowerCase(),min=+(document.getElementById('filterMin')?.value||0),max=+(document.getElementById('filterMax')?.value||0);
  a=a.filter(x=>(!q||x.name.toLowerCase().includes(q))&&(!fc||x.cat===fc)&&(!scope||x.scope===scope)&&(!tag||(x.tags||[]).some(t=>t.toLowerCase().includes(tag)))&&(!min||x.amount>=min)&&(!max||x.amount<=max));
  list.innerHTML=a.length?a.slice().reverse().map(x=>`<div class="row"><span><strong>${x.name}</strong><br><span class="muted">${x.date.slice(0,10)} · ${x.cat||'Revenu'}</span><br>${x.scope?`<span class="scopebadge">${x.scope==='pro'?'Pro':'Perso'}</span>`:''}${(x.tags||[]).map(t=>`<span class="tagbadge">${t}</span>`).join('')}</span><span><b class="${x.type==='income'||x.type==='transfer_in'?'income':'danger'}">${x.type==='income'||x.type==='transfer_in'?'+':'−'} ${eur(x.amount)}</b><div class="actions"><button onclick="editOp('${x.id}')">Modifier</button><button onclick="deleteOp('${x.id}')">Suppr.</button></div></span></div>`).join(''):'<div class="muted">Aucune opération.</div>'
}
function renderBudgets(){budgetEditors.innerHTML=cats.map(c=>`<div class="budget-editor"><span>${c}</span><input type="number" data-cat="${c}" value="${budgets()[c]||''}" placeholder="0 €"></div>`).join('')}function saveBudgets(){document.querySelectorAll('[data-cat]').forEach(i=>budgets()[i.dataset.cat]=Math.max(0,+i.value||0));render()}
function addAccount(){let n=newAccountName.value.trim();if(!n)return;let id='acc_'+Date.now();state.accounts.push({id,name:n});state.budgets[id]={};state.activeAccount=id;newAccountName.value='';toggle('accountForm');render()}
function toggle(id){document.getElementById(id).classList.toggle('hidden')}function changeMonth(n){view.setMonth(view.getMonth()+n);render()}function nav(id,b){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('.bottomnav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(id==='stats')renderStats();if(id==='report')renderMonthlyReport()}
function showForm(id,b){document.querySelectorAll('#ops form').forEach(f=>f.style.display='none');document.getElementById(id).style.display='block';document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active')}

expenseForm.onsubmit=e=>{e.preventDefault();const amount=nonNegativeMoney(eAmount.value);if(amount<=0)return showToast('Entre un montant supérieur à 0 €');state.ops.push({id:'op_'+Date.now(),type:'expense',name:eName.value,amount,cat:applyRules(eName.value,eCat.value),nature:eNature.value,scope:eScope.value,tags:eTags.value.split(',').map(x=>x.trim()).filter(Boolean),date:eDate.value+'T12:00:00',accountId:state.activeAccount});e.target.reset();render();showToast('Dépense ajoutée')};
incomeForm.onsubmit=e=>{e.preventDefault();const amount=nonNegativeMoney(iAmount.value);if(amount<=0)return showToast('Entre un montant supérieur à 0 €');state.ops.push({id:'op_'+Date.now(),type:'income',name:iName.value,amount,cat:'',date:iDate.value+'T12:00:00',accountId:state.activeAccount});e.target.reset();render();showToast('Revenu ajouté')};
transferForm.onsubmit=e=>{e.preventDefault();if(tFrom.value===tTo.value)return alert('Choisis deux comptes différents.');let a=nonNegativeMoney(tAmount.value),d=tDate.value,g='tr_'+Date.now();if(a<=0)return showToast('Entre un montant supérieur à 0 €');state.ops.push({id:g+'a',type:'transfer_out',name:'Transfert',amount:a,cat:'Transfert',date:d+'T12:00:00',accountId:tFrom.value,transferGroup:g},{id:g+'b',type:'transfer_in',name:'Transfert',amount:a,cat:'Transfert',date:d+'T12:00:00',accountId:tTo.value,transferGroup:g});e.target.reset();render()};
function deleteOp(id){
  state.ops=state.ops.filter(x=>x.id!==id);save();render();
}
function editOp(id){
  const x=state.ops.find(o=>o.id===id);if(!x)return;
  const n=prompt('Nom',x.name);if(n===null)return;
  const raw=prompt('Montant',x.amount);if(raw===null)return;
  const amount=nonNegativeMoney(raw);
  if(amount<=0)return showToast('Entre un montant supérieur à 0 €');
  x.name=n.trim()||x.name;
  x.amount=amount;
  save();render();showToast('Opération modifiée');
}

function addRecurring(){let n=rName.value.trim(),a=nonNegativeMoney(rAmount.value);if(!n||a<=0)return;state.recurring.push({id:'rec_'+Date.now(),name:n,amount:a,cat:rCat.value,day:Math.round(clampNumber(rDay.value,1,28)),accountId:state.activeAccount});rName.value='';rAmount.value='';render()}
function renderRecurring(){recurringList.innerHTML=state.recurring.filter(r=>r.accountId===state.activeAccount).map(r=>`<div class="rec"><div class="goalhead"><span><strong>${r.name}</strong><br><span class="muted">${r.cat} · le ${r.day}</span></span><b>${eur(r.amount)}</b></div><div class="actions"><button onclick="deleteRecurring('${r.id}')">Supprimer</button></div></div>`).join('')||'<div class="muted">Aucune dépense récurrente.</div>'}
function deleteRecurring(id){state.recurring=state.recurring.filter(r=>r.id!==id);render()}
function applyRecurring(){
  const k=mk();
  const now=new Date();
  const isCurrent=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const isPast=view < new Date(now.getFullYear(),now.getMonth(),1);
  const today=isCurrent?now.getDate():0;
  let changed=false;

  (state.recurring||[]).forEach(r=>{
    const due=isPast || (isCurrent && nonNegativeMoney(r.day||1)<=today);
    if(!due)return;
    if(state.ops.some(x=>x.recurringId===r.id&&x.accountId===r.accountId&&String(x.date||'').startsWith(k)))return;
    const d=String(Math.min(Math.max(1,Math.round(nonNegativeMoney(r.day)||1)),new Date(view.getFullYear(),view.getMonth()+1,0).getDate())).padStart(2,'0');
    state.ops.push({
      id:'op_'+Date.now()+Math.random(),type:'expense',name:r.name,amount:nonNegativeMoney(r.amount),
      cat:r.cat,nature:'fixed',date:k+'-'+d+'T12:00:00',
      accountId:r.accountId,recurringId:r.id,scope:'personal',tags:[]
    });
    changed=true;
  });
  if(changed)save();
}
function addGoal(){let n=gName.value.trim(),t=+gTarget.value||0;if(!n||!t)return;state.goals.push({id:'g_'+Date.now(),name:n,target:t,saved:+gSaved.value||0,monthly:+gMonthly.value||0,targetDate:gDate.value||''});gName.value='';gTarget.value='';gSaved.value='';gMonthly.value='';gDate.value='';render();showToast('Objectif ajouté')}
function renderGoals(){goalsList.innerHTML=state.goals.map(g=>{let p=Math.min(100,(g.saved/g.target)*100||0);return `<div class="goal"><div class="goalhead"><span><strong>${g.name}</strong><br><span class="muted">${eur(g.saved)} / ${eur(g.target)} · ${eur(g.monthly)}/mois</span></span><b>${Math.round(p)}%</b></div><div class="progress"><div style="width:${p}%"></div></div><div class="actions"><button onclick="addGoalMoney('${g.id}')">+ Ajouter</button><button onclick="deleteGoal('${g.id}')">Supprimer</button></div></div>`}).join('')||emptyState('◎','Aucun objectif','Ajoute un premier objectif pour suivre ta progression.')}
function addGoalMoney(id){
  const g=state.goals.find(x=>x.id===id);if(!g)return;
  const raw=prompt('Montant ajouté');
  if(raw===null)return;
  const amount=+raw||0;if(amount<=0)return;
  const date=entryDateForView();
  state.savingsEntries.push({
    id:'sav_'+Date.now(),amount,date,note:`Ajout à ${g.name}`,
    goalId:g.id,envelopeId:'',freeBalanceTracked:false,budgetImpact:true,savingsOrigin:'monthly',accountId:state.activeAccount
  });
  g.saved=Math.min(+g.target||Infinity,(+g.saved||0)+amount);
  save();render();showToast('Épargne ajoutée à l’objectif');
}
function deleteGoal(id){
  if(!confirm('Supprimer cet objectif ? L’historique d’épargne sera conservé.'))return;
  state.goals=state.goals.filter(g=>g.id!==id);
  state.savingsEntries.forEach(e=>{if(e.goalId===id)e.goalId=''});
  save();render();showToast('Objectif supprimé');
}
function startOfDay(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function startOfWeek(d){
  const x=startOfDay(d);
  const day=(x.getDay()+6)%7;
  x.setDate(x.getDate()-day);
  return x;
}
function startOfMonth(d){const x=startOfDay(d);x.setDate(1);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function addMonths(d,n){const x=new Date(d);x.setMonth(x.getMonth()+n);return x}
function fmtDayLabel(d){return d.toLocaleDateString('fr-BE',{day:'2-digit',month:'2-digit'})}
function fmtMonthLabel(d){return d.toLocaleDateString('fr-BE',{month:'short'})}
function getWeekNumber(date){
  const d=startOfDay(date);
  d.setDate(d.getDate()+4-((d.getDay()+6)%7));
  const yearStart=new Date(d.getFullYear(),0,1);
  return Math.ceil((((d-yearStart)/86400000)+1)/7);
}
function weekLabel(d){return `S${String(getWeekNumber(d)).padStart(2,'0')}`}
function buildBuckets(start,end,grouping){
  let buckets=[];
  if(grouping==='day'){
    for(let d=startOfDay(start);d<=end;d=addDays(d,1)){
      const s=startOfDay(d),e=new Date(s);e.setHours(23,59,59,999);
      buckets.push({label:fmtDayLabel(s),start:new Date(s),end:e,total:0,ops:[]});
    }
  }else if(grouping==='week'){
    for(let d=startOfWeek(start);d<=end;d=addDays(d,7)){
      const s=startOfWeek(d),e=addDays(s,6);e.setHours(23,59,59,999);
      buckets.push({label:weekLabel(s),start:new Date(s),end:e,total:0,ops:[]});
    }
  }else{
    for(let d=startOfMonth(start);d<=end;d=addMonths(d,1)){
      const s=startOfMonth(d),e=addMonths(s,1);e.setMilliseconds(-1);
      buckets.push({label:fmtMonthLabel(s),start:new Date(s),end:e,total:0,ops:[]});
    }
  }
  return buckets.filter(b=>b.end>=start && b.start<=end);
}
function detectStatsGrouping(days,mode){
  if(mode && mode!=='auto')return mode;
  if(days<=14)return 'day';
  if(days<=120)return 'week';
  return 'month';
}
function renderStats(){
  const periodEl=document.getElementById('statsPeriod');
  const groupingEl=document.getElementById('statsGrouping');
  const chartEl=document.getElementById('chart');
  if(!periodEl||!chartEl)return;

  const days=+(periodEl.value||180);
  const grouping=detectStatsGrouping(days, groupingEl?.value||'auto');

  const end=new Date(); end.setHours(23,59,59,999);
  const start=startOfDay(addDays(end,-(days-1)));

  const ops=(state.ops||[])
    .filter(x=>x.accountId===state.activeAccount)
    .filter(x=>{
      const dt=new Date(x.date);
      return !Number.isNaN(dt.getTime()) && dt>=start && dt<=end;
    });
  const expenseOps=ops.filter(x=>x.type==='expense');
  const buckets=buildBuckets(start,end,grouping);

  expenseOps.forEach(op=>{
    const dt=new Date(op.date);
    const bucket=buckets.find(b=>dt>=b.start && dt<=b.end);
    if(bucket){
      bucket.total+=(+op.amount||0);
      bucket.ops.push(op);
    }
  });

  const avgLabelMap={day:'Moyenne / jour',week:'Moyenne / semaine',month:'Moyenne / mois'};
  const worstLabelMap={day:'Jour le + cher',week:'Semaine la + chère',month:'Mois le + cher'};
  const chartTitleMap={day:'Dépenses par jour',week:'Dépenses par semaine',month:'Dépenses par mois'};

  const avgLabel=document.getElementById('avgExpensesLabel');
  const worstLabel=document.getElementById('worstMonthLabel');
  const chartTitle=document.getElementById('statsChartTitle');
  if(avgLabel)avgLabel.textContent=avgLabelMap[grouping];
  if(worstLabel)worstLabel.textContent=worstLabelMap[grouping];
  if(chartTitle)chartTitle.textContent=chartTitleMap[grouping];

  const totalExpenses=buckets.reduce((s,b)=>s+b.total,0);
  avgExpenses.textContent=eur(totalExpenses/Math.max(1,buckets.length));

  const worst=buckets.slice().sort((a,b)=>b.total-a.total)[0];
  worstMonth.textContent=worst&&worst.total?worst.label:'—';

  let ct={};
  expenseOps.forEach(x=>ct[x.cat]=(ct[x.cat]||0)+(+x.amount||0));
  let top=Object.entries(ct).sort((a,b)=>b[1]-a[1])[0];
  topCategory.textContent=top?top[0]:'—';

  let first=buckets[0]?.total||0,last=buckets[buckets.length-1]?.total||0;
  trend.textContent=first?(((last-first)/first*100)>=0?'+':'')+Math.round((last-first)/first*100)+' %':'—';

  if(!expenseOps.length){
    chartEl.innerHTML=`<div class="empty-state" style="width:100%">
      <div class="empty-icon">◌</div>
      <strong>Pas encore assez de données</strong>
      <small>Ajoute des dépenses pour voir l’évolution sur la période choisie.</small>
    </div>`;
    return;
  }

  const max=Math.max(1,...buckets.map(b=>b.total));
  chartEl.innerHTML=buckets.map(b=>`<div class="barcol"><i style="height:${Math.max(3,b.total/max*130)}px"></i>${b.label}<br>${Math.round(b.total)}€</div>`).join('');
}
async function enableNotifications(){
  const status=document.getElementById('notificationStatus');
  if(!('Notification'in window)){
    if(status)status.textContent='Notifications non prises en charge sur cet appareil.';
    return showToast('Notifications non prises en charge');
  }
  const p=await Notification.requestPermission();
  if(p==='granted'){
    const alerts=buildAlerts();
    if(alerts.length&&navigator.serviceWorker?.ready){
      const reg=await navigator.serviceWorker.ready;
      await reg.showNotification('Mon Budget',{body:alerts[0].title+' — '+alerts[0].text,icon:'./icon-192.png'});
    }
    if(status)status.textContent='Notifications autorisées.';
    showToast('Notifications activées');
  }else{
    if(status)status.textContent='Autorisation refusée.';
    showToast('Notifications non autorisées');
  }
}



function setAuthMessage(message,type='warn'){
  setGateAuthMessage(message,type);
  const ids=['accountModeBanner','authDiagnostic'];
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.className='notice '+(type==='good'?'good':'warn');
    el.textContent=message;
  });
}

function goToAccountSettings(){
  const btn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('settings'"));
  if(btn)nav('settings',btn);
  setTimeout(()=>document.querySelector('.account-access-card')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
}
function authRedirectUrl(){
  if(location.protocol==='http:'||location.protocol==='https:') return location.origin+location.pathname;
  return 'https://delcourtdav03-bit.github.io/Mon-budget/';
}
function setGateAuthMessage(message,type='warn'){
  const el=document.getElementById('gateAuthMessage');
  if(!el)return;
  el.className='auth-gate-message '+(type==='good'?'good':'warn');
  el.textContent=message||'';
}
function syncVisibleAuthFields(){
  const email=(document.getElementById('visibleAuthEmail')?.value||'').trim();
  const pass=document.getElementById('visibleAuthPassword')?.value||'';
  if(document.getElementById('authEmail'))authEmail.value=email;
  if(document.getElementById('gateEmail'))gateEmail.value=email;
  if(document.getElementById('authPassword'))authPassword.value=pass;
  if(document.getElementById('gatePassword'))gatePassword.value=pass;
  return {email,pass};
}
async function visibleSignIn(){
  const {email,pass}=syncVisibleAuthFields();
  if(!cloudConfigured){
    showToast('Connexion prête : configure Supabase pour l’activer.');
    return false;
  }
  return doSignIn(email,pass);
}
async function visibleSignUp(){
  const {email,pass}=syncVisibleAuthFields();
  if(!cloudConfigured){
    const msg=(window.supabase
      ? 'Configuration Supabase incomplète.'
      : 'La librairie Supabase ne s’est pas chargée dans ce preview. Teste la version hébergée sur GitHub Pages.');
    setAuthMessage(msg,'warn');
    showToast(msg);
    return false;
  }
  setAuthMessage('Création du compte en cours…','warn');
  return doSignUp(email,pass);
}
async function visibleResetPassword(){
  const email=(document.getElementById('visibleAuthEmail')?.value||'').trim();
  if(!cloudConfigured){
    showToast('Réinitialisation prête : configure Supabase pour l’activer.');
    return false;
  }
  return requestReset(email);
}
function renderVisibleAccountUI(){
  const banner=document.getElementById('accountModeBanner');
  const out=document.getElementById('accountLoggedOutUI');
  const inn=document.getElementById('accountLoggedInUI');
  const email=document.getElementById('visibleProfileEmail');
  const homeStatus=document.getElementById('homeAccountStatus');
  const homeText=document.getElementById('homeAccountText');

  if(currentUser){
    out?.classList.add('hidden');
    inn?.classList.remove('hidden');
    if(email)email.textContent=currentUser.email||'Compte';
    if(banner){banner.className='notice good';banner.textContent='Compte connecté — synchronisation privée active.'}
    if(homeStatus)homeStatus.textContent='Compte connecté';
    if(homeText)homeText.textContent=currentUser.email||'Synchronisation active';
  }else{
    out?.classList.remove('hidden');
    inn?.classList.add('hidden');
    if(cloudConfigured){
      if(banner){banner.className='notice warn';banner.textContent='Cloud configuré — connecte-toi ou crée ton compte.'}
      if(homeStatus)homeStatus.textContent='Non connecté';
      if(homeText)homeText.textContent='Ton cloud est prêt. Connecte-toi pour synchroniser tes données.';
    }else{
      if(banner){banner.className='notice warn';banner.textContent='Mode démo : interface prête. Configure Supabase pour activer les comptes.'}
      if(homeStatus)homeStatus.textContent='Mode local';
      if(homeText)homeText.textContent='L’interface de connexion est prête mais le cloud n’est pas encore activé.';
    }
  }
}

async function initCloud(){
  if(!cloudConfigured){showAuthGate(false);renderCloudStatus();return}
  const {data}=await sb.auth.getSession();currentUser=data.session?.user||null;
  sb.auth.onAuthStateChange(async(event,session)=>{
    currentUser=session?.user||null;renderCloudStatus();
    if(currentUser&&(event==='SIGNED_IN'||event==='INITIAL_SESSION'))await loadUserWorkspace();
    if(event==='SIGNED_OUT'){state=blankState();render();showAuthGate(true)}
    if(event==='PASSWORD_RECOVERY'){
      const p=prompt('Nouveau mot de passe (6 caractères minimum)');
      if(p&&p.length>=6){const {error}=await sb.auth.updateUser({password:p});showToast(error?error.message:'Mot de passe mis à jour')}
    }
  });
  renderCloudStatus();
  if(currentUser){await loadUserWorkspace();showAuthGate(false)}else showAuthGate(true)
}
function blankState(){return {accounts:[{id:'main',name:'Compte principal'}],activeAccount:'main',ops:[],budgets:{main:{}},recurring:[],goals:[],monthlyPlans:{},dashboardPrefs:{donut:true,insights:true,anomalies:true,upcoming:true,predictions:true},templates:[],rules:[],savingsEntries:[],savingsEnvelopes:[],freeSavingsBalances:{},freeSavingsMovements:[],uxPrefs:{compact:false},customCategories:[],categoryRenames:{}}}
function normalizeState(x){x=x&&typeof x==='object'?x:blankState();if(!x.accounts?.length)x.accounts=[{id:'main',name:'Compte principal'}];if(!x.activeAccount)x.activeAccount=x.accounts[0].id;if(!x.ops)x.ops=[];if(!x.budgets)x.budgets={main:{}};if(!x.recurring)x.recurring=[];if(!x.goals)x.goals=[];if(!x.monthlyPlans)x.monthlyPlans={};if(!x.dashboardPrefs)x.dashboardPrefs={donut:true,insights:true,anomalies:true,upcoming:true,predictions:true};if(!x.templates)x.templates=[];if(!x.rules)x.rules=[];if(!x.savingsEntries)x.savingsEntries=[];if(!x.savingsEnvelopes)x.savingsEnvelopes=[];if(!x.freeSavingsBalances)x.freeSavingsBalances={};if(!x.freeSavingsMovements)x.freeSavingsMovements=[];if(!x.patrimony)x.patrimony={assets:[{name:'Compte courant',amount:0},{name:'Épargne',amount:0}],debts:[]};if(!x.uxPrefs)x.uxPrefs={compact:false};if(!x.customCategories)x.customCategories=[];if(!x.categoryRenames)x.categoryRenames={};x.ops=x.ops.map(o=>({...o,accountId:o.accountId||'main',scope:o.scope||'personal',tags:Array.isArray(o.tags)?o.tags:[]}));x=migrateSavingsImpactV1(x);x=stabilizeFinancialData(x);return x}
function showAuthGate(v){document.getElementById('authGate')?.classList.toggle('hidden',!v)}
async function loadUserWorkspace(){if(!currentUser)return;const cached=localStorage.getItem(userCacheKey());if(cached){try{state=normalizeState(JSON.parse(cached));render()}catch(e){}}await pullCloud(true)}
function renderCloudStatus(){
  renderVisibleAccountUI();
  const el=document.getElementById('cloudStatus');const tg=document.getElementById('autoSyncToggle');if(tg)tg.checked=autoSync;
  if(!el)return;
  if(!cloudConfigured){el.className='notice warn';el.textContent='Supabase non configuré — mode local';showAuthGate(false);return}
  if(currentUser){el.className='notice good';el.textContent='Connecté : '+currentUser.email;showAuthGate(false)}
  else{el.className='notice warn';el.textContent='Connecte-toi pour ouvrir ton espace privé';showAuthGate(true)}
}
async function doSignUp(email,password){
  if(!cloudConfigured){
    const msg='Supabase n’est pas disponible dans cet environnement.';
    setAuthMessage(msg,'warn');showToast(msg);return false;
  }
  if(!email||!password){
    const msg='Entre une adresse email et un mot de passe.';
    setAuthMessage(msg,'warn');showToast(msg);return false;
  }
  if(password.length<6){
    const msg='Le mot de passe doit contenir au moins 6 caractères.';
    setAuthMessage(msg,'warn');showToast(msg);return false;
  }
  try{
    const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:authRedirectUrl()}});
    if(error){
      const msg='Création impossible : '+error.message;
      setAuthMessage(msg,'warn');showToast(msg);return false;
    }
    if(data?.session){
      currentUser=data.user;
      localStorage.setItem(userCacheKey(),JSON.stringify(normalizeState(state)));
      await pushCloud(true);
      showAuthGate(false);renderCloudStatus();
      setAuthMessage('Compte créé et connecté ✅','good');
      showToast('Compte créé ✨');
    }else{
      setAuthMessage('Compte créé ✅ Vérifie maintenant ton email pour confirmer ton compte.','good');
      showToast('Compte créé. Vérifie ton email.');
    }
    return true;
  }catch(err){
    const msg='Erreur réseau/Supabase : '+(err?.message||String(err));
    setAuthMessage(msg,'warn');showToast(msg);return false;
  }
}
async function doSignIn(email,password){
  if(!cloudConfigured){
    const msg='Supabase n’est pas disponible dans cet environnement.';
    setAuthMessage(msg,'warn');showToast(msg);return false;
  }
  if(!email||!password){
    const msg='Entre ton email et ton mot de passe.';
    setAuthMessage(msg,'warn');showToast(msg);return false;
  }
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error){
      const msg='Connexion impossible : '+error.message;
      setAuthMessage(msg,'warn');showToast(msg);return false;
    }
    currentUser=data.user;
    await loadUserWorkspace();
    renderCloudStatus();renderVisibleAccountUI();showAuthGate(false);
    setAuthMessage('Compte connecté ✅','good');
    showToast('Bienvenue 👋');
    return true;
  }catch(err){
    const msg='Erreur réseau/Supabase : '+(err?.message||String(err));
    setAuthMessage(msg,'warn');showToast(msg);return false;
  }
}
async function signUp(){const e=document.getElementById('authEmail');const p=document.getElementById('authPassword');return doSignUp((e?.value||'').trim(),p?.value||'')}
async function signIn(){const e=document.getElementById('authEmail');const p=document.getElementById('authPassword');return doSignIn((e?.value||'').trim(),p?.value||'')}
async function gateSignUp(){const e=document.getElementById('gateEmail');const p=document.getElementById('gatePassword');setGateAuthMessage('Création du compte en cours…','warn');return doSignUp((e?.value||'').trim(),p?.value||'')}
async function gateSignIn(){const e=document.getElementById('gateEmail');const p=document.getElementById('gatePassword');setGateAuthMessage('Connexion en cours…','warn');return doSignIn((e?.value||'').trim(),p?.value||'')}
async function requestReset(email){if(!cloudConfigured){setGateAuthMessage('Supabase indisponible.','warn');return showToast('Supabase indisponible')}if(!email){setGateAuthMessage('Entre ton email.','warn');return showToast('Entre ton email')}const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl()});const msg=error?('Réinitialisation impossible : '+error.message):'Email de réinitialisation envoyé ✅';setGateAuthMessage(msg,error?'warn':'good');showToast(msg)}
async function resetPassword(){const e=document.getElementById('authEmail');return requestReset((e?.value||'').trim())}
async function gateResetPassword(){const e=document.getElementById('gateEmail');return requestReset((e?.value||'').trim())}
async function signOut(){if(!cloudConfigured)return;if(currentUser)await pushCloud(true);await sb.auth.signOut()}
async function pushCloud(silent=false){if(!cloudConfigured||!currentUser){if(!silent)showToast('Connecte-toi');return}const {error}=await sb.from('budget_snapshots').upsert({user_id:currentUser.id,data:state,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error){if(!silent)showToast('Erreur cloud : '+error.message);return}localStorage.setItem(userCacheKey(),JSON.stringify(state));if(document.getElementById('syncInfo'))syncInfo.textContent='Dernière synchro : '+new Date().toLocaleString('fr-BE');if(!silent)showToast('Budget sauvegardé')}
async function pullCloud(silent=false){if(!cloudConfigured||!currentUser){if(!silent)showToast('Connecte-toi');return}const {data,error}=await sb.from('budget_snapshots').select('data,updated_at').eq('user_id',currentUser.id).maybeSingle();if(error){if(!silent)showToast('Erreur cloud : '+error.message);return}if(data?.data){state=normalizeState(data.data);localStorage.setItem(userCacheKey(),JSON.stringify(state));render();if(document.getElementById('syncInfo'))syncInfo.textContent='Données à jour : '+new Date(data.updated_at).toLocaleString('fr-BE')}else{state=normalizeState(state);await pushCloud(true);if(document.getElementById('syncInfo'))syncInfo.textContent='Premier espace cloud créé'}}
function download(c,n,t){let b=new Blob([c],{type:t}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=n;a.click();URL.revokeObjectURL(u)}
function exportBackup(){download(JSON.stringify(state,null,2),'mon_budget_v9_sauvegarde.json','application/json')}
function importBackup(f){if(!f)return;let r=new FileReader();r.onload=()=>{try{state=normalizeState(JSON.parse(r.result));refreshCats();render();save()}catch(e){alert('Fichier invalide')}};r.readAsText(f)}
function exportCSV(){let rows=[['Compte','Type','Nom','Montant','Catégorie','Nature','Date']];state.ops.forEach(x=>rows.push([state.accounts.find(a=>a.id===x.accountId)?.name||'Compte',x.type,x.name,x.amount,x.cat||'',x.nature||'',x.date.slice(0,10)]));download('\ufeff'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n'),'mon_budget_v9.csv','text/csv')}

render();initCloud();setupOnboarding();initPrivacy();


showDataMigrationNotice();

window.addEventListener('error',function(ev){try{setGateAuthMessage('Erreur de l’application : '+(ev.message||'inconnue'),'warn')}catch(e){}});
window.addEventListener('unhandledrejection',function(ev){try{setGateAuthMessage('Erreur réseau/application : '+(ev.reason?.message||String(ev.reason||'inconnue')),'warn')}catch(e){}});
