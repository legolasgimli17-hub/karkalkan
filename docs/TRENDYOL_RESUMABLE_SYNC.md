# Trendyol Resumable Sync

## Amaç

30 günlük Trendyol finans senkronunu tek uzun isteğe bağlamak yerine en fazla 3 günlük bounded parçalara ayırmak ve ilerlemeyi sunucu tarafında saklamak.

## Güvenlik ve doğruluk sözleşmesi

- Kullanıcı Edge Function JWT doğrulaması gevşetilmez.
- Marketplace API anahtarları tarayıcıya veya job tablolarına yazılmaz.
- Job/chunk tabloları browser rollerine kapalıdır; yalnız aggregate ilerleme ve güvenli hata kodları tutulur.
- Her chunk önce `trendyol-sync`, sonra `trendyol-otherfinancials-sync` çalıştırır.
- `cargoOk=true` ve `orderMapOk=true` olmadan chunk başarı sayılmaz.
- Core ve auxiliary provider fonksiyonları eski `days: 7|30` sözleşmesini korur; yalnız orchestrator için `start_day/end_day` explicit aralığı eklenmiştir.
- Explicit aralık en fazla 3 takvim günüdür ve geleceğe gidemez.
- Aynı bağlantı için tek aktif resumable job vardır.
- Job lease ve chunk retry durumu DB'de saklanır. Sekme kapanırsa kullanıcı sonraki senkron çağrısında aynı job'a devam eder.
- Dört denemeden sonra aynı chunk kalıcı hata durumuna geçer; sessizce atlanmaz.
- Tüm chunk'lar core + auxiliary olarak başarıyla tamamlanınca tam aralığı kapsayan aggregate `marketplace_sync_runs` başarı kanıtı yazılır.

## Önemli veri-bütünlüğü düzeltmesi

`trendyol-otherfinancials-sync` order-product map temizliği resumable modda bütün bağlantıyı silemez. Temizlik yalnız işlenen `startDay..endDay` aralığına daraltılmıştır; aksi halde sonraki chunk önceki chunk'ın map verisini silerdi.

## Bilerek yapılmayan iddialar

- Bu mimari gerçek yüksek hacimli Trendyol mağazasında henüz production-validated değildir.
- Chunking provider'ın tek bir 3 günlük aralıkta aşırı veri döndürmesi halinde sonsuz kapasite sağlamaz; mevcut page guard fail-closed kalır.
- Hepsiburada, n11 ve Amazon bu PR'da resumable job mimarisine taşınmamıştır.
- Gerçek mağaza doğrulaması tamamlanmadan "large-store proven" denmez.
