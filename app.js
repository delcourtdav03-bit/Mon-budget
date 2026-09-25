

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
      day:Math.round(clampNumber(r?.day||1,1,31))
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
if(!state.accounts)state.accounts=[{id:'main',name:'Compte principal'}];if(!state.activeAccount)state.activeAccount='main';if(!state.budgets)state.budgets={};if(!state.recurring)state.recurring=[];if(!state.goals)state.goals=[];if(!state.monthlyPlans)state.monthlyPlans={};if(!state.dashboardPrefs)state.dashboardPrefs={donut:true,insights:true,anomalies:true,upcoming:true,predictions:true};if(!state.templates)state.templates=[];if(!state.rules)state.rules=[];if(!state.savingsEntries)state.savingsEntries=[];if(!state.savingsEnvelopes)state.savingsEnvelopes=[];if(!state.freeSavingsBalances)state.freeSavingsBalances={};if(!state.freeSavingsMovements)state.freeSavingsMovements=[];if(!state.patrimony)state.patrimony={assets:[{name:'Compte courant',amount:0},{name:'Épargne',amount:0}],debts:[]};if(!state.uxPrefs)state.uxPrefs={compact:false};if(!state.customCategories)state.customCategories=[];if(!state.categoryRenames)state.categoryRenames={};if(!state.recurringSkips||typeof state.recurringSkips!=='object')state.recurringSkips={};
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
let authGateDismissed=sessionStorage.getItem('monBudgetAuthGateDismissed')==='1';
let autoSync=localStorage.getItem('monBudgetAutoSync')===null?true:localStorage.getItem('monBudgetAutoSync')==='1';
let syncTimer=null;

function userCacheKey(){return currentUser?`monBudgetV23:user:${currentUser.id}`:KEY}
function save(){
  const key=userCacheKey();
  const serialized=JSON.stringify(state);
  let previous=null;
  try{previous=localStorage.getItem(key)}catch(e){}
  if(previous===serialized)return false;
  try{localStorage.setItem(key,serialized)}catch(e){console.warn('[Mon Budget] Sauvegarde locale impossible',e);return false}
  updateDailyPersonalSafetySnapshot(serialized);
  if(autoSync&&cloudConfigured&&currentUser){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>pushCloud(true),900);
  }
  return true;
}
function budgets(){return state.budgets[state.activeAccount]||(state.budgets[state.activeAccount]={})}
function mk(d=view){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function mo(){return monthActuals(mk(),state.activeAccount).ops}
function monthlySave(){return state.goals.reduce((s,g)=>s+(+g.monthly||0),0)}
function recTotal(){return state.recurring.filter(r=>r.accountId===state.activeAccount).reduce((s,r)=>s+nonNegativeMoney(r.amount),0)}
function fullMonthLabel(){let s=view.toLocaleDateString('fr-BE',{month:'long',year:'numeric'});return s[0].toUpperCase()+s.slice(1)}


function monthRelation(key){
  const m=String(key||'').match(/^(\d{4})-(\d{2})$/);
  if(!m)return 'unknown';
  const target=new Date(Number(m[1]),Number(m[2])-1,1);
  const now=new Date();
  const current=new Date(now.getFullYear(),now.getMonth(),1);
  if(target<current)return 'past';
  if(target>current)return 'future';
  return 'current';
}
function recurringSkipToken(recurringId,key){
  return `${recurringId}:${key}`;
}

function calendarMonthKey(date=new Date()){
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
}
function validRecurringDayForMonth(recurring,key=mk()){
  const m=String(key||'').match(/^(\d{4})-(\d{2})$/);
  const year=m?Number(m[1]):view.getFullYear();
  const month=m?Number(m[2])-1:view.getMonth();
  const lastDay=new Date(year,month+1,0).getDate();
  return Math.max(1,Math.min(lastDay,Math.round(nonNegativeMoney(recurring?.day)||1)));
}

function isRecurringSkipped(recurringId,key){
  return !!state.recurringSkips?.[recurringSkipToken(recurringId,key)];
}
function markRecurringSkipped(recurringId,key){
  if(!recurringId)return;
  if(!state.recurringSkips||typeof state.recurringSkips!=='object')state.recurringSkips={};
  state.recurringSkips[recurringSkipToken(recurringId,key)]=true;
}



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
  const pair=monthComparisonPair();
  const cur=pair.current.expenses;
  const prev=pair.previous.expenses;
  const deltaEl=document.getElementById('monthDelta'), textEl=document.getElementById('monthDeltaText'), scoreEl=document.getElementById('budgetScore');
  if(prev>0){
    const pct=(cur-prev)/prev*100;
    deltaEl.textContent=(pct>0?'+':'')+Math.round(pct)+' %';
    deltaEl.style.color=pct<=0?'#87e3a7':'#ffaaa4';
    textEl.textContent=pair.sameDay
      ?(pct<=0?`Moins dépensé qu’au même jour le mois dernier`:`Plus dépensé qu’au même jour le mois dernier`)
      :(pct<=0?'Tu dépenses moins que le mois précédent':'Tu dépenses plus que le mois précédent');
  }else{
    deltaEl.textContent='—';
    deltaEl.style.color='';
    textEl.textContent='Pas encore assez de données';
  }
  // Same health score as the monthly report: one meaning everywhere.
  const score=scoreMonth(monthDataForKey(mk()));
  scoreEl.textContent=score+' %';
  const wrap=document.getElementById('budgetScoreWrap');
  const tone=score<40?'critical':score<55?'low':score<70?'mid':score<85?'good':'excellent';
  if(wrap)wrap.className='hero-score-chip score-'+tone;
  scoreEl.className='score-value score-'+tone;
}
function upcomingTimelineData(){
  const key=mk();
  const relation=monthRelation(key);
  const snap=financialSnapshot();
  const now=new Date();
  const lastDay=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
  const today=relation==='current'?now.getDate():1;

  const monthOps=monthActuals(key,state.activeAccount).ops;
  const appliedIds=new Set(
    monthOps
      .filter(o=>o.recurringId)
      .map(o=>o.recurringId)
  );

  let rows=(state.recurring||[])
    .filter(r=>
      r.accountId===state.activeAccount &&
      !appliedIds.has(r.id) &&
      !isRecurringSkipped(r.id,key)
    )
    .map(r=>{
      const day=validRecurringDayForMonth(r,key);
      const date=new Date(view.getFullYear(),view.getMonth(),day,12,0,0,0);
      const daysAway=relation==='current'?day-today:(relation==='future'?day:null);
      return {
        ...r,
        day,
        date,
        daysAway,
        amount:nonNegativeMoney(r.amount)
      };
    })
    .sort((a,b)=>a.day-b.day || a.name.localeCompare(b.name,'fr'));

  if(relation==='past')rows=[];

  const total=rows.reduce((s,r)=>s+r.amount,0);
  const next7=relation==='current'
    ?rows.filter(r=>r.daysAway>=0&&r.daysAway<=7).reduce((s,r)=>s+r.amount,0)
    :relation==='future'
      ?rows.filter(r=>r.day<=7).reduce((s,r)=>s+r.amount,0)
      :0;

  // safeAvailable already contains every pending recurring charge.
  // Add them back once to reconstruct the balance immediately BEFORE
  // the timeline, then subtract them progressively.
  const beforeKnownCharges=snap.safeAvailable+total;
  let cumulative=0;
  rows=rows.map(r=>{
    cumulative+=r.amount;
    return {
      ...r,
      afterBalance:snap.incomeBase>0?beforeKnownCharges-cumulative:null
    };
  });

  return {
    key,relation,snap,today,lastDay,rows,total,next7,
    beforeKnownCharges,
    afterAll:snap.incomeBase>0?snap.safeAvailable:null
  };
}

function upcomingDueLabel(row,relation){
  if(relation==='future'){
    if(row.day===1)return 'Dès le 1er';
    return `Le ${row.day}`;
  }
  if(relation!=='current')return `Le ${row.day}`;
  if(row.daysAway<0)return 'Échéance passée';
  if(row.daysAway===0)return 'Aujourd’hui';
  if(row.daysAway===1)return 'Demain';
  return `Dans ${row.daysAway} jours`;
}

function upcomingTone(row,data){
  if(row.afterBalance!==null && row.afterBalance<0)return 'danger';
  if(data.relation==='current' && row.daysAway<=1)return 'urgent';
  if(data.relation==='current' && row.daysAway<=3)return 'warn';
  return 'good';
}

function renderUpcoming(){
  const el=document.getElementById('upcomingList');
  if(!el)return;
  const d=upcomingTimelineData();

  if(d.relation==='past'){
    el.innerHTML='<div class="muted">Mois clôturé · aucune charge future à afficher.</div>';
    return;
  }

  if(!d.rows.length){
    el.innerHTML='<div class="muted">Aucune charge récurrente restante pour ce mois.</div>';
    return;
  }

  el.innerHTML=d.rows.slice(0,3).map(r=>`
    <div class="upcoming">
      <div class="datepill">${r.day}</div>
      <div class="upcoming-main">
        <strong>${escHTML(r.name)}</strong>
        <div class="muted">${escHTML(upcomingDueLabel(r,d.relation))}</div>
      </div>
      <b>${eur(r.amount)}</b>
    </div>
  `).join('');
}

function openUpcomingTimeline(){
  const planBtn=[...document.querySelectorAll('.bottomnav button')]
    .find(b=>b.getAttribute('onclick')?.includes("nav('plan'"));
  if(planBtn)nav('plan',planBtn);
  setTimeout(()=>{
    document.getElementById('upcomingTimelineCard')
      ?.scrollIntoView({behavior:'smooth',block:'start'});
  },90);
}

