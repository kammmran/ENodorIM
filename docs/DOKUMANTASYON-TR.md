# Molekülden Kokuya — Teknik Dokümantasyon

**İnteraktif insan olfaktör reseptör simülatörü**  
Proje sitesi: <https://kammmran.github.io/ENodorIM/#/>  
Veri sürümü: M2OR `M2OR_20230428.csv`, derleme tarihi 2026-10-07  
Doküman tarihi: 15 Ekim 2026

---

## 0. Bir bakışta özet

Bu proje, bir koku molekülünün burna ulaşmasından bilinçli koku algısına kadar olan yolu
adım adım gösteren, tarayıcıda çalışan interaktif bir simülatördür. Projenin bilimsel
ağırlık merkezi **reseptör adımıdır**: hangi insan olfaktör reseptörünün (OR) yanıt
verdiği, uydurma değerlerden değil, **yayımlanmış hücre temelli deney verisinden** gelir
(M2OR veritabanı). Reseptör adımından sonraki aşamalar (duysal nöron, bulbus olfactorius,
korteks) bu aktivasyon örüntüsünün neye yol açtığını gösteren, niteliksel olarak doğru
ama **şematik** modellerdir.

Projenin yöntemsel omurgası tek bir kurala dayanır: **ekrandaki her sayı, kaynağı ve
kanıt düzeyiyle birlikte etiketlenir.** Üç etiket kullanılır:

| Etiket | Anlamı |
|---|---|
| `measured` (ölçülmüş) | Yayımlanmış bir deneyden doğrudan gelen değer (örn. EC50) |
| `predicted` (tahmin) | Bir modelin ürettiği değer; modelin kendi doğrulama metriğiyle birlikte gösterilir |
| `schematic` (şematik) | Niteliksel olarak doğru ama parametreleri açıklayıcı amaçlı olan model çıktısı |

Bu ayrım kozmetik değildir: "test edilmemiş" ile "yanıt vermiyor" sitede **farklı
durumlar** olarak gösterilir ve dışa aktarımda bile korunur. Bu, nörobilimsel yorum için
kritik bir ayrımdır — insan OR repertuvarının büyük kısmı için hiçbir ligand bilinmiyor
ve bu bilgisizliği sıfır yanıt olarak kodlamak sistematik bir yanlılık üretir.

---

## 1. Bilimsel çerçeve: üç aşama

Site, koku algısını literatürdeki standart üç aşamalı kurguyla ele alır:

1. **Olfaktör GPCR'ler — uyaranın başlatıcı olayı.** Odorant, olfaktör duysal nöronların
   silialarındaki OR'lara bağlanır. İnsanda ~400 işlevsel OR geni vardır ve her nöron
   (kemirgen verisine göre) tek bir alleli monoallelik olarak ifade eder.
2. **Sinyalin nöronal entegrasyonu.** Reseptör uyarımı → Gαolf → adenilat siklaz III →
   cAMP → CNG kanalı → Ca²⁺ girişi → ANO2 klorür akımı → depolarizasyon → aksiyon
   potansiyeli dizisi. Aynı reseptör tipini ifade eden nöronlar bulbusta ortak
   glomerüllere yakınsar; lateral inhibisyon örüntüyü keskinleştirir.
3. **Sinyalin kod açılımı ve bilinçli algı.** Bulbus çıktısı primer olfaktör kortekse
   (piriform korteks, AON, tuberculum olfactorium, amigdala, entorhinal korteks) ve
   oradan OFC, insula, hipokampus, hipotalamus gibi yapılara taşınır.

Simülasyon bu üç aşamayı sırayla canlandırır; ancak **yalnızca 1. aşama ölçülmüş veriyle
sürülür.**

---

## 2. Veri kaynakları

| Kaynak | Ne için kullanılıyor | Lisans / atıf |
|---|---|---|
| **M2OR** (Lalis ve ark., *Nucleic Acids Research* 2024) | Reseptör–odorant çiftleri, EC50 değerleri, tarama sonuçları | Apache-2.0, doi:10.1093/nar/gkad886 |
| **HGNC** | Gen sembollerinin standardizasyonu | doi:10.1093/nar/gkac888 |
| **UniProt** | Protein dizileri, aksesyon eşleme | doi:10.1093/nar/gkae1010 |
| **GPCRdb** | Jenerik rezidü numaralandırması (Ballesteros–Weinstein benzeri) | doi:10.1093/nar/gkae1065 |
| **RCSB PDB** | Deneysel kriyo-EM yapıları (örn. 8F76 = OR51E2–propiyonat) | her girdinin birincil atfı |
| **AlphaFold DB** | Deneysel yapısı olmayan reseptörler için öngörülen modeller (açıkça "predicted" etiketli) | doi:10.1093/nar/gkad1011 |
| **PubChem** | Molekül kimliği, InChIKey, kimyasal yapı | — |
| **Leffingwell PMP 2001** (Pyrfume üzerinden) | Uzman koku tanımlayıcıları | **CC BY-NC** |
| **Dravnieks Atlas** (1985) | Koku karakter profilleri | — |
| **Keller & Vosshall** (2016) | İnsan panel değerlendirmeleri | doi:10.1186/s12868-016-0287-2 |
| **Crossref / DataCite** | Her DOI için kaynakça üstverisi | — |

