
const KEY='monBudgetV7';
const LEGACY=['monBudgetV6','monBudgetV5','monBudgetV1'];
const cats=['Logement','Courses','Transport','Enfant','Abonnements','Loisirs','Shopping','Travail','Autres'];
const eur=n=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(Number(n)||0);

let state=loadState();
let view=new Date(); view.setDate(1);

function loadState(){
  let raw=localStorage.getItem(KEY);
  if(!raw){for(const k of LEGACY){raw=localStorage.getItem(k);if(raw)break}}
  let s=raw?JSON.parse(raw):null;
  if(!s)s={accounts:[{id:'main',name:'Compte principal',openingBalance:0}],activeAccount:'main',ops:[],budgets:{main:{}},recurring:[],goals:[]};
  if(!s.accounts)s.accounts=[{id:'main',name:'Compte principal',openingBalance:0}];
  if(!s.activeAccount)s.activeAccount=s.accounts[0].id;
  if(!s.budgets)s.budgets={};
  if(!s.recurring)s.recurring=[];
  if(!s.goals)s.goals=[];
  s.ops=(s.ops||[]).map(x=>({...x,id:x.id||('op_'+Date.now()+Math.random()),accountId:x.accountId||'main'}));
  return s;
}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function activeBudgets(){return state.budgets[state.activeAccount]||(state.budgets[state.activeAccount]={})}
function monthKey(){return view.getFullYear()+'-'+String(view.getMonth()+1).padStart(2,'0')}
function monthLabel(){let s=view.toLocaleDateString('fr-BE',{month:'long',year:'numeric'});return s[0].toUpperCase()+s.slice(1)}
function monthOps(){return state.ops.filter(x=>x.accountId===state.activeAccount&&x.date.startsWith(monthKey()))}
function totalBudget(){const b=activeBudgets();return cats.reduce((s,c)=>s+(+b[c]||0),0)}
function monthlySavings(){return state.goals.reduce((s,g)=>s+(+g.monthly||0),0)}
function plannedRecurring(){return state.recurring.filter(r=>r.accountId===state.activeAccount).reduce((s,r)=>s+(+r.amount||0),0)}

function render(){
  renderAccounts();renderSelects();
  document.getElementById('month').textContent=monthLabel();
  const a=monthOps();
  const inc=a.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);
  const exp=a.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);
  const reserve=monthlySavings();
  const rem=inc-exp-reserve;

  document.getElementById('income').textContent=eur(inc);
  document.getElementById('expenses').textContent=eur(exp);
  document.getElementById('remaining').textContent=eur(rem);
  document.getElementById('savingReserve').textContent=eur(reserve);

  const p=inc?Math.min(100,exp/inc*100):0;
  document.getElementById('fill').style.width=p+'%';
  document.getElementById('percent').textContent=Math.round(p)+' % des revenus dépensés';

  const tb=totalBudget(), bl=tb-exp;
  document.getElementById('budgetLeft').textContent=tb?eur(bl):'—';
  document.getElementById('globalNotice').innerHTML=!tb
    ?'<div class="notice warn">Définis tes budgets mensuels pour activer les alertes.</div>'
    :exp/tb<.75
      ?`<div class="notice good">Tu es bien dans ton budget. Il reste <strong>${eur(bl)}</strong>.</div>`
      :exp/tb<=1
        ?`<div class="notice warn">Tu as utilisé <strong>${Math.round(exp/tb*100)} %</strong> de ton budget.</div>`
        :`<div class="notice bad">Budget dépassé de <strong>${eur(Math.abs(bl))}</strong>.</div>`;

  const rec=plannedRecurring();
  const alreadyRecurring=a.filter(x=>x.recurringId).reduce((s,x)=>s+x.amount,0);
  const futureRecurring=Math.max(0,rec-alreadyRecurring);
  const forecast=inc-exp-futureRecurring-reserve;
  document.getElementById('forecastAmount').textContent=eur(forecast);
  document.getElementById('forecastText').textContent=`Après ${eur(futureRecurring)} de charges récurrentes restantes et ${eur(reserve)} d’épargne prévue.`;

  const now=new Date(),same=now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth();
  const last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate(),day=same?now.getDate():1,days=Math.max(1,last-day+1);
  document.getElementById('dailyAmount').textContent=eur(Math.max(0,forecast)/days)+' / jour';
  document.getElementById('dailyText').textContent=`${days} jour${days>1?'s':''} restant${days>1?'s':''} dans le mois.`;

  document.getElementById('plannedIncome').textContent=eur(inc);
  document.getElementById('plannedFixed').textContent=eur(rec);
  document.getElementById('plannedSavings').textContent=eur(reserve);
  document.getElementById('plannedVariable').textContent=eur(Math.max(0,inc-rec-reserve));

  renderCats(a);renderList(a);renderBudgetEditors();renderRecurring();renderGoals();applyRecurringForMonth();

  const today=new Date().toISOString().slice(0,10);
  ['eDate','iDate','tDate'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.value)el.value=today});
  save();
}

