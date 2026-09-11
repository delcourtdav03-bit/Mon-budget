

const KEY='monBudgetV24_1';
const baseCats=['Logement','Courses','Transport','Enfant','Abonnements','Loisirs','Shopping','Travail','Autres'];
function baseDisplayName(c){return state?.categoryRenames?.[c]||c}
function isBaseDisplay(name){return baseCats.some(c=>baseDisplayName(c)===name)}
function allCats(){return [...new Set([...baseCats.map(baseDisplayName),...(state?.customCategories||[])])]} 
let cats=baseCats.slice();
const eur=n=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(+n||0);
let raw=localStorage.getItem(KEY)||localStorage.getItem('monBudgetV24')||localStorage.getItem('monBudgetV23_1')||localStorage.getItem('monBudgetV23')||localStorage.getItem('monBudgetV22')||localStorage.getItem('monBudgetV21')||localStorage.getItem('monBudgetV20')||localStorage.getItem('monBudgetV19')||localStorage.getItem('monBudgetV18')||localStorage.getItem('monBudgetV17')||localStorage.getItem('monBudgetV16')||localStorage.getItem('monBudgetV15')||localStorage.getItem('monBudgetV14')||localStorage.getItem('monBudgetV13')||localStorage.getItem('monBudgetV12')||localStorage.getItem('monBudgetV11')||localStorage.getItem('monBudgetV10')||localStorage.getItem('monBudgetV9')||localStorage.getItem('monBudgetV8')||localStorage.getItem('monBudgetV7')||localStorage.getItem('monBudgetV6')||localStorage.getItem('monBudgetV5')||localStorage.getItem('monBudgetV1');
let state=raw?JSON.parse(raw):{accounts:[{id:'main',name:'Compte principal'}],activeAccount:'main',ops:[],budgets:{main:{}},recurring:[],goals:[]};
if(!state.accounts)state.accounts=[{id:'main',name:'Compte principal'}];if(!state.activeAccount)state.activeAccount='main';if(!state.budgets)state.budgets={};if(!state.recurring)state.recurring=[];if(!state.goals)state.goals=[];if(!state.monthlyPlans)state.monthlyPlans={};if(!state.dashboardPrefs)state.dashboardPrefs={donut:true,insights:true,anomalies:true,upcoming:true,predictions:true};if(!state.templates)state.templates=[];if(!state.rules)state.rules=[];if(!state.savingsEntries)state.savingsEntries=[];if(!state.uxPrefs)state.uxPrefs={compact:false};if(!state.customCategories)state.customCategories=[];if(!state.categoryRenames)state.categoryRenames={};
state.ops=(state.ops||[]).map(x=>({...x,id:x.id||'op_'+Date.now()+Math.random(),accountId:x.accountId||'main',scope:x.scope||'personal',tags:Array.isArray(x.tags)?x.tags:[]}));
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
function mo(){return state.ops.filter(x=>x.accountId===state.activeAccount&&x.date.startsWith(mk()))}
function monthlySave(){return state.goals.reduce((s,g)=>s+(+g.monthly||0),0)}
function recTotal(){return state.recurring.filter(r=>r.accountId===state.activeAccount).reduce((s,r)=>s+r.amount,0)}
function fullMonthLabel(){let s=view.toLocaleDateString('fr-BE',{month:'long',year:'numeric'});return s[0].toUpperCase()+s.slice(1)}


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
  return (text||'').replace(/\r/g,'\n').replace(/[ \t]+/g,' ').trim();
}

