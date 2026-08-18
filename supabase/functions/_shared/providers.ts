export type MarketplaceKey='trendyol'|'hepsiburada'|'n11'|'amazon'|'flo'

export const PROVIDERS:Record<MarketplaceKey,{
  label:string
  mode:'api'|'oauth'|'file'
  tier:'live'|'beta'|'gated'|'import'
  sellerIdLabel:string
  sellerIdRequired:boolean
  credentialFields:Array<{key:string;label:string;max:number;vaultKey?:string}>
  capabilities:string[]
  note:string
}>={
  trendyol:{label:'Trendyol',mode:'api',tier:'live',sellerIdLabel:'Satıcı numarası',sellerIdRequired:true,credentialFields:[{key:'api_key',label:'API Key',max:220,vaultKey:'key'},{key:'api_secret',label:'API Secret',max:320,vaultKey:'secret'}],capabilities:['Sipariş V2','Finans hareketleri','Kargo','Canlı sipariş'],note:'Canlı finans senkronu hazır.'},
  hepsiburada:{label:'Hepsiburada',mode:'api',tier:'beta',sellerIdLabel:'Merchant ID (UUID)',sellerIdRequired:true,credentialFields:[{key:'username',label:'Entegrasyon kullanıcı adı',max:220},{key:'password',label:'Servis anahtarı',max:320}],capabilities:['Finans hareketleri','Ürün kârlılığı','Komisyon ve kesintiler','CSV yedeği'],note:'Resmî Hepsiburada muhasebe ve performans API senkronu hazır; ilk yetkili mağazada canlı veri doğrulaması bekliyor.'},
  n11:{label:'n11',mode:'api',tier:'beta',sellerIdLabel:'Mağaza kodu',sellerIdRequired:false,credentialFields:[{key:'app_key',label:'App Key',max:220},{key:'app_secret',label:'App Secret',max:320}],capabilities:['Sipariş bağlantısı','Komisyon alanları','CSV içe aktarma'],note:'Resmî OrderService kimlik bilgileri gerekir.'},
  amazon:{label:'Amazon',mode:'oauth',tier:'gated',sellerIdLabel:'Seller ID',sellerIdRequired:false,credentialFields:[],capabilities:['SP-API','Finances API','OAuth'],note:'Amazon uygulama kaydı, rol onayı ve satıcı OAuth izni gerekir.'},
  flo:{label:'FLO',mode:'file',tier:'import',sellerIdLabel:'Mağaza / iş ortağı kodu',sellerIdRequired:false,credentialFields:[],capabilities:['Rapor içe aktarma','Partner API geçişi'],note:'Herkese açık geliştirici API’si yok; partner erişimi veya CSV ile çalışır.'}
}

export function isMarketplace(value:string):value is MarketplaceKey{return Object.hasOwn(PROVIDERS,value)}

export function publicProviderCatalog(){return Object.entries(PROVIDERS).map(([key,value])=>({
  key,label:value.label,mode:value.mode,tier:value.tier,sellerIdLabel:value.sellerIdLabel,
  sellerIdRequired:value.sellerIdRequired,capabilities:value.capabilities,note:value.note,
  credentialFields:value.credentialFields.map(({key:fieldKey,label})=>({key:fieldKey,label}))
}))}