**Lisans notu.** Leffingwell tanımlayıcı seti CC BY-NC olduğu için sitenin yayımlanmış
kopyası **ticari olmayan** kullanımla sınırlıdır. Akademik ve araştırma kullanımı
sorunsuzdur. The Good Scents Company verisi, net bir lisansı olmadığı için
**kullanılmamıştır.**

---

## 3. Veri işleme hattı ve sayısal durum

Python hattı (`scripts/pipeline/`) kaynakları indirir, temizler, eşler ve sitenin
yüklediği JSON dosyalarını üretir. Her çalıştırmada bir özet raporu basılır
(`data/processed/summary.txt`), böylece veri sürümleri arasındaki fark izlenebilir.

### Adımlar

| Modül | Yaptığı iş |
|---|---|
| `sources.py` | Önbelleklenmiş indirmeler (M2OR, HGNC, UniProt, GPCRdb, AlphaFold, PDB, PubChem, Pyrfume, Crossref) |
| `m2or.py` | İnsan tek-bileşenli deneyleri → reseptör–odorant çifti başına **tek konsensüs sonucu**, M2OR'un yayımlanmış Pair-table kurallarıyla |
| `receptors.py` | M2OR'daki çoklu gen yazımlarını (`hOR10AC`, `OR 10G9`, eski semboller) HGNC sembolüne eşler: sembol → alias → UniProt → dizi |
| `odorants.py` | Test odorantları InChIKey ile; koku tanımlayıcıları **tam stereokimya eşleşmesiyle** |
| `genotypes.py` | Reseptör genotip vakaları; alleller **aynı makale içinde** karşılaştırılır |
| `structures.py` | Ligand temasları, yatırılmış PDB koordinatlarından **ölçülerek** çıkarılır (makaleden alıntılanmaz) |
| `references.py` | Her DOI için atıf üstverisi |

### Kilit sayılar (mevcut derleme)

| Büyüklük | Değer |
|---|---|
| İnsan tek-bileşenli deney kaydı | 47.316 |
| Konsensüs reseptör–odorant çifti | 37.849 (referans allel 27.503 / varyant allel 10.346) |
| Referans allel çiftleri | agonist **1.306** · agonist-değil **25.827** · sonuçsuz **370** |
| Agonistlerin kanıt dağılımı | doz–yanıt (EC50) 545 · primer tarama 651 · sekonder tarama 110 |
| Sayısal EC50 taşıyan çift | 513 (referans allel) · 791 (varyantlar dahil) · sansürlü (EC50 > x) 32 |
| Sitedeki reseptör ismi | 432 — bunların **417**'si HGNC'de protein kodlayan OR geni |
| En az bir molekülle test edilmiş reseptör | **422** |
| En az bir bilinen agonisti olan reseptör | **235** |
| Tam simülasyonu olan test odorantı | 16 |
| Genotip vakası | 3 (OR7D4, OR2J3, OR10G4) |

### Veri kalitesi kararları — toplantıda sorulması muhtemel noktalar

- **Çelişen sonuçlar silinmez.** Aynı çift için birbirini tutmayan deneyler varsa çift
  `inconclusive` olarak kalır ve ekranda "sonuçlar uyuşmuyor" gerekçesiyle gösterilir.
- **Medyan EC50.** Birden fazla makale EC50 bildirdiğinde medyan kullanılır, ancak tüm
  değerler listelenir.
- **Tam-log değerler işaretlenir.** Mainland ve ark. 2015'ten gelen 42 referans-allel
  EC50 değeri tam log basamaklarıdır (±0,5 log) ve gösterildiği her yerde işaretlenir.
- **Test aralığı altındaki eğri uydurmaları işaretlenir.** OR51E2 için 9 EC50 değeri
  1 nM'nin altına uydurulmuştur, yani bu tahlillerin test ettiği aralığın dışındadır.
  Silinmez ama "ölçülmüş potens değil, eğri ekstrapolasyonu" olarak etiketlenir.
- **Stereokimya korunur.** Koku tanımlayıcıları yalnızca **tam** InChIKey eşleşmesiyle
  atanır; farklı bir stereoizomerin etiketi asla ikame edilmez. Gerekçe veride görünür:
  (R)- ve (S)-karvon farklı reseptörleri etkinleştirir.
- **Doğal haplotipler ayrı tutulur.** OR7D4 WM gibi alleller gene katlanmaz, ayrı allel
  olarak saklanır.
