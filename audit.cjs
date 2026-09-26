// Run: npm install --no-save jsdom && node tests/audit.cjs
const {JSDOM,VirtualConsole}=require(process.env.JSDOM_PATH||'jsdom');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
process.env.TZ='Europe/Brussels';
const root=path.resolve(__dirname,'..');
const vc=new VirtualConsole(),errors=[];vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window;const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-09-27T00:30:00+02:00']))}static now(){return new NativeDate('2026-09-27T00:30:00+02:00').getTime()}};
w.confirm=()=>true;w.alert=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});w.matchMedia=()=>({matches:false,addEventListener(){}});
w.eval(fs.readFileSync(process.env.APP_SOURCE||path.join(root,'app.js'),'utf8')+'\nwindow.__qa={get:()=>state,set:x=>{state=normalizeState(x)},view:d=>{view=new Date(d)},manual:()=>{quickExpenseManualCategory=true}}');
const q=w.__qa;let pass=0,fail=0;const results=[];
function test(name,fn){try{reset();fn();pass++;results.push({name,pass:true});console.log('PASS',name)}catch(e){fail++;results.push({name,pass:false,error:e.message});console.log('FAIL',name,e.message)}}
function reset(){q.set(w.blankState());q.view('2026-09-01T12:00:00');w.render();w.prompt=()=>null;w.openQuickExpense();w.closeQuickExpense();}
function op(type,amount,extra={}){return {id:'test_'+Math.random(),type,amount,name:'Test',date:'2026-09-20T12:00:00',accountId:'main',cat:'Courses',...extra}}
function prompts(...a){w.prompt=()=>a.shift()??null}
function val(id,v){w.document.getElementById(id).value=v}
const eq=assert.equal;
test('Démarrage et rendu sans erreur DOM',()=>eq(errors.length,0));
test('Date locale après minuit',()=>eq(w.entryDateForView(),'2026-09-27'));
test('Date locale au changement de mois',()=>eq(w.localDateKey(new NativeDate('2026-10-01T00:30:00+02:00')),'2026-10-01'));
test('Plan explicite avec épargne zéro',()=>{q.get().goals.push({id:'g',target:1000,saved:0,monthly:100});q.get().monthlyPlans['2026-09']={income:1000,fixed:0,savings:0};eq(w.financialSnapshot().plannedSaved,0);eq(w.financialSnapshot().safeAvailable,1000)});
test('Objectif utilisé en absence de plan',()=>{q.get().goals.push({id:'g',target:1000,saved:0,monthly:100});eq(w.monthlyPlannedSavings(),100)});
test('Charges et épargne réservées une seule fois',()=>{q.get().ops=[op('income',2000),op('expense',500,{nature:'fixed'})];q.get().monthlyPlans['2026-09']={income:2000,fixed:700,savings:300};q.get().recurring=[{id:'r',accountId:'main',amount:200,day:30}];q.get().savingsEntries=[{amount:100,date:'2026-09-20',accountId:'main',budgetImpact:true}];eq(w.financialSnapshot().safeAvailable,1000)});
test('Épargne existante exclue du budget mensuel',()=>{q.get().ops=[op('income',2000)];q.get().savingsEntries=[{amount:19000,date:'2026-09-20',accountId:'main',budgetImpact:false}];eq(w.financialSnapshot().safeAvailable,2000)});
test('Catégorie express manuelle prioritaire sur règle',()=>{q.get().rules=[{keyword:'Lidl',cat:'Courses'}];w.openQuickExpense();val('qeAmount','20');val('qeName','Lidl');val('qeCat','Loisirs');q.manual();w.saveQuickExpense();eq(q.get().ops.at(-1).cat,'Loisirs')});
test('Ajout express puis persistance locale',()=>{w.openQuickExpense();val('qeAmount','12.35');val('qeName','Courses');w.saveQuickExpense();eq(JSON.parse(w.localStorage.getItem('monBudgetV24_1')).ops.at(-1).amount,12.35)});
test('Montant express négatif refusé',()=>{val('qeAmount','-10');w.saveQuickExpense();eq(q.get().ops.length,0)});
test('Épargne négative refusée',()=>{val('savingAmount','-10');w.addSavingEntry();eq(q.get().savingsEntries.length,0)});
test('Objectif dépassé puis annulation réversible',()=>{q.get().goals=[{id:'g',name:'Vacances',target:100,saved:90,monthly:0}];prompts('20');w.addGoalMoney('g');eq(q.get().goals[0].saved,110);w.deleteSavingEntry(q.get().savingsEntries[0].id);eq(q.get().goals[0].saved,90)});
test('Objectif dépassé préservé au rechargement',()=>{const s=w.blankState();s.goals=[{id:'g',target:100,saved:110,monthly:0}];q.set(s);eq(q.get().goals[0].saved,110)});
test('Virgule décimale dans ajout à objectif',()=>{q.get().goals=[{id:'g',name:'But',target:100,saved:0}];prompts('12,50');w.addGoalMoney('g');eq(q.get().goals[0].saved,12.5)});
function envelope(){q.get().savingsEnvelopes=[{id:'env',name:'Vacances',accountId:'main'}];q.get().savingsEntries=[{id:'deposit',amount:100,envelopeId:'env',date:'2026-09-20',accountId:'main',budgetImpact:false},{id:'withdraw',amount:-80,envelopeId:'env',date:'2026-09-21',accountId:'main',budgetImpact:false}]}
test('Suppression de dépôt déjà retiré bloquée',()=>{envelope();w.deleteSavingEntry('deposit');eq(w.envelopeSavedTotal('env'),20);eq(q.get().savingsEntries.length,2)});
test('Réduction de dépôt déjà retiré bloquée',()=>{envelope();prompts('10','');w.editSavingEntry('deposit');eq(w.envelopeSavedTotal('env'),20)});
test('Suppression dépôt libre déjà retiré bloquée',()=>{q.get().freeSavingsBalances.main=20;q.get().savingsEntries=[{id:'s',amount:100,freeBalanceTracked:true,accountId:'main',date:'2026-09-20'}];w.deleteSavingEntry('s');eq(q.get().savingsEntries.length,1);eq(w.freeSavingsBalanceValue(),20)});
test('Suppression épargne disponible réversible',()=>{q.get().freeSavingsBalances.main=100;q.get().savingsEntries=[{id:'s',amount:100,freeBalanceTracked:true,accountId:'main',date:'2026-09-20'}];w.deleteSavingEntry('s');eq(q.get().savingsEntries.length,0);eq(w.freeSavingsBalanceValue(),0)});
test('Dates impossibles refusées à l’import',()=>{eq(w.smartImportDate('31/02/2026'),'');eq(w.smartImportDate('2026-13-01'),'');eq(w.smartImportDate('29/02/2025'),'')});
test('Date bissextile et format Excel acceptés',()=>{eq(w.smartImportDate('29/02/2024'),'2024-02-29');eq(w.smartImportDate(45292),'2024-01-01')});
function importJSON(value){w.FileReader=class{readAsText(){this.result=JSON.stringify(value);this.onload()}};w.importBackup({})}
test('JSON sans budget refusé avant remplacement',()=>{q.get().ops=[op('income',1234)];importJSON({hello:'world'});eq(q.get().ops.length,1);eq(q.get().ops[0].amount,1234)});
test('Sauvegarde valide reconnue',()=>{const data=w.blankState();data.ops=[op('income',789)];importJSON(data);eq(q.get().ops[0].amount,789)});
test('Navigation passé/futur sans opérations automatiques',()=>{q.get().recurring=[{id:'r',name:'Loyer',amount:500,day:1,accountId:'main'}];q.view('2026-08-01T12:00:00');w.render();q.view('2026-10-01T12:00:00');w.render();eq(q.get().ops.length,0)});
test('Récurrent créé une fois puis suppression définitive du mois',()=>{q.get().recurring=[{id:'r',name:'Loyer',amount:500,day:1,accountId:'main'}];w.render();w.render();eq(q.get().ops.length,1);w.deleteOp(q.get().ops[0].id);w.render();eq(q.get().ops.length,0)});
test('Transfert modifié puis supprimé des deux comptes',()=>{q.get().accounts.push({id:'other',name:'Autre'});q.get().ops=[op('transfer_out',20,{id:'a',transferGroup:'tr'}),op('transfer_in',20,{id:'b',transferGroup:'tr',accountId:'other'})];prompts('Test','30');w.editOp('a');eq(q.get().ops[1].amount,30);w.deleteOp('b');eq(q.get().ops.length,0)});
test('Libellés HTML affichés comme texte',()=>{q.get().recurring=[{id:'r',name:'<img id="injected" src="x">',cat:'Courses',amount:10,day:30,accountId:'main'}];w.renderRecurring();eq(w.document.getElementById('injected'),null)});
test('Navigation de toutes les sections',()=>{for(const b of w.document.querySelectorAll('.bottomnav button')){const m=b.getAttribute('onclick').match(/nav\('([^']+)'/);if(m){w.nav(m[1],b);assert(w.document.getElementById(m[1]).classList.contains('active'))}}});
test('Échec sauvegarde signalé et avertissement retiré après succès',()=>{
 const original=w.Storage.prototype.setItem;
 try{q.get().ops=[op('income',99)];w.Storage.prototype.setItem=()=>{throw new Error('quota')};w.save();assert(w.document.getElementById('localSaveFailure'))}finally{w.Storage.prototype.setItem=original}
 w.save();eq(w.document.getElementById('localSaveFailure'),null);
});
console.log(JSON.stringify({pass,fail,domErrors:errors}));if(process.env.RESULTS)fs.writeFileSync(process.env.RESULTS,JSON.stringify({pass,fail,results,domErrors:errors},null,2));w.close();process.exitCode=fail?1:0;
