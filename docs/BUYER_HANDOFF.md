# KârKalkan Buyer Handoff

Bu belge ürünün bir alıcıya veya yeni işletmeciye devrinde **secret değerlerini kopyalamadan** hangi varlıkların, yetkilerin ve doğrulamaların teslim edilmesi gerektiğini tanımlar.

## 1. Kaynak ve deployment sahipliği

- GitHub repository: `legolasgimli17-hub/karkalkan`
- Default branch: `main`
- Vercel project: `karkalkan`
- Supabase project ref: `ilybqwjhkxfzociyvpeg`
- Production web origin: `https://karkalkan.vercel.app`

Devir sırasında yeni alıcının kendi organizasyonlarına repository/project ownership aktarılmalı veya açık bir transfer planı uygulanmalıdır. Transfer tamamlanmadan eski operatör erişimleri kaldırılmamalı; transfer doğrulandıktan sonra eski kişisel erişimler kapatılmalıdır.

## 2. Secret rotasyon sırası

Secret değerleri bu repository veya bu belgede tutulmaz. Devir sonrası aşağıdaki kategoriler yeni sahip tarafından yeniden oluşturulmalı/rotate edilmelidir:

1. Supabase backend secret/API keys ve DB pooler credential.
2. Marketplace credential vault kayıtları; mümkünse satıcı tarafından yeniden yetkilendirme.
3. Amazon LWA / SP-API uygulama bilgileri.
4. Paddle vendor/API/webhook secret değerleri ve price IDs.
5. OpenAI API key ve model policy ayarları.
6. Sentry DSN / environment erişimleri.
7. Production SMTP veya e-posta sağlayıcı credential’ları.
8. Custom domain/DNS erişimleri varsa registrar ve DNS yetkileri.

Tarayıcıda yalnız publishable/public anahtarların bulunması kabul edilebilir; service-role/secret key browser bundle’a girmemelidir.

## 3. Zorunlu devir doğrulamaları

Yeni sahibi kabul etmeden önce:

- Main branch Verify KârKalkan ve CodeQL yeşil.
- Vercel production deploy başarılı.
- `/api/health`, `/durum`, `/sss` yanıt veriyor.
- Supabase security advisor gözden geçirilmiş; RLS/privilege regressions yok.
- En az bir test mağazasında login → bağlantı → sync → maliyet → dashboard akışı yeniden yürütülmüş.
- Hesap silme akışı test hesabıyla doğrulanmış; gerçek müşteri hesabı kullanılmamış.
- Paddle canlı ödeme kullanılacaksa checkout → webhook → subscription → portal/cancel yaşam döngüsü yeni Paddle hesabında tekrar doğrulanmış.
- Trendyol “production validated” iddiası kullanılacaksa aynı mağazanın resmi raporuyla kapalı 7 günlük reconciliation runbook’u geçilmiş.

## 4. Veri ve gizlilik

- Kullanıcı verisi devir paketi içine export edilmez.
- Test için üretim kullanıcı kayıtları kopyalanmaz.
- Vault secret değerleri issue/PR/screenshot/chat içine alınmaz.
- Yeni operatör KVKK/veri sorumlusu kimliği, iletişim kanalı, saklama ve transfer kararlarını kendi hukuki gerçekliğiyle tamamlamalıdır.
- Public legal metinler gerçek işletmeci bilgileri kesinleşmeden “tam hukuki uygunluk” kanıtı sayılmaz.

## 5. Buyer due-diligence klasörü

Alıcıya şu belgeler birlikte verilmelidir:

- `README.md`
- `SECURITY.md` / threat-model belgeleri varsa
- `KNOWN_LIMITATIONS.md`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/EXTERNAL_DEPENDENCIES.md`
- `docs/SALE_READINESS.md`
- `docs/TRENDYOL_REAL_STORE_VALIDATION.md`
- `docs/LEGAL_GO_LIVE.md`

## 6. Kabul edilmeyecek satış iddiaları

Aşağıdaki ifadeler ancak somut doğrulama kanıtı varsa kullanılmalıdır:

- “Tam KVKK uyumlu”
- “Paddle production payment verified”
- “Trendyol real-store reconciliation passed”
- “Tüm mağaza büyüklüklerinde timeout-free sync”
- “Exact unique-order quota”
- “Direct Open Banking”
- “Gerçekleşmiş banka FX kazanç/kaybı”
- “%99.9 uptime” veya ölçülmemiş başka SLA yüzdesi

Ürünün satış değerini artırmanın yolu bu iddiaları büyütmek değil, kanıtlarını üretmektir.
