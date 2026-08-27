# KârKalkan Sale Readiness Truth Matrix

Bu belge alıcı sunumu veya satış görüşmesinde hangi iddiaların bugün kanıtla desteklenebildiğini ayırır.

## Kanıtlanmış / repository ve production kontrolleriyle desteklenen

- Vercel üzerinde çalışan canonical production web uygulaması.
- Supabase Auth/Postgres/Edge Functions tabanlı backend.
- RLS ve browser privilege hardening yaklaşımı; server-only tablolarda anon/authenticated grant'lerinin kaldırılması.
- Trendyol iki aşamalı finans pipeline'ı: core finance + Other Financials/kargo enrichment.
- Trendyol için persisted, bounded-chunk resumable sync mimarisi.
- Hepsiburada, n11 ve Amazon Türkiye finance entegrasyon kodları.
- Güvenli hesap/veri silme endpoint'i ve hesap yönetim ekranı.
- Plan bazlı mağaza ve aylık order-equivalent quota enforcement.
- Banka ekstresi CSV mutabakat akışı; direct Open Banking değildir.
- Smart CSV mapper: ham satırları modele göndermeden kolon adı/tip profiliyle öneri ve kullanıcı onayı.
- ECB referans oranlı çoklu-para CSV normalizasyonu; orijinal tutar audit kanıtı korunur.
- Deterministic haftalık 7 günlük finans özeti.
- Evidence-bound finance AI mimarisi; model finans hesaplama otoritesi değildir.
- Scoped, revocable developer API keys, read-only Public API v1 ve HMAC imzalı outbound webhook altyapısı.
- Public anlık web/runtime/database health kontrolü.
- CI: Verify KârKalkan + CodeQL + Vercel preview kapıları.
- Seller-account bağımlılıklarını azaltan buyer-owned setup/transfer belgeleri ve history-free source bundle üretim aracı.

## Kod/mimari hazır, gerçek dış hesap veya yüksek-hacim kanıtı gerekiyor

- Trendyol resumable sync mimarisi uygulanmış olsa da gerçek yüksek hacimli mağazada load/soak ve uzun dönem production kanıtı yok.
- Trendyol gerçek seller resmi raporuyla kapalı 7 günlük reconciliation.
- Hepsiburada ve n11 gerçek merchant statement reconciliation.
- Amazon yetkili SP-API/LWA seller lifecycle.
- Paddle canlı ödeme lifecycle.
- Production SMTP teslimatı.
- Developer API/webhook için buyer-owned dış istemci ve gerçek receiver doğrulaması.

## Satış kimliği / transfer gizliliği durumu

- Aktif source tree seller-specific CODEOWNERS, kişisel Vercel team hostname'i ve buyer belgesindeki seller repo/project ref bağımlılıklarından temizlenmiştir.
- **Mevcut public Git geçmişi seller author metadata'sı taşıyabilir.** Source tree temizliği geçmiş commit metadata'sını değiştirmez.
- Seller kimliğinin alıcıya verilen kaynak paketinde görünmemesi gerekiyorsa `scripts/build-buyer-bundle.py` ile `.git` içermeyen history-free ZIP kullanılmalı veya buyer-owned yeni repository'ye temiz snapshot ilk commit olarak alınmalıdır.
- Vercel'in mevcut hesapta ürettiği preview/deployment aliasları seller team slug'ını gösterebilir. Bunlar source code değildir; satış materyalinde yalnız canonical domain kullanılmalı ve buyer kendi Vercel takımında redeploy etmelidir.

## Bilerek iddia edilmeyen

- Tam KVKK/hukuki uygunluk.
- Direct Open Banking.
- Exact universal unique-order ledger/quota.
- Gerçekleşmiş banka FX kuru veya hedge sonucu.
- Ölçülmemiş uptime/SLA yüzdesi.
- AI tarafından hesaplanan authoritative finans rakamları.
- Her provider ve her mağaza büyüklüğünde timeout-free sync.
- Gerçek müşteri/gelir/retention traction'ı.

## Buyer açısından en değerli kalan kanıtlar

1. Gerçek Trendyol mağazası + resmi rapor reconciliation kaydı.
2. Resumable büyük mağaza sync için gerçek yüksek hacim load/soak doğrulaması.
3. Canlı Paddle ödeme lifecycle kaydı (ürün abonelikle işletilecekse).
4. Gerçek operator/legal bilgileriyle legal go-live tamamlanması.
5. Buyer-owned custom domain, gerçek destek kanalı ve production transactional email.
6. Buyer-owned Public API client + webhook receiver acceptance testi.

Bu maddeler tamamlanmadan ürün yine satılabilir bir yazılım varlığıdır; fakat doğrulanmamış alanlar değerlemede ve due diligence sırasında açık dependency olarak sunulmalıdır.