function renderAccounts(){
  const el=document.getElementById('accountSelect');
  if(!el)return;
  el.innerHTML=state.accounts.map(a=>`<option value="${a.id}" ${a.id===state.activeAccount?'selected':''}>${a.name}</option>`).join('');
}
function renderSelects(){
  const catOpts=cats.map(c=>`<option>${c}</option>`).join('');
  const eCat=document.getElementById('eCat'),rCat=document.getElementById('rCat');
  if(eCat)eCat.innerHTML=catOpts;if(rCat)rCat.innerHTML=catOpts;
  const rDay=document.getElementById('rDay');
  if(rDay)rDay.innerHTML=Array.from({length:28},(_,i)=>`<option value="${i+1}">Le ${i+1}</option>`).join('');
  const opts=state.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  const from=document.getElementById('tFrom'),to=document.getElementById('tTo');
  if(from)from.innerHTML=opts;if(to)to.innerHTML=opts;
}
function addAccount(){
  const n=document.getElementById('newAccountName'),b=document.getElementById('newAccountBalance');
  const name=n.value.trim();if(!name)return;
  const id='acc_'+Date.now();state.accounts.push({id,name,openingBalance:+b.value||0});state.budgets[id]={};state.activeAccount=id;n.value='';b.value='';render();
}
function switchAccount(id){state.activeAccount=id;render()}
function toggle(id){document.getElementById(id).classList.toggle('hidden')}
function changeMonth(n){view.setMonth(view.getMonth()+n);render()}
function nav(id,btn){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('.bottomnav button').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}
function showForm(id,btn){document.querySelectorAll('#ops form').forEach(f=>f.style.display='none');document.getElementById(id).style.display='block';document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}

function addOp(type,name,amount,date,cat,nature='',accountId=state.activeAccount,extra={}){
  state.ops.push({id:'op_'+Date.now()+Math.random(),type,name,amount:+amount,cat:cat||'',nature,date:date+'T12:00:00',accountId,...extra});render();
}
document.addEventListener('DOMContentLoaded',()=>{
  const ef=document.getElementById('expenseForm'),inf=document.getElementById('incomeForm'),tf=document.getElementById('transferForm');
  if(ef)ef.onsubmit=e=>{e.preventDefault();addOp('expense',eName.value,eAmount.value,eDate.value,eCat.value,eNature.value);e.target.reset();render()};
  if(inf)inf.onsubmit=e=>{e.preventDefault();addOp('income',iName.value,iAmount.value,iDate.value);e.target.reset();render()};
  if(tf)tf.onsubmit=e=>{e.preventDefault();if(tFrom.value===tTo.value)return alert('Choisis deux comptes différents.');const amt=+tAmount.value||0;if(!amt)return;const group='tr_'+Date.now();
    state.ops.push({id:'out_'+Date.now(),type:'transfer_out',name:'Transfert',amount:amt,cat:'Transfert',date:tDate.value+'T12:00:00',accountId:tFrom.value,transferGroup:group});
    state.ops.push({id:'in_'+Date.now(),type:'transfer_in',name:'Transfert',amount:amt,cat:'Transfert',date:tDate.value+'T12:00:00',accountId:tTo.value,transferGroup:group});
    e.target.reset();render();
  };
  render();
});