function scrollToRecurringEditor(){
  document.getElementById('recurringEditorCard')
    ?.scrollIntoView({behavior:'smooth',block:'start'});
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
  const el=document.getElementById('calendarList');
  if(!el)return;

  const d=upcomingTimelineData();
  const set=(id,value)=>{
    const node=document.getElementById(id);
    if(node)node.textContent=value;
  };

  set('upcomingTotal',eur(d.total));
  set('upcomingCount',`${d.rows.length} échéance${d.rows.length>1?'s':''}`);
  set('upcomingNext7',eur(d.next7));

  const next7Text=document.getElementById('upcomingNext7Text');
  if(next7Text){
    if(d.relation==='past')next7Text.textContent='Mois clôturé';
    else if(d.next7>0)next7Text.textContent=d.relation==='current'?'À réserver cette semaine':'Prévu en début de mois';
    else next7Text.textContent='Aucune charge proche';
  }

  set('upcomingAfterAll',d.afterAll===null?'—':eur(d.afterAll));

  const status=document.getElementById('upcomingTimelineStatus');
  if(status){
    status.className='upcoming-month-chip';
    if(d.relation==='past'){
      status.textContent='Clôturé';
    }else if(!d.rows.length){
      status.textContent='Rien à venir';
      status.classList.add('good');
    }else if(d.rows.some(r=>r.afterBalance!==null&&r.afterBalance<0)){
      status.textContent='À corriger';
      status.classList.add('danger');
    }else if(d.relation==='current'&&d.rows.some(r=>r.daysAway<=3)){
      status.textContent='Échéance proche';
      status.classList.add('warn');
    }else{
      status.textContent=d.relation==='future'?'Prévu':'Sous contrôle';
      status.classList.add('good');
    }
  }

  const reserve=document.getElementById('upcomingReserveNote');
  if(reserve){
    if(d.snap.fixedPlanGap>0){
      reserve.classList.remove('hidden');
      reserve.innerHTML=`<span>◎</span><div><strong>${eur(d.snap.fixedPlanGap)} déjà réservés</strong><small>Charges fixes prévues mais pas encore détaillées dans les récurrents.</small></div>`;
    }else{
      reserve.classList.add('hidden');
      reserve.innerHTML='';
    }
  }

  if(d.relation==='past'){
    el.innerHTML=`<div class="upcoming-timeline-empty">
      <span>✓</span>
      <div><strong>Mois clôturé</strong><small>Cette timeline affiche uniquement les charges encore à venir.</small></div>
    </div>`;
    return;
  }

  if(!d.rows.length){
    el.innerHTML=`<div class="upcoming-timeline-empty">
      <span>✓</span>
      <div><strong>Aucune charge restante</strong><small>Ajoute une dépense récurrente si tu veux la voir apparaître ici.</small></div>
    </div>`;
    return;
  }

  el.innerHTML=d.rows.map((r,i)=>{
    const tone=upcomingTone(r,d);
    const dateLabel=r.date.toLocaleDateString('fr-BE',{weekday:'short',day:'numeric',month:'short'}).replace('.','');
    const due=upcomingDueLabel(r,d.relation);
    const after=r.afterBalance===null?'Plan de revenu à définir':`Après : ${eur(r.afterBalance)}`;
    return `<div class="upcoming-timeline-row ${tone}">
      <div class="upcoming-timeline-line">
        <i></i>
        ${i<d.rows.length-1?'<em></em>':''}
      </div>
      <div class="upcoming-timeline-date">
        <b>${r.day}</b>
        <span>${r.date.toLocaleDateString('fr-BE',{month:'short'}).replace('.','')}</span>
      </div>
      <div class="upcoming-timeline-main">
        <div class="upcoming-timeline-title">
          <strong>${escHTML(r.name)}</strong>
          <span>${eur(r.amount)}</span>
        </div>
        <div class="upcoming-timeline-meta">
          <span>${escHTML(r.cat||'Autres')}</span>
          <span>·</span>
          <span>${escHTML(due)}</span>
          <span class="desktop-date">· ${escHTML(dateLabel)}</span>
        </div>
        <div class="upcoming-after ${r.afterBalance!==null&&r.afterBalance<0?'negative':''}">
          ${escHTML(after)}
        </div>
      </div>
    </div>`;
  }).join('');
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
    const learned=smartEntrySuggestion(data.merchant||'');
    if(learned && learned.confidence>=.78 && learned.category && [...scanCategory.options].some(o=>o.value===learned.category||o.textContent===learned.category))scanCategory.value=learned.category;
    renderScanSmartHint();
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



function smartForecastModel(){
  const snap=financialSnapshot();
  const key=mk();
  const now=new Date();
  const currentMonth=new Date(now.getFullYear(),now.getMonth(),1);
  const viewedMonth=new Date(view.getFullYear(),view.getMonth(),1);
  const same=viewedMonth.getTime()===currentMonth.getTime();
  const past=viewedMonth<currentMonth;
  const lastDay=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
  const day=same?Math.max(1,now.getDate()):(past?lastDay:1);
  const remainingDays=same?Math.max(0,lastDay-day):lastDay;
  const safeDays=same?Math.max(1,lastDay-day+1):lastDay;

  const monthOps=(state.ops||[]).filter(o=>
    o.accountId===state.activeAccount &&
    monthKeyFromDate(o.date)===key
  );
  const expenseOps=monthOps.filter(o=>o.type==='expense');
  const variableOps=expenseOps.filter(o=>o.nature!=='fixed');
  const variableSpent=variableOps.reduce((s,o)=>s+nonNegativeMoney(o.amount),0);
  const monthRate=day>0?variableSpent/day:0;

  // Recent 7-day signal: useful when spending accelerates late in the month.
  const recentCut=same?new Date(now.getFullYear(),now.getMonth(),Math.max(1,day-6)):null;
  const recentOps=same?variableOps.filter(o=>{
    const d=new Date(String(o.date||'').slice(0,10)+'T12:00:00');
    return Number.isFinite(d.getTime()) && d>=recentCut && d<=now;
  }):[];
  const recentDays=same?Math.min(7,day):0;
  const recentSpent=recentOps.reduce((s,o)=>s+nonNegativeMoney(o.amount),0);
  const recentRate=recentDays>0?recentSpent/recentDays:0;

  // Blend long-term month pace with the latest week.
  // We require a little history before letting recent spending dominate.
  let weightedRate=monthRate;
  if(same && day>=8 && variableOps.length>=4){
    weightedRate=monthRate*.58+recentRate*.42;
  }

  // Keep one extreme week from completely destabilising the forecast.
  if(monthRate>0){
    weightedRate=Math.max(monthRate*.45,Math.min(weightedRate,monthRate*2.2));
  }

  const likelyFutureVariable=weightedRate*remainingDays;
  const conservativeRate=Math.max(weightedRate,monthRate,recentRate)*1.12;
  const favorableRate=Math.max(0,Math.min(weightedRate,monthRate||weightedRate)*.82);

  const likelyEnd=snap.safeAvailable-likelyFutureVariable;
  const conservativeEnd=snap.safeAvailable-(conservativeRate*remainingDays);
  const favorableEnd=snap.safeAvailable-(favorableRate*remainingDays);
  const safeDaily=snap.safeAvailable>0?snap.safeAvailable/safeDays:0;

  // Confidence depends on elapsed time, amount of observations, and historical months.
  let historyMonths=0;
  for(let i=1;i<=6;i++){
    const d=new Date(view.getFullYear(),view.getMonth()-i,1);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const hist=monthActuals(k,state.activeAccount);
    if(hist.ops.some(o=>o.type==='expense'))historyMonths++;
  }
  let confidenceScore=0;
  if(same){
    confidenceScore+=Math.min(40,day/lastDay*40);
    confidenceScore+=Math.min(35,variableOps.length*4);
    confidenceScore+=Math.min(25,historyMonths*5);
  }else if(past){
    confidenceScore=100;
  }else{
    confidenceScore=Math.min(55,historyMonths*9 + (snap.p?.income?15:0) + (state.recurring?.length?10:0));
  }
  const confidence=confidenceScore>=72?'Élevée':confidenceScore>=42?'Moyenne':'Faible';

  // Category pressure + acceleration.
  const byCat={};
  variableOps.forEach(o=>{
    const cat=o.cat||'Autres';
    byCat[cat]=(byCat[cat]||0)+nonNegativeMoney(o.amount);
  });

  const categoryRisks=[];
  Object.entries(byCat).forEach(([cat,spent])=>{
    const limit=nonNegativeMoney(budgets()[cat]);
    const projected=day>0?spent/day*lastDay:spent;
    if(limit>0 && projected>limit*1.03){
      categoryRisks.push({
        type:'budget',
        cat,spent,limit,projected,
        severity:(projected-limit)/limit
      });
    }
  });
  categoryRisks.sort((a,b)=>b.severity-a.severity);

  const accelerations=[];
  if(same && day>=10){
    const recentStart=Math.max(1,day-6);
    const priorDays=Math.max(1,recentStart-1);
    const recentByCat={},priorByCat={};

    variableOps.forEach(o=>{
      const opDay=Number(String(o.date||'').slice(8,10))||1;
      const cat=o.cat||'Autres';
      const amount=nonNegativeMoney(o.amount);
      if(opDay>=recentStart) recentByCat[cat]=(recentByCat[cat]||0)+amount;
      else priorByCat[cat]=(priorByCat[cat]||0)+amount;
    });

    Object.keys(recentByCat).forEach(cat=>{
      const rRate=(recentByCat[cat]||0)/Math.min(7,day);
      const pRate=(priorByCat[cat]||0)/priorDays;
      if(rRate>=3 && pRate>0 && rRate>pRate*1.35){
        accelerations.push({
          cat,
          recentRate:rRate,
          priorRate:pRate,
          pct:(rRate/pRate-1)*100,
          recentSpent:recentByCat[cat]
        });
      }
    });
    accelerations.sort((a,b)=>b.pct-a.pct);
  }

  // Current financial risk.
  let risk='Faible';
  if(snap.safeAvailable<0 || likelyEnd<0)risk='Élevé';
  else if(conservativeEnd<0 || likelyEnd<Math.max(80,snap.incomeBase*.05))risk='Moyen';

  return {
    same,past,lastDay,day,remainingDays,safeDays,
    snap,variableSpent,monthRate,recentRate,weightedRate,
    likelyFutureVariable,likelyEnd,conservativeEnd,favorableEnd,safeDaily,
    confidence,confidenceScore,historyMonths,variableOps,
    categoryRisks,accelerations,risk
  };
}

function renderPredictions(){
  const el=document.getElementById('predictionList');
  if(!el)return;
  const f=smartForecastModel();

  const set=(id,value)=>{
    const node=document.getElementById(id);
    if(node)node.textContent=value;
  };

  set('smartForecastConfidence',`Confiance ${f.confidence.toLowerCase()}`);

  if(f.same){
    set('smartSafeDaily',eur(Math.max(0,f.safeDaily))+'/j');
    set('smartSafeDailyText',f.snap.safeAvailable>=0
      ?`${f.safeDays} jour${f.safeDays>1?'s':''} à couvrir après réserves`
      :'Budget prudent déjà négatif');

    set('smartLikelyEnd',eur(f.likelyEnd));
    set('smartLikelyEndText',f.risk==='Élevé'
      ?'Risque de finir sous zéro'
      :`Risque ${f.risk.toLowerCase()} selon ton rythme`);

    set('smartCurrentPace',eur(f.weightedRate)+'/j');
    const paceDelta=f.monthRate>0?((f.recentRate/f.monthRate)-1)*100:0;
    set('smartCurrentPaceText',
      f.recentRate>0 && Math.abs(paceDelta)>=10
        ?`${paceDelta>0?'+':'−'}${Math.abs(Math.round(paceDelta))} % sur les 7 derniers jours`
        :'Rythme récent proche de la moyenne');

    set('smartConservativeEnd',eur(f.conservativeEnd));
    set('smartConservativeText','Inclut une marge de prudence de 12 %');

    const low=Math.min(f.conservativeEnd,f.likelyEnd,f.favorableEnd);
    const high=Math.max(f.conservativeEnd,f.likelyEnd,f.favorableEnd);
    set('smartForecastRange',`${eur(low)} → ${eur(high)}`);
    set('smartForecastUpdated',`Basé sur ${f.variableOps.length} dépense${f.variableOps.length>1?'s':''} variable${f.variableOps.length>1?'s':''}`);

    const fill=document.getElementById('smartForecastRangeFill');
    const marker=document.getElementById('smartForecastRangeMarker');
    if(fill){
      const span=Math.max(1,Math.abs(high-low));
      const zeroPos=Math.max(0,Math.min(100,(0-low)/span*100));
      fill.style.width='100%';
      fill.style.setProperty('--zero-pos',zeroPos+'%');
      fill.classList.toggle('negative-range',low<0);
    }
    if(marker){
      const span=Math.max(1,high-low);
      const pos=Math.max(3,Math.min(97,(f.likelyEnd-low)/span*100));
      marker.style.left=pos+'%';
    }

    const rows=[];

    if(f.snap.safeAvailable<0){
      rows.push({
        cls:'dangerx',
        icon:'!',
        title:'Budget prudent déjà dépassé',
        text:`Il manque actuellement ${eur(Math.abs(f.snap.safeAvailable))} après avoir réservé l’épargne et les charges à venir.`
      });
    }else if(f.likelyEnd<0){
      rows.push({
        cls:'dangerx',
        icon:'↘',
        title:'Fin de mois sous pression',
        text:`À ton rythme actuel, la projection probable arrive à ${eur(f.likelyEnd)}. Pour rester à zéro ou plus, vise environ ${eur(f.safeDaily)} maximum par jour.`
      });
    }else{
      rows.push({
        cls:'goodx',
        icon:'✓',
        title:'Repère quotidien',
        text:`Tu peux utiliser environ ${eur(f.safeDaily)} par jour tout en gardant les réserves déjà prévues.`
      });
    }

    if(f.accelerations.length){
      const a=f.accelerations[0];
      rows.push({
        cls:'warnx',
        icon:'↑',
        title:`${a.cat} accélère`,
        text:`Le rythme des 7 derniers jours est environ ${Math.round(a.pct)} % plus élevé qu’au début du mois.`
      });
    }

    if(f.categoryRisks.length){
      const c=f.categoryRisks[0];
      rows.push({
        cls:'warnx',
        icon:'◎',
        title:`Budget ${c.cat} à risque`,
        text:`Projection ${eur(c.projected)} pour un plafond de ${eur(c.limit)} (${eur(Math.max(0,c.projected-c.limit))} au-dessus).`
      });
    }

    if(f.snap.pendingRecurring>0){
      rows.push({
        cls:'',
        icon:'⌛',
        title:'Charges encore à passer',
        text:`${eur(f.snap.pendingRecurring)} de dépenses récurrentes sont déjà réservées dans le calcul.`
      });
    }

    if(f.snap.savingsStillToReserve>0){
      rows.push({
        cls:'',
        icon:'◇',
        title:'Épargne encore réservée',
        text:`${eur(f.snap.savingsStillToReserve)} restent protégés pour ton objectif d’épargne du mois.`
      });
    }

    if(f.confidence==='Faible'){
      rows.push({
        cls:'',
        icon:'i',
        title:'Prévision encore jeune',
        text:'Quelques jours et opérations supplémentaires rendront l’estimation plus fiable.'
      });
    }

    el.innerHTML=rows.slice(0,5).map(r=>`<div class="prediction smart-prediction ${r.cls}">
      <div class="smart-prediction-icon">${r.icon}</div>
      <div><strong>${escHTML(r.title)}</strong><p>${escHTML(r.text)}</p></div>
    </div>`).join('');
    return;
  }

  if(f.past){
    set('smartSafeDaily','—');
    set('smartSafeDailyText','Mois clôturé');
    set('smartLikelyEnd',eur(f.snap.safeAvailable));
    set('smartLikelyEndText','Solde prudent constaté');
    set('smartCurrentPace',eur(f.monthRate)+'/j');
    set('smartCurrentPaceText','Rythme variable du mois clôturé');
    set('smartConservativeEnd','—');
    set('smartConservativeText','Projection terminée');
    set('smartForecastRange',eur(f.snap.safeAvailable));
    set('smartForecastUpdated','Données clôturées');

    el.innerHTML=`<div class="prediction smart-prediction ${f.snap.safeAvailable<0?'dangerx':'goodx'}">
      <div class="smart-prediction-icon">${f.snap.safeAvailable<0?'!':'✓'}</div>
      <div><strong>Bilan clôturé</strong><p>${f.snap.safeAvailable<0
        ?`Le mois s’est terminé avec un déficit prudent de ${eur(Math.abs(f.snap.safeAvailable))}.`
        :`Le mois s’est terminé avec ${eur(f.snap.safeAvailable)} de marge prudente.`}</p></div>
    </div>`;
    return;
  }

  // Future month: only plan-based information, no fake daily extrapolation.
  set('smartSafeDaily',f.snap.safeAvailable>0?eur(f.snap.safeAvailable/f.lastDay)+'/j':'—');
  set('smartSafeDailyText','Repère basé sur ton plan');
  set('smartLikelyEnd',eur(f.snap.safeAvailable));
  set('smartLikelyEndText','Après réserves connues');
  set('smartCurrentPace','—');
  set('smartCurrentPaceText','Le rythme réel commencera avec les dépenses');
  set('smartConservativeEnd','—');
  set('smartConservativeText','Pas encore assez de données');
  set('smartForecastRange','Planification');
  set('smartForecastUpdated','Mois futur');

  el.innerHTML=`<div class="prediction smart-prediction">
    <div class="smart-prediction-icon">◎</div>
    <div><strong>Mois à venir</strong><p>La projection utilise uniquement ton revenu prévu, ton épargne planifiée et les charges récurrentes connues. Elle deviendra dynamique dès les premières dépenses.</p></div>
  </div>`;
}



function normalizeMerchantLabel(value){
  return String(value||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\b(paiement|payment|carte|cb|bancontact|visa|mastercard|paypal|sumup|terminal|achat|be)\b/g,' ')
    .replace(/[*#_/.,;:()[\]{}'"`~!?+-]+/g,' ')
    .replace(/\b\d{2,}\b/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function merchantKey(value){
  const n=normalizeMerchantLabel(value);
  if(!n)return '';
  const words=n.split(' ').filter(w=>w.length>1);
  return words.slice(0,3).join(' ');
}

function merchantSimilarity(a,b){
  const x=merchantKey(a),y=merchantKey(b);
  if(!x||!y)return 0;
  if(x===y)return 1;
  if(x.includes(y)||y.includes(x))return .88;
  const A=new Set(x.split(' ')),B=new Set(y.split(' '));
  const common=[...A].filter(t=>B.has(t)).length;
  const total=new Set([...A,...B]).size;
  return total?common/total:0;
}

function historicalExpenseOps(){
  return (state.ops||[]).filter(x=>
    x.accountId===state.activeAccount &&
    x.type==='expense' &&
    nonNegativeMoney(x.amount)>0
  );
}

function learnedMerchantProfiles(){
  const ops=historicalExpenseOps();
  const groups=[];

  ops.forEach(op=>{
    const key=merchantKey(op.name);
    if(!key)return;
    let g=groups.find(x=>merchantSimilarity(x.key,key)>=.88);
    if(!g){
      g={key,label:op.name,ops:[]};
      groups.push(g);
    }
    g.ops.push(op);
    if(String(op.name||'').length<String(g.label||'').length)g.label=op.name;
  });

  return groups.map(g=>{
    const cats={},natures={},scopes={},amounts=[];
    g.ops.forEach(op=>{
      if(op.cat)cats[op.cat]=(cats[op.cat]||0)+1;
      if(op.nature)natures[op.nature]=(natures[op.nature]||0)+1;
      if(op.scope)scopes[op.scope]=(scopes[op.scope]||0)+1;
      amounts.push(nonNegativeMoney(op.amount));
    });
    const winner=obj=>Object.entries(obj).sort((a,b)=>b[1]-a[1])[0]||['',0];
    const [cat,catCount]=winner(cats);
    const [nature,natureCount]=winner(natures);
    const [scope,scopeCount]=winner(scopes);
    const avg=amounts.length?amounts.reduce((s,v)=>s+v,0)/amounts.length:0;
    const sorted=amounts.slice().sort((a,b)=>a-b);
    const median=sorted.length?sorted[Math.floor(sorted.length/2)]:0;
    const catConfidence=g.ops.length?catCount/g.ops.length:0;
    const natureConfidence=g.ops.length?natureCount/g.ops.length:0;
    const months=[...new Set(g.ops.map(o=>String(o.date||'').slice(0,7)).filter(Boolean))];
    const latest=g.ops.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];

    return {
      key:g.key,
      label:g.label,
      count:g.ops.length,
      months:months.length,
      cat,
      nature:nature||'variable',
      scope:scope||'personal',
      avg,
      median,
      catConfidence,
      natureConfidence,
      latestDate:latest?.date||''
    };
  }).sort((a,b)=>b.count-a.count || b.latestDate.localeCompare(a.latestDate));
}

function merchantProfileFor(name){
  const profiles=learnedMerchantProfiles();
  let best=null,bestScore=0;
  profiles.forEach(p=>{
    const score=merchantSimilarity(name,p.key);
    if(score>bestScore){
      best=p;bestScore=score;
    }
  });
  if(!best || bestScore<.62)return null;
  return {...best,matchScore:bestScore};
}

function smartEntrySuggestion(name){
  const manualRule=(state.rules||[]).find(r=>
    normalizeMerchantLabel(name).includes(normalizeMerchantLabel(r.keyword))
  );
  const profile=merchantProfileFor(name);

  if(manualRule){
    return {
      source:'rule',
      category:manualRule.cat,
      nature:profile?.nature||'variable',
      scope:profile?.scope||'personal',
      amount:profile?.median||0,
      label:profile?.label||name,
      confidence:1,
      count:profile?.count||0
    };
  }

  if(!profile)return null;
  return {
    source:'history',
    category:profile.cat,
    nature:profile.nature,
    scope:profile.scope,
    amount:profile.median,
    label:profile.label,
    confidence:Math.min(1,(profile.catConfidence*.65)+(Math.min(profile.count,5)/5*.35)),
    count:profile.count
  };
}

function applyExpenseSmartSuggestion(){
  const s=smartEntrySuggestion(document.getElementById('eName')?.value||'');
  if(!s)return showToast('Pas encore assez d’historique');
  const cat=document.getElementById('eCat');
  const nature=document.getElementById('eNature');
  const scope=document.getElementById('eScope');
  const amount=document.getElementById('eAmount');

  if(cat && s.category && [...cat.options].some(o=>o.value===s.category||o.textContent===s.category))cat.value=s.category;
  if(nature && s.nature)nature.value=s.nature;
  if(scope && s.scope)scope.value=s.scope;
  if(amount && !amount.value && s.amount>0)amount.placeholder=`Habituel : ${eur(s.amount)}`;
  renderExpenseSmartHint();
  showToast('Habitude appliquée');
}

function renderExpenseSmartHint(){
  const box=document.getElementById('expenseSmartHint');
  const name=document.getElementById('eName')?.value?.trim()||'';
  if(!box)return;
  const s=name.length>=2?smartEntrySuggestion(name):null;
  if(!s){
    box.classList.add('hidden');
    box.innerHTML='';
    return;
  }
  const conf=s.source==='rule'?'Règle enregistrée':s.confidence>=.82?'Confiance élevée':'Suggestion';
  box.innerHTML=`<div class="smart-hint-icon">✦</div>
    <div class="smart-hint-main">
      <small>${conf}</small>
      <strong>${escHTML(s.label||name)} → ${escHTML(s.category||'Autres')}</strong>
      <span>${s.count?`${s.count} opération${s.count>1?'s':''} reconnue${s.count>1?'s':''}`:'Règle manuelle'}${s.amount?` · habituel ${eur(s.amount)}`:''}</span>
    </div>
    <button type="button" onclick="applyExpenseSmartSuggestion()">Appliquer</button>`;
  box.classList.remove('hidden');
}

function applyScanSmartSuggestion(){
  const name=document.getElementById('scanMerchant')?.value||'';
  const s=smartEntrySuggestion(name);
  if(!s)return;
  const cat=document.getElementById('scanCategory');
  const scope=document.getElementById('scanScope');
  if(cat && s.category && [...cat.options].some(o=>o.value===s.category||o.textContent===s.category))cat.value=s.category;
  if(scope && s.scope)scope.value=s.scope;
  renderScanSmartHint();
}

function renderScanSmartHint(){
  const box=document.getElementById('scanSmartHint');
  const name=document.getElementById('scanMerchant')?.value?.trim()||'';
  if(!box)return;
  const s=name.length>=2?smartEntrySuggestion(name):null;
  if(!s){
    box.classList.add('hidden');
    box.innerHTML='';
    return;
  }
  box.innerHTML=`<div class="smart-hint-icon">✦</div>
    <div class="smart-hint-main">
      <small>Reconnu dans ton historique</small>
      <strong>${escHTML(s.category||'Autres')}</strong>
      <span>${s.count||0} opération${s.count===1?'':'s'} similaire${s.count===1?'':'s'}</span>
    </div>
    <button type="button" onclick="applyScanSmartSuggestion()">Utiliser</button>`;
  box.classList.remove('hidden');
}

function smartRuleCandidates(){
  const existing=(state.rules||[]).map(r=>normalizeMerchantLabel(r.keyword));
  return learnedMerchantProfiles()
    .filter(p=>p.count>=2 && p.cat && p.catConfidence>=.8)
    .filter(p=>!existing.some(k=>k && (p.key.includes(k)||k.includes(p.key))))
    .map(p=>({
      type:'rule',
      key:p.key,
      name:p.label,
      cat:p.cat,
      count:p.count,
      confidence:p.catConfidence
    }));
}

function recurringCandidates(){
  const ops=historicalExpenseOps();
  const groups=[];

  ops.forEach(op=>{
    const key=merchantKey(op.name);
    if(!key)return;
    let g=groups.find(x=>merchantSimilarity(x.key,key)>=.88);
    if(!g){g={key,label:op.name,ops:[]};groups.push(g)}
    g.ops.push(op);
  });

  const out=[];
  groups.forEach(g=>{
    if(g.ops.length<2)return;
    const months=[...new Set(g.ops.map(x=>String(x.date||'').slice(0,7)))];
    if(months.length<2)return;

    const already=(state.recurring||[]).some(r=>merchantSimilarity(r.name,g.key)>=.82);
    if(already)return;

    const arr=g.ops.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const amounts=arr.map(x=>nonNegativeMoney(x.amount));
    const avg=amounts.reduce((s,v)=>s+v,0)/amounts.length;
    const spread=Math.max(...amounts)-Math.min(...amounts);
    const amountStable=avg>0 && spread<=Math.max(3,avg*.16);

    const days=arr.map(x=>Number(String(x.date||'').slice(8,10))||1);
    const dayAvg=days.reduce((s,v)=>s+v,0)/days.length;
    const daySpread=Math.max(...days)-Math.min(...days);
    const dayStable=daySpread<=7;

    if(!amountStable && !dayStable)return;

    const latest=arr[arr.length-1];
    let confidence=.45;
    confidence+=Math.min(.24,(months.length-2)*.08);
    if(amountStable)confidence+=.18;
    if(dayStable)confidence+=.13;

    out.push({
      type:'recurring',
      name:latest.name||g.label,
      amount:Math.round(avg*100)/100,
      cat:latest.cat||'Autres',
      day:Math.max(1,Math.min(28,Math.round(dayAvg))),
      months:months.length,
      confidence:Math.min(.98,confidence)
    });
  });

  return out.sort((a,b)=>b.confidence-a.confidence);
}

function automationSuggestionPool(){
  const recurring=recurringCandidates();
  const rules=smartRuleCandidates();

  return [
    ...recurring.map(x=>({...x,priority:x.confidence+.15})),
    ...rules.map(x=>({...x,priority:x.confidence}))
  ].sort((a,b)=>b.priority-a.priority);
}

function acceptSmartRule(key){
  const c=(window._automationPool||[]).find(x=>x.type==='rule'&&x.key===key);
  if(!c)return;
  if(!(state.rules||[]).some(r=>normalizeMerchantLabel(r.keyword)===normalizeMerchantLabel(c.key))){
    state.rules.push({id:'rule_'+Date.now(),keyword:c.key,cat:c.cat});
  }
  save();render();
  showToast(`Règle ${c.name} → ${c.cat} mémorisée`);
}

function acceptRecurringByKey(name){
  const c=(window._automationPool||[]).find(x=>x.type==='recurring'&&x.name===name);
  if(!c)return;
  state.recurring.push({
    id:'rec_'+Date.now(),
    name:c.name,
    amount:c.amount,
    cat:c.cat,
    day:c.day,
    accountId:state.activeAccount
  });
  save();render();
  showToast(`${c.name} ajouté aux récurrents`);
}

function dismissAutomationSuggestion(type,key){
  if(!state.automationDismissed)state.automationDismissed=[];
  const token=`${type}:${key}`;
  if(!state.automationDismissed.includes(token))state.automationDismissed.push(token);
  save();render();
}


function acceptAutomationSuggestionAt(index){
  const c=(window._automationPool||[])[Number(index)];
  if(!c)return;
  if(c.type==='recurring')return acceptRecurringByKey(c.name);
  if(c.type==='rule')return acceptSmartRule(c.key);
}
function dismissAutomationSuggestionAt(index){
  const c=(window._automationPool||[])[Number(index)];
  if(!c)return;
  return dismissAutomationSuggestion(c.type,c.type==='recurring'?c.name:c.key);
}

function renderAutomationSuggestions(){
  const el=document.getElementById('automationSuggestions');
  if(!el)return;

  const profiles=learnedMerchantProfiles().filter(p=>p.count>=2);
  const recurring=recurringCandidates();
  const pool=automationSuggestionPool().filter(x=>{
    const token=x.type==='rule'?`rule:${x.key}`:`recurring:${x.name}`;
    return !(state.automationDismissed||[]).includes(token);
  });
  window._automationPool=pool;

  const chip=document.getElementById('automationLearningChip');
  const learned=document.getElementById('learnedMerchantCount');
  const detected=document.getElementById('detectedRecurringCount');
  const rules=document.getElementById('activeRuleCount');
  if(chip)chip.textContent=profiles.length>=5?'Mémoire active':profiles.length?'Apprentissage':'À découvrir';
  if(learned)learned.textContent=profiles.length;
  if(detected)detected.textContent=recurring.length;
  if(rules)rules.textContent=(state.rules||[]).length;

  if(!pool.length){
    el.innerHTML=`<div class="automation-empty">
      <div>✓</div>
      <strong>Rien à valider</strong>
      <span>L’app continue d’apprendre à partir de tes opérations sans modifier tes données toute seule.</span>
    </div>`;
    return;
  }

  el.innerHTML=pool.slice(0,5).map((c,i)=>{
    if(c.type==='recurring'){
      const conf=Math.round(c.confidence*100);
      return `<div class="automation-suggestion">
        <div class="automation-suggestion-icon">↻</div>
        <div class="automation-suggestion-main">
          <small>Récurrent probable · ${conf} %</small>
          <strong>${escHTML(c.name)}</strong>
          <span>≈ ${eur(c.amount)} autour du ${c.day} · ${escHTML(c.cat)}</span>
          <div class="automation-actions">
            <button onclick="acceptAutomationSuggestionAt(${i})">Ajouter aux récurrents</button>
            <button class="ghost" onclick="dismissAutomationSuggestionAt(${i})">Ignorer</button>
          </div>
        </div>
      </div>`;
    }
    return `<div class="automation-suggestion">
      <div class="automation-suggestion-icon">✦</div>
      <div class="automation-suggestion-main">
        <small>Habitude reconnue · ${Math.round(c.confidence*100)} %</small>
        <strong>Mémoriser ${escHTML(c.name)} → ${escHTML(c.cat)}</strong>
        <span>${c.count} opérations classées de la même façon.</span>
        <div class="automation-actions">
          <button onclick="acceptAutomationSuggestionAt(${i})">Mémoriser</button>
          <button class="ghost" onclick="dismissAutomationSuggestionAt(${i})">Ignorer</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderLearnedMerchants(){
  const el=document.getElementById('learnedMerchantList');
  if(!el)return;
  const profiles=learnedMerchantProfiles().filter(p=>p.count>=2).slice(0,8);
  if(!profiles.length){
    el.innerHTML='<div class="muted">Pas encore assez d’historique. Après quelques dépenses répétées, les habitudes apparaîtront ici.</div>';
    return;
  }

  el.innerHTML=profiles.map(p=>`<div class="learned-merchant-row">
    <div class="learned-merchant-icon">${(p.label||'?').trim().charAt(0).toUpperCase()}</div>
    <div class="learned-merchant-main">
      <strong>${escHTML(p.label)}</strong>
      <span>${escHTML(p.cat||'Autres')} · ${p.nature==='fixed'?'Fixe':'Variable'} · habituel ${eur(p.median)}</span>
    </div>
    <div class="learned-confidence">
      <b>${p.count}×</b>
      <small>${Math.round(p.catConfidence*100)} %</small>
    </div>
  </div>`).join('');
}


function renderHeroTrend(){
  const el=document.getElementById('heroTrend');if(!el)return;
  const pair=monthComparisonPair();
  const cur=pair.current.expenses;
  const prev=pair.previous.expenses;
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
let onboardingDraft={
  income:0,
  incomeReceived:false,
  fixed:0,
  savings:0,
  budgets:{Courses:0,Transport:0,Loisirs:0,Shopping:0,Enfant:0,Autres:0}
};

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

function onboardingHasExistingBudget(){
  const plan=state.monthlyPlans?.[mk()];
  const hasPlan=plan && (nonNegativeMoney(plan.income)>0||nonNegativeMoney(plan.fixed)>0||nonNegativeMoney(plan.savings)>0);
  const hasOps=(state.ops||[]).some(o=>o.accountId===state.activeAccount);
  const hasSavings=(state.savingsEntries||[]).some(o=>o.accountId===state.activeAccount);
  const hasRecurring=(state.recurring||[]).some(o=>o.accountId===state.activeAccount);
  const hasBudgets=Object.values(state.budgets?.[state.activeAccount]||{}).some(v=>nonNegativeMoney(v)>0);
  return !!(hasPlan||hasOps||hasSavings||hasRecurring||hasBudgets);
}

function onboardingResetDraft(prefill=false){
  const plan=prefill?(state.monthlyPlans?.[mk()]||{}):{};
  const b=prefill?(state.budgets?.[state.activeAccount]||{}):{};
  onboardingDraft={
    income:nonNegativeMoney(plan.income),
    incomeReceived:false,
    fixed:nonNegativeMoney(plan.fixed),
    savings:nonNegativeMoney(plan.savings),
    budgets:{
      Courses:nonNegativeMoney(b.Courses),
      Transport:nonNegativeMoney(b.Transport),
      Loisirs:nonNegativeMoney(b.Loisirs),
      Shopping:nonNegativeMoney(b.Shopping),
      Enfant:nonNegativeMoney(b.Enfant),
      Autres:nonNegativeMoney(b.Autres)
    }
  };
  onboardingStep=1;
}

function onboardingSyncDraftFromUI(){
  const val=id=>nonNegativeMoney(document.getElementById(id)?.value);
  if(document.getElementById('obIncome'))onboardingDraft.income=val('obIncome');
  if(document.getElementById('obIncomeReceived'))onboardingDraft.incomeReceived=!!document.getElementById('obIncomeReceived').checked;
  if(document.getElementById('obFixedTotal'))onboardingDraft.fixed=val('obFixedTotal');
  if(document.getElementById('obSavings'))onboardingDraft.savings=val('obSavings');

  const map={
    Courses:'obBudgetCourses',Transport:'obBudgetTransport',Loisirs:'obBudgetLoisirs',
    Shopping:'obBudgetShopping',Enfant:'obBudgetEnfant',Autres:'obBudgetAutres'
  };
  Object.entries(map).forEach(([cat,id])=>{
    const el=document.getElementById(id);
    if(el)onboardingDraft.budgets[cat]=nonNegativeMoney(el.value);
  });
}

function onboardingFillUI(){
  const set=(id,value)=>{
    const el=document.getElementById(id);
    if(el)el.value=value>0?Number(value.toFixed(2)):'';
  };
  set('obIncome',onboardingDraft.income);
  const received=document.getElementById('obIncomeReceived');
  if(received)received.checked=!!onboardingDraft.incomeReceived;
  set('obFixedTotal',onboardingDraft.fixed);
  set('obSavings',onboardingDraft.savings);
  set('obBudgetCourses',onboardingDraft.budgets.Courses);
  set('obBudgetTransport',onboardingDraft.budgets.Transport);
  set('obBudgetLoisirs',onboardingDraft.budgets.Loisirs);
  set('obBudgetShopping',onboardingDraft.budgets.Shopping);
  set('obBudgetEnfant',onboardingDraft.budgets.Enfant);
  set('obBudgetAutres',onboardingDraft.budgets.Autres);
}

function setupOnboarding(){
  const done=localStorage.getItem('monBudgetOnboardingDone')==='1';
  const el=document.getElementById('onboarding');
  if(!el)return;

  // Existing users are never interrupted by a new onboarding version.
  if(!done && onboardingHasExistingBudget()){
    localStorage.setItem('monBudgetOnboardingDone','1');
    el.classList.add('hidden');
    return;
  }

  onboardingResetDraft(false);
  onboardingFillUI();
  updateOnboardingUI();

  if(!done)el.classList.remove('hidden');
}

function restartOnboarding(){
  onboardingResetDraft(true);
  onboardingFillUI();
  updateOnboardingUI();
  document.getElementById('onboarding')?.classList.remove('hidden');
}

function onboardingStepMeta(step){
  return {
    1:['Revenus','Ton revenu mensuel sert de base à tout le reste.'],
    2:['Charges fixes','On protège d’abord les dépenses incompressibles.'],
    3:['Épargne','On réserve ce que tu veux vraiment mettre de côté.'],
    4:['Budgets','On donne des repères aux dépenses variables.'],
    5:['Résumé','Ton budget est prêt à démarrer.']
  }[step]||['Configuration',''];
}

function updateOnboardingUI(){
  onboardingSyncDraftFromUI();

  for(let i=1;i<=5;i++){
    document.getElementById('onboardStep'+i)?.classList.toggle('hidden',i!==onboardingStep);
  }

  const progress=document.getElementById('onboardProgress');
  if(progress)progress.style.width=(onboardingStep/5*100)+'%';

  const meta=onboardingStepMeta(onboardingStep);
  const label=document.getElementById('onboardStepLabel');
  const name=document.getElementById('onboardStepName');
  if(label)label.textContent=`Étape ${onboardingStep} sur 5`;
  if(name)name.textContent=meta[0];

  const back=document.getElementById('onboardBack');
  if(back){
    back.disabled=onboardingStep===1;
    back.style.visibility=onboardingStep===1?'hidden':'visible';
  }

  const next=document.getElementById('onboardNext');
  if(next)next.textContent=onboardingStep===5?'Ouvrir mon budget':'Continuer';

  renderOnboardingLiveData();
  clearOnboardingError();
}

function clearOnboardingError(){
  const el=document.getElementById('onboardError');
  if(!el)return;
  el.classList.add('hidden');
  el.textContent='';
}

function showOnboardingError(message){
  const el=document.getElementById('onboardError');
  if(!el)return;
  el.textContent=message;
  el.classList.remove('hidden');
}

function onboardingVariableRoom(){
  return Math.max(0,onboardingDraft.income-onboardingDraft.fixed-onboardingDraft.savings);
}

function onboardingBudgetTotal(){
  return Object.values(onboardingDraft.budgets||{}).reduce((s,v)=>s+nonNegativeMoney(v),0);
}

function renderOnboardingLiveData(){
  onboardingSyncDraftFromUI();

  const variable=onboardingVariableRoom();
  const room=document.getElementById('obVariableRoom');
  if(room)room.textContent=eur(variable);

  const savingsHint=document.getElementById('onboardSavingsHint');
  if(savingsHint){
    if(!onboardingDraft.income){
      savingsHint.textContent='Entre ton revenu pour obtenir un repère.';
      savingsHint.className='onboard-live-hint';
    }else{
      const pct=onboardingDraft.savings/onboardingDraft.income*100;
      const after=Math.max(0,onboardingDraft.income-onboardingDraft.fixed-onboardingDraft.savings);
      savingsHint.textContent=`${Math.round(pct)} % du revenu · ${eur(after)} resteraient après charges fixes et épargne.`;
      savingsHint.className='onboard-live-hint '+(onboardingDraft.fixed+onboardingDraft.savings>onboardingDraft.income?'warn':'good');
    }
  }

  const budgetHint=document.getElementById('obBudgetHint');
  if(budgetHint){
    const total=onboardingBudgetTotal();
    const diff=variable-total;
    if(total<=0){
      budgetHint.textContent='Tu peux utiliser “Proposer” pour remplir automatiquement des plafonds de départ.';
      budgetHint.className='onboard-live-hint';
    }else if(diff>=0){
      budgetHint.textContent=`${eur(total)} de plafonds définis · ${eur(diff)} restent sans catégorie.`;
      budgetHint.className='onboard-live-hint good';
    }else{
      budgetHint.textContent=`Tes plafonds dépassent le reste disponible de ${eur(Math.abs(diff))}. Ce n’est pas bloquant, mais ils sont ambitieux.`;
      budgetHint.className='onboard-live-hint warn';
    }
  }

  const si=document.getElementById('obSummaryIncome');
  const sf=document.getElementById('obSummaryFixed');
  const ss=document.getElementById('obSummarySavings');
  const sa=document.getElementById('obSummaryAvailable');
  if(si)si.textContent=eur(onboardingDraft.income);
  if(sf)sf.textContent=eur(onboardingDraft.fixed);
  if(ss)ss.textContent=eur(onboardingDraft.savings);
  const available=onboardingDraft.income-onboardingDraft.fixed-onboardingDraft.savings;
  if(sa)sa.textContent=eur(available);

  const status=document.getElementById('obSummaryStatus');
  if(status){
    if(onboardingDraft.income<=0){
      status.className='onboard-summary-status warn';
      status.textContent='Ajoute un revenu pour que les prévisions soient réellement utiles.';
    }else if(available<0){
      status.className='onboard-summary-status bad';
      status.textContent=`Les charges et l’épargne dépassent le revenu de ${eur(Math.abs(available))}.`;
    }else if(available<onboardingDraft.income*.1){
      status.className='onboard-summary-status warn';
      status.textContent='Ton budget est assez serré. Mon Budget utilisera une approche prudente.';
    }else{
      status.className='onboard-summary-status good';
      status.textContent=`Tu gardes ${eur(available)} à piloter après charges fixes et épargne.`;
    }
  }
}

function setOnboardingSavingsRate(percent){
  onboardingSyncDraftFromUI();
  if(onboardingDraft.income<=0){
    showOnboardingError('Entre d’abord ton revenu mensuel.');
    return;
  }
  onboardingDraft.savings=Math.round(onboardingDraft.income*(percent/100)*100)/100;
  const el=document.getElementById('obSavings');
  if(el)el.value=onboardingDraft.savings;
  renderOnboardingLiveData();
}

function suggestOnboardingBudgets(){
  onboardingSyncDraftFromUI();
  const room=onboardingVariableRoom();
  if(room<=0){
    showOnboardingError('Il ne reste pas de marge après les charges fixes et l’épargne.');
    return;
  }

  // Deliberately keep 15% unallocated as breathing room.
  const alloc=room*.85;
  const weights={
    Courses:.34,
    Transport:.15,
    Loisirs:.15,
    Shopping:.10,
    Enfant:.10,
    Autres:.16
  };
  Object.entries(weights).forEach(([cat,w])=>{
    onboardingDraft.budgets[cat]=Math.round(alloc*w);
  });
  onboardingFillUI();
  renderOnboardingLiveData();
}

function onboardingValidateStep(step){
  onboardingSyncDraftFromUI();

  if(step===1){
    if(onboardingDraft.income<=0){
      showOnboardingError('Entre ton revenu mensuel prévu pour continuer.');
      return false;
    }
    if(onboardingDraft.income>1000000){
      showOnboardingError('Vérifie le montant du revenu : il semble inhabituellement élevé.');
      return false;
    }
  }

  if(step===2){
    if(onboardingDraft.fixed>onboardingDraft.income*1.5 && onboardingDraft.income>0){
      showOnboardingError('Les charges fixes semblent très élevées par rapport au revenu. Vérifie le montant.');
      return false;
    }
  }

  if(step===3){
    if(onboardingDraft.fixed+onboardingDraft.savings>onboardingDraft.income && onboardingDraft.income>0){
      showOnboardingError('Charges fixes + épargne dépassent ton revenu. Réduis l’un des deux montants pour continuer.');
      return false;
    }
  }

  return true;
}

function previousOnboarding(){
  onboardingSyncDraftFromUI();
  if(onboardingStep<=1)return;
  onboardingStep--;
  updateOnboardingUI();
}

function nextOnboarding(){
  onboardingSyncDraftFromUI();

  if(onboardingStep<5){
    if(!onboardingValidateStep(onboardingStep))return;
    onboardingStep++;
    updateOnboardingUI();
    return;
  }

  finishOnboarding();
}

function finishOnboarding(){
  onboardingSyncDraftFromUI();
  if(!onboardingValidateStep(1)||!onboardingValidateStep(2)||!onboardingValidateStep(3))return;

  // Safety backup before configuration overwrite (useful when onboarding is restarted later).
  try{
    localStorage.setItem('monBudgetOnboardingSafety:'+new Date().toISOString(),JSON.stringify(state));
  }catch(e){}

  state.monthlyPlans[mk()]={
    income:nonNegativeMoney(onboardingDraft.income),
    fixed:nonNegativeMoney(onboardingDraft.fixed),
    savings:nonNegativeMoney(onboardingDraft.savings)
  };

  const accountBudgets=budgets();
  Object.entries(onboardingDraft.budgets).forEach(([cat,value])=>{
    accountBudgets[cat]=nonNegativeMoney(value);
  });

  // Only create an actual income when the user explicitly said it already arrived.
  if(onboardingDraft.incomeReceived && onboardingDraft.income>0){
    const hasSameIncome=(state.ops||[]).some(o=>
      o.accountId===state.activeAccount &&
      o.type==='income' &&
      String(o.date||'').startsWith(mk()) &&
      Math.abs(nonNegativeMoney(o.amount)-onboardingDraft.income)<.005
    );
    if(!hasSameIncome){
      const today=new Date().toISOString().slice(0,10);
      state.ops.push({
        id:'op_onboard_income_'+Date.now(),
        type:'income',
        name:'Revenu principal',
        amount:onboardingDraft.income,
        cat:'',
        date:today+'T12:00:00',
        accountId:state.activeAccount,
        scope:'personal',
        tags:['onboarding']
      });
    }
  }

  state=normalizeState(state);
  localStorage.setItem('monBudgetOnboardingDone','1');
  localStorage.setItem('monBudgetOnboardingVersion','24.6.1');
  save();

  document.getElementById('onboarding')?.classList.add('hidden');
  render();
  showToast('Ton budget est prêt ✨');
}

function skipOnboarding(){
  localStorage.setItem('monBudgetOnboardingDone','1');
  localStorage.setItem('monBudgetOnboardingVersion','24.6.1');
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
  const spendableMonth=Math.max(0,s.incomeBase-s.plannedSaved-s.pendingRecurring-s.fixedPlanGap);
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
  const s=financialSnapshot();
  let score=100;
  const incomeBase=s.incomeBase||data.income||0;
  if(incomeBase<=0)return 50;

  const spendRatio=data.expenses/incomeBase;
  if(spendRatio>1)score-=45;
  else if(spendRatio>.95)score-=35;
  else if(spendRatio>.85)score-=22;
  else if(spendRatio>.75)score-=12;
  else if(spendRatio>.65)score-=5;

  const planned=monthlyPlannedSavings();
  if(planned>0){
    const savedRatio=data.savings/planned;
    if(savedRatio>=1)score+=4;
    else if(savedRatio<.35)score-=14;
    else if(savedRatio<.7)score-=7;
  }

  if(s.safeAvailable<0)score-=22;
  else if(s.safeAvailable<incomeBase*.05)score-=10;

  const totalBudget=cats.reduce((sum,c)=>sum+nonNegativeMoney(budgets()[c]),0);
  if(totalBudget>0){
    const budgetRatio=data.expenses/totalBudget;
    if(budgetRatio>1)score-=12;
    else if(budgetRatio>.9)score-=6;
  }

  return Math.max(0,Math.min(100,Math.round(score)));
}
function monthDataForKey(key){
  const x=monthActuals(key,state.activeAccount);
  return {ops:x.ops,income:x.income,expenses:x.expenses,savings:x.savings,remaining:x.realBalance};
}

function monthDataThroughDay(key,cutoffDay,accountId=state.activeAccount){
  const limit=Math.max(1,Math.min(31,Number(cutoffDay)||31));
  const ops=(state.ops||[]).filter(o=>{
    if(o.accountId!==accountId || !String(o.date||'').startsWith(key))return false;
    const day=Number(String(o.date||'').slice(8,10));
    return Number.isFinite(day)&&day<=limit;
  });
  const income=ops.filter(o=>o.type==='income').reduce((s,o)=>s+nonNegativeMoney(o.amount),0);
  const expenses=ops.filter(o=>o.type==='expense').reduce((s,o)=>s+nonNegativeMoney(o.amount),0);
  const savings=(state.savingsEntries||[])
    .filter(e=>{
      if(e.accountId!==accountId || e.budgetImpact===false || !String(e.date||'').startsWith(key))return false;
      const day=Number(String(e.date||'').slice(8,10));
      return Number.isFinite(day)&&day<=limit;
    })
    .reduce((s,e)=>s+moneyNumber(e.amount),0);
  return {ops,income,expenses,savings,remaining:income-expenses-savings};
}
function monthComparisonPair(){
  const now=new Date();
  const currentKey=mk();
  const prevKey=previousMonthKey();
  const isCurrentView=currentKey===calendarMonthKey(now);

  if(!isCurrentView){
    return {
      current:monthDataForKey(currentKey),
      previous:monthDataForKey(prevKey),
      sameDay:false,
      cutoff:null
    };
  }

  const cutoff=now.getDate();
  const m=String(prevKey).match(/^(\\d{4})-(\\d{2})$/);
  const prevLast=m?new Date(Number(m[1]),Number(m[2]),0).getDate():31;
  const prevCutoff=Math.min(cutoff,prevLast);

  return {
    current:monthDataThroughDay(currentKey,cutoff),
    previous:monthDataThroughDay(prevKey,prevCutoff),
    sameDay:true,
    cutoff
  };
}

function reportPctDelta(current,previous){
  current=Number(current)||0;
  previous=Number(previous)||0;
  if(previous===0)return null;
  return (current-previous)/previous*100;
}
function setReportDelta(valueEl,textEl,pct,positiveIsGood,label){
  if(!valueEl||!textEl)return;
  valueEl.classList.remove('delta-good','delta-warn','delta-flat');

  if(pct===null || !Number.isFinite(pct)){
    valueEl.textContent='—';
    textEl.textContent='Pas encore de référence';
    valueEl.classList.add('delta-flat');
    return;
  }

  const rounded=Math.round(Math.abs(pct));
  if(Math.abs(pct)<1){
    valueEl.textContent='≈ 0 %';
    textEl.textContent=`${label} quasi stables`;
    valueEl.classList.add('delta-flat');
    return;
  }

  valueEl.textContent=(pct>0?'+':'−')+rounded+' %';
  textEl.textContent=pct>0?`${label} en hausse`:`${label} en baisse`;

  const good=positiveIsGood?pct>0:pct<0;
  valueEl.classList.add(good?'delta-good':'delta-warn');
}

function renderMonthlyReport(){
  if(!document.getElementById('reportMonth'))return;

  const key=mk();
  const data=monthDataForKey(key);
  const prev=monthDataForKey(previousMonthKey());
  const score=scoreMonth(data);

  const el=id=>document.getElementById(id);
  const set=(id,value)=>{const n=el(id);if(n)n.textContent=value};

  set('reportMonth',fullMonthLabel());
  set('reportScore',score);
  set('reportIncome',eur(data.income));
  set('reportExpenses',eur(data.expenses));
  set('reportSavings',eur(data.savings));
  set('reportRemaining',eur(data.remaining));

  let scoreText='Mois équilibré.';
  let status='Stable';
  let hero='Ton budget reste lisible';
  if(score>=90){
    scoreText='Très bon équilibre entre dépenses, reste disponible et épargne.';
    status='Très solide';
    hero='Un mois bien maîtrisé';
  }else if(score>=75){
    scoreText='Ton mois est globalement bien tenu, avec quelques optimisations possibles.';
    status='Bien cadré';
    hero='Une base saine';
  }else if(score>=60){
    scoreText='Certains postes pèsent davantage sur ton budget ce mois-ci.';
    status='À surveiller';
    hero='Quelques points à ajuster';
  }else{
    scoreText='Ton reste disponible est sous pression : regarde d’abord les plus gros postes.';
    status='Sous pression';
    hero='Un mois à rééquilibrer';
  }
  set('reportScoreText',scoreText);
  set('reportStatusChip',status);
  set('reportHeroTitle',hero);

  const expenseOps=data.ops.filter(x=>x.type==='expense');
  const fixed=expenseOps.filter(x=>x.nature==='fixed').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const variable=expenseOps.filter(x=>x.nature!=='fixed').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const fixedShare=data.expenses>0?fixed/data.expenses*100:0;
  const savingsRate=data.income>0?data.savings/data.income*100:0;

  const now=new Date();
  const sameMonth=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const daysInMonth=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
  const observedDays=sameMonth?Math.max(1,Math.min(now.getDate(),daysInMonth)):daysInMonth;
  const dailySpend=data.expenses/observedDays;

  const largest=expenseOps.slice().sort((a,b)=>(Number(b.amount)||0)-(Number(a.amount)||0))[0];

  set('reportSavingsRate',Math.round(savingsRate)+' %');
  set('reportSavingsRateText',data.income>0?`${eur(data.savings)} mis de côté sur ${eur(data.income)}`:'Ajoute un revenu pour calculer ce taux');
  set('reportDailySpend',eur(dailySpend)+'/j');
  set('reportDailySpendText',`${observedDays} jour${observedDays>1?'s':''} pris en compte`);
  set('reportLargestExpense',largest?eur(largest.amount):'—');
  set('reportLargestExpenseText',largest?(largest.name||largest.cat||'Dépense'):'Aucune dépense ce mois-ci');
  set('reportFixedShare',Math.round(fixedShare)+' %');
  set('reportFixedShareText',data.expenses>0?`${eur(fixed)} fixes · ${eur(variable)} variables`:'Aucune dépense');

  setReportDelta(
    el('reportExpensesDelta'),
    el('reportExpensesDeltaText'),
    reportPctDelta(data.expenses,prev.expenses),
    false,
    'Dépenses'
  );
  setReportDelta(
    el('reportIncomeDelta'),
    el('reportIncomeDeltaText'),
    reportPctDelta(data.income,prev.income),
    true,
    'Revenus'
  );
  setReportDelta(
    el('reportSavingsDelta'),
    el('reportSavingsDeltaText'),
    reportPctDelta(data.savings,prev.savings),
    true,
    'Épargne'
  );

  const byCat={};
  expenseOps.forEach(x=>{
    const cat=x.cat||'Autres';
    byCat[cat]=(byCat[cat]||0)+(Number(x.amount)||0);
  });
  const sorted=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const top=sorted[0];
  const low=sorted.slice().reverse().find(([k,v])=>v>0);

  const bars=el('reportCategoryBars');
  if(bars){
    const topFive=sorted.slice(0,5);
    const maxCat=Math.max(1,...topFive.map(x=>x[1]));
    bars.innerHTML=topFive.length?topFive.map(([cat,amount],i)=>{
      const pct=data.expenses>0?amount/data.expenses*100:0;
      const width=Math.max(5,amount/maxCat*100);
      return `<div class="report-category-row">
        <div class="report-category-head">
          <span><i>${i+1}</i>${cat}</span>
          <b>${eur(amount)}</b>
        </div>
        <div class="report-category-track"><span style="width:${width}%"></span></div>
        <small>${Math.round(pct)} % des dépenses</small>
      </div>`;
    }).join(''):'<div class="muted">Ajoute quelques dépenses pour voir la répartition.</div>';
  }

  const planned=monthlyPlannedSavings();
  const highlights=[];
  if(top)highlights.push(['Poste principal',`${top[0]} représente ${eur(top[1])}, soit ${data.expenses>0?Math.round(top[1]/data.expenses*100):0} % de tes dépenses.`]);
  if(largest)highlights.push(['Plus grosse opération',`${largest.name||largest.cat||'Dépense'} : ${eur(largest.amount)}.`]);
  if(planned>0){
    const diff=data.savings-planned;
    highlights.push(diff>=0
      ?['Épargne',`Objectif mensuel atteint avec ${eur(diff)} au-dessus du prévu.`]
      :['Épargne',`Il reste ${eur(Math.abs(diff))} à mettre de côté pour atteindre le montant prévu.`]);
  }
  if(prev.expenses>0){
    const pct=(data.expenses-prev.expenses)/prev.expenses*100;
    highlights.push(['Évolution',pct<=0
      ?`Tes dépenses sont en baisse de ${Math.abs(Math.round(pct))} % par rapport au mois précédent.`
      :`Tes dépenses sont en hausse de ${Math.round(pct)} % par rapport au mois précédent.`]);
  }
  const highlightsEl=el('reportHighlights');
  if(highlightsEl){
    highlightsEl.innerHTML=highlights.length
      ?highlights.slice(0,4).map(([t,m])=>`<div class="report-highlight"><strong>${t}</strong><div class="muted">${m}</div></div>`).join('')
      :'<div class="muted">Pas encore assez de données.</div>';
  }

  // Three practical next-month pistes based only on the user's own data.
  const actions=[];
  const accountBudgets=budgets();
  const overBudget=sorted
    .map(([cat,amount])=>({cat,amount,limit:Number(accountBudgets?.[cat])||0}))
    .filter(x=>x.limit>0&&x.amount>x.limit)
    .sort((a,b)=>(b.amount-b.limit)-(a.amount-a.limit))[0];

  if(overBudget){
    actions.push({
      icon:'◎',
      title:`Revoir ${overBudget.cat}`,
      text:`Ce poste dépasse son budget de ${eur(overBudget.amount-overBudget.limit)}.`
    });
  }else if(top){
    actions.push({
      icon:'◔',
      title:`Surveiller ${top[0]}`,
      text:`C’est ton premier poste du mois avec ${eur(top[1])}.`
    });
  }else{
    actions.push({
      icon:'◔',
      title:'Créer ton historique',
      text:'Quelques opérations suffisent pour obtenir des recommandations plus précises.'
    });
  }

  if(planned>0 && data.savings<planned){
    actions.push({
      icon:'◇',
      title:'Compléter l’épargne',
      text:`Il reste ${eur(planned-data.savings)} pour atteindre ton objectif mensuel.`
    });
  }else if(data.income>0){
    actions.push({
      icon:'◇',
      title:'Conserver ton rythme',
      text:`Ton taux d’épargne actuel est de ${Math.round(savingsRate)} %.`
    });
  }else{
    actions.push({
      icon:'◇',
      title:'Définir ton revenu',
      text:'Ajoute ton revenu mensuel pour calculer ton vrai potentiel d’épargne.'
    });
  }

  if(prev.expenses>0 && data.expenses>prev.expenses){
    actions.push({
      icon:'↘',
      title:'Freiner la hausse',
      text:`Tu dépenses ${eur(data.expenses-prev.expenses)} de plus que le mois précédent.`
    });
  }else if(dailySpend>0){
    actions.push({
      icon:'→',
      title:'Repère quotidien',
      text:`Ton rythme actuel est d’environ ${eur(dailySpend)} de dépenses par jour.`
    });
  }else{
    actions.push({
      icon:'→',
      title:'Préparer le mois',
      text:'Ajoute tes charges récurrentes pour rendre les projections plus précises.'
    });
  }

  const actionEl=el('reportActions');
  if(actionEl){
    actionEl.innerHTML=actions.slice(0,3).map((a,i)=>`<div class="report-action-item">
      <div class="report-action-icon">${a.icon}</div>
      <div><small>Piste ${i+1}</small><strong>${a.title}</strong><p>${a.text}</p></div>
    </div>`).join('');
  }

  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date(view);d.setMonth(d.getMonth()-i);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    months.push(monthDataForKey(k));
  }
  const nonEmptyMonths=months.filter(m=>m.expenses>0||m.income>0||m.savings>0);
  const divisor=Math.max(1,nonEmptyMonths.length);
  const avgExp=nonEmptyMonths.reduce((s,m)=>s+m.expenses,0)/divisor;
  const avgSav=nonEmptyMonths.reduce((s,m)=>s+m.savings,0)/divisor;
  const plan=currentPlan();
  const nextIncome=plan.income||data.income;

  set('nextMonthExpenses',eur(avgExp));
  set('nextMonthSavings',eur(monthlyPlannedSavings()>0?monthlyPlannedSavings():avgSav));

  const projectedRoom=Math.max(0,nextIncome-avgExp-(monthlyPlannedSavings()>0?monthlyPlannedSavings():avgSav));
  set('nextMonthText',
    nonEmptyMonths.length
      ?`Basé sur ${nonEmptyMonths.length} mois renseigné${nonEmptyMonths.length>1?'s':''}. Marge indicative après dépenses et épargne : ${eur(projectedRoom)}.`
      :'Ajoute davantage d’historique pour obtenir une projection fiable.'
  );

  const annual=[];
  for(let i=11;i>=0;i--){
    const d=new Date(view);d.setMonth(d.getMonth()-i);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    annual.push({d, ...monthDataForKey(k)});
  }
  const max=Math.max(1,...annual.map(x=>x.expenses));
  const annualEl=el('annualMiniChart');
  if(annualEl){
    annualEl.innerHTML=annual.map(x=>`<div class="annual-col" title="${eur(x.expenses)}">
      <i style="height:${Math.max(3,x.expenses/max*125)}px"></i>
      ${x.d.toLocaleDateString('fr-BE',{month:'short'}).replace('.','')}
    </div>`).join('');
  }
}


function pendingRecurringAmount(key=mk(),accountId=state.activeAccount){
  const relation=monthRelation(key);

  // A closed historical month must never reserve future charges.
  if(relation==='past')return 0;

  const monthOps=monthActuals(key,accountId).ops;
  const appliedIds=new Set(monthOps.filter(x=>x.recurringId).map(x=>x.recurringId));

  return (state.recurring||[])
    .filter(r=>
      r.accountId===accountId &&
      !appliedIds.has(r.id) &&
      !isRecurringSkipped(r.id,key)
    )
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

  const actualFixedExpenses=a
    .filter(x=>x.type==='expense'&&x.nature==='fixed')
    .reduce((s,x)=>s+nonNegativeMoney(x.amount),0);
  const plannedFixed=nonNegativeMoney(p.fixed);

  // The monthly fixed-cost plan is now real, not decorative:
  // known pending recurring charges count toward the plan first,
  // then only the uncovered remainder of the plan is additionally reserved.
  const fixedPlanGap=Math.max(0,plannedFixed-actualFixedExpenses-pendingRecurring);
  const totalFixedReserve=pendingRecurring+fixedPlanGap;

  // Prudence rule:
  // - existing savings (budgetImpact=false) never affects the month;
  // - current-month savings does;
  // - missing planned savings stays reserved;
  // - known recurring expenses stay reserved exactly once;
  // - the uncovered remainder of "charges fixes prévues" also stays reserved.
  const safeAvailable=
    incomeBase-expenses-actualSaved-savingsStillToReserve-pendingRecurring-fixedPlanGap;

  return {
    p,a,realIncome,incomeBase,expenses,actualSaved,plannedSaved,
    savingsStillToReserve,pendingRecurring,
    actualFixedExpenses,plannedFixed,fixedPlanGap,totalFixedReserve,
    safeAvailable,
    actualBalance:realIncome-expenses-actualSaved
  };
}



function scenarioNumber(id){
  const el=document.getElementById(id);
  return Math.max(0,Number(String(el?.value||'0').replace(',','.'))||0);
}

function budgetScenarioData(){
  const f=smartForecastModel();
  const purchase=scenarioNumber('simPurchase');
  const extraIncome=scenarioNumber('simExtraIncome');
  const extraSavings=scenarioNumber('simExtraSavings');
  const extraRecurring=scenarioNumber('simExtraRecurring');

  const impact=extraIncome-purchase-extraSavings-extraRecurring;
  const safeAvailable=f.snap.safeAvailable+impact;
  const likelyEnd=f.likelyEnd+impact;
  const conservativeEnd=f.conservativeEnd+impact;
  const favorableEnd=f.favorableEnd+impact;
  const safeDaily=f.same?safeAvailable/Math.max(1,f.safeDays):safeAvailable/Math.max(1,f.lastDay);

  let risk='Faible';
  if(safeAvailable<0 || likelyEnd<0)risk='Élevé';
  else if(conservativeEnd<0 || likelyEnd<Math.max(80,f.snap.incomeBase*.05))risk='Moyen';

  return {
    f,purchase,extraIncome,extraSavings,extraRecurring,impact,
    safeAvailable,likelyEnd,conservativeEnd,favorableEnd,safeDaily,risk
  };
}

function scenarioTone(risk){
  return risk==='Élevé'?'danger':risk==='Moyen'?'warn':'good';
}

function renderBudgetSimulator(){
  const card=document.getElementById('scenarioLabCard');
  if(!card)return;

  const s=budgetScenarioData();
  const set=(id,value)=>{
    const el=document.getElementById(id);
    if(el)el.textContent=value;
  };

  set('simLikelyEnd',eur(s.likelyEnd));
  set('simLikelyDelta',`Impact : ${s.impact>=0?'+':''}${eur(s.impact)}`);
  set('simSafeAvailable',eur(s.safeAvailable));
  set('simSafeDaily',eur(Math.max(0,s.safeDaily))+'/j');
  set('simConservative',eur(s.conservativeEnd));
  set('simRisk',s.risk);

  const risk=document.getElementById('simRisk');
  if(risk){
    risk.className='scenario-risk '+scenarioTone(s.risk);
  }

  const before=s.f.likelyEnd;
  const after=s.likelyEnd;
  set('simBeforeValue',eur(before));
  set('simAfterValue',eur(after));

  const max=Math.max(1,Math.abs(before),Math.abs(after));
  const beforePct=Math.max(5,Math.min(100,Math.abs(before)/max*100));
  const afterPct=Math.max(5,Math.min(100,Math.abs(after)/max*100));
  const beforeBar=document.getElementById('simBeforeBar');
  const afterBar=document.getElementById('simAfterBar');
  if(beforeBar){
    beforeBar.style.width=beforePct+'%';
    beforeBar.className=before<0?'negative':'';
  }
  if(afterBar){
    afterBar.style.width=afterPct+'%';
    afterBar.className=after<0?'negative':s.risk==='Moyen'?'warning':'';
  }

  const advice=document.getElementById('simAdvice');
  if(advice){
    const totalOut=s.purchase+s.extraSavings+s.extraRecurring;
    let text='Aucun changement simulé.';
    let cls='';

    if(totalOut===0 && s.extraIncome===0){
      text=`Situation actuelle : ${eur(s.f.snap.safeAvailable)} disponibles prudemment, avec une fin de mois probable à ${eur(s.f.likelyEnd)}.`;
    }else if(s.risk==='Élevé'){
      text=`Ce scénario met ton budget sous pression : la fin de mois probable tombe à ${eur(s.likelyEnd)}. Il faudrait réduire le scénario d’environ ${eur(Math.max(0,-s.likelyEnd))} pour revenir au moins à zéro.`;
      cls='danger';
    }else if(s.risk==='Moyen'){
      text=`Le scénario reste possible, mais la marge devient serrée. Après simulation, ton repère prudent est d’environ ${eur(Math.max(0,s.safeDaily))} par jour.`;
      cls='warn';
    }else{
      const share=s.f.snap.safeAvailable>0?s.purchase/s.f.snap.safeAvailable*100:0;
      text=s.purchase>0
        ?`Le scénario reste dans une zone confortable. L’achat représente environ ${Math.round(share)} % de ton disponible prudent actuel.`
        :`Le scénario améliore ou conserve une marge saine pour la fin du mois.`;
      cls='good';
    }

    advice.textContent=text;
    advice.className='scenario-advice '+cls;
  }
}

function setScenarioPreset(amount){
  const el=document.getElementById('simPurchase');
  if(el)el.value=amount;
  renderBudgetSimulator();
}

function resetBudgetSimulator(){
  ['simPurchase','simExtraIncome','simExtraSavings','simExtraRecurring'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.value='';
  });
  renderBudgetSimulator();
}

function openScenarioLab(){
  const planBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('plan'"));
  if(planBtn)nav('plan',planBtn);
  setTimeout(()=>{
    document.getElementById('scenarioLabCard')?.scrollIntoView({behavior:'smooth',block:'start'});
    document.getElementById('simPurchase')?.focus();
  },90);
}

function sendScenarioToAssistant(){
  const s=budgetScenarioData();
  const parts=[];
  if(s.purchase>0)parts.push(`un achat de ${s.purchase.toFixed(2)} €`);
  if(s.extraIncome>0)parts.push(`un revenu supplémentaire de ${s.extraIncome.toFixed(2)} €`);
  if(s.extraSavings>0)parts.push(`${s.extraSavings.toFixed(2)} € d’épargne supplémentaire`);
  if(s.extraRecurring>0)parts.push(`une nouvelle charge de ${s.extraRecurring.toFixed(2)} €`);

  if(!parts.length){
    showToast('Ajoute d’abord un scénario à analyser');
    return;
  }

  const question=`Analyse ce scénario : ${parts.join(', ')}. Est-ce que mon budget reste équilibré ?`;
  const input=document.getElementById('budgetAssistantInput');
  if(input)input.value=question;

  const homeBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('home'"));
  if(homeBtn)nav('home',homeBtn);

  setTimeout(()=>{
    document.getElementById('budgetAssistantCard')?.scrollIntoView({behavior:'smooth',block:'start'});
    const amount=s.purchase+s.extraSavings+s.extraRecurring;
    let result;
    if(s.risk==='Élevé'){
      result=assistantResult(
        'Ce scénario est trop tendu',
        `Avec ces changements, la projection probable de fin de mois serait de ${eur(s.likelyEnd)}.`,
        [
          `Disponible prudent après scénario : ${eur(s.safeAvailable)}`,
          `Scénario prudent : ${eur(s.conservativeEnd)}`,
          `Budget sûr/jour : ${eur(Math.max(0,s.safeDaily))}`
        ],
        'danger'
      );
    }else if(s.risk==='Moyen'){
      result=assistantResult(
        'Le scénario tient, mais réduit fortement ta marge',
        `La projection probable resterait à ${eur(s.likelyEnd)}, avec un scénario prudent à ${eur(s.conservativeEnd)}.`,
        [
          `Disponible après scénario : ${eur(s.safeAvailable)}`,
          `Repère quotidien : ${eur(Math.max(0,s.safeDaily))}/jour`
        ],
        'warn'
      );
    }else{
      result=assistantResult(
        'Le scénario reste compatible avec ton budget',
        `Après simulation, la projection probable de fin de mois serait de ${eur(s.likelyEnd)}.`,
        [
          `Disponible prudent : ${eur(s.safeAvailable)}`,
          `Repère quotidien : ${eur(Math.max(0,s.safeDaily))}/jour`,
          `Impact total : ${s.impact>=0?'+':''}${eur(s.impact)}`
        ],
        'good'
      );
    }

    assistantPush('user',question);
    assistantPush('assistant','',result);
    if(input)input.value='';
    renderBudgetAssistant();
  },100);
}

function assistantNormalizeText(value){
  return String(value||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[’']/g,"'")
    .replace(/\s+/g,' ')
    .trim();
}

function assistantExtractAmount(text){
  const clean=String(text||'').replace(/\s/g,'');
  const matches=[...clean.matchAll(/(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur|euros?)?/gi)];
  if(!matches.length)return null;

  // Prefer a value explicitly followed by € / EUR / euro.
  const explicit=matches.find(m=>/(€|eur|euro)/i.test(m[0]));
  const raw=(explicit||matches[0])[1].replace(',','.');
  const n=Number(raw);
  return Number.isFinite(n)&&n>=0?n:null;
}

function budgetAssistantContext(){
  const forecast=smartForecastModel();
  const current=monthDataForKey(mk());
  const previous=monthDataForKey(previousMonthKey());
  const comparison=monthComparisonPair();
  const expenseOps=current.ops.filter(x=>x.type==='expense');
  const incomeOps=current.ops.filter(x=>x.type==='income');

  const byCat={};
  expenseOps.forEach(x=>{
    const cat=x.cat||'Autres';
    byCat[cat]=(byCat[cat]||0)+nonNegativeMoney(x.amount);
  });
  const categories=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const largest=expenseOps.slice().sort((a,b)=>nonNegativeMoney(b.amount)-nonNegativeMoney(a.amount))[0]||null;

  const totalBudget=cats.reduce((s,c)=>s+nonNegativeMoney(budgets()[c]),0);
  const overBudgets=categories.map(([cat,spent])=>{
    const limit=nonNegativeMoney(budgets()[cat]);
    return {cat,spent,limit,over:limit>0?spent-limit:0};
  }).filter(x=>x.limit>0&&x.over>0).sort((a,b)=>b.over-a.over);

  const planned=monthlyPlannedSavings();
  const actualSaved=current.savings;
  const extraRoom=Math.max(0,forecast.likelyEnd);
  const weekRoom=Math.max(0,forecast.safeDaily*7);

  return {
    forecast,current,previous,comparison,expenseOps,incomeOps,categories,largest,
    overBudgets,totalBudget,planned,actualSaved,extraRoom,weekRoom
  };
}

function assistantResult(title,text,facts=[],tone='neutral'){
  return {title,text,facts,tone};
}

function answerBudgetQuestion(question){
  const q=assistantNormalizeText(question);
  const amount=assistantExtractAmount(question);
  const c=budgetAssistantContext();
  const f=c.forecast;

  if(!q){
    return assistantResult(
      'Pose-moi une question',
      'Je peux analyser ton disponible, ton rythme de dépenses, tes catégories et ton mois précédent.'
    );
  }

  // Can I spend X?
  if(amount!==null && /(depenser|depense|acheter|achat|payer|commande|week.?end|weekend|sortie)/.test(q)){
    const afterSafe=f.snap.safeAvailable-amount;
    const afterLikely=f.likelyEnd-amount;
    const isWeekend=/week.?end|weekend/.test(q);
    const weekendRoom=Math.max(0,f.safeDaily*2);

    if(f.snap.incomeBase<=0){
      return assistantResult(
        'Il manque ton revenu',
        `Je vois bien la dépense de ${eur(amount)}, mais je ne peux pas dire si elle rentre dans ton budget prudent sans revenu ou plan mensuel.`,
        ['Ajoute ton revenu ou configure le plan du mois.'],
        'warn'
      );
    }

    if(afterSafe<0){
      return assistantResult(
        'Ça dépasse ton disponible prudent',
        `Une dépense de ${eur(amount)} ferait passer ton disponible prudent à ${eur(afterSafe)}.`,
        [
          `Disponible actuel : ${eur(f.snap.safeAvailable)}`,
          `Projection probable après achat : ${eur(afterLikely)}`,
          f.snap.pendingRecurring>0?`${eur(f.snap.pendingRecurring)} de charges sont encore réservées.`:''
        ].filter(Boolean),
        'danger'
      );
    }

    if(afterLikely<0){
      return assistantResult(
        'Possible, mais ça met la fin de mois sous pression',
        `La dépense de ${eur(amount)} tient dans le disponible actuel, mais la projection de fin de mois tomberait à ${eur(afterLikely)}.`,
        [
          `Budget sûr/jour actuel : ${eur(f.safeDaily)}`,
          isWeekend?`Repère pour 2 jours : ${eur(weekendRoom)}`:'',
          `Scénario prudent avant achat : ${eur(f.conservativeEnd)}`
        ].filter(Boolean),
        'warn'
      );
    }

    const ratio=f.snap.safeAvailable>0?amount/f.snap.safeAvailable:1;
    const tone=ratio>.5?'warn':'good';
    return assistantResult(
      tone==='good'?'Ça rentre dans ton budget prudent':'Ça rentre, mais c’est une grosse part de ta marge',
      `Après ${eur(amount)}, il resterait environ ${eur(afterSafe)} de disponible prudent. La projection probable de fin de mois serait autour de ${eur(afterLikely)}.`,
      [
        isWeekend?`Repère prudent pour le week-end : ${eur(weekendRoom)}`:`Budget sûr/jour : ${eur(f.safeDaily)}`,
        `Confiance de la prévision : ${f.confidence.toLowerCase()}`,
        f.snap.savingsStillToReserve>0?`${eur(f.snap.savingsStillToReserve)} d’épargne restent déjà protégés.`:''
      ].filter(Boolean),
      tone
    );
  }

  // How much can I spend?
  if(/(combien.*depenser|budget.*jour|par jour|cette semaine|semaine.*budget|reste.*depenser)/.test(q)){
    return assistantResult(
      'Ton repère de dépense',
      f.same
        ?`Ton budget prudent est d’environ ${eur(f.safeDaily)} par jour. Sur 7 jours, ça représente environ ${eur(c.weekRoom)} si rien d’important ne change.`
        :`Pour ${fullMonthLabel()}, le disponible prudent est de ${eur(f.snap.safeAvailable)}.`,
      [
        `Disponible prudent : ${eur(f.snap.safeAvailable)}`,
        f.same?`Fin de mois probable : ${eur(f.likelyEnd)}`:'',
        f.snap.pendingRecurring>0?`Charges encore prévues : ${eur(f.snap.pendingRecurring)}`:''
      ].filter(Boolean),
      f.risk==='Élevé'?'danger':f.risk==='Moyen'?'warn':'good'
    );
  }

  // Why less/more money than previous month?
  if(/(pourquoi|moins d'argent|plus d'argent|mois dernier|mois precedent|compar)/.test(q)){
    const cmpCur=c.comparison?.current||c.current;
    const cmpPrev=c.comparison?.previous||c.previous;
    if(cmpPrev.income===0 && cmpPrev.expenses===0){
      return assistantResult(
        'Pas encore assez d’historique',
        'Je n’ai pas assez de données sur le mois précédent pour expliquer l’écart.',
        ['Ajoute ou importe le mois précédent pour obtenir une comparaison précise.']
      );
    }

    const incomeDiff=cmpCur.income-cmpPrev.income;
    const expenseDiff=cmpCur.expenses-cmpPrev.expenses;
    const savingDiff=cmpCur.savings-cmpPrev.savings;
    const effects=[
      {label:'Revenus',impact:incomeDiff,text:`${incomeDiff>=0?'+':''}${eur(incomeDiff)}`},
      {label:'Dépenses',impact:-expenseDiff,text:`${expenseDiff>=0?'+':''}${eur(expenseDiff)}`},
      {label:'Épargne',impact:-savingDiff,text:`${savingDiff>=0?'+':''}${eur(savingDiff)}`}
    ].sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact));

    let explanation='';
    const main=effects[0];
    if(main.label==='Revenus'){
      explanation=incomeDiff<0
        ?`La principale différence vient de revenus plus faibles de ${eur(Math.abs(incomeDiff))}.`
        :`Tes revenus sont plus élevés de ${eur(incomeDiff)} ; l’écart vient donc surtout d’un autre poste.`;
    }else if(main.label==='Dépenses'){
      explanation=expenseDiff>0
        ?`La principale différence vient de ${eur(expenseDiff)} de dépenses supplémentaires.`
        :`Tes dépenses ont baissé de ${eur(Math.abs(expenseDiff))}.`;
    }else{
      explanation=savingDiff>0
        ?`Tu as mis ${eur(savingDiff)} de plus de côté, ce qui réduit ton argent disponible mais augmente ton épargne.`
        :`Tu as épargné ${eur(Math.abs(savingDiff))} de moins.`;
    }

    return assistantResult(
      'Comparaison avec le mois précédent',
      explanation,
      [
        `${c.comparison?.sameDay?`Comparaison jusqu’au ${c.comparison.cutoff} du mois`:''}`.trim(),
        `Revenus : ${eur(cmpCur.income)} vs ${eur(cmpPrev.income)}`,
        `Dépenses : ${eur(cmpCur.expenses)} vs ${eur(cmpPrev.expenses)}`,
        `Épargne : ${eur(cmpCur.savings)} vs ${eur(cmpPrev.savings)}`
      ].filter(Boolean),
      expenseDiff>0&&incomeDiff<=0?'warn':'neutral'
    );
  }

  // Savings
  if(/(epargn|mettre de cote|economis|economies)/.test(q)){
    const remainingPlan=Math.max(0,c.planned-c.actualSaved);
    return assistantResult(
      'Ta marge d’épargne',
      c.extraRoom>0
        ?`Après les dépenses, charges prévues et l’épargne déjà réservée, la projection laisse environ ${eur(c.extraRoom)} de marge probable en fin de mois.`
        :`Ta projection ne montre pas de marge supplémentaire sûre pour l’instant.`,
      [
        `Épargne prévue : ${eur(c.planned)}`,
        `Déjà mise de côté : ${eur(c.actualSaved)}`,
        remainingPlan>0?`Reste pour l’objectif : ${eur(remainingPlan)}`:'Objectif mensuel déjà atteint ou non défini',
        `Scénario prudent : ${eur(f.conservativeEnd)}`
      ],
      c.extraRoom>0?'good':'warn'
    );
  }

  // Forecast
  if(/(prevision|projection|fin de mois|finir le mois|solde.*fin)/.test(q)){
    return assistantResult(
      'Prévision de fin de mois',
      `La projection probable est de ${eur(f.likelyEnd)}. Dans un scénario plus prudent, elle descend à ${eur(f.conservativeEnd)}, et dans un scénario favorable elle monte à ${eur(f.favorableEnd)}.`,
      [
        `Rythme variable actuel : ${eur(f.weightedRate)}/jour`,
        `Budget sûr/jour : ${eur(f.safeDaily)}`,
        `Confiance : ${f.confidence.toLowerCase()}`
      ],
      f.risk==='Élevé'?'danger':f.risk==='Moyen'?'warn':'good'
    );
  }

  // Category / biggest expense
  if(/(plus grosse|plus gros|categorie|catégorie|ou part|où part|depense le plus)/.test(q)){
    if(!c.categories.length){
      return assistantResult('Pas encore de dépenses','Je n’ai pas encore assez d’opérations pour identifier les plus gros postes.');
    }
    const [topCat,topAmount]=c.categories[0];
    return assistantResult(
      'Ton principal poste',
      `${topCat} est actuellement ta première catégorie avec ${eur(topAmount)}, soit ${c.current.expenses?Math.round(topAmount/c.current.expenses*100):0} % des dépenses du mois.`,
      [
        c.largest?`Plus grosse opération : ${c.largest.name||c.largest.cat} · ${eur(c.largest.amount)}`:'',
        c.categories[1]?`N°2 : ${c.categories[1][0]} · ${eur(c.categories[1][1])}`:'',
        c.overBudgets[0]?`${c.overBudgets[0].cat} dépasse son plafond de ${eur(c.overBudgets[0].over)}.`:''
      ].filter(Boolean),
      c.overBudgets.length?'warn':'neutral'
    );
  }

  // What should I watch?
  if(/(surveill|attention|risque|probleme|problème|alerte|conseil|quoi faire)/.test(q)){
    const facts=[];
    if(f.accelerations[0])facts.push(`${f.accelerations[0].cat} accélère d’environ ${Math.round(f.accelerations[0].pct)} % récemment.`);
    if(f.categoryRisks[0])facts.push(`${f.categoryRisks[0].cat} est projeté à ${eur(f.categoryRisks[0].projected)} pour un plafond de ${eur(f.categoryRisks[0].limit)}.`);
    if(f.snap.pendingRecurring>0)facts.push(`${eur(f.snap.pendingRecurring)} de charges récurrentes doivent encore passer.`);
    if(f.snap.savingsStillToReserve>0)facts.push(`${eur(f.snap.savingsStillToReserve)} restent à réserver pour l’épargne prévue.`);
    if(!facts.length)facts.push(`Aucune alerte importante détectée actuellement.`);

    return assistantResult(
      f.risk==='Faible'?'Pas de gros signal d’alerte':'Voici ce que je surveillerais',
      f.risk==='Élevé'
        ?`Le risque budgétaire est élevé avec une projection probable à ${eur(f.likelyEnd)}.`
        :f.risk==='Moyen'
          ?`Le mois reste gérable, mais la marge devient plus serrée.`
          :`Le mois est plutôt stable selon les données actuelles.`,
      facts.slice(0,4),
      f.risk==='Élevé'?'danger':f.risk==='Moyen'?'warn':'good'
    );
  }

  // Remaining / balance
  if(/(combien.*reste|reste.*mois|disponible|reste a vivre|reste à vivre)/.test(q)){
    return assistantResult(
      'Ton disponible prudent',
      `Il te reste actuellement ${eur(f.snap.safeAvailable)} après avoir réservé les charges récurrentes restantes et l’épargne prévue.`,
      [
        `Solde réel avant réserves : ${eur(f.snap.actualBalance)}`,
        `Charges restantes : ${eur(f.snap.pendingRecurring)}`,
        `Épargne encore à réserver : ${eur(f.snap.savingsStillToReserve)}`,
        f.same?`Repère : ${eur(f.safeDaily)}/jour`:''
      ].filter(Boolean),
      f.snap.safeAvailable<0?'danger':f.risk==='Moyen'?'warn':'good'
    );
  }

  // Generic summary
  const top=c.categories[0];
  return assistantResult(
    'Résumé intelligent du mois',
    f.snap.incomeBase<=0
      ?`Je peux analyser tes opérations, mais ajoute ton revenu ou ton plan mensuel pour obtenir des réponses plus précises.`
      :`Tu as ${eur(f.snap.safeAvailable)} de disponible prudent et une projection probable de ${eur(f.likelyEnd)} en fin de mois.`,
    [
      `Revenus : ${eur(c.current.income)}`,
      `Dépenses : ${eur(c.current.expenses)}`,
      `Épargne : ${eur(c.current.savings)}`,
      top?`Premier poste : ${top[0]} · ${eur(top[1])}`:''
    ].filter(Boolean),
    f.risk==='Élevé'?'danger':f.risk==='Moyen'?'warn':'neutral'
  );
}

function assistantPush(role,text,result=null){
  if(!Array.isArray(state.assistantHistory))state.assistantHistory=[];
  state.assistantHistory.push({
    id:'assistant_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    role,
    text:String(text||''),
    result:result||null,
    month:mk(),
    accountId:state.activeAccount,
    createdAt:new Date().toISOString()
  });
  state.assistantHistory=state.assistantHistory.slice(-12);
  save();
}

function askBudgetAssistant(event){
  if(event)event.preventDefault();
  const input=document.getElementById('budgetAssistantInput');
  const question=input?.value?.trim()||'';
  if(!question)return false;

  assistantPush('user',question);
  const result=answerBudgetQuestion(question);
  assistantPush('assistant','',result);
  if(input)input.value='';
  renderBudgetAssistant();
  document.getElementById('assistantConversationDetails')?.setAttribute('open','');
  setTimeout(()=>{
    const box=document.getElementById('budgetAssistantMessages');
    if(box)box.scrollTop=box.scrollHeight;
  },20);
  return false;
}

function assistantQuickAsk(question){
  const input=document.getElementById('budgetAssistantInput');
  if(input)input.value=question;
  askBudgetAssistant();
}

function clearBudgetAssistant(){
  state.assistantHistory=[];
  save();
  renderBudgetAssistant();
}

function openBudgetAssistant(){
  document.getElementById('quickSheet')?.classList.add('hidden');
  const homeBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('home'"));
  if(homeBtn)nav('home',homeBtn);
  setTimeout(()=>{
    document.getElementById('budgetAssistantCard')?.scrollIntoView({behavior:'smooth',block:'start'});
    document.getElementById('budgetAssistantInput')?.focus();
  },90);
}

function renderBudgetAssistant(){
  const box=document.getElementById('budgetAssistantMessages');
  if(!box)return;

  const history=(state.assistantHistory||[]).filter(m=>
    (!m.accountId||m.accountId===state.activeAccount) &&
    (!m.month||m.month===mk())
  );
  const conversationDetails=document.getElementById('assistantConversationDetails');
  if(conversationDetails && history.length)conversationDetails.setAttribute('open','');

  if(!history.length){
    const f=smartForecastModel();
    box.innerHTML=`<div class="assistant-welcome">
      <div class="assistant-orb">✦</div>
      <div>
        <strong>${f.snap.incomeBase>0?'Ton budget est prêt à être analysé':'Commence par me poser une question'}</strong>
        <span>${f.snap.incomeBase>0
          ?`Disponible prudent : ${eur(f.snap.safeAvailable)} · prévision : ${eur(f.likelyEnd)}`
          :'Je peux déjà analyser tes opérations enregistrées.'}</span>
      </div>
    </div>`;
    return;
  }

  box.innerHTML=history.map(m=>{
    if(m.role==='user'){
      return `<div class="assistant-message user"><div>${escHTML(m.text)}</div></div>`;
    }

    const r=m.result||{};
    const facts=Array.isArray(r.facts)?r.facts.filter(Boolean):[];
    return `<div class="assistant-message bot ${escHTML(r.tone||'neutral')}">
      <div class="assistant-bot-icon">✦</div>
      <div class="assistant-answer">
        <small>Assistant Budget</small>
        <strong>${escHTML(r.title||'Analyse')}</strong>
        <p>${escHTML(r.text||'')}</p>
        ${facts.length?`<div class="assistant-facts">${facts.map(f=>`<span>${escHTML(f)}</span>`).join('')}</div>`:''}
      </div>
    </div>`;
  }).join('');
}


function dateOnlyLocal(value){
  const s=String(value||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const [y,m,d]=s.split('-').map(Number);
  const dt=new Date(y,m-1,d,12,0,0,0);
  return Number.isFinite(dt.getTime())?dt:null;
}

function weeklyCoachData(){
  const now=new Date();
  const end=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59,999);
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6,0,0,0,0);
  const prevEnd=new Date(now.getFullYear(),now.getMonth(),now.getDate()-7,23,59,59,999);
  const prevStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()-13,0,0,0,0);

  const all=(state.ops||[]).filter(o=>o.accountId===state.activeAccount);
  const inRange=(o,a,b)=>{
    const d=dateOnlyLocal(o.date);
    return d && d>=a && d<=b;
  };

  const current=all.filter(o=>inRange(o,start,end));
  const previous=all.filter(o=>inRange(o,prevStart,prevEnd));

  const curExpenses=current.filter(o=>o.type==='expense');
  const prevExpenses=previous.filter(o=>o.type==='expense');
  const curIncome=current.filter(o=>o.type==='income').reduce((s,o)=>s+nonNegativeMoney(o.amount),0);
  const prevIncome=previous.filter(o=>o.type==='income').reduce((s,o)=>s+nonNegativeMoney(o.amount),0);

  const spent=curExpenses.reduce((s,o)=>s+nonNegativeMoney(o.amount),0);
  const prevSpent=prevExpenses.reduce((s,o)=>s+nonNegativeMoney(o.amount),0);
  const daily=spent/7;
  const prevDaily=prevSpent/7;

  const byCat={};
  curExpenses.forEach(o=>{
    const cat=o.cat||'Autres';
    byCat[cat]=(byCat[cat]||0)+nonNegativeMoney(o.amount);
  });
  const categories=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const topCat=categories[0]||null;

  const fixed=curExpenses.filter(o=>o.nature==='fixed').reduce((s,o)=>s+nonNegativeMoney(o.amount),0);
  const variable=curExpenses.filter(o=>o.nature!=='fixed').reduce((s,o)=>s+nonNegativeMoney(o.amount),0);

  const selectedIsCurrent=mk()===calendarMonthKey(now);
  const forecast=selectedIsCurrent?smartForecastModel():null;
  const prudentDaily=Math.max(0,forecast?.safeDaily||0);
  const paceRatio=prudentDaily>0?daily/prudentDaily:0;

  const dailyTotals={};
  curExpenses.forEach(o=>{
    const k=String(o.date||'').slice(0,10);
    dailyTotals[k]=(dailyTotals[k]||0)+nonNegativeMoney(o.amount);
  });
  const highDays=Object.entries(dailyTotals)
    .filter(([_,amount])=>prudentDaily>0 && amount>prudentDaily*1.2)
    .sort((a,b)=>b[1]-a[1]);

  let trendPct=null;
  if(prevSpent>0)trendPct=(spent-prevSpent)/prevSpent*100;

  let status='Stable';
  if((forecast?.risk==='Élevé') || paceRatio>1.25)status='À corriger';
  else if((forecast?.risk==='Moyen') || paceRatio>1.05 || (trendPct!==null&&trendPct>20))status='À surveiller';

  return {
    start,end,prevStart,prevEnd,current,previous,curExpenses,prevExpenses,
    curIncome,prevIncome,spent,prevSpent,daily,prevDaily,categories,topCat,
    fixed,variable,forecast,selectedIsCurrent,prudentDaily,paceRatio,highDays,trendPct,status
  };
}

function weeklyCoachActionPlan(){
  const w=weeklyCoachData();
  const actions=[];

  if(w.forecast && w.forecast.snap.safeAvailable<0){
    actions.push({
      icon:'!',
      title:'Revenir sous le disponible prudent',
      text:`Il manque ${eur(Math.abs(w.forecast.snap.safeAvailable))}. Priorise les dépenses essentielles jusqu’au prochain revenu.`,
      tone:'danger'
    });
  }else if(w.paceRatio>1.15){
    const target=Math.max(0,w.prudentDaily*7);
    actions.push({
      icon:'↘',
      title:'Ralentir légèrement le rythme',
      text:`Tu es au-dessus du repère prudent. Pour les 7 prochains jours, vise environ ${eur(target)} maximum au total.`,
      tone:'warn'
    });
  }else{
    actions.push({
      icon:'✓',
      title:'Garder ce rythme',
      text:`Ton repère prudent est d’environ ${eur(w.prudentDaily)} par jour. La semaine reste cohérente avec ton budget.`,
      tone:'good'
    });
  }

  if(w.topCat){
    const [cat,amount]=w.topCat;
    const limit=nonNegativeMoney(budgets()[cat]);
    const monthlyActual=monthActuals(calendarMonthKey(),state.activeAccount).ops
      .filter(o=>o.type==='expense'&&(o.cat||'Autres')===cat)
      .reduce((s,o)=>s+nonNegativeMoney(o.amount),0);

    if(limit>0){
      const left=limit-monthlyActual;
      if(left<0){
        actions.push({
          icon:'◎',
          title:`Bloquer la hausse de ${baseDisplayName(cat)}`,
          text:`Cette catégorie dépasse déjà son plafond de ${eur(Math.abs(left))}.`,
          tone:'warn'
        });
      }else if(left<amount){
        actions.push({
          icon:'◎',
          title:`Surveiller ${baseDisplayName(cat)}`,
          text:`Il reste ${eur(left)} sur le budget mensuel de cette catégorie.`,
          tone:'warn'
        });
      }else{
        actions.push({
          icon:'◎',
          title:`Repère ${baseDisplayName(cat)}`,
          text:`Tu as dépensé ${eur(amount)} sur ce poste cette semaine. Il reste ${eur(left)} sur son plafond mensuel.`,
          tone:'neutral'
        });
      }
    }else{
      actions.push({
        icon:'◎',
        title:`Observer ${baseDisplayName(cat)}`,
        text:`C’est ton premier poste de la semaine avec ${eur(amount)}.`,
        tone:'neutral'
      });
    }
  }

  if(w.forecast && w.forecast.snap.savingsStillToReserve>0){
    actions.push({
      icon:'◇',
      title:'Protéger l’épargne prévue',
      text:`Il reste ${eur(w.forecast.snap.savingsStillToReserve)} à mettre de côté ce mois-ci.`,
      tone:'neutral'
    });
  }else if(w.forecast && w.forecast.likelyEnd>0 && w.forecast.risk==='Faible'){
    const possible=Math.max(0,Math.min(w.forecast.likelyEnd,w.forecast.conservativeEnd>0?w.forecast.conservativeEnd:w.forecast.likelyEnd));
    if(possible>25){
      actions.push({
        icon:'◇',
        title:'Marge potentielle',
        text:`Le scénario prudent laisse encore environ ${eur(possible)} de marge à ce stade.`,
        tone:'good'
      });
    }
  }

  if(w.highDays.length){
    const [date,amount]=w.highDays[0];
    const d=dateOnlyLocal(date);
    actions.push({
      icon:'◔',
      title:'Repérer les journées fortes',
      text:`Ta journée la plus coûteuse récemment était ${d?d.toLocaleDateString('fr-BE',{weekday:'long'}):date} avec ${eur(amount)}.`,
      tone:'neutral'
    });
  }

  return actions.slice(0,3);
}

function renderWeeklyCoach(){
  const card=document.getElementById('weeklyCoachCard');
  if(!card)return;

  const w=weeklyCoachData();
  const set=(id,value)=>{
    const el=document.getElementById(id);
    if(el)el.textContent=value;
  };

  set('weeklyCoachStatus',w.status);
  const status=document.getElementById('weeklyCoachStatus');
  if(status){
    status.className='weekly-coach-status '+(w.status==='À corriger'?'danger':w.status==='À surveiller'?'warn':'good');
  }

  set('weeklyCoachSpent',eur(w.spent));
  set('weeklyCoachDaily',eur(w.daily)+'/j');
  set('weeklyCoachDailyHint',w.prudentDaily>0?`Repère prudent ${eur(w.prudentDaily)}/j`:'Repère prudent à configurer');

  if(w.topCat){
    set('weeklyCoachTopCat',baseDisplayName(w.topCat[0]));
    set('weeklyCoachTopCatAmount',eur(w.topCat[1]));
  }else{
    set('weeklyCoachTopCat','—');
    set('weeklyCoachTopCatAmount','Aucune dépense');
  }

  if(w.trendPct===null){
    set('weeklyCoachSpentDelta','Pas assez d’historique');
  }else if(Math.abs(w.trendPct)<1){
    set('weeklyCoachSpentDelta','Stable vs semaine précédente');
  }else{
    set('weeklyCoachSpentDelta',`${w.trendPct>0?'+':'−'}${Math.abs(Math.round(w.trendPct))} % vs semaine précédente`);
  }

  let summary='Ta semaine reste équilibrée.';
  if(!w.selectedIsCurrent){
    summary='Le coach hebdomadaire suit toujours les 7 derniers jours réels. Reviens au mois actuel pour comparer au rythme prudent.';
  }else if(!w.curExpenses.length){
    summary='Aucune dépense enregistrée sur les 7 derniers jours.';
  }else if(w.status==='À corriger'){
    summary=`Le rythme de cette semaine est trop élevé par rapport à ton budget prudent.`;
  }else if(w.status==='À surveiller'){
    summary=`La semaine reste gérable, mais certains postes commencent à peser davantage.`;
  }else if(w.trendPct!==null&&w.trendPct<0){
    summary=`Tu as dépensé moins que la semaine précédente tout en restant dans une zone stable.`;
  }else if(w.trendPct!==null&&w.trendPct>0){
    summary=`Tu dépenses un peu plus que la semaine précédente, mais la marge reste correcte.`;
  }
  set('weeklyCoachSummary',summary);

  const paceLabel=document.getElementById('weeklyCoachPaceLabel');
  const bar=document.getElementById('weeklyCoachPaceBar');
  const pct=w.prudentDaily>0?Math.min(140,w.paceRatio*100):0;
  if(paceLabel){
    paceLabel.textContent=w.prudentDaily>0
      ?`${Math.round(w.paceRatio*100)} % du rythme prudent`
      :'À configurer';
  }
  if(bar){
    bar.style.width=Math.min(100,pct)+'%';
    bar.className=w.paceRatio>1.2?'danger':w.paceRatio>1?'warn':'good';
  }

  const actions=weeklyCoachActionPlan();
  const box=document.getElementById('weeklyCoachActions');
  if(box){
    box.innerHTML=actions.length?actions.map((a,i)=>`<div class="weekly-action ${a.tone||'neutral'}">
      <div class="weekly-action-icon">${a.icon}</div>
      <div>
        <small>Action ${i+1}</small>
        <strong>${escHTML(a.title)}</strong>
        <p>${escHTML(a.text)}</p>
      </div>
    </div>`).join(''):'<div class="muted">Pas encore assez de données pour générer un plan.</div>';
  }
}

function sendWeeklyCoachToAssistant(){
  const w=weeklyCoachData();
  const actions=weeklyCoachActionPlan();
  const question='Fais-moi le point sur ma semaine et ce que je devrais surveiller pendant les 7 prochains jours.';
  const result=assistantResult(
    `Bilan de la semaine : ${w.status}`,
    w.spent>0
      ?`Tu as dépensé ${eur(w.spent)} sur les 7 derniers jours, soit ${eur(w.daily)} par jour en moyenne.`
      :'Aucune dépense n’est enregistrée sur les 7 derniers jours.',
    [
      w.trendPct!==null?`${w.trendPct>=0?'Hausse':'Baisse'} de ${Math.abs(Math.round(w.trendPct))} % vs semaine précédente`:'',
      w.topCat?`Premier poste : ${w.topCat[0]} · ${eur(w.topCat[1])}`:'',
      ...actions.map(a=>a.text)
    ].filter(Boolean).slice(0,5),
    w.status==='À corriger'?'danger':w.status==='À surveiller'?'warn':'good'
  );

  assistantPush('user',question);
  assistantPush('assistant','',result);

  const homeBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('home'"));
  if(homeBtn)nav('home',homeBtn);
  setTimeout(()=>{
    renderBudgetAssistant();
    document.getElementById('budgetAssistantCard')?.scrollIntoView({behavior:'smooth',block:'start'});
  },80);
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
function toggleAlertsPanel(force){const p=document.getElementById('alertsPanel');if(!p)return;if(force===false)p.classList.add('hidden');else p.classList.toggle('hidden')}

function actionTodayKey(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function actionSnoozed(id){
  return state.actionSnoozes?.[id]===actionTodayKey();
}

function snoozeActionToday(id){
  if(!state.actionSnoozes||typeof state.actionSnoozes!=='object')state.actionSnoozes={};
  state.actionSnoozes[id]=actionTodayKey();
  save();
  renderAlerts();
  renderActionCenter();
  renderFinalToday();
  showToast('Masqué pour aujourd’hui');
}

function resetActionSnoozes(){
  state.actionSnoozes={};
  save();
  renderAlerts();
  renderActionCenter();
  renderFinalToday();
  showToast('Toutes les priorités sont réaffichées');
}

function actionCenterItems(){
  const items=[];
  const f=smartForecastModel();
  const snap=f.snap;
  const now=new Date();
  const currentView=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const key=mk();

  const push=(item)=>{
    if(!item?.id)return;
    items.push({
      priority:50,
      severity:'info',
      icon:'•',
      ctaLabel:'Voir',
      ...item
    });
  };

  // 1) Hard financial risk
  if(snap.incomeBase>0 && snap.safeAvailable<0){
    push({
      id:'safe-negative',
      priority:100,
      severity:'danger',
      icon:'!',
      title:'Disponible prudent négatif',
      text:`Il manque ${eur(Math.abs(snap.safeAvailable))} pour couvrir les charges et l’épargne déjà réservées.`,
      impact:`Impact ${eur(Math.abs(snap.safeAvailable))}`,
      cta:'assistant',
      ctaLabel:'Analyser'
    });
  }else if(f.same && f.likelyEnd<0){
    push({
      id:'forecast-negative',
      priority:96,
      severity:'danger',
      icon:'↘',
      title:'Fin de mois projetée sous zéro',
      text:`Au rythme actuel, la projection probable arrive à ${eur(f.likelyEnd)}.`,
      impact:`Repère ${eur(Math.max(0,f.safeDaily))}/j`,
      cta:'forecast',
      ctaLabel:'Voir prévision'
    });
  }else if(f.same && f.risk==='Moyen'){
    push({
      id:'forecast-tight',
      priority:76,
      severity:'warn',
      icon:'◔',
      title:'Marge de fin de mois serrée',
      text:`La projection probable est de ${eur(f.likelyEnd)} et le scénario prudent de ${eur(f.conservativeEnd)}.`,
      impact:`Confiance ${f.confidence.toLowerCase()}`,
      cta:'forecast',
      ctaLabel:'Voir'
    });
  }

  // 2) Upcoming recurring expenses
  if(currentView){
    const day=now.getDate();
    (state.recurring||[])
      .filter(r=>r.accountId===state.activeAccount)
      .forEach(r=>{
        const rday=validRecurringDayForMonth(r,key);
        const delta=rday-day;
        if(delta>=0 && delta<=7){
          const when=delta===0?"aujourd’hui":delta===1?"demain":`dans ${delta} jours`;
          push({
            id:`recurring-${r.id}-${key}`,
            priority:delta<=1?92:Math.max(64,84-delta*3),
            severity:delta<=1?'danger':'warn',
            icon:'⌛',
            title:`${r.name} ${when}`,
            text:`${eur(r.amount)} sont prévus ${when}.`,
            impact:`Échéance J${delta===0?'0':'+'+delta}`,
            dueDays:delta,
            cta:'plan',
            ctaLabel:'Voir charges'
          });
        }
      });
  }

  // 3) Category budget pressure
  const actual=monthActuals(key,state.activeAccount);
  const spentByCat={};
  actual.ops.filter(o=>o.type==='expense').forEach(o=>{
    const cat=o.cat||'Autres';
    spentByCat[cat]=(spentByCat[cat]||0)+nonNegativeMoney(o.amount);
  });
  Object.entries(spentByCat).forEach(([cat,spent])=>{
    const limit=nonNegativeMoney(budgets()[cat]);
    if(!limit)return;
    const ratio=spent/limit;
    if(ratio>=1){
      push({
        id:`budget-over-${cat}-${key}`,
        priority:90+Math.min(8,(ratio-1)*20),
        severity:'danger',
        icon:'%',
        title:`Budget ${cat} dépassé`,
        text:`${eur(spent)} utilisés pour un plafond de ${eur(limit)}.`,
        impact:`+${eur(spent-limit)} au-dessus`,
        cta:'categories',
        ctaLabel:'Voir catégorie'
      });
    }else if(ratio>=.82){
      push({
        id:`budget-near-${cat}-${key}`,
        priority:70+Math.min(12,(ratio-.82)*60),
        severity:'warn',
        icon:'%',
        title:`Budget ${cat} presque atteint`,
        text:`Il reste ${eur(limit-spent)} sur ce poste.`,
        impact:`${Math.round(ratio*100)} % utilisé`,
        cta:'categories',
        ctaLabel:'Voir'
      });
    }
  });

  // 4) Category acceleration from smart forecast
  (f.accelerations||[]).slice(0,2).forEach((a,i)=>{
    push({
      id:`accel-${a.cat}-${key}`,
      priority:68-i*4,
      severity:'warn',
      icon:'↑',
      title:`${a.cat} accélère`,
      text:`Le rythme récent est environ ${Math.round(a.pct)} % plus élevé qu’au début du mois.`,
      impact:`7 derniers jours`,
      cta:'assistant',
      ctaLabel:'Comprendre'
    });
  });

  // 5) Savings target
  if(snap.incomeBase>0 && snap.savingsStillToReserve>0){
    const lastDay=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
    const daysLeft=currentView?Math.max(0,lastDay-now.getDate()):lastDay;
    const urgency=daysLeft<=5?82:daysLeft<=10?68:55;
    push({
      id:`savings-gap-${key}`,
      priority:urgency,
      severity:daysLeft<=5?'warn':'info',
      icon:'◇',
      title:'Épargne du mois à compléter',
      text:`Il reste ${eur(snap.savingsStillToReserve)} à mettre de côté pour atteindre le montant prévu.`,
      impact:daysLeft<=5?`${daysLeft} jour${daysLeft>1?'s':''} restant${daysLeft>1?'s':''}`:`Objectif ${eur(snap.plannedSaved)}`,
      cta:'savings',
      ctaLabel:'Mettre de côté'
    });
  }

  // 6) Weekly pace
  if(typeof weeklyCoachData==='function'){
    const w=weeklyCoachData();
    if(w.status==='À corriger'){
      push({
        id:`weekly-correct-${actionTodayKey()}`,
        priority:78,
        severity:'danger',
        icon:'↘',
        title:'Rythme hebdomadaire trop élevé',
        text:`Tu as dépensé ${eur(w.spent)} sur les 7 derniers jours, soit ${eur(w.daily)}/jour.`,
        impact:`Repère ${eur(w.prudentDaily)}/j`,
        cta:'weekly',
        ctaLabel:'Voir coach'
      });
    }else if(w.status==='À surveiller'){
      push({
        id:`weekly-watch-${actionTodayKey()}`,
        priority:61,
        severity:'warn',
        icon:'◔',
        title:'Semaine à surveiller',
        text:`Le rythme des 7 derniers jours commence à dépasser ton repère prudent.`,
        impact:`${eur(w.spent)} cette semaine`,
        cta:'weekly',
        ctaLabel:'Voir coach'
      });
    }
  }

  // 7) Smart automation candidates waiting for validation
  if(typeof automationSuggestionPool==='function'){
    const pool=automationSuggestionPool().filter(x=>{
      const token=x.type==='rule'?`rule:${x.key}`:`recurring:${x.name}`;
      return !(state.automationDismissed||[]).includes(token);
    });
    if(pool.length){
      const first=pool[0];
      push({
        id:`automation-${first.type}-${first.key||first.name}`,
        priority:42,
        severity:'info',
        icon:'✦',
        title:pool.length===1?'1 suggestion intelligente à valider':`${pool.length} suggestions intelligentes à valider`,
        text:first.type==='recurring'
          ?`${first.name} ressemble à une dépense récurrente.`
          :`${first.name} peut être mémorisé automatiquement en ${first.cat}.`,
        impact:'Validation manuelle',
        cta:'automation',
        ctaLabel:'Vérifier'
      });
    }
  }

  return items
    .filter(x=>!actionSnoozed(x.id))
    .sort((a,b)=>b.priority-a.priority);
}

function actionCenterRun(id){
  const item=actionCenterItems().find(x=>x.id===id);
  if(!item)return;

  if(item.cta==='assistant'){
    toggleAlertsPanel(false);
    openBudgetAssistant();
    return;
  }
  if(item.cta==='forecast'){
    toggleAlertsPanel(false);
    const homeBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('home'"));
    if(homeBtn)nav('home',homeBtn);
    setTimeout(()=>document.getElementById('predictionsCard')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    return;
  }
  if(item.cta==='plan'){
    toggleAlertsPanel(false);
    openUpcomingTimeline();
    return;
  }
  if(item.cta==='savings'){
    toggleAlertsPanel(false);
    openSavingPanel();
    return;
  }
  if(item.cta==='weekly'){
    toggleAlertsPanel(false);
    const homeBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('home'"));
    if(homeBtn)nav('home',homeBtn);
    setTimeout(()=>document.getElementById('weeklyCoachCard')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    return;
  }
  if(item.cta==='automation'){
    toggleAlertsPanel(false);
    const homeBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('home'"));
    if(homeBtn)nav('home',homeBtn);
    setTimeout(()=>document.querySelector('.smart-automation-card')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    return;
  }
  if(item.cta==='categories'){
    toggleAlertsPanel(false);
    const homeBtn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('home'"));
    if(homeBtn)nav('home',homeBtn);
    setTimeout(()=>document.getElementById('cats')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }
}

function actionCardHTML(a,compact=false){
  const safeId=encodeURIComponent(a.id);
  if(compact){
    return `<div class="action-preview-item ${a.severity}">
      <div class="action-preview-icon">${a.icon}</div>
      <div class="action-preview-main">
        <strong>${escHTML(a.title)}</strong>
        <span>${escHTML(a.impact||a.text)}</span>
      </div>
      <button type="button" onclick="actionCenterRun(decodeURIComponent('${safeId}'))">→</button>
    </div>`;
  }
  return `<div class="smart-alert-item ${a.severity}">
    <div class="smart-alert-icon">${a.icon}</div>
    <div class="smart-alert-main">
      <div class="smart-alert-topline">
        <small>${a.priority>=90?'Urgent':a.priority>=70?'Prioritaire':a.priority>=55?'À surveiller':'Suggestion'}</small>
        <span>${escHTML(a.impact||'')}</span>
      </div>
      <strong>${escHTML(a.title)}</strong>
      <p>${escHTML(a.text)}</p>
      <div class="smart-alert-actions">
        <button type="button" onclick="actionCenterRun(decodeURIComponent('${safeId}'))">${escHTML(a.ctaLabel||'Voir')}</button>
        <button type="button" class="ghost" onclick="snoozeActionToday(decodeURIComponent('${safeId}'))">Masquer aujourd’hui</button>
      </div>
    </div>
  </div>`;
}

function renderActionCenter(){
  const preview=document.getElementById('actionCenterPreview');
  if(!preview)return;

  const items=actionCenterItems();
  const urgent=items.filter(x=>x.priority>=90).length;
  const week=items.filter(x=>x.dueDays===undefined||x.dueDays<=7).length;

  const count=document.getElementById('actionCenterCount');
  const urgentEl=document.getElementById('actionCenterUrgent');
  const weekEl=document.getElementById('actionCenterWeek');
  if(count)count.textContent=items.length;
  if(urgentEl)urgentEl.textContent=urgent;
  if(weekEl)weekEl.textContent=week;

  if(!items.length){
    preview.innerHTML=`<div class="action-center-empty">
      <div>✓</div>
      <strong>Rien d’important à traiter</strong>
      <span>L’app continue de surveiller les échéances, budgets et prévisions.</span>
    </div>`;
    return;
  }

  preview.innerHTML=items.slice(0,3).map(x=>actionCardHTML(x,true)).join('');
}

function buildAlerts(){
  return actionCenterItems().map(a=>({
    type:a.severity==='danger'?'bad':a.severity==='warn'?'warn':'good',
    icon:a.icon,
    title:a.title,
    text:a.text,
    id:a.id,
    priority:a.priority
  }));
}
function renderAlerts(){
  const list=document.getElementById('alertsList'),count=document.getElementById('alertCount');
  if(!list||!count)return;

  const items=actionCenterItems();
  const urgent=items.filter(x=>x.priority>=90).length;
  count.textContent=urgent>0?urgent:items.length;
  count.classList.toggle('hidden',items.length===0);

  const summary=document.getElementById('alertsSummaryText');
  if(summary){
    summary.textContent=!items.length
      ?'Aucune priorité active pour aujourd’hui.'
      :urgent>0
        ?`${urgent} priorité${urgent>1?'s':''} urgente${urgent>1?'s':''} · ${items.length} élément${items.length>1?'s':''} au total`
        :`${items.length} élément${items.length>1?'s':''} classé${items.length>1?'s':''} par importance`;
  }

  list.innerHTML=items.length
    ?items.map(a=>actionCardHTML(a,false)).join('')
    :`<div class="empty-state"><div class="empty-icon">✓</div><strong>Tout est calme</strong><small>Aucune action importante pour le moment.</small></div>`;
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
  const level=document.getElementById('todayPriorityLevel');
  if(!title||!text)return;

  const s=financialSnapshot();
  const items=actionCenterItems();

  if(!s.incomeBase){
    title.textContent='Configure ton revenu';
    text.textContent='Ajoute ton revenu ou ton plan mensuel pour activer le pilotage complet.';
    if(level)level.textContent='À faire';
    return;
  }

  if(items.length){
    const top=items[0];
    title.textContent=top.title;
    text.textContent=top.text;
    if(level){
      level.textContent=top.priority>=90?'Urgent':top.priority>=70?'Prioritaire':top.priority>=55?'À surveiller':'Info';
      level.className=top.severity;
    }
    return;
  }

  title.textContent='Tout va bien';
  text.textContent='Aucune priorité importante détectée pour aujourd’hui.';
  if(level){
    level.textContent='Calme';
    level.className='good';
  }
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
  const f=smartForecastModel();

  let projected=f.snap.safeAvailable;
  let daily='—';
  let days='—';
  let risk=f.risk;
  let stateLabel='Stable';
  let pct=72;
  let txt='';

  if(f.same){
    projected=f.likelyEnd;
    daily=eur(f.safeDaily);
    days=f.safeDays;
    if(f.risk==='Élevé'){
      stateLabel='À corriger';pct=22;
      txt=`Projection probable ${eur(f.likelyEnd)} · scénario prudent ${eur(f.conservativeEnd)}.`;
    }else if(f.risk==='Moyen'){
      stateLabel='À surveiller';pct=48;
      txt=`Marge probable ${eur(f.likelyEnd)} · vise environ ${eur(f.safeDaily)} maximum par jour.`;
    }else{
      stateLabel='Stable';pct=78;
      txt=`Projection probable ${eur(f.likelyEnd)} avec un repère sûr de ${eur(f.safeDaily)} par jour.`;
    }
  }else if(f.past){
    projected=f.snap.safeAvailable;
    stateLabel='Clôturé';
    risk=projected<0?'Élevé':'—';
    pct=projected<0?25:100;
    txt=`Solde prudent constaté pour ce mois : ${eur(projected)}.`;
  }else{
    projected=f.snap.safeAvailable;
    stateLabel='Prévu';
    risk=projected<0?'Élevé':projected<Math.max(100,f.snap.incomeBase*.08)?'Moyen':'Faible';
    pct=projected<0?22:risk==='Moyen'?48:72;
    txt=`Plan du mois : ${eur(projected)} disponibles après réserves connues.`;
  }

  premiumProjectionAmount.textContent=eur(projected);
  premiumDailyRate.textContent=daily;
  premiumDaysLeft.textContent=days;
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



function financialDataAudit(){
  const errors=[];
  const warnings=[];
  const info=[];

  const add=(bucket,code,title,text)=>bucket.push({code,title,text});

  try{
    const s=financialSnapshot();

    // Core number validity + exact snapshot equation.
    const numericFields=[
      ['realIncome',s.realIncome],['incomeBase',s.incomeBase],['expenses',s.expenses],
      ['actualSaved',s.actualSaved],['plannedSaved',s.plannedSaved],
      ['pendingRecurring',s.pendingRecurring],['fixedPlanGap',s.fixedPlanGap],
      ['safeAvailable',s.safeAvailable]
    ];
    numericFields.forEach(([name,value])=>{
      if(!Number.isFinite(Number(value))){
        add(errors,'number-'+name,'Valeur financière invalide',`${name} n’est pas un nombre valide.`);
      }
    });

    const expected=
      s.incomeBase-s.expenses-s.actualSaved-s.savingsStillToReserve-s.pendingRecurring-s.fixedPlanGap;
    if(Math.abs(expected-s.safeAvailable)>.005){
      add(errors,'snapshot-equation','Calcul du disponible incohérent',
        `Le disponible calculé diffère de ${eur(Math.abs(expected-s.safeAvailable))}.`);
    }

    // Operations.
    const accountIds=new Set((state.accounts||[]).map(a=>a.id));
    const allowedTypes=new Set(['expense','income','transfer_out','transfer_in']);
    const opIds=new Map();

    (state.ops||[]).forEach((o,i)=>{
      if(!allowedTypes.has(o.type)){
        add(warnings,`op-type-${i}`,'Type d’opération inconnu',`${o.name||'Opération'} utilise le type “${o.type||'vide'}”.`);
      }
      if(!accountIds.has(o.accountId)){
        add(errors,`op-account-${i}`,'Compte introuvable',`${o.name||'Opération'} pointe vers un compte supprimé ou inexistant.`);
      }
      if(!/^\d{4}-\d{2}-\d{2}/.test(String(o.date||''))){
        add(warnings,`op-date-${i}`,'Date à vérifier',`${o.name||'Opération'} n’a pas une date standard.`);
      }
      if(!Number.isFinite(Number(o.amount)) || Number(o.amount)<0){
        add(errors,`op-amount-${i}`,'Montant invalide',`${o.name||'Opération'} possède un montant incorrect.`);
      }
      if(o.id){
        opIds.set(o.id,(opIds.get(o.id)||0)+1);
      }
    });

    [...opIds.entries()].filter(([,count])=>count>1).forEach(([id,count])=>{
      add(errors,`dup-op-${id}`,'Identifiant d’opération dupliqué',`${count} opérations partagent le même identifiant.`);
    });

    // Transfer pairs.
    const transferGroups={};
    (state.ops||[]).filter(o=>o.transferGroup).forEach(o=>{
      (transferGroups[o.transferGroup]||(transferGroups[o.transferGroup]=[])).push(o);
    });
    Object.entries(transferGroups).forEach(([group,rows])=>{
      const outs=rows.filter(x=>x.type==='transfer_out');
      const ins=rows.filter(x=>x.type==='transfer_in');
      if(rows.length!==2 || outs.length!==1 || ins.length!==1){
        add(errors,`transfer-shape-${group}`,'Transfert incomplet',`Le transfert ${group} ne possède pas exactement une sortie et une entrée.`);
        return;
      }
      if(Math.abs(nonNegativeMoney(outs[0].amount)-nonNegativeMoney(ins[0].amount))>.005){
        add(errors,`transfer-amount-${group}`,'Montants de transfert différents','Les deux côtés du transfert n’ont pas le même montant.');
      }
    });

    // Recurring duplicates per month.
    const recurringSeen=new Map();
    (state.ops||[]).filter(o=>o.recurringId).forEach(o=>{
      const token=`${o.accountId}|${o.recurringId}|${String(o.date||'').slice(0,7)}`;
      recurringSeen.set(token,(recurringSeen.get(token)||0)+1);
    });
    [...recurringSeen.entries()].filter(([,count])=>count>1).forEach(([token,count])=>{
      add(errors,`recurring-dup-${token}`,'Charge récurrente dupliquée',`${count} écritures existent pour la même charge et le même mois.`);
    });

    // Savings references.
    const goalIds=new Set((state.goals||[]).map(g=>g.id));
    const envelopeIds=new Set((state.savingsEnvelopes||[]).map(e=>e.id));
    (state.savingsEntries||[]).forEach((e,i)=>{
      if(e.goalId && !goalIds.has(e.goalId)){
        add(warnings,`saving-goal-${i}`,'Objectif d’épargne introuvable',`${e.note||'Une épargne'} référence un objectif supprimé.`);
      }
      if(e.envelopeId && !envelopeIds.has(e.envelopeId)){
        add(warnings,`saving-envelope-${i}`,'Enveloppe introuvable',`${e.note||'Une épargne'} référence une enveloppe supprimée.`);
      }
      if(!Number.isFinite(Number(e.amount))){
        add(errors,`saving-amount-${i}`,'Mouvement d’épargne invalide',`${e.note||'Épargne'} possède un montant incorrect.`);
      }
    });

    // Planning coverage information.
    if(s.plannedFixed>0 && s.fixedPlanGap>0){
      add(info,'fixed-gap','Charges fixes encore réservées',
        `${eur(s.fixedPlanGap)} du plan de charges fixes restent réservés en plus des récurrents connus.`);
    }
    if(s.savingsStillToReserve>0){
      add(info,'saving-gap','Épargne encore réservée',
        `${eur(s.savingsStillToReserve)} restent protégés pour l’objectif du mois.`);
    }

    if(!s.incomeBase){
      add(warnings,'income-missing','Revenu non défini','Le pilotage prudent sera moins précis tant qu’aucun revenu réel ou prévu n’est renseigné.');
    }
  }catch(err){
    add(errors,'audit-crash','Audit impossible',String(err?.message||err));
  }

  const score=Math.max(0,100-errors.length*22-warnings.length*7);
  return {errors,warnings,info,score,checkedAt:new Date().toISOString()};
}

function renderFinancialAudit(audit=financialDataAudit()){
  const chip=document.getElementById('dataHealthChip');
  const score=document.getElementById('dataHealthScore');
  const errors=document.getElementById('dataHealthErrors');
  const warnings=document.getElementById('dataHealthWarnings');
  const list=document.getElementById('dataHealthList');
  const snapshot=document.getElementById('dataHealthSnapshot');

  if(score)score.textContent=audit.score+' %';
  if(errors)errors.textContent=audit.errors.length;
  if(warnings)warnings.textContent=audit.warnings.length;

  if(chip){
    chip.className='data-health-chip '+(
      audit.errors.length?'bad':
      audit.warnings.length?'warn':'good'
    );
    chip.textContent=audit.errors.length?'À corriger':audit.warnings.length?'À vérifier':'Stable';
  }

  if(snapshot){
    const s=financialSnapshot();
    snapshot.innerHTML=`
      <div><span>Disponible prudent</span><b>${eur(s.safeAvailable)}</b></div>
      <div><span>Fixes encore réservés</span><b>${eur(s.totalFixedReserve)}</b></div>
      <div><span>Épargne réservée</span><b>${eur(s.savingsStillToReserve)}</b></div>
    `;
  }

  if(list){
    const rows=[
      ...audit.errors.map(x=>({...x,tone:'bad',label:'Erreur'})),
      ...audit.warnings.map(x=>({...x,tone:'warn',label:'À vérifier'})),
      ...audit.info.map(x=>({...x,tone:'info',label:'Info'}))
    ];
    list.innerHTML=rows.length
      ?rows.slice(0,10).map(x=>`<div class="data-health-row ${x.tone}">
          <div><small>${x.label}</small><strong>${escHTML(x.title)}</strong><span>${escHTML(x.text)}</span></div>
        </div>`).join('')
      :`<div class="data-health-ok"><span>✓</span><div><strong>Aucune incohérence détectée</strong><small>Les principaux calculs et liens internes sont cohérents.</small></div></div>`;
  }
  return audit;
}

function runManualFinancialAudit(){
  const audit=renderFinancialAudit(financialDataAudit());
  if(audit.errors.length)showToast(`${audit.errors.length} erreur${audit.errors.length>1?'s':''} détectée${audit.errors.length>1?'s':''}`);
  else if(audit.warnings.length)showToast(`${audit.warnings.length} point${audit.warnings.length>1?'s':''} à vérifier`);
  else showToast('Santé des données : OK ✓');
}

function runFinancialIntegrityCheck(){
  const audit=financialDataAudit();
  if(audit.errors.length||audit.warnings.length){
    console.warn('[Mon Budget] Audit financier',audit);
  }
  renderFinancialAudit(audit);
  return [...audit.errors,...audit.warnings];
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
  rDay.innerHTML=Array.from({length:31},(_,i)=>`<option value="${i+1}">Le ${i+1}</option>`).join('');
  tFrom.innerHTML=state.accounts.map(a=>`<option value="${a.id}" ${a.id===state.activeAccount?'selected':''}>${a.name}</option>`).join('');
  tTo.innerHTML=state.accounts.map(a=>`<option value="${a.id}" ${a.id!==state.activeAccount?'selected':''}>${a.name}</option>`).join('');
  month.textContent=fullMonthLabel();

  let a=mo(),inc=a.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0),exp=a.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0),sav=monthlySavedActual(),snap=financialSnapshot(),rem=snap.safeAvailable;
  income.textContent=eur(inc);expenses.textContent=eur(exp);savingReserve.textContent=eur(sav);remaining.textContent=eur(rem);[income,expenses,savingReserve,remaining].forEach(animateNumberEl);const sa=document.getElementById('summaryAvailable'),sf=document.getElementById('summaryForecast');if(sa)sa.textContent=eur(rem);renderPremium(a,inc,exp);
  let p=inc?Math.min(100,exp/inc*100):0;
  fill.style.width=p+'%';
  const spendTone=p>=95?'danger':p>=80?'warn':p>=65?'mid':'good';
  fill.className='fill spend-'+spendTone;
  percent.textContent=Math.round(p)+' % des revenus dépensés';
  percent.className='muted spend-ratio spend-'+spendTone;
  let tb=cats.reduce((s,c)=>s+(+budgets()[c]||0),0);globalNotice.innerHTML=!tb?'<div class="notice warn">Définis tes budgets pour activer les alertes.</div>':exp/tb<.75?`<div class="notice good">Budget OK · ${eur(tb-exp)} restant.</div>`:exp/tb<=1?`<div class="notice warn">${Math.round(exp/tb*100)} % du budget utilisé.</div>`:`<div class="notice bad">Dépassé de ${eur(exp-tb)}.</div>`;

  let future=snap.pendingRecurring,forecast=snap.safeAvailable;
  const legacyForecastAmount=document.getElementById('forecastAmount');
  const legacyForecastText=document.getElementById('forecastText');
  if(legacyForecastAmount)legacyForecastAmount.textContent=eur(forecast);
  if(legacyForecastText)legacyForecastText.textContent=`Après ${eur(future)} de charges récurrentes restantes et ${eur(Math.max(snap.plannedSaved,snap.actualSaved))} d’épargne réservée.`;
  if(sf)sf.textContent=eur(forecast);
  let now=new Date(),same=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const smartForecast=smartForecastModel();
  const legacyDailyAmount=document.getElementById('dailyAmount');
  const legacyDailyText=document.getElementById('dailyText');
  if(same){
    if(legacyDailyAmount)legacyDailyAmount.textContent=eur(Math.max(0,smartForecast.safeDaily))+' / jour';
    if(legacyDailyText)legacyDailyText.textContent=`Repère prudent sur ${smartForecast.safeDays} jour${smartForecast.safeDays>1?'s':''}, charges et épargne déjà réservées.`;
  }else{
    if(legacyDailyAmount)legacyDailyAmount.textContent='—';
    if(legacyDailyText)legacyDailyText.textContent=view<new Date(now.getFullYear(),now.getMonth(),1)?'Mois clôturé.':'Le rythme quotidien apparaîtra au début de ce mois.';
  }

  renderCats(a);renderFiltered();renderBudgets();renderRecurring();renderGoals();renderStats();renderComparison();renderUpcoming();renderSmartInsights();renderAnomalies();renderCalendar();renderTemplates();renderRules();renderPredictions();renderAutomationSuggestions();renderLearnedMerchants();renderBudgetAssistant();renderBudgetSimulator();renderWeeklyCoach();renderHeroTrend();renderGoalShowcase();renderMonthlyPilot();renderSavingsModule();renderSavingEnvelopes();renderSavingsHistory();renderMonthlyReport();renderFocusCard();renderCategoryManager();renderAlerts();renderActionCenter();renderFinalToday();renderPremiumProjection();renderAnnualPremium();renderPatrimony();loadMonthlyPlanInputs();applyDashboardPrefs();renderCloudStatus();renderSettingsOverview();renderSmartNotificationSettings();renderPersonalSafety();scheduleSmartNotificationCheck();
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
let activityQuickFilter='all';
function setActivityQuickFilter(filter,btn){
  activityQuickFilter=filter||'all';
  document.querySelectorAll('[data-activity-filter]').forEach(b=>b.classList.toggle('active',b===btn || b.dataset.activityFilter===activityQuickFilter));
  renderFiltered();
}
function clearActivityFilters(){
  activityQuickFilter='all';
  document.querySelectorAll('[data-activity-filter]').forEach(b=>b.classList.toggle('active',b.dataset.activityFilter==='all'));
  if(searchInput)searchInput.value='';
  if(filterCat)filterCat.value='';
  const scope=document.getElementById('filterScope'),tag=document.getElementById('filterTag'),min=document.getElementById('filterMin'),max=document.getElementById('filterMax');
  if(scope)scope.value='';if(tag)tag.value='';if(min)min.value='';if(max)max.value='';
  renderFiltered();
}
function activityTypeInfo(x){
  if(x.type==='income')return {sign:'+',cls:'income',icon:'↗',label:'Revenu'};
  if(x.type==='transfer_in')return {sign:'+',cls:'income',icon:'⇄',label:'Transfert reçu'};
  if(x.type==='transfer_out')return {sign:'−',cls:'activity-transfer-out',icon:'⇄',label:'Transfert envoyé'};
  return {sign:'−',cls:'danger',icon:'↙',label:x.cat||'Dépense'};
}
function activityDateLabel(dateStr){
  const raw=String(dateStr||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return 'Sans date';
  const d=new Date(raw+'T12:00:00');
  if(Number.isNaN(d.getTime()))return 'Sans date';
  const today=new Date(), yesterday=new Date();yesterday.setDate(today.getDate()-1);
  const same=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
  if(same(d,today))return "Aujourd’hui";
  if(same(d,yesterday))return 'Hier';
  return d.toLocaleDateString('fr-BE',{weekday:'long',day:'numeric',month:'long'}).replace(/^./,c=>c.toUpperCase());
}
function renderActivitySummary(all){
  const income=all.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount||0),0);
  const expenses=all.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount||0),0);
  const net=income-expenses;
  const inc=document.getElementById('activityIncome'),exp=document.getElementById('activityExpenses'),netEl=document.getElementById('activityNet'),cnt=document.getElementById('activityCount'),title=document.getElementById('activityMonthTitle');
  if(inc)inc.textContent=eur(income);if(exp)exp.textContent=eur(expenses);
  if(netEl){netEl.textContent=(net>=0?'+ ':'− ')+eur(Math.abs(net));netEl.className=net>=0?'income':'danger'}
  if(cnt)cnt.textContent=`${all.length} opération${all.length>1?'s':''}`;
  if(title)title.textContent=view.toLocaleDateString('fr-BE',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase());
}
function renderFiltered(){
  const all=mo();
  renderActivitySummary(all);
  let a=all.slice(),q=(searchInput?.value||'').trim().toLowerCase(),fc=filterCat?.value||'',scope=document.getElementById('filterScope')?.value||'',tag=(document.getElementById('filterTag')?.value||'').trim().toLowerCase(),min=+(document.getElementById('filterMin')?.value||0),max=+(document.getElementById('filterMax')?.value||0);
  a=a.filter(x=>{
    const typeOk=activityQuickFilter==='all'||
      (activityQuickFilter==='expense'&&x.type==='expense')||
      (activityQuickFilter==='income'&&x.type==='income')||
      (activityQuickFilter==='fixed'&&x.type==='expense'&&x.nature==='fixed')||
      (activityQuickFilter==='variable'&&x.type==='expense'&&x.nature==='variable');
    const text=[x.name,x.cat,x.nature,x.scope,...(x.tags||[])].filter(Boolean).join(' ').toLowerCase();
    return typeOk&&(!q||text.includes(q))&&(!fc||x.cat===fc)&&(!scope||x.scope===scope)&&(!tag||(x.tags||[]).some(t=>String(t).toLowerCase().includes(tag)))&&(!min||Number(x.amount)>=min)&&(!max||Number(x.amount)<=max);
  });
  a.sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')) || String(y.id||'').localeCompare(String(x.id||'')));

  const resultsText=document.getElementById('activityResultsText'),filteredTotal=document.getElementById('activityFilteredTotal');
  if(resultsText)resultsText.textContent=a.length===all.length?'Toutes les opérations':`${a.length} résultat${a.length>1?'s':''}`;
  const visibleIn=a.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount||0),0);
  const visibleOut=a.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount||0),0);
  if(filteredTotal)filteredTotal.textContent=a.length?`${eur(visibleIn)} entrées · ${eur(visibleOut)} sorties`:'—';

  if(!a.length){
    list.innerHTML='<div class="activity-empty"><span>◎</span><strong>Aucune opération trouvée</strong><small>Change les filtres ou ajoute une nouvelle opération.</small></div>';
    return;
  }

  const groups={};
  a.forEach(x=>{const day=String(x.date||'').slice(0,10)||'Sans date';(groups[day]||(groups[day]=[])).push(x)});
  list.innerHTML=Object.entries(groups).map(([day,ops])=>{
    const dayIn=ops.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount||0),0);
    const dayOut=ops.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount||0),0);
    const dayNet=dayIn-dayOut;
    const rows=ops.map(x=>{
      const ti=activityTypeInfo(x),meta=[x.cat||ti.label,x.nature==='fixed'?'Fixe':x.nature==='variable'?'Variable':'',x.scope==='pro'?'Pro':x.scope==='personal'?'Perso':''].filter(Boolean);
      return `<div class="activity-item">
        <div class="activity-icon ${x.type==='income'||x.type==='transfer_in'?'is-income':x.type==='transfer_out'?'is-transfer':'is-expense'}">${ti.icon}</div>
        <div class="activity-main"><strong>${escHTML(x.name||'Opération')}</strong><div class="activity-meta">${meta.map(escHTML).join(' · ')}</div>${(x.tags||[]).length?`<div class="activity-tags">${x.tags.map(t=>`<span>${escHTML(t)}</span>`).join('')}</div>`:''}</div>
        <div class="activity-side"><b class="${ti.cls}">${ti.sign} ${eur(x.amount)}</b><div class="activity-item-actions"><button onclick="editOp('${x.id}')" aria-label="Modifier">Modifier</button><button onclick="deleteOp('${x.id}')" aria-label="Supprimer">Suppr.</button></div></div>
      </div>`;
    }).join('');
    return `<div class="activity-day"><div class="activity-day-head"><span>${activityDateLabel(day)}</span><b class="${dayNet>=0?'income':'danger'}">${dayNet>=0?'+':'−'} ${eur(Math.abs(dayNet))}</b></div>${rows}</div>`;
  }).join('');
}
function renderBudgets(){budgetEditors.innerHTML=cats.map(c=>`<div class="budget-editor"><span>${c}</span><input type="number" data-cat="${c}" value="${budgets()[c]||''}" placeholder="0 €"></div>`).join('')}function saveBudgets(){document.querySelectorAll('[data-cat]').forEach(i=>budgets()[i.dataset.cat]=Math.max(0,+i.value||0));render()}
function addAccount(){let n=newAccountName.value.trim();if(!n)return;let id='acc_'+Date.now();state.accounts.push({id,name:n});state.budgets[id]={};state.activeAccount=id;newAccountName.value='';toggle('accountForm');render()}
function toggle(id){document.getElementById(id).classList.toggle('hidden')}function changeMonth(n){view.setMonth(view.getMonth()+n);render()}function nav(id,b){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('.bottomnav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(id==='stats')renderStats();if(id==='report')renderMonthlyReport()}
function showForm(id,b){document.querySelectorAll('#ops form').forEach(f=>f.style.display='none');document.getElementById(id).style.display='block';document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active')}

expenseForm.onsubmit=e=>{e.preventDefault();const amount=nonNegativeMoney(eAmount.value);if(amount<=0)return showToast('Entre un montant supérieur à 0 €');state.ops.push({id:'op_'+Date.now(),type:'expense',name:eName.value,amount,cat:applyRules(eName.value,eCat.value),nature:eNature.value,scope:eScope.value,tags:eTags.value.split(',').map(x=>x.trim()).filter(Boolean),date:eDate.value+'T12:00:00',accountId:state.activeAccount});e.target.reset();render();showToast('Dépense ajoutée')};
incomeForm.onsubmit=e=>{e.preventDefault();const amount=nonNegativeMoney(iAmount.value);if(amount<=0)return showToast('Entre un montant supérieur à 0 €');state.ops.push({id:'op_'+Date.now(),type:'income',name:iName.value,amount,cat:'',date:iDate.value+'T12:00:00',accountId:state.activeAccount});e.target.reset();render();showToast('Revenu ajouté')};
transferForm.onsubmit=e=>{e.preventDefault();if(tFrom.value===tTo.value)return alert('Choisis deux comptes différents.');let a=nonNegativeMoney(tAmount.value),d=tDate.value,g='tr_'+Date.now();if(a<=0)return showToast('Entre un montant supérieur à 0 €');state.ops.push({id:g+'a',type:'transfer_out',name:'Transfert',amount:a,cat:'Transfert',date:d+'T12:00:00',accountId:tFrom.value,transferGroup:g},{id:g+'b',type:'transfer_in',name:'Transfert',amount:a,cat:'Transfert',date:d+'T12:00:00',accountId:tTo.value,transferGroup:g});e.target.reset();render()};
function deleteOp(id){
  const x=state.ops.find(o=>o.id===id);
  if(!x)return;

  // A transfer is one logical operation represented by two rows.
  // Never leave one side orphaned.
  if(x.transferGroup){
    state.ops=state.ops.filter(o=>o.transferGroup!==x.transferGroup);
    save();render();showToast('Transfert supprimé des deux comptes');
    return;
  }

  // Deleting an auto-posted recurring expense means "skip this month".
  // It must not be silently recreated on the next render.
  if(x.recurringId){
    markRecurringSkipped(x.recurringId,String(x.date||'').slice(0,7));
  }

  state.ops=state.ops.filter(o=>o.id!==id);
  save();render();
  showToast(x.recurringId?'Charge ignorée pour ce mois':'Opération supprimée');
}
function editOp(id){
  const x=state.ops.find(o=>o.id===id);if(!x)return;
  const n=prompt('Nom',x.name);if(n===null)return;
  const raw=prompt('Montant',x.amount);if(raw===null)return;
  const amount=nonNegativeMoney(raw);
  if(amount<=0)return showToast('Entre un montant supérieur à 0 €');

  const name=n.trim()||x.name;

  if(x.transferGroup){
    const pair=state.ops.filter(o=>o.transferGroup===x.transferGroup);
    pair.forEach(o=>{
      o.name=name;
      o.amount=amount;
    });
    save();render();showToast('Transfert modifié sur les deux comptes');
    return;
  }

  x.name=name;
  x.amount=amount;
  save();render();showToast('Opération modifiée');
}

function addRecurring(){let n=rName.value.trim(),a=nonNegativeMoney(rAmount.value);if(!n||a<=0)return;state.recurring.push({id:'rec_'+Date.now(),name:n,amount:a,cat:rCat.value,day:Math.round(clampNumber(rDay.value,1,31)),accountId:state.activeAccount});rName.value='';rAmount.value='';render()}
function renderRecurring(){recurringList.innerHTML=state.recurring.filter(r=>r.accountId===state.activeAccount).map(r=>`<div class="rec"><div class="goalhead"><span><strong>${r.name}</strong><br><span class="muted">${r.cat} · le ${r.day}</span></span><b>${eur(r.amount)}</b></div><div class="actions"><button onclick="deleteRecurring('${r.id}')">Supprimer</button></div></div>`).join('')||'<div class="muted">Aucune dépense récurrente.</div>'}
function deleteRecurring(id){state.recurring=state.recurring.filter(r=>r.id!==id);render()}
function applyRecurring(){
  const k=mk();
  const now=new Date();
  const isCurrent=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();

  // Critical V24.6 rule:
  // browsing a past or future month must NEVER create financial operations.
  if(!isCurrent)return;

  const today=now.getDate();
  let changed=false;

  (state.recurring||[]).forEach(r=>{
    const effectiveDay=validRecurringDayForMonth(r,k);
    const due=effectiveDay<=today;
    if(!due)return;
    if(isRecurringSkipped(r.id,k))return;
    if(state.ops.some(x=>x.recurringId===r.id&&x.accountId===r.accountId&&String(x.date||'').startsWith(k)))return;

    const d=String(effectiveDay).padStart(2,'0');

    state.ops.push({
      id:'op_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      type:'expense',
      name:r.name,
      amount:nonNegativeMoney(r.amount),
      cat:r.cat,
      nature:'fixed',
      date:k+'-'+d+'T12:00:00',
      accountId:r.accountId,
      recurringId:r.id,
      scope:'personal',
      tags:[]
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
const SMART_NOTIFICATION_PREFS_KEY='monBudgetNotificationPrefsV1';
const SMART_NOTIFICATION_LOG_KEY='monBudgetNotificationLogV1';

function defaultSmartNotificationPrefs(){
  return {
    master:true,
    upcoming:true,
    budget:true,
    risk:true,
    savings:true
  };
}

function smartNotificationPrefs(){
  try{
    const raw=JSON.parse(localStorage.getItem(SMART_NOTIFICATION_PREFS_KEY)||'null');
    return {...defaultSmartNotificationPrefs(),...(raw&&typeof raw==='object'?raw:{})};
  }catch(e){
    return defaultSmartNotificationPrefs();
  }
}

function smartNotificationLog(){
  try{
    const raw=JSON.parse(localStorage.getItem(SMART_NOTIFICATION_LOG_KEY)||'{}');
    return raw&&typeof raw==='object'?raw:{};
  }catch(e){
    return {};
  }
}

function saveSmartNotificationLog(log){
  try{localStorage.setItem(SMART_NOTIFICATION_LOG_KEY,JSON.stringify(log||{}))}catch(e){}
}

function saveSmartNotificationPrefs(){
  const prefs=smartNotificationPrefs();
  const read=(id,fallback)=>{
    const el=document.getElementById(id);
    return el?!!el.checked:fallback;
  };
  prefs.upcoming=read('notifyUpcoming',prefs.upcoming);
  prefs.budget=read('notifyBudget',prefs.budget);
  prefs.risk=read('notifyRisk',prefs.risk);
  prefs.savings=read('notifySavings',prefs.savings);
  try{localStorage.setItem(SMART_NOTIFICATION_PREFS_KEY,JSON.stringify(prefs))}catch(e){}
  renderSmartNotificationSettings();
}

function smartNotificationPermission(){
  if(!('Notification' in window))return 'unsupported';
  return Notification.permission||'default';
}

function renderSmartNotificationSettings(){
  const prefs=smartNotificationPrefs();
  const permission=smartNotificationPermission();

  const setChecked=(id,value)=>{
    const el=document.getElementById(id);
    if(el)el.checked=!!value;
  };
  setChecked('notifyUpcoming',prefs.upcoming);
  setChecked('notifyBudget',prefs.budget);
  setChecked('notifyRisk',prefs.risk);
  setChecked('notifySavings',prefs.savings);

  const chip=document.getElementById('notificationPermissionChip');
  const status=document.getElementById('notificationStatus');
  const btn=document.getElementById('notificationEnableBtn');

  if(chip){
    chip.className='notification-permission-chip';
    if(permission==='granted'){
      chip.textContent='Autorisées';
      chip.classList.add('good');
    }else if(permission==='denied'){
      chip.textContent='Bloquées';
      chip.classList.add('bad');
    }else if(permission==='unsupported'){
      chip.textContent='Indisponibles';
      chip.classList.add('warn');
    }else{
      chip.textContent='À activer';
      chip.classList.add('warn');
    }
  }

  if(status){
    status.textContent=
      permission==='granted'
        ?'Actives sur cet appareil · vérification à l’ouverture de l’app.'
        :permission==='denied'
          ?'Bloquées dans les réglages du navigateur / téléphone.'
          :permission==='unsupported'
            ?'Notifications système non prises en charge ici.'
            :'Autorisation système nécessaire.';
  }

  if(btn){
    btn.textContent=permission==='granted'?'Activées':'Activer';
    btn.disabled=permission==='granted'||permission==='unsupported';
  }
}

function notificationCurrentDayKey(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function smartNotificationCandidates(){
  const prefs=smartNotificationPrefs();
  if(!prefs.master)return [];

  const out=[];
  const key=mk();
  const relation=monthRelation(key);
  const f=smartForecastModel();
  const snap=f.snap;
  const now=new Date();

  const add=item=>{
    if(!item?.id||!item?.title||!item?.body)return;
    out.push({priority:50,...item});
  };

  // 1) Upcoming recurring charges.
  if(prefs.upcoming && relation==='current'){
    const timeline=upcomingTimelineData();
    const income=snap.incomeBase||0;
    timeline.rows.forEach(r=>{
      if(r.daysAway<0||r.daysAway>3)return;

      const importantThreshold=Math.max(30,income*.02);
      const veryImportantThreshold=Math.max(75,income*.03);
      const important=
        (r.daysAway<=1 && r.amount>=importantThreshold) ||
        (r.daysAway<=3 && r.amount>=veryImportantThreshold);

      if(!important)return;

      const windowKey=r.daysAway===0?'today':r.daysAway===1?'tomorrow':'soon';
      const when=r.daysAway===0?"aujourd’hui":r.daysAway===1?"demain":`dans ${r.daysAway} jours`;
      add({
        id:`upcoming:${r.id}:${key}:${windowKey}`,
        type:'upcoming',
        priority:r.daysAway===0?100:r.daysAway===1?94:82,
        title:`${r.name} ${when}`,
        body:`${eur(r.amount)} sont prévus ${when}. ${r.afterBalance===null?'':`Disponible estimé après : ${eur(r.afterBalance)}.`}`.trim(),
        tag:`mb-upcoming-${r.id}-${key}`
      });
    });
  }

  // 2) Category budget pressure.
  if(prefs.budget){
    const actual=monthActuals(key,state.activeAccount);
    const byCat={};
    actual.ops.filter(o=>o.type==='expense').forEach(o=>{
      const cat=o.cat||'Autres';
      byCat[cat]=(byCat[cat]||0)+nonNegativeMoney(o.amount);
    });

    Object.entries(byCat).forEach(([cat,spent])=>{
      const limit=nonNegativeMoney(budgets()[cat]);
      if(!limit)return;
      const ratio=spent/limit;

      if(ratio>=1){
        add({
          id:`budget:${cat}:${key}:over`,
          type:'budget',
          priority:96,
          title:`Budget ${baseDisplayName(cat)} dépassé`,
          body:`${eur(spent)} utilisés pour un plafond de ${eur(limit)}.`,
          tag:`mb-budget-${cat}-${key}-over`
        });
      }else if(ratio>=.90){
        add({
          id:`budget:${cat}:${key}:90`,
          type:'budget',
          priority:74,
          title:`Budget ${baseDisplayName(cat)} à ${Math.round(ratio*100)} %`,
          body:`Il reste ${eur(limit-spent)} avant d’atteindre le plafond.`,
          tag:`mb-budget-${cat}-${key}-90`
        });
      }
    });
  }

  // 3) Real month-end risk: only high risk, not medium noise.
  if(prefs.risk && relation==='current'){
    if(snap.safeAvailable<0 || f.likelyEnd<0 || f.risk==='Élevé'){
      add({
        id:`risk:${key}:high`,
        type:'risk',
        priority:99,
        title:'Budget du mois sous pression',
        body:snap.safeAvailable<0
          ?`Le disponible prudent est à ${eur(snap.safeAvailable)}.`
          :`La fin de mois probable est estimée à ${eur(f.likelyEnd)}.`,
        tag:`mb-risk-${key}`
      });
    }
  }

  // 4) Savings reminder only near month end.
  if(prefs.savings && relation==='current' && snap.plannedSaved>0 && snap.savingsStillToReserve>0){
    const lastDay=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    const daysLeft=Math.max(0,lastDay-now.getDate());
    if(daysLeft<=5){
      add({
        id:`savings:${key}:last5`,
        type:'savings',
        priority:daysLeft<=2?80:64,
        title:'Objectif d’épargne à compléter',
        body:`Il reste ${eur(snap.savingsStillToReserve)} à mettre de côté avant la fin du mois.`,
        tag:`mb-savings-${key}`
      });
    }
  }

  return out.sort((a,b)=>b.priority-a.priority);
}

function smartNotificationAlreadySent(id){
  return !!smartNotificationLog()[id];
}

function markSmartNotificationSent(id){
  const log=smartNotificationLog();
  log[id]=new Date().toISOString();

  // Keep storage small: retain the newest 80 notification markers only.
  const entries=Object.entries(log)
    .sort((a,b)=>String(b[1]).localeCompare(String(a[1])))
    .slice(0,80);
  saveSmartNotificationLog(Object.fromEntries(entries));
}

async function showSmartSystemNotification(candidate,{test=false}={}){
  if(smartNotificationPermission()!=='granted')return false;

  const options={
    body:candidate.body,
    icon:'./icon-192.png',
    badge:'./icon-192.png',
    tag:candidate.tag||candidate.id,
    renotify:false,
    data:{url:'./',type:candidate.type||'info'}
  };

  try{
    if(navigator.serviceWorker?.ready){
      const reg=await navigator.serviceWorker.ready;
      await reg.showNotification(candidate.title,options);
    }else{
      new Notification(candidate.title,options);
    }
    if(!test)markSmartNotificationSent(candidate.id);
    return true;
  }catch(err){
    console.warn('[Mon Budget] Notification impossible',err);
    return false;
  }
}

let smartNotificationCheckBusy=false;
async function checkSmartNotifications(manual=false){
  if(smartNotificationCheckBusy)return false;
  smartNotificationCheckBusy=true;
  try{
    renderSmartNotificationSettings();

    if(smartNotificationPermission()!=='granted'){
      if(manual)showToast('Active d’abord les notifications');
      return false;
    }

    const candidates=smartNotificationCandidates();
    const next=candidates.find(x=>!smartNotificationAlreadySent(x.id));

    if(!next){
      if(manual)showToast('Aucune nouvelle alerte importante');
      return false;
    }

    const shown=await showSmartSystemNotification(next);
    if(manual){
      showToast(shown?'Alerte envoyée ✓':'Notification impossible');
    }
    return shown;
  }finally{
    smartNotificationCheckBusy=false;
  }
}

async function enableNotifications(){
  if(!('Notification' in window)){
    renderSmartNotificationSettings();
    return showToast('Notifications non prises en charge');
  }

  try{
    const p=await Notification.requestPermission();
    renderSmartNotificationSettings();

    if(p==='granted'){
      const prefs=smartNotificationPrefs();
      prefs.master=true;
      localStorage.setItem(SMART_NOTIFICATION_PREFS_KEY,JSON.stringify(prefs));
      showToast('Notifications intelligentes activées');
      setTimeout(()=>checkSmartNotifications(false),350);
      return true;
    }

    showToast(p==='denied'?'Notifications bloquées':'Autorisation non accordée');
    return false;
  }catch(err){
    console.warn('[Mon Budget] Permission notification',err);
    showToast('Impossible d’activer les notifications');
    return false;
  }
}

async function testSmartNotification(){
  if(smartNotificationPermission()!=='granted'){
    const ok=await enableNotifications();
    if(!ok)return;
  }

  const test={
    id:'test:'+Date.now(),
    type:'test',
    title:'Mon Budget',
    body:'Test réussi ✓ Les alertes importantes pourront apparaître sur cet appareil.',
    tag:'mb-test'
  };
  const shown=await showSmartSystemNotification(test,{test:true});
  showToast(shown?'Notification test envoyée':'Test impossible');
}

function scheduleSmartNotificationCheck(){
  clearTimeout(window._smartNotificationTimer);
  window._smartNotificationTimer=setTimeout(()=>{
    checkSmartNotifications(false);
  },1200);
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


function openSettingsGroup(id){
  const group=document.getElementById(id);
  if(!group)return;
  group.open=true;
  setTimeout(()=>group.scrollIntoView({behavior:'smooth',block:'start'}),40);
}

function renderSettingsOverview(){
  const el=document.getElementById('settingsAccountMini');
  if(!el)return;
  if(currentUser)el.textContent='Connecté · '+(currentUser.email||'Compte');
  else if(cloudConfigured)el.textContent='Mode local · cloud disponible';
  else el.textContent='Mode local';
}

function goToAccountSettings(){
  if(cloudConfigured&&!currentUser){reopenAuthGate();return}
  const btn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('settings'"));
  if(btn)nav('settings',btn);
  document.getElementById('settingsAccount')?.setAttribute('open','');
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

function setAuthBusy(busy,label='Connexion en cours…'){
  const ids=['gateSignInBtn','gateSignUpBtn','gateResetBtn'];
  ids.forEach(id=>{const b=document.getElementById(id);if(b)b.disabled=!!busy});
  if(busy)setGateAuthMessage(label,'warn');
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
      if(banner){banner.className='notice warn';banner.textContent='Mode local actif — crée un compte seulement si tu veux activer le cloud.'}
      if(homeStatus)homeStatus.textContent='Mode local';
      if(homeText)homeText.textContent='Tes données restent sur cet appareil. Connecte-toi pour ajouter une sauvegarde cloud.';
    }else{
      if(banner){banner.className='notice warn';banner.textContent='Mode démo : interface prête. Configure Supabase pour activer les comptes.'}
      if(homeStatus)homeStatus.textContent='Mode local';
      if(homeText)homeText.textContent='L’interface de connexion est prête mais le cloud n’est pas encore activé.';
    }
  }
}

async function initCloud(){
  if(!cloudConfigured){
    renderCloudStatus();
    return;
  }

  // Subscribe first: PASSWORD_RECOVERY can fire while Supabase processes the URL.
  sb.auth.onAuthStateChange(async(event,session)=>{
    currentUser=session?.user||null;

    if(event==='PASSWORD_RECOVERY'){
      passwordRecoveryActive=true;
      openPasswordRecovery();
      showRecoveryMessage('Lien validé. Choisis maintenant ton nouveau mot de passe.','good');
    }

    renderCloudStatus();
    renderVisibleAccountUI();

    if(currentUser&&(event==='SIGNED_IN'||event==='INITIAL_SESSION')&&!passwordRecoveryActive){
      await loadUserWorkspace();
    }

    if(event==='SIGNED_OUT'){
      renderCloudStatus();
      renderVisibleAccountUI();
      showToast('Déconnecté — mode local actif');
    }
  });

  let data=null;
  try{
    const result=await sb.auth.getSession();
    data=result.data;
  }catch(err){
    console.warn('Impossible de charger la session Supabase',err);
    renderCloudStatus();
    return;
  }

  currentUser=data?.session?.user||null;
  renderCloudStatus();
  renderVisibleAccountUI();

  // Fallback for browsers where the recovery event fired before UI was ready.
  if(recoveryUrlDetected()){
    passwordRecoveryActive=true;
    openPasswordRecovery();
    showRecoveryMessage('Lien de récupération détecté. Choisis ton nouveau mot de passe.','good');
  }else if(currentUser){
    await loadUserWorkspace();
  }
}
function blankState(){return {accounts:[{id:'main',name:'Compte principal'}],activeAccount:'main',ops:[],budgets:{main:{}},recurring:[],goals:[],monthlyPlans:{},dashboardPrefs:{donut:true,insights:true,anomalies:true,upcoming:true,predictions:true},templates:[],rules:[],savingsEntries:[],savingsEnvelopes:[],freeSavingsBalances:{},freeSavingsMovements:[],uxPrefs:{compact:false},customCategories:[],categoryRenames:{},automationDismissed:[],assistantHistory:[],actionSnoozes:{},recurringSkips:{}}}
function normalizeState(x){x=x&&typeof x==='object'?x:blankState();if(!x.accounts?.length)x.accounts=[{id:'main',name:'Compte principal'}];if(!x.activeAccount)x.activeAccount=x.accounts[0].id;if(!x.ops)x.ops=[];if(!x.budgets)x.budgets={main:{}};if(!x.recurring)x.recurring=[];if(!x.goals)x.goals=[];if(!x.monthlyPlans)x.monthlyPlans={};if(!x.dashboardPrefs)x.dashboardPrefs={donut:true,insights:true,anomalies:true,upcoming:true,predictions:true};if(!x.templates)x.templates=[];if(!x.rules)x.rules=[];if(!x.savingsEntries)x.savingsEntries=[];if(!x.savingsEnvelopes)x.savingsEnvelopes=[];if(!x.freeSavingsBalances)x.freeSavingsBalances={};if(!x.freeSavingsMovements)x.freeSavingsMovements=[];if(!x.patrimony)x.patrimony={assets:[{name:'Compte courant',amount:0},{name:'Épargne',amount:0}],debts:[]};if(!x.uxPrefs)x.uxPrefs={compact:false};if(!x.customCategories)x.customCategories=[];if(!x.categoryRenames)x.categoryRenames={};if(!Array.isArray(x.automationDismissed))x.automationDismissed=[];if(!Array.isArray(x.assistantHistory))x.assistantHistory=[];if(!x.actionSnoozes||typeof x.actionSnoozes!=='object')x.actionSnoozes={};if(!x.recurringSkips||typeof x.recurringSkips!=='object')x.recurringSkips={};x.ops=x.ops.map(o=>({...o,accountId:o.accountId||'main',scope:o.scope||'personal',tags:Array.isArray(o.tags)?o.tags:[]}));x=migrateSavingsImpactV1(x);x=stabilizeFinancialData(x);return x}
function showAuthGate(v,force=false){
  // V24.4.5: authentication is optional. No full-screen gate blocks the app.
  return;
}
function continueLocalMode(){
  showToast('Mode local actif.');
}
function reopenAuthGate(){
  goToAccountSettings();
}
async function loadUserWorkspace(){if(!currentUser)return;createRecoverySafetyBackup();const cached=localStorage.getItem(userCacheKey());if(cached){try{state=normalizeState(JSON.parse(cached));render()}catch(e){}}await pullCloud(true)}
function renderCloudStatus(){
  renderVisibleAccountUI();
  renderSettingsOverview();
  const el=document.getElementById('cloudStatus');const tg=document.getElementById('autoSyncToggle');if(tg)tg.checked=autoSync;
  if(!el)return;
  if(!cloudConfigured){
    el.className='notice warn';
    el.textContent='Mode local — cloud non disponible';
    return;
  }
  if(currentUser){
    el.className='notice good';
    el.textContent='Connecté : '+currentUser.email;
  }else{
    el.className='notice warn';
    el.textContent='Mode local — connecte-toi seulement si tu veux activer le cloud';
  }
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
      renderCloudStatus();
      setAuthMessage('Compte créé et connecté ✅','good');
      showToast('Compte créé ✨');
    }else{
      setAuthMessage('Compte créé ✅ Vérifie le nouvel email de confirmation, puis reviens ici pour te connecter.','good');
      showAuthGate(true,true);
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
    authGateDismissed=false;sessionStorage.removeItem('monBudgetAuthGateDismissed');
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
async function gateSignUp(){
  const e=document.getElementById('gateEmail');const p=document.getElementById('gatePassword');
  setAuthBusy(true,'Création du compte en cours…');
  try{return await doSignUp((e?.value||'').trim(),p?.value||'')}
  finally{setAuthBusy(false)}
}
async function gateSignIn(){
  const e=document.getElementById('gateEmail');const p=document.getElementById('gatePassword');
  setAuthBusy(true,'Connexion en cours…');
  try{return await doSignIn((e?.value||'').trim(),p?.value||'')}
  finally{setAuthBusy(false)}
}

let passwordRecoveryActive=false;

function recoveryUrlDetected(){
  const hash=String(location.hash||'');
  const search=String(location.search||'');
  return /type=recovery/i.test(hash) || /type=recovery/i.test(search) || /access_token=/i.test(hash) && /refresh_token=/i.test(hash);
}
function showRecoveryMessage(message,type='warn'){
  const el=document.getElementById('recoveryMessage');
  if(!el)return;
  el.className='recovery-message '+(type==='good'?'good':'warn');
  el.textContent=message||'';
}
function openPasswordRecovery(){
  passwordRecoveryActive=true;
  const modal=document.getElementById('passwordRecoveryModal');
  modal?.classList.remove('hidden');
  setTimeout(()=>document.getElementById('recoveryPassword')?.focus(),120);
}
function closePasswordRecovery(){
  document.getElementById('passwordRecoveryModal')?.classList.add('hidden');
}
function clearRecoveryUrl(){
  try{
    history.replaceState({},document.title,location.origin+location.pathname);
  }catch(e){}
}
function cancelPasswordRecovery(){
  passwordRecoveryActive=false;
  closePasswordRecovery();
  clearRecoveryUrl();
  showToast('Réinitialisation annulée');
}
async function completePasswordRecovery(){
  if(!cloudConfigured||!sb){
    showRecoveryMessage('Supabase est indisponible. Recharge la page.','warn');
    return false;
  }
  const p1=document.getElementById('recoveryPassword')?.value||'';
  const p2=document.getElementById('recoveryPasswordConfirm')?.value||'';
  if(p1.length<6){
    showRecoveryMessage('Le mot de passe doit contenir au moins 6 caractères.','warn');
    return false;
  }
  if(p1!==p2){
    showRecoveryMessage('Les deux mots de passe ne correspondent pas.','warn');
    return false;
  }
  const btn=document.getElementById('recoverySaveBtn');
  if(btn){btn.disabled=true;btn.textContent='Mise à jour…'}
  try{
    const {error}=await sb.auth.updateUser({password:p1});
    if(error){
      showRecoveryMessage('Impossible de modifier le mot de passe : '+error.message,'warn');
      return false;
    }
    passwordRecoveryActive=false;
    showRecoveryMessage('Mot de passe mis à jour ✅','good');
    showToast('Mot de passe mis à jour ✅');
    clearRecoveryUrl();
    setTimeout(()=>closePasswordRecovery(),900);
    return true;
  }catch(err){
    showRecoveryMessage('Erreur réseau : '+(err?.message||String(err)),'warn');
    return false;
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Enregistrer le nouveau mot de passe'}
  }
}

async function requestReset(email){
  if(!cloudConfigured){
    showToast('Supabase indisponible');
    return false;
  }
  if(!email){
    showToast('Entre ton adresse email');
    const msg=document.getElementById('accountModeBanner');
    if(msg){msg.className='notice warn';msg.textContent='Entre ton adresse email avant de demander un nouveau mot de passe.'}
    return false;
  }
  try{
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl()});
    if(error){
      const message='Réinitialisation impossible : '+error.message;
      showToast(message);
      const msg=document.getElementById('accountModeBanner');
      if(msg){msg.className='notice warn';msg.textContent=message}
      return false;
    }
    const message='Email de réinitialisation envoyé ✅ Vérifie ta boîte mail.';
    showToast(message);
    const msg=document.getElementById('accountModeBanner');
    if(msg){msg.className='notice good';msg.textContent=message}
    return true;
  }catch(err){
    const message='Erreur réseau : '+(err?.message||String(err));
    showToast(message);
    return false;
  }
}
async function resetPassword(){const e=document.getElementById('authEmail');return requestReset((e?.value||'').trim())}
async function gateResetPassword(){const e=document.getElementById('gateEmail');return requestReset((e?.value||'').trim())}
async function signOut(){
  if(!cloudConfigured)return;
  if(currentUser){
    await pushCloud(true);
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
  }
  // Personal Edition: disconnect only this device.
  // Other phones/computers using the same account keep their session.
  await sb.auth.signOut({scope:'local'});
  currentUser=null;
  renderCloudStatus();
  renderVisibleAccountUI();
  showToast('Déconnecté sur cet appareil — données locales conservées');
}
async function pushCloud(silent=false){
  if(!cloudConfigured||!currentUser){if(!silent)showToast('Connecte-toi');return}
  const audit=financialDataAudit();
  if(audit.errors.some(x=>x.code==='audit-crash')){
    if(!silent)showToast('Synchronisation bloquée : données illisibles');
    return;
  }
  const {error}=await sb.from('budget_snapshots').upsert({
    user_id:currentUser.id,
    data:state,
    updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  if(error){if(!silent)showToast('Erreur cloud : '+error.message);return}
  localStorage.setItem(userCacheKey(),JSON.stringify(state));
  if(document.getElementById('syncInfo'))syncInfo.textContent='Dernière synchro : '+new Date().toLocaleString('fr-BE');
  if(!silent)showToast('Budget sauvegardé');
}
async function pullCloud(silent=false){if(!cloudConfigured||!currentUser){if(!silent)showToast('Connecte-toi');return}createRecoverySafetyBackup();const {data,error}=await sb.from('budget_snapshots').select('data,updated_at').eq('user_id',currentUser.id).maybeSingle();if(error){if(!silent)showToast('Erreur cloud : '+error.message);return}if(data?.data){state=normalizeState(data.data);localStorage.setItem(userCacheKey(),JSON.stringify(state));render();if(document.getElementById('syncInfo'))syncInfo.textContent='Données à jour : '+new Date(data.updated_at).toLocaleString('fr-BE')}else{state=normalizeState(state);await pushCloud(true);if(document.getElementById('syncInfo'))syncInfo.textContent='Premier espace cloud créé'}}

function recoveryDataScore(x){
  if(!x||typeof x!=='object')return -1;
  return (
    (Array.isArray(x.ops)?x.ops.length*6:0)+
    (Array.isArray(x.savingsEntries)?x.savingsEntries.length*5:0)+
    (Array.isArray(x.savingsEnvelopes)?x.savingsEnvelopes.length*4:0)+
    (Array.isArray(x.goals)?x.goals.length*4:0)+
    (Array.isArray(x.recurring)?x.recurring.length*3:0)+
    (Array.isArray(x.accounts)?x.accounts.length*2:0)+
    (x.monthlyPlans&&typeof x.monthlyPlans==='object'?Object.keys(x.monthlyPlans).length*2:0)+
    (x.budgets&&typeof x.budgets==='object'?Object.keys(x.budgets).length:0)+
    (x.patrimony&&typeof x.patrimony==='object'?3:0)
  );
}

function recoveryDataSummary(x){
  return {
    ops:Array.isArray(x?.ops)?x.ops.length:0,
    savings:Array.isArray(x?.savingsEntries)?x.savingsEntries.length:0,
    envelopes:Array.isArray(x?.savingsEnvelopes)?x.savingsEnvelopes.length:0,
    goals:Array.isArray(x?.goals)?x.goals.length:0,
    recurring:Array.isArray(x?.recurring)?x.recurring.length:0,
    accounts:Array.isArray(x?.accounts)?x.accounts.length:0
  };
}

function collectLocalRecoveryCandidates(){
  const found=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key)continue;
    if(!/monbudget/i.test(key))continue;
    const raw=localStorage.getItem(key);
    if(!raw)continue;
    try{
      const data=JSON.parse(raw);
      if(!data||typeof data!=='object')continue;
      const score=recoveryDataScore(data);
      if(score<0)continue;
      found.push({
        key,
        raw,
        data,
        score,
        summary:recoveryDataSummary(data),
        isCurrent:key===KEY,
        isUserCache:/monBudgetV23:user:/i.test(key)
      });
    }catch(e){}
  }
  found.sort((a,b)=>b.score-a.score);
  return found;
}

function escAttr(v){
  return String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function scanLocalRecovery(){
  const status=document.getElementById('localRecoveryStatus');
  const list=document.getElementById('localRecoveryList');
  const candidates=collectLocalRecoveryCandidates();

  if(!list||!status)return;
  if(!candidates.length){
    status.textContent='Aucune ancienne sauvegarde Mon Budget trouvée sur cet appareil.';
    list.innerHTML='';
    return;
  }

  const useful=candidates.filter(c=>c.score>0);
  if(!useful.length){
    status.textContent='Des clés Mon Budget existent, mais elles semblent vides.';
  }else{
    status.textContent=`${useful.length} sauvegarde(s) contenant des données trouvée(s). La plus riche est affichée en premier.`;
  }

  list.innerHTML=candidates.slice(0,12).map((c,idx)=>{
    const s=c.summary;
    const label=c.isCurrent?'Version actuelle':(c.isUserCache?'Cache compte cloud':'Ancienne sauvegarde locale');
    const best=idx===0&&c.score>0?'<span class="recovery-best">Meilleure candidate</span>':'';
    return `
      <div class="recovery-item">
        <div class="recovery-item-top">
          <div>
            <strong>${escHTML(label)}</strong>
            <small>${escHTML(c.key)}</small>
          </div>
          ${best}
        </div>
        <div class="recovery-stats">
          <span>${s.ops} opérations</span>
          <span>${s.savings} épargnes</span>
          <span>${s.envelopes} enveloppes</span>
          <span>${s.goals} objectifs</span>
          <span>${s.recurring} récurrents</span>
        </div>
        <div class="recovery-actions">
          <button type="button" class="secondary compact" onclick="previewRecoveryCandidate('${encodeURIComponent(c.key)}')">Aperçu</button>
          <button type="button" class="primary compact" onclick="restoreRecoveryCandidate('${encodeURIComponent(c.key)}')">Restaurer</button>
        </div>
      </div>`;
  }).join('');
}

function previewRecoveryCandidate(encodedKey){
  const key=decodeURIComponent(encodedKey);
  const raw=localStorage.getItem(key);
  if(!raw)return showToast('Sauvegarde introuvable');
  try{
    const x=JSON.parse(raw);
    const s=recoveryDataSummary(x);
    const msg=[
      `Clé : ${key}`,
      `${s.ops} opérations`,
      `${s.savings} mouvements d’épargne`,
      `${s.envelopes} enveloppes`,
      `${s.goals} objectifs`,
      `${s.recurring} charges récurrentes`,
      `${s.accounts} comptes`
    ].join('\n');
    alert(msg);
  }catch(e){
    showToast('Sauvegarde illisible');
  }
}

const PERSONAL_SAFETY_PREFIX='monBudgetPersonalSafety:';
const PERSONAL_SAFETY_MAX_DAILY=3;
const PERSONAL_SAFETY_MAX_MANUAL=3;

function personalSafetyKeys(){
  const out=[];
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&key.startsWith(PERSONAL_SAFETY_PREFIX))out.push(key);
    }
  }catch(e){}
  return out.sort().reverse();
}

function prunePersonalSafetySnapshots(){
  const keys=personalSafetyKeys();
  const daily=keys.filter(k=>k.includes(':daily:'));
  const manual=keys.filter(k=>k.includes(':manual:'));
  [...daily.slice(PERSONAL_SAFETY_MAX_DAILY),...manual.slice(PERSONAL_SAFETY_MAX_MANUAL)]
    .forEach(k=>{try{localStorage.removeItem(k)}catch(e){}});
}

function updateDailyPersonalSafetySnapshot(serialized=null){
  try{
    if(recoveryDataScore(state)<=0)return false;
    const today=new Date().toISOString().slice(0,10);
    const key=`${PERSONAL_SAFETY_PREFIX}daily:${today}`;
    localStorage.setItem(key,serialized||JSON.stringify(state));
    prunePersonalSafetySnapshots();
    return true;
  }catch(e){
    return false;
  }
}

function createManualPersonalSafetySnapshot(){
  try{
    if(recoveryDataScore(state)<=0){
      showToast('Aucune donnée à sauvegarder pour le moment');
      return false;
    }
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    localStorage.setItem(`${PERSONAL_SAFETY_PREFIX}manual:${stamp}`,JSON.stringify(state));
    prunePersonalSafetySnapshots();
    renderPersonalSafety();
    showToast('Point de restauration créé ✓');
    return true;
  }catch(e){
    showToast('Impossible de créer le point local');
    return false;
  }
}

function personalSafetyLatest(){
  const keys=personalSafetyKeys();
  if(!keys.length)return null;
  return keys[0];
}

function personalSafetyDateFromKey(key){
  if(!key)return null;
  const daily=key.match(/:daily:(\d{4}-\d{2}-\d{2})$/);
  if(daily)return new Date(daily[1]+'T12:00:00');
  const manual=key.match(/:manual:(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if(manual)return new Date(`${manual[1]}T${manual[2]}:${manual[3]}:${manual[4]}`);
  return null;
}

function renderPersonalSafety(){
  const last=document.getElementById('personalSafetyLast');
  const count=document.getElementById('personalSafetyCount');
  const stateEl=document.getElementById('personalSafetyState');
  const note=document.getElementById('personalSafetyNote');
  const chip=document.getElementById('personalSafetyChip');
  if(!last&&!count&&!stateEl&&!note&&!chip)return;

  const keys=personalSafetyKeys();
  const latest=personalSafetyLatest();
  const d=personalSafetyDateFromKey(latest);
  const audit=financialDataAudit();

  if(last)last.textContent=d?d.toLocaleString('fr-BE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Aucun';
  if(count)count.textContent=keys.length;
  if(stateEl)stateEl.textContent=audit.errors.length?'À vérifier':audit.warnings.length?'Stable avec alertes':'Stable';

  if(chip){
    chip.className='personal-safety-chip '+(audit.errors.length?'bad':audit.warnings.length?'warn':'good');
    chip.textContent=audit.errors.length?'Attention':'Protégé';
  }

  if(note){
    const cloud=currentUser?'Cloud connecté':'Sauvegarde locale';
    note.textContent=`${cloud} · ${keys.length} point${keys.length>1?'s':''} de restauration local${keys.length>1?'aux':''} conservé${keys.length>1?'s':''}.`;
  }
}

function createRecoverySafetyBackup(){
  try{
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    localStorage.setItem(`monBudgetRecoverySafety:${stamp}`,JSON.stringify(state));

    const recoveryKeys=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&key.startsWith('monBudgetRecoverySafety:'))recoveryKeys.push(key);
    }
    recoveryKeys.sort().reverse().slice(5).forEach(key=>localStorage.removeItem(key));
  }catch(e){}
}

function restoreRecoveryCandidate(encodedKey){
  const key=decodeURIComponent(encodedKey);
  const raw=localStorage.getItem(key);
  if(!raw)return showToast('Sauvegarde introuvable');

  let candidate;
  try{
    candidate=JSON.parse(raw);
  }catch(e){
    return showToast('Sauvegarde illisible');
  }

  const s=recoveryDataSummary(candidate);
  const ok=confirm(
    `Restaurer cette sauvegarde ?\n\n`+
    `${s.ops} opérations\n`+
    `${s.savings} mouvements d’épargne\n`+
    `${s.envelopes} enveloppes\n`+
    `${s.goals} objectifs\n`+
    `${s.recurring} charges récurrentes\n\n`+
    `Une copie de sécurité de l’état actuel sera conservée.`
  );
  if(!ok)return;

  createRecoverySafetyBackup();

  try{
    state=normalizeState(candidate);
    state=migrateSavingsImpactV1(state);
    state=stabilizeFinancialData(state);

    // Restore to canonical local key and keep source intact.
    localStorage.setItem(KEY,JSON.stringify(state));
    localStorage.setItem('monBudgetRecoveredFrom',key);
    localStorage.setItem('monBudgetRecoveredAt',new Date().toISOString());

    refreshCats();
    render();
    save();

    const status=document.getElementById('localRecoveryStatus');
    if(status)status.textContent=`Données restaurées depuis ${key} ✅`;
    showToast('Anciennes données restaurées ✅');
  }catch(err){
    showToast('Échec de la restauration : '+(err?.message||String(err)));
  }
}


function localBudgetDataKeys(){
  const keys=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k)continue;

    // Financial / app-data keys only.
    // Preferences such as theme and auto-sync are intentionally kept.
    const isBudgetData =
      /^monBudgetV\d/i.test(k) ||
      /^monBudgetRecoverySafety:/i.test(k) ||
      /^monBudgetRecovered/i.test(k) ||
      /^monBudgetLastMigrationSource$/i.test(k);

    if(isBudgetData && k!=='monBudgetTheme' && k!=='monBudgetAutoSync'){
      keys.push(k);
    }
  }
  return keys;
}

async function resetAllLocalBudgetData(){
  if(currentUser){
    alert(
      'Tu es encore connecté au cloud.\n\n' +
      'Déconnecte-toi d’abord, puis relance la réinitialisation. ' +
      'Comme ça, le reset reste uniquement local et ne risque pas de modifier ton espace Supabase.'
    );
    return false;
  }

  const first=confirm(
    'Réinitialiser toutes les données Mon Budget de CET APPAREIL ?\n\n' +
    'Cela effacera les opérations, revenus, dépenses, épargne, enveloppes, objectifs, ' +
    'comptes, budgets et anciennes sauvegardes locales.\n\n' +
    'Les données Supabase ne seront PAS supprimées.'
  );
  if(!first)return false;

  const typed=prompt(
    'Dernière confirmation.\n\nTape RESET pour effacer les données locales :'
  );
  if(typed!=='RESET'){
    showToast('Réinitialisation annulée');
    return false;
  }

  // Stop any pending auto-sync just in case.
  if(syncTimer){
    clearTimeout(syncTimer);
    syncTimer=null;
  }

  try{
    const keys=localBudgetDataKeys();
    keys.forEach(k=>localStorage.removeItem(k));

    sessionStorage.removeItem('monBudgetAuthGateDismissed');

    // Fresh empty local state.
    state=blankState();
    state=normalizeState(state);
    localStorage.setItem(KEY,JSON.stringify(state));

    view=new Date();
    view.setDate(1);
    refreshCats();
    render();

    const recoveryStatus=document.getElementById('localRecoveryStatus');
    const recoveryList=document.getElementById('localRecoveryList');
    if(recoveryStatus)recoveryStatus.textContent='Aucune ancienne donnée locale après réinitialisation.';
    if(recoveryList)recoveryList.innerHTML='';

    showToast('Données locales réinitialisées ✅');
    alert(
      'Réinitialisation terminée.\n\n' +
      'Les données de cet appareil ont été effacées. ' +
      'Ton éventuel espace cloud Supabase n’a pas été supprimé.'
    );
    return true;
  }catch(err){
    console.error('Reset local failed',err);
    showToast('Erreur pendant la réinitialisation');
    alert('La réinitialisation a échoué : '+(err?.message||String(err)));
    return false;
  }
}

window.resetAllLocalBudgetData = resetAllLocalBudgetData;


// ================= V24.5.0 — SMART EXCEL / CSV IMPORT =================
let smartImportDraft=null;

function smartImportText(v){return String(v??'').trim()}
function smartImportNorm(v){
  return smartImportText(v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function smartImportMoney(v){
  if(typeof v==='number' && Number.isFinite(v))return v;
  let s=smartImportText(v);
  if(!s)return NaN;
  const negative=/^\(.*\)$/.test(s)||/^\s*-/.test(s);
  s=s.replace(/[()€$£\s\u00a0']/g,'').replace(/[^0-9,.-]/g,'');
  if(!s)return NaN;
  const comma=s.lastIndexOf(','), dot=s.lastIndexOf('.');
  if(comma>=0 && dot>=0){
    if(comma>dot)s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(comma>=0){
    s=s.replace(/\./g,'').replace(',','.');
  }
  const n=Number(s);
  if(!Number.isFinite(n))return NaN;
  return negative?-Math.abs(n):n;
}
function smartImportDate(v){
  if(v instanceof Date && !Number.isNaN(v.getTime())){
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  }
  if(typeof v==='number' && Number.isFinite(v) && v>20000 && v<90000){
    const d=new Date(Date.UTC(1899,11,30)+Math.round(v*86400000));
    return d.toISOString().slice(0,10);
  }
  const s=smartImportText(v);
  if(!s)return '';
  let m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if(m)return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;
  m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if(m){
    let y=+m[3]; if(y<100)y+=2000;
    return `${y}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
  }
  const d=new Date(s);
  if(!Number.isNaN(d.getTime()))return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return '';
}
function smartImportType(v,amount){
  const s=smartImportNorm(v);
  if(['expense','depense','debit','sortie','achat','charge'].some(x=>s===x||s.includes(x)))return 'expense';
  if(['income','revenu','credit','entree','salaire','remboursement'].some(x=>s===x||s.includes(x)))return 'income';
  if(!s && Number.isFinite(amount))return amount<0?'expense':'income';
  return '';
}
function smartImportNature(v){
  const s=smartImportNorm(v);
  return (s.includes('fix')||s==='fixed')?'fixed':'variable';
}
function smartImportDelimiter(text){
  const line=(String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).find(x=>x.trim())||'');
  const counts={';':0,',':0,'\t':0}; let quote=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"')quote=!quote;
    else if(!quote && Object.prototype.hasOwnProperty.call(counts,line[i]))counts[line[i]]++;
  }
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}
function smartImportCSV(text){
  text=String(text||'').replace(/^\uFEFF/,'');
  const delimiter=smartImportDelimiter(text), rows=[]; let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quote && text[i+1]==='"'){cell+='"';i++}
      else quote=!quote;
    }else if(ch===delimiter && !quote){row.push(cell);cell=''}
    else if((ch==='\n'||ch==='\r')&&!quote){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';
      if(row.some(v=>smartImportText(v)!==''))rows.push(row);
      row=[];
    }else cell+=ch;
  }
  row.push(cell);
  if(row.some(v=>smartImportText(v)!==''))rows.push(row);
  return rows;
}
function smartImportColumnMap(headers){
  const h=headers.map(smartImportNorm);
  const aliases={
    account:['compte','account','compte bancaire','bank account'],
    type:['type','sens','operation type','type operation'],
    name:['nom','libelle','libelle operation','description','intitule','operation','name'],
    amount:['montant','amount','valeur','somme','prix'],
    category:['categorie','category','cat'],
    nature:['nature','fixe variable','fixed variable'],
    date:['date','date operation','date transaction']
  };
  const map={};
  Object.entries(aliases).forEach(([key,list])=>{
    let idx=-1;
    for(const alias of list){
      idx=h.findIndex(x=>x===alias||x.includes(alias));
      if(idx>=0)break;
    }
    map[key]=idx;
  });
  return map;
}
function smartImportExistingKey(op){
  const account=state.accounts.find(a=>a.id===op.accountId)?.name||'Compte principal';
  return [smartImportNorm(account),op.type,smartImportNorm(op.name),Number(op.amount||0).toFixed(2),String(op.date||'').slice(0,10),smartImportNorm(op.cat||''),smartImportNorm(op.nature||'')].join('|');
}
function smartImportIncomingKey(op){
  return [smartImportNorm(op.accountName),op.type,smartImportNorm(op.name),Number(op.amount||0).toFixed(2),op.date,smartImportNorm(op.cat||''),smartImportNorm(op.nature||'')].join('|');
}
function smartImportAnalyze(rows,fileName=''){
  if(!Array.isArray(rows)||rows.length<2)throw new Error('Le fichier ne contient pas assez de lignes.');
  const headers=rows[0].map(smartImportText), map=smartImportColumnMap(headers);
  if(map.amount<0||map.date<0)throw new Error('Colonnes obligatoires introuvables : Montant et Date.');
  if(map.type<0)showToast('Colonne Type absente : le signe du montant sera utilisé.');

  const existing=new Set((state.ops||[]).map(smartImportExistingKey));
  const seen=new Set();
  const valid=[],duplicates=[],invalid=[],all=[];
  let income=0,expenses=0;

  rows.slice(1).forEach((r,i)=>{
    if(!r||!r.some(v=>smartImportText(v)!==''))return;
    const rawAmount=smartImportMoney(r[map.amount]);
    const type=smartImportType(map.type>=0?r[map.type]:'',rawAmount);
    const date=smartImportDate(r[map.date]);
    const amount=Math.abs(rawAmount);
    const accountName=map.account>=0&&smartImportText(r[map.account])?smartImportText(r[map.account]):(state.accounts.find(a=>a.id===state.activeAccount)?.name||'Compte principal');
    const cat=type==='expense'?(map.category>=0&&smartImportText(r[map.category])?smartImportText(r[map.category]):'Autres'):'';
    const name=(map.name>=0&&smartImportText(r[map.name]))?smartImportText(r[map.name]):(cat||'Import');
    const nature=type==='expense'?smartImportNature(map.nature>=0?r[map.nature]:''):'';
    const reasons=[];
    if(!Number.isFinite(amount)||amount<=0)reasons.push('montant invalide');
    if(!date)reasons.push('date invalide');
    if(!type)reasons.push('type non reconnu');
    const op={row:i+2,accountName,type,name,amount,cat,nature,date,scope:'personal',tags:[]};
    if(reasons.length){op.status='invalid';op.reason=reasons.join(', ');invalid.push(op);all.push(op);return;}
    const key=smartImportIncomingKey(op);
    if(existing.has(key)||seen.has(key)){op.status='duplicate';op.reason='déjà présent';duplicates.push(op);all.push(op);return;}
    seen.add(key);op.status='valid';valid.push(op);all.push(op);
    if(type==='income')income+=amount;else expenses+=amount;
  });

  return {fileName,headers,map,valid,duplicates,invalid,all,income,expenses};
}
async function handleSmartImport(file){
  if(!file)return;
  const status=document.getElementById('smartImportStatus');
  const preview=document.getElementById('smartImportPreview');
  if(status)status.textContent=`Lecture de ${file.name}…`;
  if(preview)preview.classList.add('hidden');
  try{
    const ext=(file.name.split('.').pop()||'').toLowerCase(); let rows;
    if(ext==='csv'||file.type.includes('csv')||file.type==='text/plain'){
      rows=smartImportCSV(await file.text());
    }else{
      if(typeof XLSX==='undefined')throw new Error('Le module Excel n’est pas chargé. Vérifie ta connexion internet puis réessaie.');
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
      if(!wb.SheetNames?.length)throw new Error('Aucune feuille trouvée dans le fichier Excel.');
      rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:true});
    }
    smartImportDraft=smartImportAnalyze(rows,file.name);
    renderSmartImportPreview();
  }catch(err){
    smartImportDraft=null;
    if(status)status.textContent='Import impossible : '+(err?.message||String(err));
    if(preview)preview.classList.add('hidden');
    showToast('Fichier non reconnu');
  }
}
function renderSmartImportPreview(){
  const d=smartImportDraft;if(!d)return;
  const status=document.getElementById('smartImportStatus'),preview=document.getElementById('smartImportPreview');
  if(status)status.textContent=`${d.fileName} · ${d.all.length} ligne${d.all.length>1?'s':''} analysée${d.all.length>1?'s':''}.`;
  document.getElementById('smartImportValid').textContent=d.valid.length;
  document.getElementById('smartImportIncome').textContent=eur(d.income);
  document.getElementById('smartImportExpenses').textContent=eur(d.expenses);
  document.getElementById('smartImportDuplicates').textContent=d.duplicates.length;
  const warn=document.getElementById('smartImportWarning');
  const messages=[];
  if(d.invalid.length)messages.push(`${d.invalid.length} ligne${d.invalid.length>1?'s':''} ignorée${d.invalid.length>1?'s':''} car invalide${d.invalid.length>1?'s':''}`);
  if(d.duplicates.length)messages.push(`${d.duplicates.length} doublon${d.duplicates.length>1?'s':''} ne sera${d.duplicates.length>1?'ont':''} pas importé${d.duplicates.length>1?'s':''}`);
  if(warn){warn.textContent=messages.join(' · ');warn.classList.toggle('hidden',!messages.length)}
  const tbody=document.getElementById('smartImportRows');
  if(tbody){
    tbody.innerHTML=d.all.slice(0,12).map(x=>{
      const statusLabel=x.status==='valid'?'Prêt':x.status==='duplicate'?'Doublon':'Erreur';
      return `<tr class="smart-import-${x.status}"><td><span>${statusLabel}</span></td><td>${escHTML(x.date||'—')}</td><td>${escHTML(x.name||'—')}</td><td>${x.type==='income'?'Revenu':x.type==='expense'?'Dépense':'—'}</td><td>${Number.isFinite(x.amount)?eur(x.amount):'—'}</td></tr>`;
    }).join('')+(d.all.length>12?`<tr><td colspan="5" class="smart-import-more">+ ${d.all.length-12} autres lignes</td></tr>`:'');
  }
  const confirm=document.getElementById('smartImportConfirm');
  if(confirm){confirm.disabled=d.valid.length===0;confirm.textContent=d.valid.length?`Importer ${d.valid.length} opération${d.valid.length>1?'s':''}`:'Rien à importer'}
  if(preview)preview.classList.remove('hidden');
}
function cancelSmartImport(){
  smartImportDraft=null;
  document.getElementById('smartImportPreview')?.classList.add('hidden');
  const status=document.getElementById('smartImportStatus');if(status)status.textContent='Import annulé. Aucune donnée n’a été modifiée.';
}
function smartImportFindOrCreateAccount(name){
  const norm=smartImportNorm(name);
  let acc=state.accounts.find(a=>smartImportNorm(a.name)===norm);
  if(acc)return acc.id;
  const id='acc_import_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  state.accounts.push({id,name:name||'Compte importé'});
  state.budgets[id]=state.budgets[id]||{};
  return id;
}
function confirmSmartImport(){
  const d=smartImportDraft;
  if(!d||!d.valid.length)return;
  const ok=confirm(`Importer ${d.valid.length} opération${d.valid.length>1?'s':''} dans Mon Budget ?\n\nRevenus : ${eur(d.income)}\nDépenses : ${eur(d.expenses)}\nDoublons ignorés : ${d.duplicates.length}`);
  if(!ok)return;
  try{
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    localStorage.setItem('monBudgetImportSafety:'+stamp,JSON.stringify(state));
    const custom=new Set((state.customCategories||[]).map(smartImportNorm));
    d.valid.forEach((x,i)=>{
      const accountId=smartImportFindOrCreateAccount(x.accountName);
      if(x.type==='expense' && x.cat && !baseCats.some(c=>smartImportNorm(baseDisplayName(c))===smartImportNorm(x.cat)) && !custom.has(smartImportNorm(x.cat))){
        state.customCategories.push(x.cat);custom.add(smartImportNorm(x.cat));
      }
      state.ops.push({
        id:'op_import_'+Date.now()+'_'+i+'_'+Math.random().toString(36).slice(2,6),
        type:x.type,
        name:x.name,
        amount:Math.abs(x.amount),
        cat:x.type==='expense'?x.cat:'',
        nature:x.type==='expense'?x.nature:'',
        scope:'personal',
        tags:[],
        date:x.date+'T12:00:00',
        accountId
      });
    });
    state=normalizeState(state);refreshCats();render();save();
    const imported=d.valid.length;
    smartImportDraft=null;
    document.getElementById('smartImportPreview')?.classList.add('hidden');
    const status=document.getElementById('smartImportStatus');if(status)status.textContent=`Import terminé : ${imported} opération${imported>1?'s':''} ajoutée${imported>1?'s':''}.`;
    showToast(`${imported} opération${imported>1?'s':''} importée${imported>1?'s':''} ✅`);
  }catch(err){
    console.error('Smart import failed',err);
    alert('L’import a échoué : '+(err?.message||String(err)));
  }
}
// ======================================================================

