"use strict";

const EmpireWidgets = (function() {
    const API_BASE = "https://empire-reviews.vercel.app";
    let activeProductId = null;
    let activeShopDomain = null;
    let currentRatingSelected = 0;
    let pendingUploads = 0; // tracks in-progress Cloudinary uploads
    const widgetState = {}; // Store pagination state for multiple widgets

    // ─── i18n ────────────────────────────────────────────────────────────────
    // Storefront widget translations. Language is driven by the merchant's
    // Settings.language (delivered via the API response → setLang), with a
    // fallback to Shopify's storefront locale, then English. Unknown keys/langs
    // fall back to English so a missing translation never renders blank.
    let currentLang = "en";
    const I18N = {
        en: { verified_buyer:"Verified Buyer", write_review:"Write a Review", modal_title:"Share Your Experience", modal_sub:"How would you rate this product?", star_label:"Tap a star to rate", name_ph:"Your name (optional)", review_ph:"Tell us what you think...", submit_review:"Submit Review", submitting:"Submitting...", success_title:"Thank you!", success_sub:"Your review has been received and is pending approval.", review_live:"Your review is now visible to everyone. Thank you!", no_reviews_yet:"No reviews yet", be_first:"Be the first to review!", out_of_5:"out of 5", add_photos:"Add Photos", remove:"Remove", load_more:"Load More" },
        es: { verified_buyer:"Comprador Verificado", write_review:"Escribir una reseña", modal_title:"Comparte tu experiencia", modal_sub:"¿Cómo calificarías este producto?", star_label:"Toca una estrella para calificar", name_ph:"Tu nombre (opcional)", review_ph:"Cuéntanos qué opinas...", submit_review:"Enviar reseña", submitting:"Enviando...", success_title:"¡Gracias!", success_sub:"Tu reseña ha sido recibida y está pendiente de aprobación.", review_live:"Tu reseña ya es visible para todos. ¡Gracias!", no_reviews_yet:"Aún no hay reseñas", be_first:"¡Sé el primero en opinar!", out_of_5:"de 5", add_photos:"Añadir fotos", remove:"Quitar", load_more:"Cargar más" },
        fr: { verified_buyer:"Acheteur Vérifié", write_review:"Écrire un avis", modal_title:"Partagez votre expérience", modal_sub:"Comment noteriez-vous ce produit ?", star_label:"Touchez une étoile pour noter", name_ph:"Votre nom (facultatif)", review_ph:"Dites-nous ce que vous en pensez...", submit_review:"Envoyer l'avis", submitting:"Envoi...", success_title:"Merci !", success_sub:"Votre avis a été reçu et est en attente d'approbation.", review_live:"Votre avis est maintenant visible par tous. Merci !", no_reviews_yet:"Pas encore d'avis", be_first:"Soyez le premier à donner votre avis !", out_of_5:"sur 5", add_photos:"Ajouter des photos", remove:"Retirer", load_more:"Voir plus" },
        de: { verified_buyer:"Verifizierter Käufer", write_review:"Bewertung schreiben", modal_title:"Teile deine Erfahrung", modal_sub:"Wie würdest du dieses Produkt bewerten?", star_label:"Tippe auf einen Stern zum Bewerten", name_ph:"Dein Name (optional)", review_ph:"Sag uns deine Meinung...", submit_review:"Bewertung absenden", submitting:"Senden...", success_title:"Danke!", success_sub:"Deine Bewertung ist eingegangen und wartet auf Freigabe.", review_live:"Deine Bewertung ist jetzt für alle sichtbar. Danke!", no_reviews_yet:"Noch keine Bewertungen", be_first:"Schreibe die erste Bewertung!", out_of_5:"von 5", add_photos:"Fotos hinzufügen", remove:"Entfernen", load_more:"Mehr laden" },
        pt: { verified_buyer:"Comprador Verificado", write_review:"Escrever avaliação", modal_title:"Compartilhe sua experiência", modal_sub:"Como você avaliaria este produto?", star_label:"Toque em uma estrela para avaliar", name_ph:"Seu nome (opcional)", review_ph:"Conte-nos o que você acha...", submit_review:"Enviar avaliação", submitting:"Enviando...", success_title:"Obrigado!", success_sub:"Sua avaliação foi recebida e está aguardando aprovação.", review_live:"Sua avaliação já está visível para todos. Obrigado!", no_reviews_yet:"Ainda sem avaliações", be_first:"Seja o primeiro a avaliar!", out_of_5:"de 5", add_photos:"Adicionar fotos", remove:"Remover", load_more:"Carregar mais" },
        it: { verified_buyer:"Acquirente Verificato", write_review:"Scrivi una recensione", modal_title:"Condividi la tua esperienza", modal_sub:"Come valuteresti questo prodotto?", star_label:"Tocca una stella per valutare", name_ph:"Il tuo nome (facoltativo)", review_ph:"Dicci cosa ne pensi...", submit_review:"Invia recensione", submitting:"Invio...", success_title:"Grazie!", success_sub:"La tua recensione è stata ricevuta ed è in attesa di approvazione.", review_live:"La tua recensione è ora visibile a tutti. Grazie!", no_reviews_yet:"Ancora nessuna recensione", be_first:"Sii il primo a recensire!", out_of_5:"su 5", add_photos:"Aggiungi foto", remove:"Rimuovi", load_more:"Carica altro" },
        nl: { verified_buyer:"Geverifieerde koper", write_review:"Schrijf een review", modal_title:"Deel je ervaring", modal_sub:"Hoe zou je dit product beoordelen?", star_label:"Tik op een ster om te beoordelen", name_ph:"Je naam (optioneel)", review_ph:"Vertel ons wat je ervan vindt...", submit_review:"Review versturen", submitting:"Versturen...", success_title:"Bedankt!", success_sub:"Je review is ontvangen en wacht op goedkeuring.", review_live:"Je review is nu zichtbaar voor iedereen. Bedankt!", no_reviews_yet:"Nog geen reviews", be_first:"Wees de eerste die een review schrijft!", out_of_5:"van 5", add_photos:"Foto's toevoegen", remove:"Verwijderen", load_more:"Meer laden" },
        sv: { verified_buyer:"Verifierad köpare", write_review:"Skriv en recension", modal_title:"Dela din upplevelse", modal_sub:"Hur skulle du betygsätta denna produkt?", star_label:"Tryck på en stjärna för att betygsätta", name_ph:"Ditt namn (valfritt)", review_ph:"Berätta vad du tycker...", submit_review:"Skicka recension", submitting:"Skickar...", success_title:"Tack!", success_sub:"Din recension har tagits emot och väntar på godkännande.", review_live:"Din recension är nu synlig för alla. Tack!", no_reviews_yet:"Inga recensioner än", be_first:"Bli först med att recensera!", out_of_5:"av 5", add_photos:"Lägg till foton", remove:"Ta bort", load_more:"Ladda mer" },
        pl: { verified_buyer:"Zweryfikowany kupujący", write_review:"Napisz recenzję", modal_title:"Podziel się swoim doświadczeniem", modal_sub:"Jak oceniasz ten produkt?", star_label:"Dotknij gwiazdkę, aby ocenić", name_ph:"Twoje imię (opcjonalnie)", review_ph:"Powiedz nam, co myślisz...", submit_review:"Wyślij recenzję", submitting:"Wysyłanie...", success_title:"Dziękujemy!", success_sub:"Twoja recenzja została odebrana i oczekuje na zatwierdzenie.", review_live:"Twoja recenzja jest teraz widoczna dla wszystkich. Dziękujemy!", no_reviews_yet:"Brak recenzji", be_first:"Bądź pierwszą osobą, która oceni!", out_of_5:"z 5", add_photos:"Dodaj zdjęcia", remove:"Usuń", load_more:"Załaduj więcej" },
        tr: { verified_buyer:"Doğrulanmış Alıcı", write_review:"Yorum yaz", modal_title:"Deneyiminizi paylaşın", modal_sub:"Bu ürünü nasıl değerlendirirsiniz?", star_label:"Değerlendirmek için bir yıldıza dokunun", name_ph:"Adınız (isteğe bağlı)", review_ph:"Ne düşündüğünüzü söyleyin...", submit_review:"Yorumu gönder", submitting:"Gönderiliyor...", success_title:"Teşekkürler!", success_sub:"Yorumunuz alındı ve onay bekliyor.", review_live:"Yorumunuz artık herkese görünür. Teşekkürler!", no_reviews_yet:"Henüz yorum yok", be_first:"İlk yorumu siz yapın!", out_of_5:"/ 5", add_photos:"Fotoğraf ekle", remove:"Kaldır", load_more:"Daha fazla yükle" },
        ru: { verified_buyer:"Проверенный покупатель", write_review:"Написать отзыв", modal_title:"Поделитесь своим опытом", modal_sub:"Как бы вы оценили этот товар?", star_label:"Нажмите на звезду, чтобы оценить", name_ph:"Ваше имя (необязательно)", review_ph:"Расскажите, что вы думаете...", submit_review:"Отправить отзыв", submitting:"Отправка...", success_title:"Спасибо!", success_sub:"Ваш отзыв получен и ожидает одобрения.", review_live:"Ваш отзыв теперь виден всем. Спасибо!", no_reviews_yet:"Отзывов пока нет", be_first:"Будьте первым, кто оставит отзыв!", out_of_5:"из 5", add_photos:"Добавить фото", remove:"Удалить", load_more:"Загрузить ещё" },
        ja: { verified_buyer:"認証済み購入者", write_review:"レビューを書く", modal_title:"ご感想をお聞かせください", modal_sub:"この商品をどう評価しますか？", star_label:"星をタップして評価", name_ph:"お名前（任意）", review_ph:"ご意見をお聞かせください...", submit_review:"レビューを送信", submitting:"送信中...", success_title:"ありがとうございます！", success_sub:"レビューを受け付けました。承認待ちです。", review_live:"あなたのレビューが公開されました。ありがとうございます！", no_reviews_yet:"まだレビューがありません", be_first:"最初のレビューを書きましょう！", out_of_5:"／5", add_photos:"写真を追加", remove:"削除", load_more:"もっと見る" },
        zh: { verified_buyer:"已验证买家", write_review:"写评价", modal_title:"分享您的体验", modal_sub:"您如何评价此商品？", star_label:"点击星星进行评分", name_ph:"您的姓名（可选）", review_ph:"告诉我们您的想法...", submit_review:"提交评价", submitting:"提交中...", success_title:"谢谢！", success_sub:"您的评价已收到，正在等待审核。", review_live:"您的评价现已对所有人可见。谢谢！", no_reviews_yet:"暂无评价", be_first:"成为第一个评价的人！", out_of_5:"/ 5", add_photos:"添加照片", remove:"移除", load_more:"加载更多" },
        ar: { verified_buyer:"مشترٍ موثّق", write_review:"اكتب مراجعة", modal_title:"شاركنا تجربتك", modal_sub:"كيف تقيّم هذا المنتج؟", star_label:"اضغط على نجمة للتقييم", name_ph:"اسمك (اختياري)", review_ph:"أخبرنا برأيك...", submit_review:"إرسال المراجعة", submitting:"جارٍ الإرسال...", success_title:"شكرًا لك!", success_sub:"تم استلام مراجعتك وهي في انتظار الموافقة.", review_live:"مراجعتك الآن مرئية للجميع. شكرًا لك!", no_reviews_yet:"لا توجد مراجعات بعد", be_first:"كن أول من يكتب مراجعة!", out_of_5:"من 5", add_photos:"إضافة صور", remove:"إزالة", load_more:"تحميل المزيد" },
        hi: { verified_buyer:"सत्यापित खरीदार", write_review:"समीक्षा लिखें", modal_title:"अपना अनुभव साझा करें", modal_sub:"आप इस उत्पाद को कैसे रेट करेंगे?", star_label:"रेट करने के लिए स्टार पर टैप करें", name_ph:"आपका नाम (वैकल्पिक)", review_ph:"हमें बताएं कि आप क्या सोचते हैं...", submit_review:"समीक्षा भेजें", submitting:"भेज रहे हैं...", success_title:"धन्यवाद!", success_sub:"आपकी समीक्षा प्राप्त हो गई है और अनुमोदन की प्रतीक्षा में है।", review_live:"आपकी समीक्षा अब सभी के लिए दृश्यमान है। धन्यवाद!", no_reviews_yet:"अभी तक कोई समीक्षा नहीं", be_first:"समीक्षा करने वाले पहले व्यक्ति बनें!", out_of_5:"में से 5", add_photos:"फ़ोटो जोड़ें", remove:"हटाएं", load_more:"और लोड करें" },
    };
    // ─── Extended translations ────────────────────────────────────────────────
    // Merged into the base I18N above. Because t() falls back per-key to English,
    // any language missing a key degrades gracefully instead of rendering blank.
    const I18N_EXT = {
        en: { based_on_reviews:"Based on {n} reviews", see_all_reviews:"See all reviews here ↓", hide_reviews:"Hide reviews ↑", loading:"Loading...", sent:"Sent!", live_title:"You're live!", received_title:"Review received!", received_sub:"We'll share your experience with the world very soon. Thank you!", err_rating:"Please select a star rating first.", err_uploading:"Please wait — your photo is still uploading.", err_shop:"Could not detect your store. Please refresh the page and try again.", customer_photo:"Customer photo", no_photos:"No customer photos yet — be the first to share yours!", failed_photos:"Failed to load photos.", reviews_tab:"Reviews", store_reviews:"Store Reviews", product_reviews:"Product Reviews", verified_customer:"Verified Customer", no_reviews_panel:"No reviews yet.", failed_reviews:"Failed to load reviews.", powered_by:"Powered by", ai_badge:"Empire AI Analysis", ai_title:"Customer Consensus", ai_disclaimer:"Generated from the text of customer reviews", ai_no_provider:"Add an AI provider in your Empire Reviews settings to enable AI-generated summaries.", ai_pro_only:"AI summaries are available on Empire Pro. Upgrade to unlock this feature.", ai_no_reviews:"No reviews yet — be the first to share your experience with this product.", ai_no_written:"Customers have rated this product but haven't left written reviews yet. A summary will appear once written feedback comes in.", ai_fallback:"No reviews yet — summaries will appear once customers start leaving feedback." },
        es: { based_on_reviews:"Basado en {n} reseñas", see_all_reviews:"Ver todas las reseñas ↓", hide_reviews:"Ocultar reseñas ↑", loading:"Cargando...", sent:"¡Enviado!", live_title:"¡Ya está publicada!", received_title:"¡Reseña recibida!", received_sub:"Compartiremos tu experiencia con el mundo muy pronto. ¡Gracias!", err_rating:"Primero selecciona una calificación con estrellas.", err_uploading:"Espera — tu foto aún se está subiendo.", err_shop:"No se pudo detectar tu tienda. Actualiza la página e inténtalo de nuevo.", customer_photo:"Foto del cliente", no_photos:"Aún no hay fotos de clientes — ¡sé el primero en compartir la tuya!", failed_photos:"Error al cargar las fotos.", reviews_tab:"Reseñas", store_reviews:"Reseñas de la tienda", product_reviews:"Reseñas del producto", verified_customer:"Cliente verificado", no_reviews_panel:"Aún no hay reseñas.", failed_reviews:"Error al cargar las reseñas.", powered_by:"Con tecnología de", ai_badge:"Análisis de Empire AI", ai_title:"Consenso de los clientes", ai_disclaimer:"Generado a partir del texto de las reseñas de clientes", ai_no_provider:"Añade un proveedor de IA en la configuración de Empire Reviews para activar los resúmenes generados por IA.", ai_pro_only:"Los resúmenes con IA están disponibles en Empire Pro. Mejora tu plan para desbloquear esta función.", ai_no_reviews:"Aún no hay reseñas — sé el primero en compartir tu experiencia con este producto.", ai_no_written:"Los clientes han calificado este producto pero aún no han dejado reseñas escritas. El resumen aparecerá cuando lleguen comentarios escritos.", ai_fallback:"Aún no hay reseñas — los resúmenes aparecerán cuando los clientes empiecen a dejar comentarios." },
        fr: { based_on_reviews:"Basé sur {n} avis", see_all_reviews:"Voir tous les avis ↓", hide_reviews:"Masquer les avis ↑", loading:"Chargement...", sent:"Envoyé !", live_title:"C'est en ligne !", received_title:"Avis reçu !", received_sub:"Nous partagerons votre expérience avec le monde très bientôt. Merci !", err_rating:"Veuillez d'abord sélectionner une note en étoiles.", err_uploading:"Veuillez patienter — votre photo est encore en cours de téléchargement.", err_shop:"Impossible de détecter votre boutique. Actualisez la page et réessayez.", customer_photo:"Photo du client", no_photos:"Aucune photo de client pour le moment — soyez le premier à partager la vôtre !", failed_photos:"Échec du chargement des photos.", reviews_tab:"Avis", store_reviews:"Avis de la boutique", product_reviews:"Avis du produit", verified_customer:"Client vérifié", no_reviews_panel:"Pas encore d'avis.", failed_reviews:"Échec du chargement des avis.", powered_by:"Propulsé par", ai_badge:"Analyse Empire AI", ai_title:"Consensus des clients", ai_disclaimer:"Généré à partir du texte des avis clients", ai_no_provider:"Ajoutez un fournisseur d'IA dans les paramètres d'Empire Reviews pour activer les résumés générés par IA.", ai_pro_only:"Les résumés par IA sont disponibles sur Empire Pro. Passez à la version supérieure pour débloquer cette fonctionnalité.", ai_no_reviews:"Pas encore d'avis — soyez le premier à partager votre expérience avec ce produit.", ai_no_written:"Les clients ont noté ce produit mais n'ont pas encore laissé d'avis écrits. Un résumé apparaîtra dès réception de commentaires écrits.", ai_fallback:"Pas encore d'avis — les résumés apparaîtront lorsque les clients commenceront à laisser des commentaires." },
        de: { based_on_reviews:"Basierend auf {n} Bewertungen", see_all_reviews:"Alle Bewertungen ansehen ↓", hide_reviews:"Bewertungen ausblenden ↑", loading:"Lädt...", sent:"Gesendet!", live_title:"Jetzt online!", received_title:"Bewertung erhalten!", received_sub:"Wir teilen deine Erfahrung sehr bald mit der Welt. Danke!", err_rating:"Bitte wähle zuerst eine Sternebewertung.", err_uploading:"Bitte warte — dein Foto wird noch hochgeladen.", err_shop:"Dein Shop konnte nicht erkannt werden. Bitte aktualisiere die Seite und versuche es erneut.", customer_photo:"Kundenfoto", no_photos:"Noch keine Kundenfotos — sei der Erste, der seines teilt!", failed_photos:"Fotos konnten nicht geladen werden.", reviews_tab:"Bewertungen", store_reviews:"Shop-Bewertungen", product_reviews:"Produktbewertungen", verified_customer:"Verifizierter Kunde", no_reviews_panel:"Noch keine Bewertungen.", failed_reviews:"Bewertungen konnten nicht geladen werden.", powered_by:"Bereitgestellt von", ai_badge:"Empire-KI-Analyse", ai_title:"Kundenkonsens", ai_disclaimer:"Erstellt aus dem Text der Kundenbewertungen", ai_no_provider:"Füge in deinen Empire-Reviews-Einstellungen einen KI-Anbieter hinzu, um KI-generierte Zusammenfassungen zu aktivieren.", ai_pro_only:"KI-Zusammenfassungen sind in Empire Pro verfügbar. Führe ein Upgrade durch, um diese Funktion freizuschalten.", ai_no_reviews:"Noch keine Bewertungen — sei der Erste, der seine Erfahrung mit diesem Produkt teilt.", ai_no_written:"Kunden haben dieses Produkt bewertet, aber noch keine schriftlichen Bewertungen hinterlassen. Eine Zusammenfassung erscheint, sobald schriftliches Feedback vorliegt.", ai_fallback:"Noch keine Bewertungen — Zusammenfassungen erscheinen, sobald Kunden Feedback hinterlassen." },
        pt: { based_on_reviews:"Com base em {n} avaliações", see_all_reviews:"Ver todas as avaliações ↓", hide_reviews:"Ocultar avaliações ↑", loading:"Carregando...", sent:"Enviado!", live_title:"Está no ar!", received_title:"Avaliação recebida!", received_sub:"Compartilharemos sua experiência com o mundo muito em breve. Obrigado!", err_rating:"Selecione primeiro uma classificação por estrelas.", err_uploading:"Aguarde — sua foto ainda está sendo enviada.", err_shop:"Não foi possível detectar sua loja. Atualize a página e tente novamente.", customer_photo:"Foto do cliente", no_photos:"Ainda não há fotos de clientes — seja o primeiro a compartilhar a sua!", failed_photos:"Falha ao carregar as fotos.", reviews_tab:"Avaliações", store_reviews:"Avaliações da loja", product_reviews:"Avaliações do produto", verified_customer:"Cliente verificado", no_reviews_panel:"Ainda sem avaliações.", failed_reviews:"Falha ao carregar as avaliações.", powered_by:"Desenvolvido por", ai_badge:"Análise Empire AI", ai_title:"Consenso dos clientes", ai_disclaimer:"Gerado a partir do texto das avaliações dos clientes", ai_no_provider:"Adicione um provedor de IA nas configurações do Empire Reviews para ativar resumos gerados por IA.", ai_pro_only:"Os resumos com IA estão disponíveis no Empire Pro. Faça upgrade para desbloquear este recurso.", ai_no_reviews:"Ainda não há avaliações — seja o primeiro a compartilhar sua experiência com este produto.", ai_no_written:"Os clientes avaliaram este produto, mas ainda não deixaram avaliações escritas. Um resumo aparecerá quando houver comentários escritos.", ai_fallback:"Ainda não há avaliações — os resumos aparecerão quando os clientes começarem a deixar comentários." },
        it: { based_on_reviews:"Basato su {n} recensioni", see_all_reviews:"Vedi tutte le recensioni ↓", hide_reviews:"Nascondi recensioni ↑", loading:"Caricamento...", sent:"Inviato!", live_title:"Sei online!", received_title:"Recensione ricevuta!", received_sub:"Condivideremo la tua esperienza con il mondo molto presto. Grazie!", err_rating:"Seleziona prima una valutazione a stelle.", err_uploading:"Attendi — la tua foto è ancora in caricamento.", err_shop:"Impossibile rilevare il tuo negozio. Aggiorna la pagina e riprova.", customer_photo:"Foto del cliente", no_photos:"Ancora nessuna foto dei clienti — sii il primo a condividere la tua!", failed_photos:"Impossibile caricare le foto.", reviews_tab:"Recensioni", store_reviews:"Recensioni del negozio", product_reviews:"Recensioni del prodotto", verified_customer:"Cliente verificato", no_reviews_panel:"Ancora nessuna recensione.", failed_reviews:"Impossibile caricare le recensioni.", powered_by:"Realizzato con", ai_badge:"Analisi Empire AI", ai_title:"Consenso dei clienti", ai_disclaimer:"Generato dal testo delle recensioni dei clienti", ai_no_provider:"Aggiungi un provider di IA nelle impostazioni di Empire Reviews per abilitare i riepiloghi generati dall'IA.", ai_pro_only:"I riepiloghi con IA sono disponibili su Empire Pro. Esegui l'upgrade per sbloccare questa funzione.", ai_no_reviews:"Ancora nessuna recensione — sii il primo a condividere la tua esperienza con questo prodotto.", ai_no_written:"I clienti hanno valutato questo prodotto ma non hanno ancora lasciato recensioni scritte. Un riepilogo apparirà quando arriveranno commenti scritti.", ai_fallback:"Ancora nessuna recensione — i riepiloghi appariranno quando i clienti inizieranno a lasciare commenti." },
        nl: { based_on_reviews:"Gebaseerd op {n} reviews", see_all_reviews:"Bekijk alle reviews ↓", hide_reviews:"Reviews verbergen ↑", loading:"Laden...", sent:"Verzonden!", live_title:"Je staat live!", received_title:"Review ontvangen!", received_sub:"We delen jouw ervaring heel binnenkort met de wereld. Bedankt!", err_rating:"Selecteer eerst een sterbeoordeling.", err_uploading:"Even geduld — je foto wordt nog geüpload.", err_shop:"Je winkel kon niet worden gedetecteerd. Vernieuw de pagina en probeer het opnieuw.", customer_photo:"Klantfoto", no_photos:"Nog geen klantfoto's — wees de eerste die de jouwe deelt!", failed_photos:"Foto's laden mislukt.", reviews_tab:"Reviews", store_reviews:"Winkelreviews", product_reviews:"Productreviews", verified_customer:"Geverifieerde klant", no_reviews_panel:"Nog geen reviews.", failed_reviews:"Reviews laden mislukt.", powered_by:"Mogelijk gemaakt door", ai_badge:"Empire AI-analyse", ai_title:"Klantconsensus", ai_disclaimer:"Gegenereerd op basis van de tekst van klantreviews", ai_no_provider:"Voeg een AI-provider toe in je Empire Reviews-instellingen om AI-gegenereerde samenvattingen in te schakelen.", ai_pro_only:"AI-samenvattingen zijn beschikbaar in Empire Pro. Upgrade om deze functie te ontgrendelen.", ai_no_reviews:"Nog geen reviews — wees de eerste die zijn ervaring met dit product deelt.", ai_no_written:"Klanten hebben dit product beoordeeld maar nog geen geschreven reviews achtergelaten. Een samenvatting verschijnt zodra er geschreven feedback is.", ai_fallback:"Nog geen reviews — samenvattingen verschijnen zodra klanten feedback achterlaten." },
        sv: { based_on_reviews:"Baserat på {n} recensioner", see_all_reviews:"Se alla recensioner ↓", hide_reviews:"Dölj recensioner ↑", loading:"Laddar...", sent:"Skickat!", live_title:"Du är live!", received_title:"Recension mottagen!", received_sub:"Vi delar din upplevelse med världen mycket snart. Tack!", err_rating:"Välj först ett stjärnbetyg.", err_uploading:"Vänta — ditt foto laddas fortfarande upp.", err_shop:"Din butik kunde inte identifieras. Uppdatera sidan och försök igen.", customer_photo:"Kundfoto", no_photos:"Inga kundfoton ännu — var först med att dela ditt!", failed_photos:"Det gick inte att ladda foton.", reviews_tab:"Recensioner", store_reviews:"Butiksrecensioner", product_reviews:"Produktrecensioner", verified_customer:"Verifierad kund", no_reviews_panel:"Inga recensioner ännu.", failed_reviews:"Det gick inte att ladda recensioner.", powered_by:"Drivs av", ai_badge:"Empire AI-analys", ai_title:"Kundkonsensus", ai_disclaimer:"Genererat från texten i kundrecensioner", ai_no_provider:"Lägg till en AI-leverantör i dina Empire Reviews-inställningar för att aktivera AI-genererade sammanfattningar.", ai_pro_only:"AI-sammanfattningar är tillgängliga i Empire Pro. Uppgradera för att låsa upp den här funktionen.", ai_no_reviews:"Inga recensioner ännu — var först med att dela din upplevelse av denna produkt.", ai_no_written:"Kunder har betygsatt denna produkt men har inte lämnat skriftliga recensioner ännu. En sammanfattning visas när skriftlig feedback kommer in.", ai_fallback:"Inga recensioner ännu — sammanfattningar visas när kunder börjar lämna feedback." },
        pl: { based_on_reviews:"Na podstawie {n} recenzji", see_all_reviews:"Zobacz wszystkie recenzje ↓", hide_reviews:"Ukryj recenzje ↑", loading:"Ładowanie...", sent:"Wysłano!", live_title:"Jesteś na żywo!", received_title:"Recenzja otrzymana!", received_sub:"Już wkrótce podzielimy się Twoim doświadczeniem ze światem. Dziękujemy!", err_rating:"Najpierw wybierz ocenę w gwiazdkach.", err_uploading:"Poczekaj — Twoje zdjęcie jest jeszcze przesyłane.", err_shop:"Nie udało się wykryć Twojego sklepu. Odśwież stronę i spróbuj ponownie.", customer_photo:"Zdjęcie klienta", no_photos:"Brak zdjęć klientów — bądź pierwszym, który udostępni swoje!", failed_photos:"Nie udało się załadować zdjęć.", reviews_tab:"Recenzje", store_reviews:"Recenzje sklepu", product_reviews:"Recenzje produktu", verified_customer:"Zweryfikowany klient", no_reviews_panel:"Brak recenzji.", failed_reviews:"Nie udało się załadować recenzji.", powered_by:"Obsługiwane przez", ai_badge:"Analiza Empire AI", ai_title:"Konsensus klientów", ai_disclaimer:"Wygenerowano na podstawie treści recenzji klientów", ai_no_provider:"Dodaj dostawcę AI w ustawieniach Empire Reviews, aby włączyć podsumowania generowane przez AI.", ai_pro_only:"Podsumowania AI są dostępne w Empire Pro. Ulepsz plan, aby odblokować tę funkcję.", ai_no_reviews:"Brak recenzji — bądź pierwszym, który podzieli się swoim doświadczeniem z tym produktem.", ai_no_written:"Klienci ocenili ten produkt, ale nie zostawili jeszcze pisemnych recenzji. Podsumowanie pojawi się, gdy napłyną pisemne opinie.", ai_fallback:"Brak recenzji — podsumowania pojawią się, gdy klienci zaczną zostawiać opinie." },
        tr: { based_on_reviews:"{n} değerlendirmeye göre", see_all_reviews:"Tüm yorumları gör ↓", hide_reviews:"Yorumları gizle ↑", loading:"Yükleniyor...", sent:"Gönderildi!", live_title:"Yayında!", received_title:"Yorum alındı!", received_sub:"Deneyiminizi çok yakında dünyayla paylaşacağız. Teşekkürler!", err_rating:"Lütfen önce bir yıldız puanı seçin.", err_uploading:"Lütfen bekleyin — fotoğrafınız hâlâ yükleniyor.", err_shop:"Mağazanız algılanamadı. Lütfen sayfayı yenileyip tekrar deneyin.", customer_photo:"Müşteri fotoğrafı", no_photos:"Henüz müşteri fotoğrafı yok — kendinizinkini ilk paylaşan siz olun!", failed_photos:"Fotoğraflar yüklenemedi.", reviews_tab:"Yorumlar", store_reviews:"Mağaza Yorumları", product_reviews:"Ürün Yorumları", verified_customer:"Doğrulanmış Müşteri", no_reviews_panel:"Henüz yorum yok.", failed_reviews:"Yorumlar yüklenemedi.", powered_by:"Destekleyen", ai_badge:"Empire AI Analizi", ai_title:"Müşteri Uzlaşısı", ai_disclaimer:"Müşteri yorumlarının metninden oluşturuldu", ai_no_provider:"Yapay zeka tarafından oluşturulan özetleri etkinleştirmek için Empire Reviews ayarlarınıza bir yapay zeka sağlayıcısı ekleyin.", ai_pro_only:"Yapay zeka özetleri Empire Pro'da mevcuttur. Bu özelliği açmak için yükseltin.", ai_no_reviews:"Henüz yorum yok — bu ürünle ilgili deneyiminizi ilk paylaşan siz olun.", ai_no_written:"Müşteriler bu ürünü puanladı ancak henüz yazılı yorum bırakmadı. Yazılı geri bildirim geldiğinde bir özet görünecektir.", ai_fallback:"Henüz yorum yok — müşteriler geri bildirim bırakmaya başladığında özetler görünecektir." },
        ru: { based_on_reviews:"На основе {n} отзывов", see_all_reviews:"Смотреть все отзывы ↓", hide_reviews:"Скрыть отзывы ↑", loading:"Загрузка...", sent:"Отправлено!", live_title:"Опубликовано!", received_title:"Отзыв получен!", received_sub:"Мы очень скоро поделимся вашим опытом со всем миром. Спасибо!", err_rating:"Сначала выберите оценку в звёздах.", err_uploading:"Подождите — ваше фото ещё загружается.", err_shop:"Не удалось определить ваш магазин. Обновите страницу и попробуйте снова.", customer_photo:"Фото покупателя", no_photos:"Пока нет фото от покупателей — поделитесь своим первым!", failed_photos:"Не удалось загрузить фото.", reviews_tab:"Отзывы", store_reviews:"Отзывы о магазине", product_reviews:"Отзывы о товаре", verified_customer:"Проверенный покупатель", no_reviews_panel:"Пока нет отзывов.", failed_reviews:"Не удалось загрузить отзывы.", powered_by:"Работает на", ai_badge:"Анализ Empire AI", ai_title:"Мнение покупателей", ai_disclaimer:"Сформировано на основе текста отзывов покупателей", ai_no_provider:"Добавьте поставщика ИИ в настройках Empire Reviews, чтобы включить сводки, созданные ИИ.", ai_pro_only:"Сводки ИИ доступны в Empire Pro. Перейдите на лучший план, чтобы разблокировать эту функцию.", ai_no_reviews:"Пока нет отзывов — поделитесь своим опытом об этом товаре первым.", ai_no_written:"Покупатели оценили этот товар, но пока не оставили письменных отзывов. Сводка появится, когда поступят письменные отзывы.", ai_fallback:"Пока нет отзывов — сводки появятся, когда покупатели начнут оставлять отзывы." },
        ja: { based_on_reviews:"{n}件のレビューに基づく", see_all_reviews:"すべてのレビューを見る ↓", hide_reviews:"レビューを隠す ↑", loading:"読み込み中...", sent:"送信しました！", live_title:"公開されました！", received_title:"レビューを受け付けました！", received_sub:"まもなくあなたの体験を世界に共有します。ありがとうございます！", err_rating:"まず星評価を選択してください。", err_uploading:"お待ちください — 写真をまだアップロード中です。", err_shop:"ストアを検出できませんでした。ページを更新してもう一度お試しください。", customer_photo:"お客様の写真", no_photos:"まだお客様の写真がありません — 最初に共有しましょう！", failed_photos:"写真を読み込めませんでした。", reviews_tab:"レビュー", store_reviews:"ストアのレビュー", product_reviews:"商品のレビュー", verified_customer:"認証済みのお客様", no_reviews_panel:"まだレビューがありません。", failed_reviews:"レビューを読み込めませんでした。", powered_by:"提供", ai_badge:"Empire AI 分析", ai_title:"お客様の総意", ai_disclaimer:"お客様のレビュー文から生成されました", ai_no_provider:"AIによる要約を有効にするには、Empire Reviewsの設定でAIプロバイダーを追加してください。", ai_pro_only:"AI要約はEmpire Proでご利用いただけます。アップグレードしてこの機能をご利用ください。", ai_no_reviews:"まだレビューがありません — この商品の体験を最初に共有しましょう。", ai_no_written:"お客様はこの商品を評価していますが、まだ文章でのレビューはありません。文章のフィードバックが届くと要約が表示されます。", ai_fallback:"まだレビューがありません — お客様がフィードバックを残し始めると要約が表示されます。" },
        zh: { based_on_reviews:"基于 {n} 条评价", see_all_reviews:"查看所有评价 ↓", hide_reviews:"隐藏评价 ↑", loading:"加载中...", sent:"已发送！", live_title:"已发布！", received_title:"已收到评价！", received_sub:"我们很快就会向全世界分享您的体验。谢谢！", err_rating:"请先选择星级评分。", err_uploading:"请稍候 — 您的照片仍在上传中。", err_shop:"无法识别您的店铺。请刷新页面后重试。", customer_photo:"顾客照片", no_photos:"暂无顾客照片 — 成为第一个分享的人！", failed_photos:"加载照片失败。", reviews_tab:"评价", store_reviews:"店铺评价", product_reviews:"商品评价", verified_customer:"已验证顾客", no_reviews_panel:"暂无评价。", failed_reviews:"加载评价失败。", powered_by:"技术支持", ai_badge:"Empire AI 分析", ai_title:"顾客共识", ai_disclaimer:"根据顾客评价内容生成", ai_no_provider:"在您的 Empire Reviews 设置中添加 AI 提供商以启用 AI 生成的摘要。", ai_pro_only:"AI 摘要在 Empire Pro 中提供。升级以解锁此功能。", ai_no_reviews:"暂无评价 — 成为第一个分享此商品体验的人。", ai_no_written:"顾客已对此商品评分，但尚未留下文字评价。收到文字反馈后将显示摘要。", ai_fallback:"暂无评价 — 当顾客开始留下反馈时将显示摘要。" },
        ar: { based_on_reviews:"بناءً على {n} مراجعة", see_all_reviews:"عرض جميع المراجعات ↓", hide_reviews:"إخفاء المراجعات ↑", loading:"جارٍ التحميل...", sent:"تم الإرسال!", live_title:"أصبحت منشورة!", received_title:"تم استلام المراجعة!", received_sub:"سنشارك تجربتك مع العالم قريبًا جدًا. شكرًا لك!", err_rating:"يرجى اختيار تقييم بالنجوم أولاً.", err_uploading:"يرجى الانتظار — لا تزال صورتك قيد التحميل.", err_shop:"تعذّر التعرف على متجرك. يرجى تحديث الصفحة والمحاولة مرة أخرى.", customer_photo:"صورة العميل", no_photos:"لا توجد صور للعملاء بعد — كن أول من يشارك صورته!", failed_photos:"فشل تحميل الصور.", reviews_tab:"المراجعات", store_reviews:"مراجعات المتجر", product_reviews:"مراجعات المنتج", verified_customer:"عميل موثّق", no_reviews_panel:"لا توجد مراجعات بعد.", failed_reviews:"فشل تحميل المراجعات.", powered_by:"مدعوم من", ai_badge:"تحليل Empire AI", ai_title:"إجماع العملاء", ai_disclaimer:"تم إنشاؤه من نص مراجعات العملاء", ai_no_provider:"أضف مزوّد ذكاء اصطناعي في إعدادات Empire Reviews لتفعيل الملخصات المُنشأة بالذكاء الاصطناعي.", ai_pro_only:"ملخصات الذكاء الاصطناعي متوفرة في Empire Pro. قم بالترقية لفتح هذه الميزة.", ai_no_reviews:"لا توجد مراجعات بعد — كن أول من يشارك تجربته مع هذا المنتج.", ai_no_written:"قام العملاء بتقييم هذا المنتج لكن لم يتركوا مراجعات مكتوبة بعد. سيظهر الملخص عند ورود تعليقات مكتوبة.", ai_fallback:"لا توجد مراجعات بعد — ستظهر الملخصات عندما يبدأ العملاء في ترك تعليقات." },
        hi: { based_on_reviews:"{n} समीक्षाओं के आधार पर", see_all_reviews:"सभी समीक्षाएं देखें ↓", hide_reviews:"समीक्षाएं छिपाएं ↑", loading:"लोड हो रहा है...", sent:"भेज दिया!", live_title:"अब लाइव है!", received_title:"समीक्षा प्राप्त हुई!", received_sub:"हम बहुत जल्द आपका अनुभव दुनिया के साथ साझा करेंगे। धन्यवाद!", err_rating:"कृपया पहले एक स्टार रेटिंग चुनें।", err_uploading:"कृपया प्रतीक्षा करें — आपकी फ़ोटो अभी भी अपलोड हो रही है।", err_shop:"आपकी स्टोर का पता नहीं चल सका। कृपया पेज रिफ़्रेश करें और पुनः प्रयास करें।", customer_photo:"ग्राहक की फ़ोटो", no_photos:"अभी तक कोई ग्राहक फ़ोटो नहीं — अपनी फ़ोटो साझा करने वाले पहले व्यक्ति बनें!", failed_photos:"फ़ोटो लोड करने में विफल।", reviews_tab:"समीक्षाएं", store_reviews:"स्टोर समीक्षाएं", product_reviews:"उत्पाद समीक्षाएं", verified_customer:"सत्यापित ग्राहक", no_reviews_panel:"अभी तक कोई समीक्षा नहीं।", failed_reviews:"समीक्षाएं लोड करने में विफल।", powered_by:"द्वारा संचालित", ai_badge:"Empire AI विश्लेषण", ai_title:"ग्राहक सहमति", ai_disclaimer:"ग्राहक समीक्षाओं के टेक्स्ट से तैयार किया गया", ai_no_provider:"AI-जनित सारांश सक्षम करने के लिए अपनी Empire Reviews सेटिंग्स में एक AI प्रदाता जोड़ें।", ai_pro_only:"AI सारांश Empire Pro में उपलब्ध हैं। इस सुविधा को अनलॉक करने के लिए अपग्रेड करें।", ai_no_reviews:"अभी तक कोई समीक्षा नहीं — इस उत्पाद के साथ अपना अनुभव साझा करने वाले पहले व्यक्ति बनें।", ai_no_written:"ग्राहकों ने इस उत्पाद को रेट किया है लेकिन अभी तक लिखित समीक्षाएं नहीं छोड़ी हैं। लिखित प्रतिक्रिया आने पर एक सारांश दिखाई देगा।", ai_fallback:"अभी तक कोई समीक्षा नहीं — जब ग्राहक प्रतिक्रिया छोड़ना शुरू करेंगे तो सारांश दिखाई देंगे।" },
    };
    Object.keys(I18N_EXT).forEach(function (l) {
        if (I18N[l]) Object.assign(I18N[l], I18N_EXT[l]);
    });
    // Translate + substitute {placeholders}: tf("based_on_reviews", { n: 5 })
    function tf(key, vars) {
        var s = t(key);
        if (vars) { for (var k in vars) { s = s.split('{' + k + '}').join(vars[k]); } }
        return s;
    }
    function setLang(lang) {
        if (lang && I18N[lang]) { currentLang = lang; return; }
        // Fallback: try the base of a regional Shopify locale (e.g. "fr-CA" → "fr")
        const base = (lang || "").split("-")[0];
        if (base && I18N[base]) currentLang = base;
    }
    function t(key) {
        const table = I18N[currentLang] || I18N.en;
        return table[key] || I18N.en[key] || key;
    }
    // Translate all server-rendered (Liquid) text that carries a data-empire-i18n
    // attribute for textContent, or data-empire-i18n-ph for a placeholder. This is
    // what makes the "Write a Review" button + the whole review modal translate.
    function applyI18n() {
        try {
            document.querySelectorAll('[data-empire-i18n]').forEach(function (el) {
                var v = t(el.getAttribute('data-empire-i18n'));
                if (v) el.textContent = v;
            });
            document.querySelectorAll('[data-empire-i18n-ph]').forEach(function (el) {
                var v = t(el.getAttribute('data-empire-i18n-ph'));
                if (v) el.setAttribute('placeholder', v);
            });
        } catch (e) { /* never break the page over a translation */ }
    }
    // Resolve the merchant's configured language once on load (from the reviews API
    // → Settings.language) and apply it to the static Liquid UI. Falls back to the
    // Shopify storefront locale, then English.
    let languageResolved = false;
    function resolveLanguageAndApply() {
        if (languageResolved) { applyI18n(); return; }
        languageResolved = true;
        var shop = resolveShop();
        var applyLocaleFallback = function () {
            if (window.Shopify && window.Shopify.locale) setLang(window.Shopify.locale);
            applyI18n();
        };
        if (!shop) { applyLocaleFallback(); return; }
        fetch(API_BASE + '/api/reviews?shop=' + encodeURIComponent(shop) + '&limit=1')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d && d.settings && d.settings.language) { setLang(d.settings.language); applyI18n(); }
                else applyLocaleFallback();
            })
            .catch(applyLocaleFallback);
    }

    // Always returns the best available shop domain. Tries in order:
    // 1. Value captured when the modal was opened (set from data-shop-domain attr)
    // 2. Shopify's own global (always present on live storefronts)
    // 3. Injected by review-list.liquid at page load
    function resolveShop() {
        return activeShopDomain
            || (window.Shopify && window.Shopify.shop)
            || window.EmpireShopDomain
            || '';
    }

    // Cached product id for the current page once resolved (sync or async).
    let pageProductId = '';

    // Resolve a product's numeric id synchronously. The Liquid `data-product-id`
    // attribute can render empty when the block isn't inside a product-section
    // context, which would make the API fall back to SHOP-WIDE stats. Fall back
    // to Shopify's storefront product meta, then to a cached async lookup.
    function resolveProductId(el) {
        let pid = el && el.getAttribute('data-product-id');
        if (pid) pid = pid.trim();
        if (pid && pid !== '' && pid.indexOf('{{') === -1) return pid;
        try {
            if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
                return String(window.ShopifyAnalytics.meta.product.id);
            }
            if (window.meta && window.meta.product && window.meta.product.id) {
                return String(window.meta.product.id);
            }
        } catch (e) {}
        return pageProductId || '';
    }

    // Bulletproof last resort: on any product URL, ask Shopify's storefront
    // product JSON endpoint for the numeric id. Works regardless of theme,
    // Liquid context, or analytics globals. Caches the result for the page.
    async function resolveProductIdFromUrl() {
        if (pageProductId) return pageProductId;
        try {
            const m = window.location.pathname.match(/\/products\/([^/?#]+)/);
            if (!m) return '';
            const res = await fetch('/products/' + m[1] + '.js', { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return '';
            const p = await res.json();
            if (p && p.id) { pageProductId = String(p.id); return pageProductId; }
        } catch (e) {}
        return '';
    }

    const API = {
        init() {
            // Resolve + apply the merchant's language to the static Liquid UI
            // (Write a Review button, review modal) as early as possible.
            resolveLanguageAndApply();
            setTimeout(() => {
                this.renderStarRatings();
                this.renderReviewLists();
                this.renderReviewCarousels();
                this.renderPhotoGalleries();
            }, 100);
        },

        openReviewModal(triggerElement) {
            activeProductId = resolveProductId(triggerElement);
            activeShopDomain = triggerElement.getAttribute('data-shop-domain')
                || (window.Shopify && window.Shopify.shop)
                || window.EmpireShopDomain
                || null;
            currentRatingSelected = 0;
            pendingUploads = 0;

            document.querySelectorAll('.empire-pick-star').forEach(el => {
                el.classList.remove('selected', 'hover-active', 'active');
                el.style.color = '#e2e8f0';
            });

            const nameInput = document.getElementById('empire-input-name');
            const bodyInput = document.getElementById('empire-input-body');
            if (nameInput) nameInput.value = '';
            if (bodyInput) bodyInput.value = '';

            const formFields = document.getElementById('empire-review-fields');
            if (formFields) {
                formFields.style.display = 'none';
                formFields.classList.remove('visible');
            }

            const submitBtn = document.getElementById('empire-submit-btn');
            if (submitBtn) submitBtn.classList.remove('empire-btn-ready');

            const overlay = document.getElementById('empire-modal-overlay');
            if (overlay) overlay.classList.add('open', 'active');

            const filePreview = document.getElementById('empire-file-preview');
            if (filePreview) filePreview.innerHTML = '';
            
            const successMsg = document.getElementById('empire-modal-success');
            if (successMsg) successMsg.style.display = 'none';

            // Photo Uploader Injection (PRO Feature)
            const uploadContainer = document.getElementById('empire-photo-upload-container');
            if (uploadContainer) {
                uploadContainer.innerHTML = ''; // reset
                // Only render if PRO feature is unlocked by the backend
                if (window.EmpireFeatures && window.EmpireFeatures.allowPhotoUploads === true) {
                    // Hybrid: photos on every plan; video only when the backend unlocks it (Pro).
                    var allowVideo = window.EmpireFeatures.allowVideoUploads === true;
                    var acceptTypes = allowVideo
                        ? "image/png, image/jpeg, image/webp, video/mp4, video/quicktime, video/webm"
                        : "image/png, image/jpeg, image/webp";
                    var helperText = allowVideo ? "Photos & video • up to 4 files" : "Max 4 photos, 10MB each";
                    uploadContainer.innerHTML = `
                        <div class="empire-photo-dropzone" id="empire-photo-dropzone">
                            <div class="empire-dropzone-clicker" id="empire-dropzone-clicker">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                <div style="font-size:0.95rem; font-weight:700; color:#6d28d9;">Add Photos${allowVideo ? ' or Video' : ''}</div>
                                <div style="font-size:0.78rem; color:#a78bfa; margin-top:1px;">${helperText}</div>
                            </div>
                            <div class="empire-photo-previews" id="empire-photo-previews"></div>
                            <input type="file" id="empire-photo-input" accept="${acceptTypes}" multiple style="display:none;" />
                        </div>
                    `;
                    this.initPhotoUploader();
                }
            }
        },

        closeModal(event) {
            if (event && event.target !== document.getElementById('empire-modal-overlay') && !event.target.classList.contains('empire-modal-close')) {
                return;
            }
            const overlay = document.getElementById('empire-modal-overlay');
            if (overlay) overlay.classList.remove('open', 'active');
        },

        setRating(rating) {
            currentRatingSelected = rating;
            document.querySelectorAll('.empire-pick-star').forEach((el, index) => {
                const isActive = index < rating;
                el.classList.toggle('active', isActive);
                el.style.color = isActive ? '#f59e0b' : '#e2e8f0';
            });

            const formFields = document.getElementById('empire-review-fields');
            if (formFields) {
                formFields.style.display = 'flex';
                setTimeout(() => { formFields.classList.add('visible'); }, 20);
            }

            const submitBtn = document.getElementById('empire-submit-btn');
            if (submitBtn) submitBtn.classList.add('empire-btn-ready');
        },

        selectStar(rating) {
            this.setRating(rating);
        },

        async submitReview(event) {
            if (event && event.preventDefault) event.preventDefault();

            const showError = (msg) => {
                let errEl = document.getElementById('empire-form-error');
                if (!errEl) {
                    errEl = document.createElement('div');
                    errEl.id = 'empire-form-error';
                    errEl.style.color = '#ef4444';
                    errEl.style.fontSize = '0.85rem';
                    errEl.style.marginBottom = '12px';
                    errEl.style.textAlign = 'center';
                    errEl.style.background = 'rgba(239, 68, 68, 0.1)';
                    errEl.style.padding = '8px';
                    errEl.style.borderRadius = '6px';
                    const btn = document.getElementById('empire-submit-btn');
                    if (btn && btn.parentNode) btn.parentNode.insertBefore(errEl, btn);
                }
                errEl.innerText = msg;
                errEl.style.display = 'block';
            };

            const hideError = () => {
                const errEl = document.getElementById('empire-form-error');
                if (errEl) errEl.style.display = 'none';
            };

            hideError();

            if (currentRatingSelected === 0) {
                showError(t("err_rating"));
                return;
            }

            if (pendingUploads > 0) {
                showError(t("err_uploading"));
                return;
            }

            const submitBtn = document.getElementById('empire-submit-btn');
            if (!submitBtn) return;

            const shop = resolveShop();
            if (!shop) {
                showError(t("err_shop"));
                return;
            }

            const originalText = submitBtn.innerText;
            submitBtn.innerText = t("submitting");
            submitBtn.disabled = true;

            try {
                const formData = new FormData();
                const nameInput = document.getElementById('empire-input-name');
                const bodyInput = document.getElementById('empire-input-body');

                formData.append('productId', activeProductId || '');
                formData.append('shop', shop);
                formData.append('rating', currentRatingSelected.toString());

                if (nameInput && nameInput.value) formData.append('author', nameInput.value);
                if (bodyInput && bodyInput.value) formData.append('body', bodyInput.value);

                if (window.EmpireUploadedPhotos && window.EmpireUploadedPhotos.length > 0) {
                    formData.append('media_urls', JSON.stringify(window.EmpireUploadedPhotos));
                }

                const response = await fetch(`${API_BASE}/api/reviews?shop=${encodeURIComponent(shop)}`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const resData = await response.json().catch(() => ({}));
                    const isLive = resData.review?.status === 'approved';

                    submitBtn.innerText = t("sent");
                    const formFields = document.getElementById('empire-review-fields');
                    const label = document.getElementById('empire-star-label');
                    const picker = document.getElementById('empire-star-picker');
                    const successMsg = document.getElementById('empire-modal-success');
                    const modalIcon = document.getElementById('empire-modal-icon-el');
                    const modalTitle = document.getElementById('empire-modal-title-el');
                    const modalSub = document.getElementById('empire-modal-sub-el');

                    if (formFields) formFields.style.display = 'none';
                    if (label) label.style.display = 'none';
                    if (picker) picker.style.display = 'none';

                    if (successMsg) {
                        successMsg.innerHTML = isLive
                            ? `<div class="empire-success-burst">🌟</div>
                               <h3 class="empire-success-title">${t("live_title")}</h3>
                               <p class="empire-success-sub">${t("review_live")} 💜</p>`
                            : `<div class="empire-success-burst">🎉</div>
                               <h3 class="empire-success-title">${t("received_title")}</h3>
                               <p class="empire-success-sub">${t("received_sub")} 💜</p>`;
                        successMsg.style.display = 'flex';
                    }

                    // Dim the header so success state feels full-screen
                    if (modalIcon) modalIcon.style.opacity = '0';
                    if (modalTitle) modalTitle.style.opacity = '0';
                    if (modalSub) modalSub.style.opacity = '0';

                    setTimeout(() => {
                        this.closeModal();
                        submitBtn.innerText = originalText;
                        submitBtn.disabled = false;
                        if (label) label.style.display = 'block';
                        if (picker) picker.style.display = 'flex';
                        if (modalIcon) modalIcon.style.opacity = '1';
                        if (modalTitle) modalTitle.style.opacity = '1';
                        if (modalSub) modalSub.style.opacity = '1';
                        if (successMsg) successMsg.style.display = 'none';
                    }, 3000);
                } else {
                    const resData = await response.json().catch(() => ({}));
                    throw new Error(resData.error || "Server error");
                }
            } catch (error) {
                showError(error.message || "Failed to submit review. Please try again.");
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            }
        },

        initPhotoUploader() {
            const dropzone = document.getElementById('empire-photo-dropzone');
            const fileInput = document.getElementById('empire-photo-input');
            const previewsContainer = document.getElementById('empire-photo-previews');
            const clicker = document.getElementById('empire-dropzone-clicker');
            
            if (!dropzone || !fileInput) return;

            window.EmpireUploadedPhotos = []; 

            // Only trigger file select if clicking the left side clicker (or empty zone)
            clicker.addEventListener('click', () => fileInput.click());
            dropzone.addEventListener('click', (e) => {
                if (e.target === dropzone) fileInput.click();
            });
            
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            dropzone.addEventListener('dragover', () => dropzone.classList.add('drag-active'));
            dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
            dropzone.addEventListener('drop', (e) => {
                dropzone.classList.remove('drag-active');
                if (e.dataTransfer.files) this.handleFilesUpload(e.dataTransfer.files, previewsContainer);
            });

            const self = this;
            fileInput.addEventListener('change', function() {
                if (this.files) self.handleFilesUpload(this.files, previewsContainer);
                this.value = ''; // reset so same file can be selected again if removed
            });
        },

        async handleFilesUpload(files, previewsContainer) {
            // Updated to max 4 photos to match reference mockup
            const fileArray = Array.from(files).slice(0, 4 - window.EmpireUploadedPhotos.length);
            if (fileArray.length === 0) return;

            for (let file of fileArray) {
                // Instantly generate a temporary local URL for immediate visual feedback
                const localUrl = URL.createObjectURL(file);
                const isVideoFile = file.type.startsWith('video/');

                const prev = document.createElement('div');
                prev.className = 'empire-photo-preview-item';
                const previewMediaTag = isVideoFile
                    ? `<video src="${localUrl}" class="empire-photo-preview-img" muted playsinline style="opacity:0.5; object-fit:cover; width:100%; height:100%;"></video>`
                    : `<img src="${localUrl}" class="empire-photo-preview-img" style="opacity: 0.5;" />`;
                prev.innerHTML = `
                    <div class="empire-uploading-shimmer" style="position: absolute; inset:0; background: rgba(255,255,255,0.5); display: flex; align-items:center; justify-content:center;"><div class="empire-spinner" style="width:16px; height:16px; border-width:2px;"></div></div>
                    ${previewMediaTag}
                    <button class="empire-photo-remove" disabled>✕</button>
                `;
                previewsContainer.appendChild(prev);

                pendingUploads++;
                try {
                    const shopForUpload = resolveShop();
                    if (!shopForUpload) throw new Error("Store not detected — please refresh the page.");

                    // 1. Ask our server for a short-lived signed upload signature.
                    const signRes = await fetch(`${API_BASE}/api/upload-sign?shop=${encodeURIComponent(shopForUpload)}${isVideoFile ? '&type=video' : ''}`, {
                        method: 'POST',
                    });
                    const sign = await signRes.json();
                    if (!signRes.ok) throw new Error(sign.error || "Upload not permitted");

                    // 2. Upload directly to Cloudinary using the signed params.
                    const uploadData = new FormData();
                    uploadData.append('file', file);
                    uploadData.append('api_key', sign.apiKey);
                    uploadData.append('timestamp', String(sign.timestamp));
                    uploadData.append('signature', sign.signature);
                    uploadData.append('folder', sign.folder);

                    const response = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/${isVideoFile ? 'video' : 'image'}/upload`, {
                        method: 'POST',
                        body: uploadData
                    });

                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error?.message || "Cloudinary upload failed");

                    if (data.secure_url) {
                        const secureUrl = data.secure_url;
                        window.EmpireUploadedPhotos.push(secureUrl);

                        // Update UI to success state
                        const shimmer = prev.querySelector('.empire-uploading-shimmer');
                        if (shimmer) shimmer.style.display = 'none';
                        const mediaEl = prev.querySelector('img, video');
                        if (mediaEl) mediaEl.style.opacity = '1';

                        const rmBtn = prev.querySelector('.empire-photo-remove');
                        if (rmBtn) {
                            rmBtn.disabled = false;
                            rmBtn.onclick = function() {
                                EmpireWidgets.removePhoto(secureUrl, prev);
                            };
                        }
                    }
                } catch (err) {
                    console.error("Upload failed:", err);
                    // Show the real error message persistently so the user knows
                    // the photo was NOT attached. They can remove it and try again.
                    prev.innerHTML = `
                        <div style="font-size:10px; color:#ef4444; background:#fef2f2; border:1px solid #fca5a5; padding:6px; text-align:center; position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:4px;">
                            <div style="font-weight:600; margin-bottom:2px;">Upload failed</div>
                            <div style="opacity:0.8;">${(err.message || 'Try again').substring(0, 60)}</div>
                            <button onclick="this.closest('.empire-photo-preview-item').remove(); window.EmpireUploadedPhotos = (window.EmpireUploadedPhotos||[]);" style="margin-top:4px; font-size:10px; cursor:pointer; background:none; border:1px solid #ef4444; color:#ef4444; border-radius:3px; padding:2px 6px;">${t("remove")}</button>
                        </div>`;
                } finally {
                    pendingUploads = Math.max(0, pendingUploads - 1);
                }
            }
        },

        removePhoto(url, element) {
            window.EmpireUploadedPhotos = window.EmpireUploadedPhotos.filter(u => u !== url);
            if (element) element.remove();
        },

        escapeHtml(unsanitized) {
            if (!unsanitized) return "";
            // Escape for both text and double-quoted attribute contexts.
            // The textContent trick only covers < > & — we must also escape
            // " and ' so values interpolated into quoted attributes (e.g.
            // data-name, alt, aria-label in the photo gallery) cannot break out.
            return String(unsanitized)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        getStarsHtml(rating) {
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                if (i <= rating) {
                    stars += '<span class="empire-skeleton-star">\u2605</span>';
                } else {
                    stars += '<span class="empire-star-empty">\u2605</span>';
                }
            }
            return `<div class="empire-stars-inner">${stars}</div>`;
        },

        async fetchReviewsData(productId, shopDomain, page = 1) {
            if (!shopDomain) return null;
            let url = `${API_BASE}/api/reviews?shop=${shopDomain}&page=${page}&limit=10`;
            if (productId && productId.trim() !== '') {
                const pureId = productId.replace('gid://shopify/Product/', '');
                url += `&productId=${pureId}`;
            }
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error("Network error");
                return await res.json();
            } catch (e) {
                return null;
            }
        },

        async renderStarRatings() {
            const wrappers = document.querySelectorAll('.empire-star-rating');
            if (!wrappers.length) return;

            for (const wrapper of wrappers) {
                let productId = resolveProductId(wrapper);
                if (!productId) productId = await resolveProductIdFromUrl();
                const shopDomain = wrapper.getAttribute('data-shop-domain');
                if (!shopDomain) continue;

                const data = await this.fetchReviewsData(productId, shopDomain, 1);

                // Resolve merchant language from this widget's own fetch so the
                // star-rating summary localizes even if no review-list is present.
                if (data && data.settings && data.settings.language) setLang(data.settings.language);

                if (!data || !data.stats || data.stats.total === 0) {
                    wrapper.innerHTML = `<span class="empire-rating-text">${t("no_reviews_yet")}</span>`;
                    continue;
                }

                wrapper.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <div class="empire-stars-wrap">${this.getStarsHtml(Math.round(data.stats.average))}</div>
                            <span class="empire-rating-text">${data.stats.average.toFixed(2)} ${t("out_of_5")}</span>
                        </div>
                        <div class="empire-rating-text" style="color: var(--text-color, var(--empire-text-light));">
                            ${tf("based_on_reviews", { n: data.stats.total })}
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#48c7a6" style="width:1.2em; height:1.2em; vertical-align:middle; margin-left:2px; transform:translateY(-1px);"><rect width="24" height="24" rx="4"/><path fill="#fff" d="M9.5 16l-4-4 1.5-1.5 2.5 2.5 6.5-6.5L17.5 8z"/></svg>
                        </div>
                    </div>
                `;
            }
        },

        async renderReviewLists() {
            const widgets = document.querySelectorAll('.empire-reviews-widget');
            if (!widgets.length) return;

            for (const widget of widgets) {
                // Scope control: 'auto' (product page → product, else store),
                // 'product' (force this product), 'store' (force whole store).
                const scope = widget.getAttribute('data-review-scope') || 'auto';
                let productId = (scope === 'store') ? '' : resolveProductId(widget);
                if (!productId && scope !== 'store') productId = await resolveProductIdFromUrl();
                const shopDomain = widget.getAttribute('data-shop-domain');
                const widgetId = widget.id || 'widget_' + Math.floor(Math.random() * 100000);
                
                if (!shopDomain) continue;
                
                widgetState[widgetId] = { page: 1, hasMore: true, isLoading: true, statsLoaded: false };

                const data = await this.fetchReviewsData(productId, shopDomain, 1);
                
                // Store global features block so modal can read it later
                if (data && data.features) {
                    window.EmpireFeatures = data.features;
                }

                // Apply merchant's configured widget language (falls back to
                // Shopify storefront locale, then English) and re-translate the
                // static Liquid UI in case this resolved before the early fetch.
                if (data && data.settings && data.settings.language) {
                    setLang(data.settings.language);
                } else if (window.Shopify && window.Shopify.locale) {
                    setLang(window.Shopify.locale);
                }
                applyI18n();
                
                const summarySkeleton = widget.querySelector('.empire-summary-skeleton');
                const distContainer = widget.querySelector('.empire-distribution-container');
                const reviewsGrid = widget.querySelector('.empire-reviews-grid');
                const loadMoreTrigger = widget.querySelector('.empire-load-more-trigger');

                if (!data || !data.reviews || data.reviews.length === 0) {
                    if (reviewsGrid) {
                        reviewsGrid.classList.remove('empire-loading');
                        reviewsGrid.innerHTML = `
                            <div class="empire-empty-state">
                                <div class="empire-empty-icon">✨</div>
                                <h3>${t("be_first")}</h3>
                            </div>`;
                    }
                    if (summarySkeleton) summarySkeleton.innerHTML = '<div class="empire-summary-score">0.0</div><div style="font-size: 0.9rem; color: #64748b; margin-top: 4px;">' + tf("based_on_reviews", { n: 0 }) + '</div>';
                    if (distContainer) distContainer.innerHTML = '';
                    continue;
                }

                if (summarySkeleton && data.stats) {
                    summarySkeleton.outerHTML = `
                        <div class="empire-summary-stats">
                            <div class="empire-summary-score">${data.stats.average.toFixed(1)}</div>
                            <div style="font-size: 0.95rem; font-weight: 500; color: #64748b; margin-top: 4px;">${tf("based_on_reviews", { n: data.stats.total })}</div>
                        </div>`;
                }

                if (distContainer && data.stats) {
                    let distHtml = '';
                    const totalSafe = data.stats.total || 1;
                    for (let rating = 5; rating >= 1; rating--) {
                        const count = data.stats.distribution[rating] || 0;
                        const pct = Math.round((count / totalSafe) * 100);
                        distHtml += `
                            <div class="empire-dist-row">
                                <span class="empire-dist-label">${rating} <span style="color:var(--empire-primary);">★</span></span>
                                <div style="flex-grow:1; display:flex; align-items:center;">
                                    <svg width="100%" height="12" style="border-radius:99px;" preserveAspectRatio="none">
                                        <rect width="100%" height="12" fill="#f1f5f9" rx="6" />
                                        <rect width="${pct}%" height="12" fill="var(--empire-primary)" rx="6" />
                                    </svg>
                                </div>
                                <span class="empire-dist-count">${count}</span>
                            </div>
                        `;
                    }
                    distContainer.innerHTML = distHtml;
                }

                if (reviewsGrid) {
                    reviewsGrid.classList.remove('empire-loading');
                    reviewsGrid.innerHTML = data.reviews.map(rev => this.createReviewCardHtml(rev)).join('');
                    
                    widgetState[widgetId].hasMore = data.pagination?.hasMore ?? false;
                    widgetState[widgetId].isLoading = false;

                    const summaryCol = widget.querySelector('.empire-summary-col');
                    const reviewsCol = widget.querySelector('.empire-reviews-col');

                    if (summaryCol && reviewsCol) {
                        if (window.innerWidth <= 900 && !widget.querySelector('.empire-mobile-reviews-toggle')) {
                            reviewsCol.classList.add('empire-mobile-hidden');
                            const toggleBtn = document.createElement('button');
                            toggleBtn.className = 'empire-mobile-reviews-toggle';
                            toggleBtn.innerText = t("see_all_reviews");
                            summaryCol.appendChild(toggleBtn);

                            toggleBtn.addEventListener('click', () => {
                                if (reviewsCol.classList.contains('empire-mobile-hidden')) {
                                    reviewsCol.classList.remove('empire-mobile-hidden');
                                    toggleBtn.innerText = t("hide_reviews");
                                } else {
                                    reviewsCol.classList.add('empire-mobile-hidden');
                                    toggleBtn.innerText = t("see_all_reviews");
                                }
                            });
                        }

                        let isHovered = false;
                        reviewsCol.addEventListener('mouseenter', () => isHovered = true);
                        reviewsCol.addEventListener('mouseleave', () => isHovered = false);
                        reviewsCol.addEventListener('touchstart', () => isHovered = true, {passive: true});
                        reviewsCol.addEventListener('touchend', () => {
                            setTimeout(() => isHovered = false, 2000);
                        }, {passive: true});

                        setInterval(() => {
                            if (!isHovered && reviewsCol.scrollHeight > reviewsCol.clientHeight) {
                                reviewsCol.scrollTop += 1;
                                if (!widgetState[widgetId].hasMore && reviewsCol.scrollTop + reviewsCol.clientHeight >= reviewsCol.scrollHeight - 2) {
                                    reviewsCol.scrollTop = 0;
                                }
                            }
                            if (summaryCol && summaryCol.offsetHeight > 0) {
                                if (window.innerWidth > 900) {
                                    reviewsCol.style.maxHeight = summaryCol.offsetHeight + 'px';
                                } else {
                                    reviewsCol.style.maxHeight = 'none';
                                }
                            }
                        }, 40);
                    }

                    if (loadMoreTrigger && widgetState[widgetId].hasMore) {
                        const observer = new IntersectionObserver(async (entries) => {
                            if (entries[0].isIntersecting && !widgetState[widgetId].isLoading && widgetState[widgetId].hasMore) {
                                widgetState[widgetId].isLoading = true;
                                widgetState[widgetId].page += 1;
                                loadMoreTrigger.innerHTML = '<div class="empire-spinner"></div> ' + t("loading");
                                
                                const nextData = await this.fetchReviewsData(productId, shopDomain, widgetState[widgetId].page);
                                if (nextData && nextData.reviews && nextData.reviews.length > 0) {
                                    reviewsGrid.insertAdjacentHTML('beforeend', nextData.reviews.map(r => this.createReviewCardHtml(r)).join(''));
                                    widgetState[widgetId].hasMore = nextData.pagination?.hasMore ?? false;
                                } else {
                                    widgetState[widgetId].hasMore = false;
                                }
                                
                                if (!widgetState[widgetId].hasMore) {
                                    loadMoreTrigger.innerHTML = '';
                                    observer.disconnect();
                                } else {
                                    loadMoreTrigger.innerHTML = '';
                                }
                                widgetState[widgetId].isLoading = false;
                            }
                        }, { root: widget.querySelector('.empire-reviews-col'), rootMargin: '200px' });
                        observer.observe(loadMoreTrigger);
                    }
                }
            }
        },

        createReviewCardHtml(review) {
            const dateStr = new Date(review.createdAt).toLocaleDateString();
            const title = this.escapeHtml(review.title || '');
            const body = this.escapeHtml(review.body || '');
            const author = this.escapeHtml(review.customerName || 'Anonymous');

            let mediaHtml = '';
            if (review.media && review.media.length > 0) {
                mediaHtml = '<div class="empire-review-gallery">';
                review.media.forEach(m => {
                    const safeUrl = this.escapeHtml(m.url || '');
                    const isVideo = m.type === 'video'
                        || /\/video\//.test(safeUrl)
                        || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(safeUrl);
                    if (isVideo) {
                        mediaHtml += `<video src="${safeUrl}" class="empire-gallery-video" controls playsinline preload="metadata" style="max-width:280px; width:100%; border-radius:10px; margin-top:4px; display:block;"></video>`;
                    } else {
                        mediaHtml += `<img src="${safeUrl}" class="empire-gallery-img" alt="${t("customer_photo")}" loading="lazy" data-open-url="${safeUrl}" />`;
                    }
                });
                mediaHtml += '</div>';
            }

            let replyHtml = '';
            if (review.replies && review.replies.length > 0) {
                replyHtml = `
                    <details class="empire-owner-reply-accordion">
                        <summary>👑 Store Owner Response</summary>
                        <div class="empire-owner-reply-content">
                            ${this.escapeHtml(review.replies[0].body)}
                        </div>
                    </details>`;
            }

            const verifiedBadge = review.verified ? `
                <span class="empire-verified-badge">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>
                    ${t("verified_buyer")}
                </span>` : '';

            return `
                <div class="empire-review-card empire-animate-in">
                    <div class="empire-card-header">
                        <div class="empire-card-header-left">
                            <div style="display:flex; align-items:center; gap: 10px;">
                                <div class="empire-avatar">${author.charAt(0).toUpperCase()}</div>
                                <div class="empire-header-text">
                                    <span class="empire-reviewer-name" style="font-size:0.95rem;">${author}</span>
                                    <span class="empire-review-date" style="font-size:0.75rem;">${dateStr}</span>
                                </div>
                            </div>
                        </div>
                        <div class="empire-header-right" style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                            <div class="empire-stars-wrap" style="--star-size:28px;">${this.getStarsHtml(review.rating)}</div>
                            ${verifiedBadge}
                        </div>
                    </div>
                    ${title ? `<h4 class="empire-review-title">${title}</h4>` : ''}
                    <p class="empire-review-body">${body}</p>
                    ${mediaHtml}
                    ${replyHtml}
                </div>`;
        },

        // --- CAROUSEL LOGIC ---
        async renderReviewCarousels() {
            const carousels = document.querySelectorAll('.empire-review-carousel-section');
            if (!carousels.length) return;

            for (const section of carousels) {
                const shopDomain = section.getAttribute('data-shop-domain');
                if (!shopDomain) continue;

                const track = section.querySelector('.empire-carousel-track');
                const prevBtn = section.querySelector('.empire-carousel-prev');
                const nextBtn = section.querySelector('.empire-carousel-next');
                const dotsContainer = section.querySelector('.empire-carousel-dots');

                const rawProductId = (section.getAttribute('data-product-id') || '').trim().replace('gid://shopify/Product/', '');
                const carouselUrl = rawProductId
                    ? `${API_BASE}/api/reviews?shop=${shopDomain}&productId=${rawProductId}&limit=10`
                    : `${API_BASE}/api/featured?shop=${shopDomain}&limit=10`;

                try {
                    const res = await fetch(carouselUrl);
                    if (!res.ok) throw new Error("Failed to load featured reviews");
                    const data = await res.json();

                    // Localize carousel text when the response carries the setting
                    // (product-scoped path hits /api/reviews which returns it).
                    if (data && data.settings && data.settings.language) setLang(data.settings.language);

                    if (!data.reviews || data.reviews.length === 0) {
                        section.style.display = 'none'; // Gracefully hide instead of showing empty text
                        continue;
                    }

                    // Render Cards
                    track.innerHTML = data.reviews.map(rev => {
                        const dateStr = new Date(rev.createdAt).toLocaleDateString();
                        const initial = rev.customerName ? rev.customerName.charAt(0).toUpperCase() : "A";
                        // Using fixed 5 stars since the backend filters rating=5
                        const starsHtml = `<div class="empire-stars-wrap" style="color:var(--empire-carousel-primary); font-size:var(--empire-carousel-star-size, 18px); margin-bottom: 0px;">
                            <span class="empire-skeleton-star" style="margin-right: -2px;">★</span><span class="empire-skeleton-star" style="margin-right: -2px;">★</span><span class="empire-skeleton-star" style="margin-right: -2px;">★</span><span class="empire-skeleton-star" style="margin-right: -2px;">★</span><span class="empire-skeleton-star" style="margin-right: -2px;">★</span>
                        </div>`;

                        const verifiedHtml = rev.verified ? `
                        <div style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:0.65rem; color:#10b981; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:12px;">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#10b981" style="width:14px; height:14px;"><rect width="24" height="24" rx="4"></rect><path fill="#fff" d="M10 16.4l-4.2-4.2 1.4-1.4 2.8 2.8 7.2-7.2 1.4 1.4z"></path></svg>
                            ${t("verified_buyer")}
                        </div>` : '';

                        let mediaHtml = '';
                        if (rev.media && rev.media.length > 0) {
                            mediaHtml = '<div class="empire-review-gallery" style="margin-top:16px; display:flex; gap:8px;">';
                            rev.media.slice(0, 3).forEach(m => {
                                const safeUrl = EmpireWidgets.escapeHtml(m.url || '');
                                mediaHtml += `<img src="${safeUrl}" class="empire-gallery-img" style="width:60px; height:60px; object-fit:cover; border-radius:6px; cursor:pointer;" alt="Review Photo" loading="lazy" data-open-url="${safeUrl}" />`;
                            });
                            mediaHtml += '</div>';
                        }

                        return `
                        <div class="empire-carousel-card">
                            ${starsHtml}
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px; margin-top:2px;">
                                <div class="empire-carousel-card-avatar" style="width:40px; height:40px; margin:0; border: none; font-size:1.35rem; flex-shrink:0;">${initial}</div>
                                <div class="empire-carousel-card-name" style="margin:0;">${this.escapeHtml(rev.customerName)}</div>
                            </div>
                            ${verifiedHtml}
                            <div class="empire-carousel-card-text">"${this.escapeHtml(rev.body)}"</div>
                            ${mediaHtml}
                        </div>`;
                    }).join('');

                    const singleSetHtml = track.innerHTML;
                    
                    // True Infinite Loop execution: We clone the full set 3 times to allow seamless looping forward AND backward
                    track.innerHTML = singleSetHtml + singleSetHtml + singleSetHtml;

                    const originalCount = data.reviews.length;
                    const scrollAmount = 344; // card width (320px) + gap (24px)
                    const setWidth = originalCount * scrollAmount;

                    if (originalCount > 0) {
                        // We only need indicator dots for the original number of cards
                        dotsContainer.innerHTML = Array.from({length: originalCount}).map((_, i) => `<div class="empire-carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`).join('');
                        const dots = Array.from(dotsContainer.querySelectorAll('.empire-carousel-dot'));
                        const allCards = Array.from(track.querySelectorAll('.empire-carousel-card'));

                        // Instantly jump to the middle cloned set so we can scroll infinitely immediately
                        setTimeout(() => {
                            track.scrollTo({ left: setWidth, behavior: 'instant' });
                        }, 50);

                        // Update the dots based on whichever clone comes into the center view
                        const observer = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting) {
                                    dots.forEach(d => d.classList.remove('active'));
                                    // Math.floor modulo ensures the dot matches the correct original card index
                                    const index = allCards.indexOf(entry.target) % originalCount;
                                    if (dots[index]) dots[index].classList.add('active');
                                }
                            });
                        }, { root: track, threshold: 0.6 });

                        allCards.forEach(card => observer.observe(card));

                        // INFINITE CONTINUOUS JUMP LOGIC
                        track.addEventListener('scroll', () => {
                            // If scrolled past the last card of the Middle Set into the 3rd set, instantly snap backwards 1 full set
                            if (track.scrollLeft >= setWidth * 2 - (scrollAmount / 2)) {
                                track.scrollTo({ left: track.scrollLeft - setWidth, behavior: 'instant' });
                            } 
                            // If scrolled backwards past the first card of the Middle Set into the 1st set, instantly snap forward 1 full set
                            else if (track.scrollLeft <= (scrollAmount / 2)) {
                                track.scrollTo({ left: track.scrollLeft + setWidth, behavior: 'instant' });
                            }
                        });

                        // Standard Buttons
                        prevBtn.addEventListener('click', () => {
                            track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
                        });
                        nextBtn.addEventListener('click', () => {
                            track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
                        });

                        // Dot clicks
                        dots.forEach((dot, idx) => {
                            dot.addEventListener('click', () => {
                                // Jump directly within the current frame view
                                const currentSetStart = Math.floor(track.scrollLeft / setWidth) * setWidth;
                                track.scrollTo({ left: currentSetStart + (idx * scrollAmount), behavior: 'smooth' });
                            });
                        });

                        // Autoplay Loop Logic
                        let isHovering = false;
                        let autoScrollTimer;

                        const startAutoScroll = () => {
                            autoScrollTimer = setInterval(() => {
                                if (!isHovering) {
                                    nextBtn.click(); // No need to check ends! track event listener handles infinite teleportation!
                                }
                            }, 3500); 
                        };

                        section.addEventListener('mouseenter', () => isHovering = true);
                        section.addEventListener('mouseleave', () => isHovering = false);
                        section.addEventListener('touchstart', () => isHovering = true);
                        section.addEventListener('touchend', () => setTimeout(() => isHovering = false, 3000)); 

                        startAutoScroll();
                    }


                } catch (e) {
                    console.error("Carousel render error:", e);
                    section.style.display = 'none'; // Gracefully hide instead of red error text
                }
            }
        },

        // --- PHOTO GALLERY LOGIC ---
        async renderPhotoGalleries() {
            const sections = document.querySelectorAll('.empire-photo-gallery-section');
            if (!sections.length) return;

            // Inject shared lightbox into body once
            if (!document.getElementById('empire-photo-lightbox')) {
                const lb = document.createElement('div');
                lb.id = 'empire-photo-lightbox';
                lb.className = 'empire-photo-lightbox';
                lb.innerHTML = `
                    <button class="empire-photo-lightbox-close" id="empire-lb-close" aria-label="Close">&times;</button>
                    <img class="empire-photo-lightbox-img" id="empire-lb-img" src="" alt="Customer Photo" />
                    <div class="empire-photo-lightbox-meta" id="empire-lb-meta"></div>
                `;
                document.body.appendChild(lb);

                // Close on button click
                document.getElementById('empire-lb-close').addEventListener('click', () => {
                    lb.classList.remove('open');
                    document.body.style.overflow = '';
                });
                // Close on backdrop click
                lb.addEventListener('click', (e) => {
                    if (e.target === lb) {
                        lb.classList.remove('open');
                        document.body.style.overflow = '';
                    }
                });
                // Close on Escape key
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        lb.classList.remove('open');
                        document.body.style.overflow = '';
                    }
                });
            }

            for (const section of sections) {
                const shopDomain = section.getAttribute('data-shop-domain');
                const productId = section.getAttribute('data-product-id');
                const limit = section.getAttribute('data-limit') || '30';
                const gridId = section.querySelector('.empire-photo-masonry-grid')?.id;
                const emptyId = section.querySelector('.empire-gallery-empty')?.id;
                
                if (!shopDomain || !gridId) continue;
                
                const grid = document.getElementById(gridId);
                const emptyEl = emptyId ? document.getElementById(emptyId) : null;
                
                try {
                    let apiUrl = `${API_BASE}/api/photos?shop=${shopDomain}&limit=${limit}`;
                    if (productId && productId.trim() !== '') apiUrl += `&productId=${productId}`;

                    const res = await fetch(apiUrl);
                    if (!res.ok) throw new Error('Failed to load photos');
                    const data = await res.json();

                    if (!data.photos || data.photos.length === 0) {
                        grid.innerHTML = '';
                        if (emptyEl) emptyEl.style.display = 'block';
                        continue;
                    }

                    grid.innerHTML = data.photos.map(photo => {
                        const name = this.escapeHtml(photo.customerName || 'Anonymous');
                        const rating = parseInt(photo.rating) || 5;
                        const starLabel = '★'.repeat(rating) + ' ' + rating + '.0';
                        return `
                        <div class="empire-gallery-tile"
                            data-url="${this.escapeHtml(photo.url)}"
                            data-name="${name}"
                            data-rating="${rating}"
                            data-body="${this.escapeHtml((photo.body || '').substring(0, 120))}"
                            role="button"
                            tabindex="0"
                            aria-label="${t("customer_photo")}"
                        >
                            <img src="${this.escapeHtml(photo.url)}" alt="${t("customer_photo")}" loading="lazy" />
                            <div class="empire-gallery-tile-badge">
                                <span class="empire-gallery-tile-name">${name}</span>
                                <span class="empire-gallery-tile-stars">${starLabel}</span>
                            </div>
                        </div>`;
                    }).join('');

                    // Attach lightbox events
                    grid.querySelectorAll('.empire-gallery-tile').forEach(tile => {
                        const openLb = () => {
                            const lb = document.getElementById('empire-photo-lightbox');
                            const img = document.getElementById('empire-lb-img');
                            const meta = document.getElementById('empire-lb-meta');
                            img.src = tile.getAttribute('data-url');
                            const name = tile.getAttribute('data-name');
                            const rating = parseInt(tile.getAttribute('data-rating'));
                            const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
                            meta.innerHTML = `<span class="empire-photo-lightbox-stars">${stars}</span><span>${this.escapeHtml(name)}</span>`;
                            lb.classList.add('open');
                            document.body.style.overflow = 'hidden';
                        };
                        tile.addEventListener('click', openLb);
                        tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openLb(); });
                    });

                } catch (err) {
                    console.error('[Empire] Photo gallery error:', err);
                    grid.innerHTML = '<div style="text-align:center; padding:40px; color:#ef4444;">' + t("failed_photos") + '</div>';
                }
            }
        }
    };

    document.addEventListener("DOMContentLoaded", function() {
        const stars = document.querySelectorAll('.empire-pick-star');
        stars.forEach((star, index) => {
            star.addEventListener('mouseenter', () => {
                stars.forEach((s, idx) => {
                    const isHovered = idx <= index;
                    s.classList.toggle('hover-active', isHovered);
                    s.style.color = isHovered ? '#f59e0b' : '#e2e8f0';
                });
            });
            star.addEventListener('mouseleave', () => {
                stars.forEach(s => {
                    s.classList.remove('hover-active');
                    s.style.color = s.classList.contains('active') ? '#f59e0b' : '#e2e8f0';
                });
            });
        });
    });

    // Delegated handler for gallery images (replaces inline onclick)
    document.addEventListener('click', function(e) {
        const target = /** @type {HTMLElement} */ (e.target);
        if (target && target.dataset && target.dataset.openUrl) {
            const url = target.dataset.openUrl;
            // Only open https:// URLs
            if (url.startsWith('https://')) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }
    });

    // Expose i18n helpers so isolated inline block scripts (floating-tab,
    // ai-summary) can localize their own dynamically-rendered strings.
    API.t = t;
    API.tf = tf;
    API.setLang = setLang;
    API.applyI18n = applyI18n;
    API.currentLang = function () { return currentLang; };

    return API;
})();

window.EmpireWidgets = EmpireWidgets;
window.EmpireWidgets.init();