function renderList(a){
  const el=document.getElementById('list');
  el.innerHTML=a.length?a.slice().reverse().map(x=>{const plus=x.type==='income'||x.type==='transfer_in';return `<div class="row"><span><strong>${x.name}</strong><br><span class="muted">${x.date.slice(0,10)} · ${x.cat||'Revenu'}</span></span><span style="text-align:right"><b class="${plus?'income':'danger'}">${plus?'+':'−'} ${eur(x.amount)}</b><div class="actions"><button onclick="editOp('${x.id}')">Modifier</button><button onclick="deleteOp('${x.id}')">Suppr.</button></div></span></div>`}).join(''):'<div class="muted">Aucune opération ce mois-ci.</div>';
}
function deleteOp(id){state.ops=state.ops.filter(x=>x.id!==id);render()}
function editOp(id){const x=state.ops.find(o=>o.id===id);if(!x)return;const n=prompt('Nom',x.name);if(n===null)return;const a=prompt('Montant',x.amount);if(a===null)return;x.name=n.trim()||x.name;x.amount=Math.max(0,+a||x.amount);render()}
function renderCats(a){
  let totals={};a.filter(x=>x.type==='expense').forEach(x=>totals[x.cat]=(totals[x.cat]||0)+x.amount);
  const b=activeBudgets(),visible=cats.filter(c=>(totals[c]||0)>0||(b[c]||0)>0);
  document.getElementById('cats').innerHTML=visible.map(c=>{let s=totals[c]||0,l=+b[c]||0,p=l?s/l*100:0,st=l?(p>100?'over':p>=80?'warn':''):'';return `<div class="cat ${st}"><div class="row"><span><strong>${c}</strong><br><span class="muted">${l?(l-s>=0?eur(l-s)+' restant':eur(s-l)+' dépassé'):'Pas de plafond'}</span></span><b>${eur(s)}${l?' / '+eur(l):''}</b></div><div class="catbar"><div class="catfill" style="width:${l?Math.min(100,p):0}%"></div></div></div>`}).join('')||'<div class="muted">Aucune donnée pour ce mois.</div>';
}
function renderBudgetEditors(){const b=activeBudgets();document.getElementById('budgetEditors').innerHTML=cats.map(c=>`<div class="budget-editor"><span>${c}</span><input type="number" min="0" step="10" data-cat="${c}" value="${b[c]||''}" placeholder="0 €"></div>`).join('')}
function saveBudgets(){const b=activeBudgets();document.querySelectorAll('[data-cat]').forEach(i=>b[i.dataset.cat]=Math.max(0,+i.value||0));render()}
function resetBudgets(){state.budgets[state.activeAccount]={};render()}
function addRecurring(){const name=rName.value.trim(),amount=+rAmount.value||0;if(!name||!amount)return;state.recurring.push({id:'rec_'+Date.now(),name,amount,cat:rCat.value,day:+rDay.value,accountId:state.activeAccount});rName.value='';rAmount.value='';render()}
function renderRecurring(){document.getElementById('recurringList').innerHTML=state.recurring.filter(r=>r.accountId===state.activeAccount).map(r=>`<div class="recurring"><div class="recurring-head"><span><strong>${r.name}</strong><br><span class="muted">${r.cat} · le ${r.day}</span></span><b>${eur(r.amount)}</b></div><div class="actions"><button onclick="deleteRecurring('${r.id}')">Supprimer</button></div></div>`).join('')||'<div class="muted">Aucune dépense récurrente.</div>'}
function deleteRecurring(id){state.recurring=state.recurring.filter(r=>r.id!==id);render()}
function applyRecurringForMonth(){const key=monthKey();state.recurring.filter(r=>r.accountId===state.activeAccount).forEach(r=>{const exists=state.ops.some(x=>x.recurringId===r.id&&x.date.startsWith(key));if(!exists){const d=String(Math.min(r.day,28)).padStart(2,'0');state.ops.push({id:'op_'+Date.now()+Math.random(),type:'expense',name:r.name,amount:r.amount,cat:r.cat,nature:'fixed',date:key+'-'+d+'T12:00:00',accountId:r.accountId,recurringId:r.id})}})}
function addGoal(){const name=gName.value.trim(),target=+gTarget.value||0;if(!name||!target)return;state.goals.push({id:'goal_'+Date.now(),name,target,saved:+gSaved.value||0,monthly:+gMonthly.value||0});gName.value='';gTarget.value='';gSaved.value='';gMonthly.value='';render()}
function renderGoals(){document.getElementById('goalsList').innerHTML=state.goals.map(g=>{const p=Math.min(100,(g.saved/g.target)*100||0);return `<div class="goal"><div class="goal-head"><span><strong>${g.name}</strong><br><span class="muted">${eur(g.saved)} / ${eur(g.target)} · ${eur(g.monthly)}/mois</span></span><b>${Math.round(p)}%</b></div><div class="progress"><div style="width:${p}%"></div></div><div class="actions"><button onclick="addToGoal('${g.id}')">+ Ajouter</button><button onclick="deleteGoal('${g.id}')">Supprimer</button></div></div>`}).join('')||'<div class="muted">Aucun objectif d’épargne.</div>'}
function addToGoal(id){const g=state.goals.find(x=>x.id===id);const a=prompt('Montant ajouté à l’épargne');if(a===null)return;g.saved=Math.min(g.target,g.saved+(+a||0));render()}
function deleteGoal(id){state.goals=state.goals.filter(g=>g.id!==id);render()}
function exportCSV(){const rows=[['Compte','Type','Nom','Montant','Catégorie','Nature','Date']];state.ops.forEach(x=>{const acc=state.accounts.find(a=>a.id===x.accountId)?.name||'Compte';rows.push([acc,x.type,x.name,x.amount,x.cat||'',x.nature||'',x.date.slice(0,10)])});const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');downloadFile("\ufeff"+csv,'mon_budget_v7.csv','text/csv')}
function exportBackup(){downloadFile(JSON.stringify(state,null,2),'mon_budget_v7_sauvegarde.json','application/json')}
function importBackup(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.ops||!d.budgets)throw 0;state=d;save();render();alert('Sauvegarde importée.')}catch(e){alert('Fichier invalide.')}};r.readAsText(file)}
function downloadFile(content,name,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});
