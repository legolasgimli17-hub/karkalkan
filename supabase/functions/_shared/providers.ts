export type MarketplaceKey='trendyol'|'hepsiburada'|'n11'|'amazon'|'flo'

export const PROVIDERS:Record<MarketplaceKey,{
  label:string
  mode:'api'|'oauth'|'file'
  tier:'verified'|'ready'|'beta'|'gated'|'import'
  sellerIdLabel:string
  sellerIdRequired:boolean
  credentialFields:Array<{key:string;label:string;max:number;vaultKey?:string}>
  capabilities:string[]
  note:string
}>={
  trendyol:{label:'Trendyol',mode:'api',tier:'ready',sellerIdLabel:'Satıcı numarası',sellerIdRequired:true,credentialFields:[{key:'api_key',label:'API Key',max:220,vaultKey:'key'},{key:'api_secret',label:'API Secret',max:320,vaultKey:'secret'}],capabilities:['Sipariş V2','Finans hareketleri','Kargo','Otomatik eşitleme'],note:'Entegrasyon hazır; ilk yetkili mağazada gerçek veri doğrulaması bekliyor.'},
  hepsiburada:{label:'Hepsiburada',mode:'api',tier:'ready',sellerIdLabel:'Merchant ID (UUID)',sellerIdRequired:true,credentialFields:[{key:'username',label:'Entegrasyon kullanıcı adı',max:220},{key:'password',label:'Servis anahtarı',max:320}],capabilities:['Finans hareketleri','Ürün kârlılığı','Komisyon ve kesintiler','Otomatik eşitleme'],note:'Entegrasyon hazır; ilk yetkili mağazada gerçek veri doğrulaması bekliyor.'},
  n11:{label:'n11',mode:'api',tier:'ready',sellerIdLabel:'Satıcı ID',sellerIdRequired:false,credentialFields:[{key:'app_key',label:'API anahtarı',max:220},{key:'app_secret',label:'API şifresi',max:320}],capabilities:['Siparişler','Onaylı iadeler','Komisyon ve hizmet oranları','Otomatik eşitleme'],note:'Entegrasyon hazır; kargo ve son ekstre kesintileri n11 ödeme detay raporuyla tamamlanır, ilk yetkili mağaza doğrulaması bekliyor.'},
  amazon:{label:'Amazon',mode:'oauth',tier:'gated',sellerIdLabel:'Seller ID',sellerIdRequired:false,credentialFields:[],capabilities:['Güvenli OAuth','Finances API 2024','Ürün kârlılığı','Otomatik eşitleme'],note:'OAuth ve finans senkron altyapısı hazır. Canlı bağlantı için Amazon uygulama kaydı, Finance and Accounting rolü ve satıcı izni gerekir.'},
  flo:{label:'FLO',mode:'file',tier:'import',sellerIdLabel:'Mağaza / iş ortağı kodu',sellerIdRequired:false,credentialFields:[],capabilities:['Rapor içe aktarma','Partner API geçişi'],note:'Herkese açık geliştirici API’si yok; partner erişimi veya CSV ile çalışır.'}
}

export function isMarketplace(value:string):value is MarketplaceKey{return Object.hasOwn(PROVIDERS,value)}

export function publicProviderCatalog(){return Object.entries(PROVIDERS).map(([key,value])=>({
  key,label:value.label,mode:value.mode,tier:value.tier,sellerIdLabel:value.sellerIdLabel,
  sellerIdRequired:value.sellerIdRequired,capabilities:value.capabilities,note:value.note,
  credentialFields:value.credentialFields.map(({key:fieldKey,label})=>({key:fieldKey,label}))
}))}