function download(c,n,t){let b=new Blob([c],{type:t}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=n;a.click();URL.revokeObjectURL(u)}
function exportBackup(){
  const date=new Date().toISOString().slice(0,10);
  download(JSON.stringify(state,null,2),`mon_budget_personal_${date}.json`,'application/json');
}
function importBackup(f){
  if(!f)return;
  let r=new FileReader();
  r.onload=()=>{
    try{
      const incoming=normalizeState(JSON.parse(r.result));
      createRecoverySafetyBackup();
      createManualPersonalSafetySnapshot();
      state=incoming;
      refreshCats();
      render();
      save();
      showToast('Sauvegarde importée ✓');
    }catch(e){
      alert('Fichier invalide');
    }
  };
  r.readAsText(f);
}
function exportCSV(){let rows=[['Compte','Type','Nom','Montant','Catégorie','Nature','Date']];state.ops.forEach(x=>rows.push([state.accounts.find(a=>a.id===x.accountId)?.name||'Compte',x.type,x.name,x.amount,x.cat||'',x.nature||'',x.date.slice(0,10)]));download('\ufeff'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n'),`mon_budget_${new Date().toISOString().slice(0,10)}.csv`,'text/csv')}

render();updateDailyPersonalSafetySnapshot();initCloud();setupOnboarding();initPrivacy();

['obIncome','obFixedTotal','obSavings','obBudgetCourses','obBudgetTransport','obBudgetLoisirs','obBudgetShopping','obBudgetEnfant','obBudgetAutres']
  .forEach(id=>document.getElementById(id)?.addEventListener('input',renderOnboardingLiveData));
document.getElementById('obIncomeReceived')?.addEventListener('change',onboardingSyncDraftFromUI);

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')scheduleSmartNotificationCheck();
});
window.addEventListener('focus',()=>scheduleSmartNotificationCheck());


showDataMigrationNotice();

window.addEventListener('error',function(ev){try{setGateAuthMessage('Erreur de l’application : '+(ev.message||'inconnue'),'warn')}catch(e){}});
window.addEventListener('unhandledrejection',function(ev){try{setGateAuthMessage('Erreur réseau/application : '+(ev.reason?.message||String(ev.reason||'inconnue')),'warn')}catch(e){}});
