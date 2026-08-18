import { cashSnapshotFromRow } from './finance.js';

const WINDOW_DAYS=[7,14,15,30];
const DAY_MS=86_400_000;

function cleanText(value,max){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max)}
function money(value){const number=Number(value);return Number.isFinite(number)?Math.round(number*100)/100:NaN}
function dateShift(value,days){return new Date(Date.parse(`${value}T00:00:00Z`)+days*DAY_MS).toISOString().slice(0,10)}

export function maskBankDescription(value){
  let text=cleanText(value,1000);
  text=text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[e-posta]')
    .replace(/\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi,'[IBAN]')
    .replace(/(?:\+?90|0)?[\s().-]*5\d{2}(?:[\s().-]*\d){7}\b/g,'[telefon]')
    .replace(/\b\d{6,}\b/g,match=>`••••${match.slice(-4)}`);
  return cleanText(text,240);
}

export function detectMarketplaceHint(value){
  const normalized=String(value??'').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g,' ');
  if(/\b(trendyol|dsm grup)\b/.test(normalized))return'trendyol';
  if(/\b(hepsiburada|hepsi burada|d market)\b/.test(normalized))return'hepsiburada';
  if(/\bn11\b/.test(normalized))return'n11';
  if(/\bamazon\b/.test(normalized))return'amazon';
  if(/\bflo\b/.test(normalized))return'flo';
  return null;
}

export function minimizeBankDescription(value){
  const masked=maskBankDescription(value),providerHint=detectMarketplaceHint(masked);
  const labels={trendyol:'Trendyol',hepsiburada:'Hepsiburada',n11:'n11',amazon:'Amazon',flo:'FLO'};
  return{
    providerHint,
    descriptionMasked:providerHint?`${labels[providerHint]} işareti · banka açıklaması gizlendi.`:'Banka açıklaması gizlendi.'
  };
}

export function buildPayoutCandidates(transaction,connections,financialRows){
  const bankAmount=money(transaction?.amount);
  if(!(bankAmount>0))return[];
  const matches=[];
  for(const connection of connections||[]){
    const providerMatched=transaction.provider_hint===connection.marketplace;
    if(transaction.provider_hint&&!providerMatched)continue;
    const rows=(financialRows||[]).filter(row=>row.connection_id===connection.id&&row.currency===transaction.currency);
    for(const length of WINDOW_DAYS){
      for(let lag=0;lag<=7;lag++){
        const rangeEnd=dateShift(transaction.transaction_date,-lag),rangeStart=dateShift(rangeEnd,-length+1);
        const selected=rows.filter(row=>row.day>=rangeStart&&row.day<=rangeEnd);
        if(!selected.length)continue;
        const expectedAmount=money(selected.reduce((sum,row)=>sum+Number(cashSnapshotFromRow(row).knownCashAfterFeesAndStoppage||0),0));
        if(!(expectedAmount>0))continue;
        const differenceAmount=money(bankAmount-expectedAmount),absolute=Math.abs(differenceAmount),relative=absolute/Math.max(bankAmount,expectedAmount);
        if(absolute>Math.max(10,bankAmount*.02))continue;
        let confidence='weak';
        if(relative<=.001&&(providerMatched||absolute<=.5))confidence='strong';
        else if((providerMatched&&relative<=.005)||(!transaction.provider_hint&&relative<=.002))confidence='medium';
        matches.push({connectionId:connection.id,marketplace:connection.marketplace,displayName:connection.display_name,rangeStart,rangeEnd,expectedAmount,bankAmount,differenceAmount,confidence,providerMatched,evidenceBasis:'known_cash_window_v1'});
      }
    }
  }
  const rank={strong:3,medium:2,weak:1};
  const span=item=>(Date.parse(`${item.rangeEnd}T00:00:00Z`)-Date.parse(`${item.rangeStart}T00:00:00Z`))/DAY_MS;
  matches.sort((a,b)=>rank[b.confidence]-rank[a.confidence]||Number(b.providerMatched)-Number(a.providerMatched)||Math.abs(a.differenceAmount)-Math.abs(b.differenceAmount)||span(a)-span(b)||b.rangeEnd.localeCompare(a.rangeEnd));
  const unique=new Map();
  for(const item of matches){const key=`${item.connectionId}:${item.rangeStart}:${item.rangeEnd}`;if(!unique.has(key))unique.set(key,item);if(unique.size===3)break;}
  return[...unique.values()];
}