- **Eşlenemeyen 4 isim** (OR11H13, OR2T32, ORM2B, ORN4C) olduğu gibi korunur ve özet
  raporda listelenir.

---

## 4. Simülasyon modeli

Modelin tamamı React arayüzünden bağımsız, saf TypeScript olarak `src/model/` altında
yazılmıştır ve birim testleri vardır. Yani simülasyon arayüzden ayrı olarak test
edilebilir ve yeniden kullanılabilir.

### 4.1 Reseptör aktivasyonu — `measured`

Ölçülmüş EC50 varsa, Hill katsayısı 1 olan basit doygunluk eğrisi:

```
a = C / (EC50 + C)
```

Hill katsayısı 1 alınır, çünkü M2OR Hill katsayısı bildirmez — yani bu bir varsayım
değil, veri yokluğunun dürüst sonucudur.

Yalnızca taramadan bilinen agonistler, yanıt veren en düşük konsantrasyondan itibaren
sabit bir niteliksel düzeye (**0,5**) geçer. Test aralığının üzerine uydurulmuş bir EC50
sansürlü kabul edilir ve **0,25** düzeyi verilir.

Arayüzdeki "barkod" görünümünde **işaret boyutu kanıt düzeyini kodlar**: doz–yanıt >
doğrulanmış tarama > tek tarama vuruşu. Böylece bir örüntüye bakan kişi, 54 agonistin
kaçının gerçekte doz–yanıt eğrisiyle ölçüldüğünü tek bakışta görür.

### 4.2 Duysal nöron — `schematic`

Beş bağlaşık denklemle tek bir olfaktör duysal nöronun kinetik modeli:

reseptör sürüşü → Gαolf ve AC III (τ = 25 ms) → cAMP (sentez `kSyn` = 0,02, PDE1C
yıkımı `kDeg` = 0,01) → CNG kanal açılması (Hill katsayısı **2**, Ca²⁺–kalmodulin ile
duyarlılık azalması, τ = 250 ms) → Ca²⁺ (NCKX4 ile atılım, τ = 100 ms) → ANO2 klorür
akımı (reseptör akımının **%90**'ına kadarını taşır, `gCl` = 9) → depolarizasyon
(τ = 10 ms) → **200 Hz**'e kadar ateşleme.

Modelin **şekilleri** — gecikme, amplifikasyon, adaptasyon, sonlanma — Reisert ve
ark.'nın kayıtlarını izler (doi:10.1085/jgp.201110645). **Parametre değerleri
açıklayıcıdır ve hiçbir kayda fit edilmemiştir.** Zamanlama ve transdüksiyon ayrıntıları
büyük ölçüde kemirgen ve amfibi nöronlarından gelir; bu, dokümante edilmiş bir
sınırlamadır.

### 4.3 Bulbus olfactorius — `schematic`

Her reseptör tipi için bir glomerül, o nöron tipinin ortalama ateşleme hızını alır;
lateral inhibisyon ağırlıklı bir komşuluk çıkarımı yaparak örüntüyü keskinleştirir.

**Yerleşim anatomik değildir** ve site bunu açıkça söyler: hangi insan reseptörünün hangi
glomerüle karşılık geldiği bilinmiyor, ayrıca insanda bulbus başına 5.500'den fazla
glomerül vardır — reseptör tipi başına kabaca 16 (doi:10.1371/journal.pone.0002640).

### 4.4 Korteks ve algı — `schematic`

Bölge parlaklığı toplam bulbus çıktısını izler (yarı-doygunluk 0,5); algılama, toplam
nöron sürüşünü 0,05 eşiğiyle karşılaştırır. Bunlar açıklayıcı çıktılardır, ölçülmüş
aktivite değildir.

**Önemli:** algı olarak gösterilen koku sözcükleri **her zaman insan algı
veri setlerinden** gelir; animasyondan hesaplanmaz. Yani simülasyon "vanilya kokuyor"
sonucunu üretmez — o kelime Leffingwell/Dravnieks/Keller–Vosshall verisinden okunur.

### 4.5 "Kim kokluyor" — birey değişkenleri

Tüm çarpanlar tek bir dosyada (`src/model/modifiers.ts`), her biri kaynağı ve gerekçe
yorumuyla birlikte toplanmıştır. İki ilke:

- **Yalnızca reseptör genotipi, reseptör aktivasyonunu değiştirir** — ve bunu yaparken
  **tek bir makale içinde ölçülmüş** allel verisini kullanır. Böylece genotip etkisi
  laboratuvarlar arası farklarla karışmaz. Heterozigot, her allelden yarım olarak
  modellenir; gerekçe monoallelik ifadedir (kemirgen verisi,
  doi:10.1016/S0092-8674(94)90562-2).
- **Yaş**, reseptör aşamasından **sonra** tek bir küçük ve açıkça "illustrative" olarak
  etiketlenmiş kaydırma uygular (0,82 çarpanı; primer olfaktör korteks, insula,
  hipokampus). Çalışmadan gelen tek şey **yön**dür (yaşlı yetişkinlerde daha düşük),
  çarpanın büyüklüğü değil (fMRI, n = 37; doi:10.18632/oncotarget.16977).

Genotip vakaları:

| Vaka | Reseptör | Odorant | Alleller | Kaynak |
|---|---|---|---|---|
| Androstenon | OR7D4 | androstenon | RT (referans), WM (R88W+T133M) | doi:10.1038/nature06162 |
| cis-3-heksenol | OR2J3 | cis-3-heksen-1-ol | referans, T113A+R226Q | doi:10.1093/chemse/bjs049 |
| Guaiakol | OR10G4 | guaiakol | referans, APT (2 aa), VLT (5 aa), ALI (8 aa) | doi:10.1038/nn.3598 |

---

## 5. Ölçülmemiş bir molekülü tahmin etmek — `predicted`

"Molekül çiz" ekranında kullanıcı herhangi bir yapıyı çizebilir veya SMILES olarak
yapıştırabilir; sistem reseptör örüntüsünü ve koku sözcüklerini tahmin eder. Tahmin aynı
`Stimulus` arayüzünü beslediği için **tüm simülasyon çizilmiş bir molekülle de
değişmeden çalışır**, baştan sona `predicted` etiketiyle.

### 5.1 Moleküler temsil

Morgan parmak izi, yarıçap 2, 2048 bit, **kiralite dahil**. Kiralite dahil edilmesi
bilinçli bir karardır: ölçülmüş veri enantiyomerlerin farklı reseptörleri
etkinleştirdiğini gösteriyor, dolayısıyla (R)- ve (S)-karvonu aynı molekül sayan bir
tahminci sitenin kendi verisiyle çelişirdi.

Python (RDKit) ve tarayıcı (RDKit.js) **bit düzeyinde aynı** parmak izini üretir; bu
nedenle referans seti önceden hesaplanır ve çalışma zamanında yalnızca sorgu molekülü
parmak izlenir.

### 5.2 Yöntem A — en yakın komşular (temel çizgi)

M2OR'dan **654 ölçülmüş molekül**e karşı Tanimoto benzerliği. Bir reseptörün skoru,
benzer moleküllerin yanıt verenlerinin benzerlik-ağırlıklı payıdır — **yalnızca o
reseptörde gerçekten test edilmiş olanlar sayılarak.** Böylece hiç test edilmemiş bir
reseptör "negatif tahmin" edilmez, **bilinmeyen** kalır. Bir reseptör ancak toplam
benzerliği ≥ 1,0 olan komşular onda test edilmişse listelenir ve skor > 0,5 ise yanıt
veren sayılır. Koku sözcükleri aynı yolla, uzman etiketli **3.522 molekül**den gelir.
Her tahmin, hangi ölçülmüş moleküllerden türediğini listeler.

**Birini-dışarıda-bırak değerlendirmesi** (142 molekül skorlandı, yalnızca gerçekten
test edildikleri reseptörler puanlanarak):

| Metrik | Değer |
|---|---|
| En üst sıradaki reseptör gerçek agonist | **%61** (n = 138) |
| Kesinlik (precision) @ skor ≥ 0,5 | 0,48 |
| Duyarlılık (recall) @ skor ≥ 0,5 | 0,13 |

**Bu sayıların dürüst okuması:** sıralamayı okuyun, mutlak kümeyi değil. Duyarlılığın
düşük olmasının yapısal bir nedeni var — her referans molekülü yalnızca birkaç reseptörde
test edilmişken, "gerçeği" tanımlayan taramalar yüzlerce reseptörü taradı. Tahmin
listesinin tepesi, **test edilmeye değer bir hipotez**dir; bir sonuç değildir.

### 5.3 Yöntem B — öğrenilmiş model

Her iki yanda da yeterli ölçülmüş molekülü olan **31 reseptör** için (her sınıfta ≥ 8
molekül), parmak izi bitleri üzerinde reseptör başına **L2 düzenlileştirilmiş lojistik
regresyon**. Komşuluk temel çizgisine karşı **birebir aynı katlarda** çapraz doğrulanır:

| 31 reseptör üzerinde | Öğrenilmiş model | En yakın komşular |
|---|---|---|
| Ortalama ROC-AUC | **0,691** | 0,677 |
| Ortalama average precision | **0,422** | 0,380 |
| Daha iyi olduğu reseptör sayısı | 22 | 9 |

Fark marjinaldir ve **abartılmamalıdır.**

Asıl değişken **reseptörün kendisidir**: en iyi model OR5AN1 için AUC 0,98'e ulaşırken
birkaç reseptör şans düzeyinde kalır. Tek bir manşet sayısı bunu gizlerdi; bu yüzden
**her tahmin kendi reseptörünün çapraz doğrulanmış AUC'sini taşır**, 0,70 altındaki
değerler güvenilmez olarak işaretlenir ve simülasyon öğrenilmiş skoru **yalnızca bu
çizginin üstünde** kullanır. Model 43 KB'lık bir matrise aktarılır ve tarayıcıda basit
bir iç çarpım olarak çalışır.

---

## 6. Benchmark: düz çapraz doğrulama ile iç içe çapraz doğrulama

Yukarıdaki tablo *bu model ne kadar iyi* sorusunu yanıtlar. *Bu modeli seçen prosedür ne
kadar iyi* sorusunu yanıtlamaz — ve bir şeyi ayarlamaya (tuning) başladığınız anda önemli
olan sayı ikincisidir, çünkü **bir kazananı seçen katlar, aynı zamanda onu adil
notlandıramaz.**

`scripts/pipeline/benchmark_models.py` dokuz model ailesini birebir aynı katlarda iki
şemadan geçirir (5-katlı tabakalı dış × 3 karıştırma, havuzlanmış kat-dışı skorlama,
3-katlı iç arama, bit filtreleme her katta yeniden fit edilir; ~24 dakika):

| Model ailesi | Izgara | Düz CV | İç içe CV | İyimserlik | Δ (sevk edilene karşı) | p (Holm) |
|---|---|---|---|---|---|---|
| lojistik C=0,1 (**sevk edilen**, ayarsız) | 1 | 0,686 | **0,686** | — | — | — |
| random forest | 4 | 0,707 | 0,686 | +0,022 | 0,000 | 0,78 |
| extra trees | 4 | 0,710 | 0,683 | +0,027 | −0,003 | 0,78 |
| lojistik regresyon (L2) | 6 | 0,707 | 0,677 | +0,030 | −0,009 | 0,26 |
| Bernoulli naive Bayes | 3 | 0,701 | 0,676 | +0,025 | −0,010 | 0,52 |
| Tanimoto komşuları | 3 | 0,703 | 0,674 | +0,029 | −0,012 | 0,52 |
| doğrusal SVM | 4 | 0,712 | 0,671 | +0,040 | −0,015 | 0,08 |
| RBF SVM | 9 | 0,726 | 0,668 | +0,058 | −0,018 | 0,08 |
| lojistik regresyon (L1) | 5 | 0,709 | 0,657 | +0,051 | −0,029 | 0,20 |

Üç sonuç ve hepsi aynı yönü gösteriyor:

1. **Hiçbir şey, ayarsız sevk edilen yapılandırmayı geçmiyor.** Dokuz ailenin en yüksek
   iç içe CV skoru odur (random forest ile eşit). Sekiz karşılaştırma üzerinde Holm
   düzeltmesinden sonra hiçbir aile ondan anlamlı biçimde farklı değil; düzeltilmemiş
   *p* < 0,05'e ulaşan üç aile ise **daha kötü** olanlardır.
2. **Ayarlama, var olmayan +0,035 AUC değerinde.** Bu, ortalama düz-eksi-iç içe
   farkıdır — hiperparametre aramasının bedeli dürüstçe ödendiğinde buharlaşan skor.
   Bu fark, dokuz aile arasındaki tüm yayılımdan daha büyüktür; yani düz CV ile
   raporlanan ayarlı bir model, hiç olmadığı hâlde iyileşme gibi görünürdü. Fark ızgara
   boyutuyla ölçeklenir: dokuz noktalı RBF SVM ızgarası için +0,058, hiçbir şey aramayan
   model için +0,000.
3. **Kat gürültüsü, farklarla aynı büyüklükte.** Aynı değerlendirme farklı bir
   karıştırmayla yeniden koşulduğunda tek bir reseptörün AUC'si ±0,021 oynuyor.

**Sonuç:** bu veri setinde sınır algoritma değil, **veridir.** Bir sonraki kazanç daha
geniş bir aramadan değil, ya daha fazla ölçülmüş çiftten ya da reseptörler arasında tek
bir temsili paylaşmaktan gelmek zorunda. Karşılaştırma gizlenmek yerine **yayımlanmıştır**
— sitede `#/benchmark` sayfası tabloyu, düz-karşı-iç içe şeklini ve her reseptörün kendi
sayılarını gösterir; `scripts/report/benchmark_report.py` aynı JSON'dan tek sayfalık bir
LaTeX özeti üretir, böylece ikisi birbirinden sapamaz.

---

## 7. Karışımlar

Karışımlar ekranında bileşenler her reseptörde **aynı bağlanma bölgesi için yarışır**.
Eşit etkinlikte agonistler için, Cᵢ konsantrasyonları ve EC50ᵢ potensleriyle:

```
a = Σ(Cᵢ/EC50ᵢ) / (1 + Σ(Cᵢ/EC50ᵢ))        Cᵢ = fᵢ·C yazılırsa:
a = C / (EC50_karışım + C)                  EC50_karışım = 1 / Σ(fᵢ/EC50ᵢ)
```

Yani karışım, reseptör başına **tek bir etkin EC50**'ye çöker — sıradan bir Hill eğrisi —
ve tek bir `Stimulus` hâline gelir; sonraki tüm aşamalar hiç değişmeden çalışır.

Ekranda görülmeye değer iki sonuç:

- Sabit **toplam** konsantrasyonda bir karışım, en iyi tek bileşeninden asla daha güçlü
  değildir; çünkü zayıf bir ortak eklemek güçlü olanı seyreltir.
- Bir bileşenin bir reseptörün sürüşündeki payı, karışımdaki payını değil **o
  reseptördeki potensini** izler. İki karvon enantiyomeri ve guaiakolün 1:1:1 karışımında
  (R) formu OR1A1'deki sürüşün ~%90'ını sağlarken, (S) formu OR2W1'de ~%80'ini sağlar.

**Modelin açık sınırı:** bu formülasyon bileşen eklendikçe bir reseptörün yanıtının
yalnızca **artmasına** izin verir. Gerçek karışımlarda görülen **supresyon ve maskeleme**
(reseptör düzeyinde antagonizma ve daha ileri aşamalarda) modellenmemiştir ve bir karışım
hiçbir bileşeninin kokmadığı bir şey gibi kokabilir. Ayrıca karışım için gösterilen
harmanlanmış koku sözcükleri, bileşenlerin kendi bildirilen sözcüklerinin ağırlıklı bir
**gösterimidir**, karışımın nasıl algılandığına dair bir tahmin değildir. Site bunu
belirgin biçimde söyler.

---

## 8. Sınırlar — projenin iddia **etmediği** şeyler

Bu bölüm, nörobilimci bir dinleyiciyle konuşurken en önemli bölümdür ve sitede ayrı bir
başlık olarak durur:

- Reseptör–odorant verisi **hücre temelli tahlillerden** gelir (HEK293T, Hana3A ve
  diğerleri; lusiferaz, cAMP veya Ca²⁺ okumalarıyla). Bunlar hangi reseptörlerin yanıt
  **verebileceğini** gösterir, canlı bir burunda ne olduğunu göstermez.
- İnsan reseptörlerinin çoğunun bilinen ligandı yoktur. **"Test edilmemiş", "yanıt
  vermiyor" değildir**; site bunları ayrı gösterir.
- Tahlil konsantrasyonları, havadaki veya nazal mukustaki konsantrasyonlar değildir.
- Transdüksiyon ayrıntıları ve zamanlamaları çoğunlukla kemirgen ve amfibi
  nöronlarındandır.
- Glomerüler harita, bölge aktivite düzeyleri ve reseptör aşamasından sonraki bireysel
  kaydırmalar şematik veya açıklayıcıdır.
- Mainland ve ark. 2015 EC50 değerleri tam-log değerlerdir (±0,5 log) ve işaretlenir.
- OR51E2 için dokuz EC50 değeri, tahlillerin test ettiği aralığın altına (1 nM altı)
  uydurulmuştur; korunur ama işaretlenir.
- Tahminler bir benzerlik temel çizgisi ve küçük bir doğrusal modeldir: sıralama için
  yararlı, duyarlılıkta zayıf.
- Karışım modeli supresyonu modellemez (yukarıya bakınız).

---

## 9. Çıktılar, yeniden üretilebilirlik ve atıf

### Veri dışa aktarımı

Reseptör örüntüsü hesaplayan her görünüm, sonucu **CSV** veya **JSON** olarak sunar
(`src/model/export.ts`). İkisi de 432 reseptörün tamamını, konsantrasyonu, InChIKey veya
karışım bileşimini, genotipi ve her değerin kaynağını taşır.

Kimsenin test etmediği reseptörler, `0` değil **boş hücre** (CSV) veya `null` (JSON)
olarak aktarılır. Böylece "veri yok", aşağı akış analizinde sessizce "yanıt yok"a
dönüşemez — arayüzün yaptığı ayrımın aynısı.

### Paylaşılabilir bağlantılar

Odorant, konsantrasyon, genotip veya karışım URL hash'inde kodlanır
(`src/state/shareLink.ts`), böylece tam bir görünüm bir meslektaşa gönderilebilir veya
bir makalede atıf olarak verilebilir:

```
#/simulate?o=androstenone&c=-5.00&g=OR7D4-androstenone:WM/WM
#/mixtures?c=-4.00&m=r-carvone:1&m=guaiacol:1
```

Bilinmeyen odorantlar, aralık dışı konsantrasyonlar ve bozuk değerler hata vermek yerine
yok sayılır — çünkü bu bağlantılar elle yeniden yazılır ve kırpılır.

### Atıf

Site, **başkalarının ölçümlerinin bir sunumudur.** Bir şekil veya dışa aktarılmış örüntü
kullanılırsa **veri kaynaklarına atıf verilmelidir** — iş onların üzerinde duruyor:

- **Reseptör–odorant verisi:** Lalis, M., Hladiš, M., Abi Khalil, S., Briand, L.,
  Fiorucci, S. & Topin, J. M2OR: a database of olfactory receptor–odorant pairs.
  *Nucleic Acids Research* (2024). doi:10.1093/nar/gkad886
- **Koku tanımlayıcıları:** Leffingwell PMP 2001 (Pyrfume üzerinden, CC BY-NC),
  Dravnieks *Atlas of Odor Character Profiles* (1985), Keller & Vosshall
  (doi:10.1186/s12868-016-0287-2)
- **Reseptör kimliği ve yapılar:** HGNC, UniProt, GPCRdb, AlphaFold DB ve her PDB
  girdisinin birincil atfı
- **Araç için:** "Molekülden kokuya", interaktif olfaktör reseptör simülatörü

Hangi genotip, yapı veya EC50 alıntılanıyorsa, o değerin yanında **spesifik makale**
bağlantılıdır — ölçümün kendisi için siteye değil o makaleye atıf verilmelidir.

---

## 10. Teknik mimari

```
scripts/pipeline/   Python veri hattı (pandas, RDKit, gemmi) + model benchmark'ı
scripts/report/     Benchmark JSON'undan üretilen LaTeX raporu
reports/            Üretilmiş tek sayfalık rapor (.tex ve .pdf)
data/raw/           İndirmeler (git tarafından yok sayılır, önbelleklenir)
data/processed/     Sitenin yüklediği JSON (depoya işlenmiş)
src/model/          Saf TypeScript simülasyon, React yok — birim testli
src/scenes/         Aşama başına bir SVG sahne
src/ui/             Yeniden kullanılabilir bileşenler (barkod,
                    grafikler, moleküller, 3B, kontroller)
src/screens/        Başlangıç, Simülasyon, Reseptör gezgini,
                    Odorant gezgini, Molekül çiz, Karışımlar,
                    Nasıl çalışır
attic/              Derlemeden çıkarılmış eski dosyalar
```

`src/model/` arayüzden **hiç import etmez.** Modüller:

| Dosya | İçerik |
|---|---|
| `activation.ts` | Hill fonksiyonu, yalnız-tarama agonistleri için niteliksel düzeyler |
| `transduction.ts` | Tek duysal nöronun kinetik modeli (cAMP, Ca²⁺, Cl⁻, Vm, ateşleme) |
| `bulb.ts` | Glomerüler yerleşim ve lateral inhibisyon |
| `simulation.ts` | Tam bir koşu |
| `modifiers.ts` | Her birey-seçici çarpanı, kaynağı ve yorumuyla |
| `stimulus.ts` | Faz 2 ve 3'ün bağlandığı arayüz (seam) |

### Çalıştırma

```bash
npm install          # bağımlılıklar
npm run dev          # http://localhost:5173
npm run build        # tip kontrolü + dist/ içine üretim derlemesi
npm test             # model birim testleri (Vitest)
```

`npm run dev`, `data/processed/*.json` ile Mol*/RDKit paketlerini önce `public/` içine
kopyalar; yani **depodaki veri siteyi çalıştırmak için yeterlidir.**

### Veriyi yeniden üretme

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python -m scripts.pipeline.build            # önbelleklenmiş indirmelerle
.venv/bin/python -m scripts.pipeline.build --refresh  # kaynakları yeniden indir
npm run benchmark    # ≈24 dk → data/processed/model_benchmark.json
npm run report       # → reports/benchmark_report.pdf
```

**Tek manuel adım.** M2OR web sitesi (m2or.chemsensim.fr) betiklerin geçemediği bir
tarayıcı kontrolünün arkasındadır, bu nedenle hat yazarların GitHub anlık görüntüsünü
kullanır (`M2OR_20230428.csv`, Apache-2.0). Güncel veritabanını kullanmak için
Experiments tablosunu tarayıcıdan CSV olarak dışa aktarıp `data/raw/m2or/` içine bırakmak
yeterlidir; hat onu otomatik olarak tercih eder ve farkları özet raporda bildirir.

### Yayımlama

Derleme, göreli tabanlı, kendi kendine yeten statik bir sitedir — sunucu, veritabanı veya
API anahtarı yok. `dist/` yaklaşık 21 MB'dır (3B görüntüleyici, kimya araç takımı ve
çizim aracı ağırlığın çoğunu oluşturur ve yalnızca gerektiğinde yüklenir).
`.github/workflows/deploy.yml`, `main`'e her itişte derleyip GitHub Pages'e yayımlar.

---

## 11. Fazlar ve yol haritası

- **Faz 1 (hazır):** bir test odorantı seç, tam simülasyonu izle, her reseptörü incele.
- **Faz 2 (hazır):** herhangi bir molekülü çiz veya yapıştır; tahmini reseptör örüntüsü ve
  tahmini koku sözcüklerini, her tahminin arkasındaki ölçülmüş molekülleri kanıt olarak
  göstererek al.
- **Faz 3 (hazır):** iki veya daha fazla odorantın (çizilmiş bir molekül dahil) karışımı,
  aynı `Stimulus`'a toplanarak.

**Planlanan değişiklik:** aynı arayüzün arkasına daha yüksek kapasiteli bir öğrenilmiş
model — reseptörler için protein dil modeli ile bir graf sinir ağı (Hladiš ve ark. 2023)
ve koku tanımlayıcıları için OpenPOM. Ancak yukarıdaki kanıta göre **daha fazla veri, daha
iyi bir mimariden daha çok işe yarayacaktır.**

### İlgili yeni literatür

Pashakhanloo & Murthy (Harvard, arXiv:2610.17164, Ekim 2026), ~1.240 doğal gıda
karışımının moleküler bileşiminden algısal benzerliğini öğrenmek için büyük dil
modellerinden türetilen koku tanımlayıcılarını vekil hedef olarak kullanıyor. Bu proje
açısından üç noktası ilgi çekici:

1. Doğrulamayla seçilen moleküler gömme boyutu **k ≈ 141** (%95 GA 99–200) çıkıyor;
   yazarlar bunun insan OR tipi sayısıyla aynı mertebede olduğunu ve reseptör
   repertuvarının **biyolojik bir darboğaz** oluşturduğunu vurguluyor. Hiç reseptör
   verisi kullanılmadan, yalnızca algısal benzerlik uydurmasından bu projenin merkezî
   tezine bağımsız destek.
2. Dışsal moleküler öznitelikler (GS–LF, OpenPOM, MolFormer, Mordred) sıfır-vuruşta
   yalnızca r ≈ 0,24–0,35 veriyor ve **yalnızca az veri rejiminde** fayda sağlıyor; tam
   eğitim setinde ek katkıları kayboluyor. Bu, bu projenin benchmark sonucunun ("sınır
   algoritma değil, veri") bağımsız bir doğrulamasıdır.
3. Yazarların açık sınırlaması, VCF verisinde güvenilir konsantrasyon olmadığı için
   karışımları **ikili var/yok** vektörleriyle temsil etmek zorunda kalmaları. Bu
   projenin karışım modeli ise doğrudan konsantrasyon sürümlüdür.

---

## 12. Toplantıda muhtemel sorular ve kısa yanıtlar

**"Bu bir tahmin motoru mu, bir görselleştirme mi?"**
Reseptör adımında bir veri sunumu; "Molekül çiz" ekranında ise açıkça etiketlenmiş bir
tahmin. İkisi hiçbir yerde karışmaz, çünkü her değer provenance etiketi taşır.

**"Neden Hill katsayısı 1?"**
Çünkü M2OR Hill katsayısı bildirmiyor. Veri olmadığında parametre uydurmak yerine en
yalın varsayım seçildi ve bu açıkça yazıldı.

**"235 reseptörün agonisti var — gerisi yanıt vermiyor mu?"**
Hayır. 422 reseptör en az bir molekülle test edilmiş; 235'inde en az bir agonist bulundu.
Kalanı için çoğunlukla **yeterli test yok.** Site ve dışa aktarım bu iki durumu ayırır.

**"Bulbus haritası gerçek mi?"**
Değil ve site bunu söylüyor. İnsan reseptör→glomerül eşlemesi bilinmiyor; ayrıca insanda
reseptör tipi başına ~16 glomerül var. Yerleşim açıklayıcıdır.

**"Tahmin performansı düşük görünüyor (recall 0,13)."**
Doğru ve bu yapısal. Referans molekülleri birkaç reseptörde test edilmişken "gerçeği"
tanımlayan taramalar yüzlerce reseptör taradı. Bu yüzden mutlak kümeye değil
**sıralamaya** bakılması söyleniyor ve her tahmin kendi reseptörünün AUC'siyle sunuluyor.

**"Daha iyi bir model denediniz mi?"**
Dokuz model ailesi, iç içe çapraz doğrulamayla. Hiçbiri sevk edilen ayarsız
yapılandırmayı güvenilir biçimde geçmedi; ayarlama düz CV'de ~0,03 AUC kazanç gibi
görünüp iç içe şemada buharlaşıyor. Karşılaştırma sitede yayımlanmış durumda.

**"Karışımlarda supresyon neden yok?"**
Çünkü mevcut veri yarışmalı bağlanmanın ötesini kalibre etmeye yetmiyor. Model yalnızca
tek bağlanma bölgesi için yarışmayı içeriyor ve supresyonun modellenmediği açıkça
belirtiliyor.