function extractReceiptData(text){
  const raw=normalizeReceiptText(text);
  const lines=raw.split('\n').map(x=>x.trim()).filter(Boolean);

  // merchant: first meaningful line without mostly digits
  let merchant=lines.find(l=>/[A-Za-zÀ-ÿ]{3}/.test(l) && !/^(ticket|reçu|receipt|facture|date|total|tva|vat)\b/i.test(l))||'';
  merchant=merchant.replace(/[^\wÀ-ÿ&' .-]/g,'').trim().slice(0,60);

  // dates: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
  let date='';
  const dm=raw.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](20\d{2}|\d{2})\b/);
  const ym=raw.match(/\b(20\d{2})[\/\-.](0?[1-9]|1[0-2])[\/\-.](0?[1-9]|[12]\d|3[01])\b/);
  if(dm){
    let y=dm[3].length===2?'20'+dm[3]:dm[3];
    date=`${y}-${String(dm[2]).padStart(2,'0')}-${String(dm[1]).padStart(2,'0')}`;
  }else if(ym){
    date=`${ym[1]}-${String(ym[2]).padStart(2,'0')}-${String(ym[3]).padStart(2,'0')}`;
  }

  // amounts near TOTAL/TOTAL TTC first
  let amount=null;
  const totalLines=lines.filter(l=>/\b(total|total ttc|à payer|a payer|montant|amount)\b/i.test(l));
  const candidates=[];
  const parseAmounts=line=>{
    const ms=[...line.matchAll(/(?:€\s*)?(\d{1,5}(?:[.,]\d{2}))(?:\s*€)?/g)];
    ms.forEach(m=>candidates.push(parseFloat(m[1].replace(',','.'))));
  };
  totalLines.forEach(parseAmounts);
  if(candidates.length) amount=Math.max(...candidates);
  else{
    const all=[];
    lines.forEach(line=>{
      [...line.matchAll(/(?:€\s*)?(\d{1,5}(?:[.,]\d{2}))(?:\s*€)?/g)].forEach(m=>all.push(parseFloat(m[1].replace(',','.'))));
    });
    if(all.length) amount=Math.max(...all.filter(x=>x<100000));
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
  for(const [keys,cat] of rules){if(keys.some(k=>low.includes(k))){category=cat;break}}
  category=applyRules(merchant,category);

  return {merchant,amount,date,category,raw};
}

async function analyzeReceipt(){
  if(!receiptFile)return alert('Choisis d’abord une photo.');
  if(typeof Tesseract==='undefined')return alert('Le module de lecture du ticket n’est pas disponible. Vérifie ta connexion internet.');
  scanProgress.className='scan-progress active';
  scanProgress.textContent='Analyse du ticket… 0 %';
  scanResult.classList.add('hidden');
  try{
    const result=await Tesseract.recognize(receiptFile,'fra+eng',{
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
    scanAmount.value=data.amount?data.amount.toFixed(2):'';
    scanDate.value=data.date||new Date().toISOString().slice(0,10);
    scanCategory.value=data.category||'Autres';
    scanRawText.textContent=data.raw||'Aucun texte détecté.';
    scanResult.classList.remove('hidden');
    scanProgress.className='scan-progress';
    scanProgress.textContent='Analyse terminée. Vérifie les informations avant de valider.';
  }catch(err){
    scanProgress.className='scan-progress';
    scanProgress.textContent='Impossible de lire ce ticket. Essaie une photo plus nette.';
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
  const now=new Date(),same=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const day=Math.max(1,same?now.getDate():1),last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
  const spent=current.reduce((s,x)=>s+x.amount,0),rate=spent/day,projected=rate*last;
  const rows=[];
  const totalBudget=cats.reduce((s,c)=>s+(+budgets()[c]||0),0);
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
  el.innerHTML=rows.length?rows.slice(0,5).map(([t,m,cl])=>`<div class="prediction ${cl}"><strong>${t}</strong><div>${m}</div></div>`).join(''):'<div class="muted">Ajoute des budgets et quelques dépenses pour activer les prévisions.</div>';
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


function monthlyPlannedSavings(){
  return (+currentPlan().savings||0) || monthlySave();
}
function monthSavingsEntries(){
  return (state.savingsEntries||[]).filter(x=>x.accountId===state.activeAccount&&x.date.startsWith(mk()));
}
function monthlySavedActual(){
  return monthSavingsEntries().reduce((s,x)=>s+(+x.amount||0),0);
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
  const d=new Date(view.getFullYear(),view.getMonth(),Math.min(1,last));
  return d.toISOString().slice(0,10);
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
  state.savingsEntries=state.savingsEntries.filter(x=>x.id!==id);
  save();render();showToast('Épargne supprimée');
}
function editSavingEntry(id){
  const e=state.savingsEntries.find(x=>x.id===id);if(!e)return;
  const raw=prompt('Nouveau montant',String(e.amount));
  if(raw===null)return;
  const amount=+raw||0;if(amount<=0)return;
  const old=+e.amount||0;
  e.amount=amount;
  adjustGoalFromSaving(e,amount-old);
  const note=prompt('Note',e.note||'');
  if(note!==null)e.note=note.trim();
  save();render();showToast('Épargne modifiée');
}
function addSavingEntry(fromQuick=false){
  const amount=+(fromQuick?(document.getElementById('savingAmountQuick')?.value||0):(document.getElementById('savingAmount')?.value||0));
  if(!amount)return;
  const date=fromQuick?entryDateForView():(document.getElementById('savingDate')?.value||entryDateForView());
  const note=(fromQuick?(document.getElementById('savingNoteQuick')?.value||''):(document.getElementById('savingNote')?.value||'')).trim();
  const goalId=fromQuick?'':(document.getElementById('savingGoal')?.value||'');
  state.savingsEntries.push({id:'sav_'+Date.now(),amount,date,note,goalId,accountId:state.activeAccount});
  if(goalId){
    const g=state.goals.find(x=>x.id===goalId);
    if(g)g.saved=Math.min(+g.target||Infinity,(+g.saved||0)+amount);
  }
  if(fromQuick){
    if(document.getElementById('savingAmountQuick'))savingAmountQuick.value='';
    if(document.getElementById('savingNoteQuick'))savingNoteQuick.value='';
    document.getElementById('savingQuickForm')?.classList.add('hidden');
  }else{
    if(document.getElementById('savingAmount'))savingAmount.value='';
    if(document.getElementById('savingDate'))savingDate.value='';
    if(document.getElementById('savingNote'))savingNote.value='';
    if(document.getElementById('savingGoal'))savingGoal.value='';
  }
  save();render();showToast('Épargne ajoutée ✨');
}
function renderSavingsModule(){
  const planned=monthlyPlannedSavings();
  const actual=monthlySavedActual();
  const remaining=Math.max(0,planned-actual);
  const bonus=Math.max(0,actual-planned);
  const pct=planned>0?Math.min(100,Math.round(actual/planned*100)):0;
  if(document.getElementById('savingPlanned'))savingPlanned.textContent=eur(planned);
  if(document.getElementById('savingActual'))savingActual.textContent=eur(actual);
  if(document.getElementById('savingRemaining'))savingRemaining.textContent=eur(remaining);
  if(document.getElementById('savingBonus'))savingBonus.textContent=eur(bonus);
  if(document.getElementById('savingPercent'))savingPercent.textContent=(planned>0?pct:0)+' %';
  if(document.getElementById('savingProgress'))savingProgress.style.width=(planned>0?Math.min(100,actual/planned*100):0)+'%';
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
    savingGoal.innerHTML='<option value="">Aucun objectif lié</option>'+state.goals.map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
  }
  el.innerHTML=entries.length?entries.map(x=>{
    const goal=x.goalId?state.goals.find(g=>g.id===x.goalId):null;
    return `<div class="savingsHistoryItem">
      <div class="meta"><strong>${x.note||'Épargne'}</strong><div class="muted">${x.date}</div>${goal?`<div class="goalpill">${goal.name}</div>`:''}</div>
      <div>
        <b class="income">+ ${eur(x.amount)}</b>
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
  const ops=state.ops.filter(x=>x.accountId===state.activeAccount&&x.date.startsWith(key));
  const income=ops.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);
  const expenses=ops.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);
  const savings=(state.savingsEntries||[]).filter(x=>x.accountId===state.activeAccount&&x.date.startsWith(key)).reduce((s,x)=>s+(+x.amount||0),0);
  return {ops,income,expenses,savings,remaining:income-expenses-savings};
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
  nextMonthSavings.textContent=eur(Math.max(avgSav,Math.max(0,nextIncome-avgExp)));
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



function pendingRecurringAmount(){
  const a=mo();
  const appliedIds=new Set(a.filter(x=>x.recurringId).map(x=>x.recurringId));
  return state.recurring
    .filter(r=>r.accountId===state.activeAccount&&!appliedIds.has(r.id))
    .reduce((s,r)=>s+(+r.amount||0),0);
}
function financialSnapshot(){
  const p=currentPlan();
  const a=mo();
  const realIncome=a.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);
  const expenses=a.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);
  const actualSaved=monthlySavedActual();
  const plannedSaved=monthlyPlannedSavings();
  const incomeBase=realIncome>0?realIncome:(+p.income||0);
  const savingsStillToReserve=Math.max(0,plannedSaved-actualSaved);
  const pendingRecurring=pendingRecurringAmount();
  const safeAvailable=incomeBase-expenses-actualSaved-savingsStillToReserve-pendingRecurring;
  return {p,a,realIncome,incomeBase,expenses,actualSaved,plannedSaved,savingsStillToReserve,pendingRecurring,safeAvailable};
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
  const date=new Date().toISOString().slice(0,10)+'T12:00:00';
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
  const day=now.getDate();
  state.recurring.filter(r=>r.accountId===state.activeAccount).forEach(r=>{
    const delta=(+r.day||1)-day;
    if(delta>=0 && delta<=3)alerts.push({type:'warn',icon:'⌛',title:`${r.name} arrive bientôt`,text:`${eur(r.amount)} prévu${delta===0?" aujourd’hui":` dans ${delta} jour${delta>1?'s':''}`}.`});
  });

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
  el.innerHTML=allCats().map(c=>`<div class="category-row">
    <span>${c}</span>
    <div class="category-actions">
      <button class="secondary" onclick="renameCategory('${c.replace(/'/g,"\'")}')">Renommer</button>
      ${isBaseDisplay(c)?'':`<button class="secondary" onclick="deleteCustomCategory('${c.replace(/'/g,"\'")}')">Supprimer</button>`}
    </div>
  </div>`).join('');
}
function emptyState(icon,title,text){
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${title}</strong><small>${text}</small></div>`;
}

function render(){
  refreshCats();
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
  forecastAmount.textContent=eur(forecast);forecastText.textContent=`Après ${eur(future)} de charges récurrentes restantes et ${eur(snap.plannedSaved)} d’épargne prévue.`;if(sf)sf.textContent=eur(forecast);
  let now=new Date(),same=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth(),last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate(),day=same?now.getDate():1,days=Math.max(1,last-day+1);
  dailyAmount.textContent=eur(Math.max(0,forecast)/days)+' / jour';dailyText.textContent=`${days} jours restants dans le mois.`;

  renderCats(a);renderFiltered();renderBudgets();renderRecurring();renderGoals();renderStats();renderComparison();renderUpcoming();renderSmartInsights();renderAnomalies();renderCalendar();renderTemplates();renderRules();renderPredictions();renderAutomationSuggestions();renderHeroTrend();renderGoalShowcase();renderMonthlyPilot();renderSavingsModule();renderSavingsHistory();renderMonthlyReport();renderFocusCard();renderCategoryManager();renderAlerts();loadMonthlyPlanInputs();applyDashboardPrefs();applyRecurring();renderCloudStatus();
  let td=new Date().toISOString().slice(0,10);if(!eDate.value)eDate.value=td;if(!iDate.value)iDate.value=td;if(!tDate.value)tDate.value=td;save();
}
function renderCats(a){let t={};a.filter(x=>x.type==='expense').forEach(x=>t[x.cat]=(t[x.cat]||0)+x.amount);cats.innerHTML=cats.filter?'' : '';document.getElementById('cats').innerHTML=cats.filter(c=>(t[c]||0)>0||(budgets()[c]||0)>0).map(c=>{let s=t[c]||0,l=+budgets()[c]||0,p=l?s/l*100:0;return `<div class="cat"><div class="row"><span><strong>${c}</strong><br><span class="muted">${l?(l-s>=0?eur(l-s)+' restant':eur(s-l)+' dépassé'):'Pas de plafond'}</span></span><b>${eur(s)}${l?' / '+eur(l):''}</b></div><div class="catbar"><div class="catfill" style="width:${l?Math.min(100,p):0}%"></div></div></div>`}).join('')||emptyState('◌','Aucune dépense ici','Tes dépenses apparaîtront ici dès que tu en ajoutes une.')}
function renderFiltered(){
  let a=mo(),q=(searchInput?.value||'').toLowerCase(),fc=filterCat?.value||'',scope=document.getElementById('filterScope')?.value||'',tag=(document.getElementById('filterTag')?.value||'').toLowerCase(),min=+(document.getElementById('filterMin')?.value||0),max=+(document.getElementById('filterMax')?.value||0);
  a=a.filter(x=>(!q||x.name.toLowerCase().includes(q))&&(!fc||x.cat===fc)&&(!scope||x.scope===scope)&&(!tag||(x.tags||[]).some(t=>t.toLowerCase().includes(tag)))&&(!min||x.amount>=min)&&(!max||x.amount<=max));
  list.innerHTML=a.length?a.slice().reverse().map(x=>`<div class="row"><span><strong>${x.name}</strong><br><span class="muted">${x.date.slice(0,10)} · ${x.cat||'Revenu'}</span><br>${x.scope?`<span class="scopebadge">${x.scope==='pro'?'Pro':'Perso'}</span>`:''}${(x.tags||[]).map(t=>`<span class="tagbadge">${t}</span>`).join('')}</span><span><b class="${x.type==='income'||x.type==='transfer_in'?'income':'danger'}">${x.type==='income'||x.type==='transfer_in'?'+':'−'} ${eur(x.amount)}</b><div class="actions"><button onclick="editOp('${x.id}')">Modifier</button><button onclick="deleteOp('${x.id}')">Suppr.</button></div></span></div>`).join(''):'<div class="muted">Aucune opération.</div>'
}
function renderBudgets(){budgetEditors.innerHTML=cats.map(c=>`<div class="budget-editor"><span>${c}</span><input type="number" data-cat="${c}" value="${budgets()[c]||''}" placeholder="0 €"></div>`).join('')}function saveBudgets(){document.querySelectorAll('[data-cat]').forEach(i=>budgets()[i.dataset.cat]=Math.max(0,+i.value||0));render()}
function addAccount(){let n=newAccountName.value.trim();if(!n)return;let id='acc_'+Date.now();state.accounts.push({id,name:n});state.budgets[id]={};state.activeAccount=id;newAccountName.value='';toggle('accountForm');render()}
function toggle(id){document.getElementById(id).classList.toggle('hidden')}function changeMonth(n){view.setMonth(view.getMonth()+n);render()}function nav(id,b){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('.bottomnav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(id==='stats')renderStats();if(id==='report')renderMonthlyReport()}
function showForm(id,b){document.querySelectorAll('#ops form').forEach(f=>f.style.display='none');document.getElementById(id).style.display='block';document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active')}

expenseForm.onsubmit=e=>{e.preventDefault();state.ops.push({id:'op_'+Date.now(),type:'expense',name:eName.value,amount:+eAmount.value,cat:applyRules(eName.value,eCat.value),nature:eNature.value,scope:eScope.value,tags:eTags.value.split(',').map(x=>x.trim()).filter(Boolean),date:eDate.value+'T12:00:00',accountId:state.activeAccount});e.target.reset();render();showToast('Dépense ajoutée')};
incomeForm.onsubmit=e=>{e.preventDefault();state.ops.push({id:'op_'+Date.now(),type:'income',name:iName.value,amount:+iAmount.value,cat:'',date:iDate.value+'T12:00:00',accountId:state.activeAccount});e.target.reset();render();showToast('Revenu ajouté')};
transferForm.onsubmit=e=>{e.preventDefault();if(tFrom.value===tTo.value)return alert('Choisis deux comptes différents.');let a=+tAmount.value||0,d=tDate.value,g='tr_'+Date.now();state.ops.push({id:g+'a',type:'transfer_out',name:'Transfert',amount:a,cat:'Transfert',date:d+'T12:00:00',accountId:tFrom.value,transferGroup:g},{id:g+'b',type:'transfer_in',name:'Transfert',amount:a,cat:'Transfert',date:d+'T12:00:00',accountId:tTo.value,transferGroup:g});e.target.reset();render()};
function deleteOp(id){state.ops=state.ops.filter(x=>x.id!==id);render()}function editOp(id){let x=state.ops.find(o=>o.id===id),n=prompt('Nom',x.name);if(n===null)return;let a=prompt('Montant',x.amount);if(a===null)return;x.name=n||x.name;x.amount=Math.max(0,+a||x.amount);render()}

function addRecurring(){let n=rName.value.trim(),a=+rAmount.value||0;if(!n||!a)return;state.recurring.push({id:'rec_'+Date.now(),name:n,amount:a,cat:rCat.value,day:+rDay.value,accountId:state.activeAccount});rName.value='';rAmount.value='';render()}
function renderRecurring(){recurringList.innerHTML=state.recurring.filter(r=>r.accountId===state.activeAccount).map(r=>`<div class="rec"><div class="goalhead"><span><strong>${r.name}</strong><br><span class="muted">${r.cat} · le ${r.day}</span></span><b>${eur(r.amount)}</b></div><div class="actions"><button onclick="deleteRecurring('${r.id}')">Supprimer</button></div></div>`).join('')||'<div class="muted">Aucune dépense récurrente.</div>'}
function deleteRecurring(id){state.recurring=state.recurring.filter(r=>r.id!==id);render()}
function applyRecurring(){
  const k=mk();
  const now=new Date();
  const isCurrent=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const isPast=view < new Date(now.getFullYear(),now.getMonth(),1);
  const today=isCurrent?now.getDate():0;
  let changed=false;

  state.recurring.filter(r=>r.accountId===state.activeAccount).forEach(r=>{
    const due=isPast || (isCurrent && (+r.day||1)<=today);
    if(!due)return;
    if(state.ops.some(x=>x.recurringId===r.id&&x.date.startsWith(k)))return;
    const d=String(Math.min(+r.day||1,new Date(view.getFullYear(),view.getMonth()+1,0).getDate())).padStart(2,'0');
    state.ops.push({
      id:'op_'+Date.now()+Math.random(),type:'expense',name:r.name,amount:+r.amount||0,
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
    goalId:g.id,accountId:state.activeAccount
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
function renderStats(){let n=+(statsPeriod?.value||6),months=[];for(let i=n-1;i>=0;i--){let d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);let key=mk(d),ops=state.ops.filter(x=>x.accountId===state.activeAccount&&x.date.startsWith(key)),exp=ops.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);months.push({d,exp,ops})}let avg=months.reduce((s,m)=>s+m.exp,0)/Math.max(1,n);avgExpenses.textContent=eur(avg);let worst=months.slice().sort((a,b)=>b.exp-a.exp)[0];worstMonth.textContent=worst&&worst.exp?worst.d.toLocaleDateString('fr-BE',{month:'short'}):'—';let ct={};months.flatMap(m=>m.ops).filter(x=>x.type==='expense').forEach(x=>ct[x.cat]=(ct[x.cat]||0)+x.amount);let top=Object.entries(ct).sort((a,b)=>b[1]-a[1])[0];topCategory.textContent=top?top[0]:'—';let first=months[0]?.exp||0,last=months.at(-1)?.exp||0;trend.textContent=first?(((last-first)/first*100)>=0?'+':'')+Math.round((last-first)/first*100)+' %':'—';let max=Math.max(1,...months.map(m=>m.exp));chart.innerHTML=months.map(m=>`<div class="barcol"><i style="height:${Math.max(3,m.exp/max*130)}px"></i>${m.d.toLocaleDateString('fr-BE',{month:'short'})}<br>${Math.round(m.exp)}€</div>`).join('')}
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


function goToAccountSettings(){
  const btn=[...document.querySelectorAll('.bottomnav button')].find(b=>b.getAttribute('onclick')?.includes("nav('settings'"));
  if(btn)nav('settings',btn);
  setTimeout(()=>document.querySelector('.account-access-card')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
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
    showToast('Création de compte prête : configure Supabase pour l’activer.');
    return false;
  }
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
function blankState(){return {accounts:[{id:'main',name:'Compte principal'}],activeAccount:'main',ops:[],budgets:{main:{}},recurring:[],goals:[],monthlyPlans:{},dashboardPrefs:{donut:true,insights:true,anomalies:true,upcoming:true,predictions:true},templates:[],rules:[],savingsEntries:[],uxPrefs:{compact:false},customCategories:[],categoryRenames:{}}}
function normalizeState(x){x=x&&typeof x==='object'?x:blankState();if(!x.accounts?.length)x.accounts=[{id:'main',name:'Compte principal'}];if(!x.activeAccount)x.activeAccount=x.accounts[0].id;if(!x.ops)x.ops=[];if(!x.budgets)x.budgets={main:{}};if(!x.recurring)x.recurring=[];if(!x.goals)x.goals=[];if(!x.monthlyPlans)x.monthlyPlans={};if(!x.dashboardPrefs)x.dashboardPrefs={donut:true,insights:true,anomalies:true,upcoming:true,predictions:true};if(!x.templates)x.templates=[];if(!x.rules)x.rules=[];if(!x.savingsEntries)x.savingsEntries=[];if(!x.uxPrefs)x.uxPrefs={compact:false};if(!x.customCategories)x.customCategories=[];if(!x.categoryRenames)x.categoryRenames={};x.ops=x.ops.map(o=>({...o,accountId:o.accountId||'main',scope:o.scope||'personal',tags:Array.isArray(o.tags)?o.tags:[]}));return x}
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
async function doSignUp(email,password){if(!cloudConfigured)return showToast('Configure Supabase dans config.js');if(!email||!password)return showToast('Email et mot de passe requis');if(password.length<6)return showToast('6 caractères minimum');const {data,error}=await sb.auth.signUp({email,password});if(error)return showToast(error.message);if(data.session){currentUser=data.user;localStorage.setItem(userCacheKey(),JSON.stringify(normalizeState(state)));await pushCloud(true);showAuthGate(false);renderCloudStatus();showToast('Compte créé ✨')}else showToast('Compte créé. Vérifie ton email.')}
async function doSignIn(email,password){if(!cloudConfigured)return showToast('Configure Supabase dans config.js');const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)return showToast('Connexion impossible : '+error.message);currentUser=data.user;await loadUserWorkspace();renderCloudStatus();renderVisibleAccountUI();showAuthGate(false);showToast('Bienvenue 👋')}
async function signUp(){return doSignUp(authEmail.value.trim(),authPassword.value)}
async function signIn(){return doSignIn(authEmail.value.trim(),authPassword.value)}
async function gateSignUp(){return doSignUp(gateEmail.value.trim(),gatePassword.value)}
async function gateSignIn(){return doSignIn(gateEmail.value.trim(),gatePassword.value)}
async function requestReset(email){if(!cloudConfigured)return showToast('Configure Supabase dans config.js');if(!email)return showToast('Entre ton email');const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});showToast(error?error.message:'Email de réinitialisation envoyé')}
async function resetPassword(){return requestReset(authEmail.value.trim())}
async function gateResetPassword(){return requestReset(gateEmail.value.trim())}
async function signOut(){if(!cloudConfigured)return;if(currentUser)await pushCloud(true);await sb.auth.signOut()}
async function pushCloud(silent=false){if(!cloudConfigured||!currentUser){if(!silent)showToast('Connecte-toi');return}const {error}=await sb.from('budget_snapshots').upsert({user_id:currentUser.id,data:state,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error){if(!silent)showToast('Erreur cloud : '+error.message);return}localStorage.setItem(userCacheKey(),JSON.stringify(state));if(document.getElementById('syncInfo'))syncInfo.textContent='Dernière synchro : '+new Date().toLocaleString('fr-BE');if(!silent)showToast('Budget sauvegardé')}
async function pullCloud(silent=false){if(!cloudConfigured||!currentUser){if(!silent)showToast('Connecte-toi');return}const {data,error}=await sb.from('budget_snapshots').select('data,updated_at').eq('user_id',currentUser.id).maybeSingle();if(error){if(!silent)showToast('Erreur cloud : '+error.message);return}if(data?.data){state=normalizeState(data.data);localStorage.setItem(userCacheKey(),JSON.stringify(state));render();if(document.getElementById('syncInfo'))syncInfo.textContent='Données à jour : '+new Date(data.updated_at).toLocaleString('fr-BE')}else{state=normalizeState(state);await pushCloud(true);if(document.getElementById('syncInfo'))syncInfo.textContent='Premier espace cloud créé'}}
function download(c,n,t){let b=new Blob([c],{type:t}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=n;a.click();URL.revokeObjectURL(u)}
function exportBackup(){download(JSON.stringify(state,null,2),'mon_budget_v9_sauvegarde.json','application/json')}
function importBackup(f){if(!f)return;let r=new FileReader();r.onload=()=>{try{state=normalizeState(JSON.parse(r.result));refreshCats();render();save()}catch(e){alert('Fichier invalide')}};r.readAsText(f)}
function exportCSV(){let rows=[['Compte','Type','Nom','Montant','Catégorie','Nature','Date']];state.ops.forEach(x=>rows.push([state.accounts.find(a=>a.id===x.accountId)?.name||'Compte',x.type,x.name,x.amount,x.cat||'',x.nature||'',x.date.slice(0,10)]));download('\ufeff'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n'),'mon_budget_v9.csv','text/csv')}

render();initCloud();setupOnboarding();initPrivacy();


if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
