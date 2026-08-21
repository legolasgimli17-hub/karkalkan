# KârKalkan Sale Readiness Truth Matrix

Bu belge alıcı sunumu veya satış görüşmesinde hangi iddiaların bugün kanıtla desteklenebildiğini ayırır.

## Kanıtlanmış / repository ve production kontrolleriyle desteklenen

- Vercel üzerinde çalışan production web uygulaması.
- Supabase Auth/Postgres/Edge Functions tabanlı backend.
- RLS ve browser privilege hardening yaklaşımı; server-only tablolarda anon/authenticated grant'lerinin kaldırılması.
- Trendyol iki aşamalı sync pipeline kodu: core finance + Other Financials/kargo enrichment.
- Hepsiburada, n11 ve Amazon Türkiye finance entegrasyon kodları.
- Güvenli hesap/veri silme endpoint'i ve hesap yönetim ekranı.
- Plan bazlı mağaza ve aylık order-equivalent quota enforcement.
- Banka ekstresi CSV mutabakat akışı; direct Open Banking değildir.
- Smart CSV mapper: ham satırları modele göndermeden kolon adı/tip profiliyle öneri ve kullanıcı onayı.
- ECB referans oranlı çoklu-para CSV normalizasyonu; orijinal tutar audit kanıtı korunur.
- Deterministic haftalık 7 günlük finans özeti.
- Public anlık web/runtime/database health kontrolü.
- CI: Verify KârKalkan + CodeQL + Vercel preview kapıları.

## Kod hazır, gerçek dış hesap/veri doğrulaması gerekiyor

- Trendyol gerçek seller resmi raporuyla kapalı 7 günlük reconciliation.
- Amazon yetkili SP-API/LWA seller lifecycle.
- Paddle canlı ödeme lifecycle.
- Production SMTP teslimatı.
- Büyük mağaza uzun dönem sync'in resumable worker mimarisi ve gerçek yüksek hacim testi.

## Bilerek iddia edilmeyen

- Tam KVKK/hukuki uygunluk.
- Direct Open Banking.
- Exact universal unique-order ledger/quota.
- Gerçekleşmiş banka FX kuru veya hedge sonucu.
- Ölçülmemiş uptime/SLA yüzdesi.
- AI tarafından hesaplanan authoritative finans rakamları.
- Her provider ve her mağaza büyüklüğünde timeout-free sync.

## Buyer açısından en değerli kalan kanıtlar

1. Gerçek Trendyol mağazası + resmi rapor reconciliation kaydı.
2. Resumable büyük mağaza sync ve yüksek hacim load/soak doğrulaması.
3. Canlı Paddle ödeme lifecycle kaydı (ürün abonelikle satılacaksa).
4. Gerçek operator/legal bilgileriyle legal go-live tamamlanması.
5. Custom domain, gerçek destek kanalı ve production transactional email.

Bu maddeler tamamlanmadan ürün satılabilir bir yazılım varlığı olabilir; fakat yukarıdaki doğrulanmamış alanlar satış değerlemesinde açık dependency olarak sunulmalıdır.
