
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function snapshot({income,expenses,actualSaved,plannedSaved,pendingRecurring}){
  const missing=Math.max(0,plannedSaved-actualSaved);
  return income-expenses-actualSaved-missing-pendingRecurring;
}
const tests=[
  ['existing savings ignored', snapshot({income:2000,expenses:500,actualSaved:0,plannedSaved:0,pendingRecurring:0}),1500],
  ['planned savings reserved', snapshot({income:2000,expenses:500,actualSaved:100,plannedSaved:300,pendingRecurring:0}),1200],
  ['extra savings counted once', snapshot({income:2000,expenses:500,actualSaved:400,plannedSaved:300,pendingRecurring:0}),1100],
  ['pending recurring counted once', snapshot({income:2000,expenses:500,actualSaved:300,plannedSaved:300,pendingRecurring:200}),1000]
];
let fail=0;
for(const [name,got,want] of tests){
  if(got!==want){console.error(name,got,want);fail++}
  else console.log('OK',name,got)
}
process.exitCode=fail?1:0;
