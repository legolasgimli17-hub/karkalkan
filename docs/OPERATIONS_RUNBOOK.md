# KârKalkan Production Operations Runbook

## Release

1. Main'den dar kapsamlı bir feature branch aç.
2. Veritabanı değişikliği varsa önce transaction içinde dry-run ve rollback ile doğrula.
3. PR aç; Verify KârKalkan, CodeQL ve Vercel preview yeşil olmadan merge etme.
4. Merge sonrası production deploy'u kontrol et.
5. Migration varsa merge sonrasında production'a uygula.
6. Edge Function değiştiyse main kaynağını deploy et ve `supabase/config.toml` içindeki JWT ayarıyla eşleştir.
7. Canlı smoke test yap ve Supabase security/performance advisor sonuçlarını incele.

## Rollback

- Web/UI sorunu: son bilinen iyi Vercel deployment'a dön ve kritik route'ları smoke et.
- Edge Function sorunu: son bilinen iyi repository sürümünü yeniden deploy et; auth doğrulamasını gevşeterek çözüm üretme.
- Database sorunu: destructive rollback yerine mümkünse forward-fix tercih et; veri etkisi olan değişikliklerde backup/restore kapasitesini doğrulamadan işlem yapma.

## Incident triage

1. `/durum` ve `/api/health` ile web/runtime/database seviyesini ayır.
2. Vercel production deploy durumunu kontrol et.
3. Supabase Edge Function loglarında yalnız sanitize edilmiş hata kodlarını kullan.
4. `marketplace_sync_runs` ve bağlantıların son sync durumunu incele.
5. Provider 401/403/429/5xx hatalarını KârKalkan runtime/DB hatalarından ayrı sınıflandır.

## Sync kuralları

- `*_UNAUTHORIZED` veya reauth hatası: yeniden yetkilendirme gerekir.
- `*_RATE_LIMIT`: agresif tekrar döngüsü kurma; provider pacing politikasına uy.
- `SYNC_IN_PROGRESS`: aktif lock/lease bitmeden ikinci writer başlatma.
- `SYNC_TOO_LARGE`: veri kesme veya sessiz truncation yapma; resumable/kısa pencere akışına geç.
- `PLAN_ORDER_LIMIT_REACHED`: limiti sessizce aşma; kullanıcıya açık hata döndür.
- `UNSUPPORTED_CURRENCY`: farklı para birimini TRY gibi kaydetme; FX normalize akışını kullan veya fail-closed kal.

## Billing ve auth

- Paddle webhook imza kontrolü bypass edilmez.
- Canlı ödeme config'i yoksa checkout/portal akışları fail-closed kalır.
- Browser'a service-role veya backend secret key konmaz.
- Hassas hesap işlemleri yalnız oturum sahibinden kabul edilir.

## AI kuralları

- Authoritative finans matematiğini AI hesaplamaz.
- AI readiness kapalıysa özellik deterministic fallback'e düşer.
- Gereksiz müşteri iletişim/banka/vergi alanları modele gönderilmez.
- Model hatasında finans kaydı veya rakam uydurulmaz.

## Haftalık bakım

- Main CI ve CodeQL sonuçları.
- Supabase security/performance advisor.
- Sync failure oranları ve safe error code dağılımı.
- Sentry sanitize edilmiş hata trendleri.
- Public `/durum` kontrolü.
- `KNOWN_LIMITATIONS.md` ile ürün copy'sinin tutarlı olup olmadığı.

## Aylık bakım

- Marketplace API deprecation/changelog kontrolü.
- Supabase/Vercel breaking change kontrolü.
- Secret rotasyon ihtiyacı.
- Legal/operator bilgilerinin güncelliği.
- Gerçek trafik oluşmadan yalnız `unused_index` lint'ine bakarak index silme.
