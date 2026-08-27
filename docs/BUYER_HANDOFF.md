# KârKalkan Buyer Handoff

Bu belge ürünün bir alıcıya veya yeni işletmeciye devrinde **secret değerlerini kopyalamadan** hangi varlıkların, yetkilerin ve doğrulamaların teslim edilmesi gerektiğini tanımlar.

## 1. Kaynak ve deployment sahipliği

Devir sonrası hedef yapı buyer-owned olmalıdır:

- GitHub repository: `<buyer-account-or-org>/karkalkan`
- Default branch: `main`
- Vercel project: `karkalkan` veya buyer'ın seçtiği yeni proje adı
- Supabase project: buyer'ın kendi project ref'i
- Production web origin: buyer'ın kontrol ettiği canonical domain veya geçiş sırasında `https://karkalkan.vercel.app`

Seller'a ait kişisel GitHub/Vercel/Supabase hesapları credential olarak devredilmemelidir. Alıcı kendi organizasyonlarını kullanmalı veya platformun desteklediği resmi project/repository transfer akışı uygulanmalıdır.

### Kimlik gizliliği ve Git geçmişi

Git commit geçmişi author adı/e-posta gibi metadata taşıyabilir. Seller kimliğinin alıcı paketinde görünmemesi gerekiyorsa mevcut `.git` klasörü **buyer paketine dahil edilmemelidir**. Bunun için `scripts/build-buyer-bundle.py` ile history-free source ZIP üretilir veya buyer-owned yeni repository'ye temiz source snapshot ilk commit olarak alınır. Public repository geçmişini satıştan hemen önce force-rewrite etmek önerilmez; imzalı commitler, PR referansları ve audit provenance bozulabilir.

### Vercel preview aliasları

Vercel'in otomatik preview/deployment URL'leri mevcut takım slug'ını içerebilir. Bunlar source code değildir ve pazarlama/satış materyalinde kullanılmamalıdır. Buyer kendi Vercel takımında projeyi import/redeploy ettiğinde yeni preview aliasları buyer takımına göre oluşur. Müşteri trafiği yalnız canonical domain üzerinden gösterilmelidir.

## 2. Secret rotasyon sırası

Secret değerleri bu repository veya bu belgede tutulmaz. Devir sonrası aşağıdaki kategoriler yeni sahip tarafından yeniden oluşturulmalı/rotate edilmelidir:

1. Supabase backend secret/API keys ve DB pooler credential.
2. Marketplace credential Vault kayıtları; mümkünse mağaza sahibi tarafından yeniden yetkilendirme.
3. Amazon LWA / SP-API uygulama bilgileri.
4. Paddle vendor/API/webhook secret değerleri ve price IDs.
5. OpenAI API key ve model policy ayarları.
6. Sentry DSN / environment erişimleri.
7. Production SMTP veya e-posta sağlayıcı credential'ları.
8. Custom domain/DNS erişimleri varsa registrar ve DNS yetkileri.
9. KârKalkan developer API key ve outbound webhook signing secret'ları.

Tarayıcıda yalnız publishable/public anahtarların bulunması kabul edilebilir; service-role/secret key browser bundle'a girmemelidir.

## 3. Zorunlu devir doğrulamaları

Yeni sahibi kabul etmeden önce:

- Main branch Verify KârKalkan ve CodeQL yeşil.
- Vercel production deploy başarılı.
- `/api/health`, `/durum`, `/sss` yanıt veriyor.
- Supabase security advisor gözden geçirilmiş; browser privilege veya RLS regression yok.
- Buyer kendi Supabase/Vercel ortamında en az smoke-test seviyesinde deploy yapmış.
- En az bir test hesabında login → bağlantı → sync → maliyet → dashboard akışı yeniden yürütülmüş.
- Hesap silme akışı test hesabıyla doğrulanmış; gerçek müşteri hesabı kullanılmamış.
- Paddle canlı ödeme kullanılacaksa checkout → webhook → subscription → portal/cancel yaşam döngüsü buyer'ın kendi Paddle hesabında tekrar doğrulanmış.
- Trendyol “production validated” iddiası kullanılacaksa aynı mağazanın resmi raporuyla kapalı 7 günlük reconciliation runbook'u geçilmiş.

## 4. Veri ve gizlilik

- Kullanıcı verisi devir paketi içine export edilmez.
- Test için üretim kullanıcı kayıtları kopyalanmaz.
- Vault secret değerleri issue/PR/screenshot/chat içine alınmaz.
- `.git`, `.vercel`, gerçek `.env` ve local provider metadata history-free buyer bundle içine alınmaz.
- Yeni operatör KVKK/veri sorumlusu kimliği, iletişim kanalı, saklama ve transfer kararlarını kendi hukuki gerçekliğiyle tamamlamalıdır.
- Public legal metinler gerçek işletmeci bilgileri kesinleşmeden “tam hukuki uygunluk” kanıtı sayılmaz.

## 5. Buyer due-diligence paketi

Alıcıya şu belgeler birlikte verilmelidir:

- `README.md`
- `SECURITY.md`
- `KNOWN_LIMITATIONS.md`
- `TRANSFER.md`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/EXTERNAL_DEPENDENCIES.md`
- `docs/SALE_READINESS.md`
- `docs/SALE_TRANSFER_CHECKLIST.md`
- `docs/TRENDYOL_REAL_STORE_VALIDATION.md`
- `docs/LEGAL_GO_LIVE.md`

## 6. Kabul edilmeyecek satış iddiaları

Aşağıdaki ifadeler ancak somut doğrulama kanıtı varsa kullanılmalıdır:

- “Tam KVKK uyumlu”
- “Paddle production payment verified”
- “Trendyol real-store reconciliation passed”
- “Tüm provider ve mağaza büyüklüklerinde timeout-free sync”
- “Exact unique-order quota”
- “Direct Open Banking”
- “Gerçekleşmiş banka FX kazanç/kaybı”
- “%99.9 uptime” veya ölçülmemiş başka SLA yüzdesi

Ürünün satış değerini artırmanın yolu bu iddiaları büyütmek değil, kanıtlarını üretmektir.
