# KârKalkan External Dependencies

Bu belge dış servisleri **kod hazır / gerçek hesap doğrulandı / dış aksiyon gerekiyor** olarak ayırır. Secret değerleri içermez.

| Bağımlılık | Kullanım | Kod durumu | Üretim doğrulaması / dış aksiyon |
| --- | --- | --- | --- |
| Vercel | Web deployment, analytics | Aktif | Production deploy ve route smoke ile doğrulanıyor |
| Supabase | Auth, Postgres, Vault, Edge Functions | Aktif | Production proje aktif; migration/function deploy'ları ayrıca doğrulanmalı |
| Trendyol | Sipariş/settlement/other financials/kargo | Pipeline hazır | Gerçek satıcı kapalı 7 günlük resmi rapor reconciliation henüz şart |
| Hepsiburada | Finance API | Entegrasyon mevcut | Gerçek merchant verisiyle geniş ölçek doğrulaması gerekli |
| n11 | Sipariş/iade finance | Entegrasyon mevcut | Gerçek merchant verisiyle geniş ölçek doğrulaması gerekli |
| Amazon Türkiye SP-API | OAuth + Finances | Kod mevcut | Yetkili app/LWA hesabı ve gerçek seller lifecycle doğrulaması gerekli |
| FLO | Normalize report flow | Dosya/Vault tabanlı | Sağlayıcı formatı gerçek raporla tekrar doğrulanmalı |
| Paddle | Subscription billing | Fail-closed kod mevcut | Canlı checkout → webhook → subscription → portal/cancel lifecycle doğrulanmadan production-ready denmez |
| OpenAI | Finance explanation / schema mapping | Opsiyonel ve readiness-gated | API key/model policy gerekir; finans matematiğinin otoritesi değildir |
| ECB Data API | FX reference normalization | Aktif entegrasyon | Referans oran; gerçekleşmiş banka kuru değildir |
| Sentry | Sanitized error monitoring | Kod mevcut | DSN/environment yeni operatörce sahiplenilmeli/rotate edilmeli |
| Have I Been Pwned | Password risk check | Browser security akışında kullanılıyor | Supabase Auth leaked-password protection ayrıca platform ayarıdır |
| SMTP / transactional email | Auth mail delivery | Uygulama bağımlılığı | Production teslimatı gerçek sağlayıcıyla ayrıca doğrulanmalı |
| Custom domain / DNS | Marka ve CORS | Opsiyonel | Domain edinilince Vercel + CORS allowlist güncellenmeli |

## Fail-closed kuralı

Dış servis hesabı veya secret'ı eksikse KârKalkan mümkün olduğunca açık `NOT_CONFIGURED`/reauth benzeri hata üretmeli; sahte başarı, test URL'sini production gibi sunma veya finans sonucunu tahmin etme kabul edilmez.
