// Reply phrases for the deterministic fallback agent, in English, Hinglish and
// Hindi. Amounts are inserted only from tool results (already formatted).

import type { Lang } from "./intents.ts";

type Vars = Record<string, string | number | null | undefined>;

const P: Record<string, Record<Lang, string>> = {
  greet_catalogue: {
    en: "Namaste! Thank you for reaching out to {mfr}. I have shared our trade catalogue here. Which products are you interested in, and what monthly volume do you usually stock?",
    hinglish: "Namaste ji! {mfr} se judne ke liye dhanyavaad. Hamara trade catalogue yahan bhej diya hai. Aap kaun se products dekh rahe hain aur mahine me kitna maal uthate hain?",
    hi: "नमस्ते जी! {mfr} से जुड़ने के लिए धन्यवाद। हमारा ट्रेड कैटलॉग यहाँ भेज दिया है। आप कौन से प्रोडक्ट देख रहे हैं और महीने में कितना माल लेते हैं?",
  },
  greet: {
    en: "Namaste! Thank you for reaching out to {mfr}. We make {products}. Which product are you interested in, and what quantity do you need?",
    hinglish: "Namaste ji! {mfr} se judne ke liye dhanyavaad. Hum {products} banate hain. Aapko kaun sa product chahiye aur kitni quantity?",
    hi: "नमस्ते जी! {mfr} से जुड़ने के लिए धन्यवाद। हम {products} बनाते हैं। आपको कौन सा प्रोडक्ट चाहिए और कितनी मात्रा?",
  },
  catalogue_sent: {
    en: "I have shared our trade catalogue. Which products would you like a price for?",
    hinglish: "Catalogue bhej diya hai. Kis product ka rate chahiye aapko?",
    hi: "कैटलॉग भेज दिया है। आपको किस प्रोडक्ट का रेट चाहिए?",
  },
  ask_product: {
    en: "Sure. Which product would you like a price for? We offer {products}.",
    hinglish: "Zaroor. Kis product ka rate chahiye? Hamare paas {products} hai.",
    hi: "ज़रूर। किस प्रोडक्ट का रेट चाहिए? हमारे पास {products} हैं।",
  },
  ask_qty: {
    en: "{product}: our list price is {list} per {unit} (minimum order {moq} {unit}). How many {unit} do you need? Larger quantities get better rates.",
    hinglish: "{product}: list price {list} per {unit} hai (minimum order {moq} {unit}). Aapko kitne {unit} chahiye? Zyada quantity par behtar rate milega.",
    hi: "{product}: लिस्ट प्राइस {list} प्रति {unit} है (न्यूनतम ऑर्डर {moq} {unit})। आपको कितने {unit} चाहिए? ज़्यादा मात्रा पर बेहतर रेट मिलेगा।",
  },
  price_accept: {
    en: "Done! {qty} {unit} of {product} at {price} per {unit} works for us. Shall I send the quotation?",
    hinglish: "Ho jayega! {qty} {unit} {product} {price} per {unit} me de denge. Quotation bhej doon?",
    hi: "हो जाएगा! {qty} {unit} {product} {price} प्रति {unit} में दे देंगे। कोटेशन भेज दूँ?",
  },
  price_list: {
    en: "For {qty} {unit} of {product}, our price is {price} per {unit}. Shall I send the quotation?",
    hinglish: "{qty} {unit} {product} ke liye hamara rate {price} per {unit} hai. Quotation bhej doon?",
    hi: "{qty} {unit} {product} के लिए हमारा रेट {price} प्रति {unit} है। कोटेशन भेज दूँ?",
  },
  price_needs_approval: {
    en: "For {qty} {unit}, our best price right now is {floor} per {unit}. For the rate you asked, I am checking with our team and will confirm shortly.",
    hinglish: "{qty} {unit} ke liye abhi hamara best price {floor} per {unit} hai. Aapke bataye rate ke liye main team se check karke thodi der me confirm karta hoon.",
    hi: "{qty} {unit} के लिए अभी हमारा बेस्ट प्राइस {floor} प्रति {unit} है। आपके बताए रेट के लिए मैं टीम से पूछकर थोड़ी देर में बताता हूँ।",
  },
  price_reject: {
    en: "Sorry, we cannot go that low for {qty} {unit}. The best price I can offer is {floor} per {unit}. Shall I prepare the quotation at this price?",
    hinglish: "Maaf kijiye, {qty} {unit} ke liye itna kam possible nahi hai. Best price {floor} per {unit} de sakte hain. Is rate par quotation bana doon?",
    hi: "माफ़ कीजिए, {qty} {unit} के लिए इतना कम संभव नहीं है। बेस्ट प्राइस {floor} प्रति {unit} दे सकते हैं। इस रेट पर कोटेशन बना दूँ?",
  },
  below_moq: {
    en: "The minimum order for {product} is {moq} {unit}. Shall I quote for {moq} {unit} or more?",
    hinglish: "{product} ka minimum order {moq} {unit} hai. {moq} {unit} ya zyada ka rate bata doon?",
    hi: "{product} का न्यूनतम ऑर्डर {moq} {unit} है। {moq} {unit} या ज़्यादा का रेट बता दूँ?",
  },
  no_pricing: {
    en: "Let me check the price for {product} with our team and get back to you shortly.",
    hinglish: "{product} ka rate main team se confirm karke thodi der me batata hoon.",
    hi: "{product} का रेट मैं टीम से पूछकर थोड़ी देर में बताता हूँ।",
  },
  settle_done: {
    en: "Thank you! Your quotation for {qty} {unit} of {product} at {price} per {unit} is being prepared and will reach you here as a PDF shortly. Please share your purchase order once ready.",
    hinglish: "Dhanyavaad! {qty} {unit} {product} {price} per {unit} ka quotation ban raha hai, thodi der me PDF yahan aa jayega. Ready hone par apna PO bhej dijiye.",
    hi: "धन्यवाद! {qty} {unit} {product} {price} प्रति {unit} का कोटेशन बन रहा है, थोड़ी देर में PDF यहाँ आ जाएगा। तैयार होने पर अपना PO भेज दीजिए।",
  },
  settle_pending: {
    en: "Your requested rate is still with our team for approval. I will update you as soon as I hear back.",
    hinglish: "Aapka rate abhi team ke paas approval ke liye hai. Jaise hi jawab aata hai, main bata dunga.",
    hi: "आपका रेट अभी टीम के पास अनुमोदन के लिए है। जैसे ही जवाब आता है, मैं बता दूँगा।",
  },
  already_quoted: {
    en: "Your quotation has already been shared. Please send your purchase order when you are ready.",
    hinglish: "Aapka quotation bhej diya gaya hai. Ready hone par PO bhej dijiye.",
    hi: "आपका कोटेशन भेज दिया गया है। तैयार होने पर PO भेज दीजिए।",
  },
  nothing_to_confirm: {
    en: "Happy to help! Which product and quantity should I quote for?",
    hinglish: "Zaroor! Kis product aur kitni quantity ka quotation banaun?",
    hi: "ज़रूर! किस प्रोडक्ट और कितनी मात्रा का कोटेशन बनाऊँ?",
  },
  credit_check: {
    en: "Noted your request for {days} credit. I am checking with our team and will confirm shortly.",
    hinglish: "{days} credit ki request note kar li hai. Team se check karke jaldi confirm karta hoon.",
    hi: "{days} क्रेडिट की रिक्वेस्ट नोट कर ली है। टीम से पूछकर जल्दी बताता हूँ।",
  },
  sample_check: {
    en: "I have asked our team about a sample for you and will confirm shortly.",
    hinglish: "Sample ke liye team se baat kar raha hoon, jaldi confirm karta hoon.",
    hi: "सैंपल के लिए टीम से बात कर रहा हूँ, जल्दी बताता हूँ।",
  },
  escalate_hold: {
    en: "Thank you for letting us know. A senior member of our team will call or message you shortly.",
    hinglish: "Batane ke liye dhanyavaad. Hamari team ke senior aapse jaldi call ya message par baat karenge.",
    hi: "बताने के लिए धन्यवाद। हमारी टीम के वरिष्ठ सदस्य आपसे जल्दी कॉल या मैसेज पर बात करेंगे।",
  },
  po_ack: {
    en: "Thank you, we have received your document. Our team will verify it against the quotation and confirm shortly.",
    hinglish: "Dhanyavaad, aapka document mil gaya hai. Team quotation se match karke jaldi confirm karegi.",
    hi: "धन्यवाद, आपका दस्तावेज़ मिल गया है। टीम कोटेशन से मिलान करके जल्दी पुष्टि करेगी।",
  },
  noted: {
    en: "Thank you, noted.",
    hinglish: "Dhanyavaad, note kar liya.",
    hi: "धन्यवाद, नोट कर लिया।",
  },
  next_question: {
    en: "Which of our products would you like to start with, and what quantity?",
    hinglish: "Aap kaun se product se shuru karna chahenge, aur kitni quantity?",
    hi: "आप किस प्रोडक्ट से शुरू करना चाहेंगे, और कितनी मात्रा?",
  },
  generic: {
    en: "How can I help you today? I can share our catalogue, product details, or a price for your quantity.",
    hinglish: "Bataiye, main kaise madad karun? Catalogue, product details ya aapki quantity ka rate, sab bata sakta hoon.",
    hi: "बताइए, मैं कैसे मदद करूँ? कैटलॉग, प्रोडक्ट की जानकारी या आपकी मात्रा का रेट, सब बता सकता हूँ।",
  },
  thanks: {
    en: "You are welcome! Let me know whenever you need anything.",
    hinglish: "Aapka swagat hai! Kabhi bhi zaroorat ho to bataiye.",
    hi: "आपका स्वागत है! कभी भी ज़रूरत हो तो बताइए।",
  },
  approval_approved: {
    en: "Good news! Our team has approved your price for {product}. Your quotation is being prepared and will reach you here shortly.",
    hinglish: "Khushkhabri! Team ne {product} ke liye aapka rate approve kar diya hai. Quotation ban raha hai, thodi der me yahan aa jayega.",
    hi: "खुशखबरी! टीम ने {product} के लिए आपका रेट मंज़ूर कर दिया है। कोटेशन बन रहा है, थोड़ी देर में यहाँ आ जाएगा।",
  },
  approval_countered: {
    en: "Our team reviewed your request: we can do {price} per {unit} for {qty} {unit} of {product}. Shall I send the quotation at this price?",
    hinglish: "Team ne aapki request dekhi: {qty} {unit} {product} ke liye {price} per {unit} kar sakte hain. Is rate par quotation bhej doon?",
    hi: "टीम ने आपकी रिक्वेस्ट देखी: {qty} {unit} {product} के लिए {price} प्रति {unit} कर सकते हैं। इस रेट पर कोटेशन भेज दूँ?",
  },
  approval_rejected: {
    en: "Our team could not approve the requested rate. The best price we can offer is {price} per {unit} for {qty} {unit}. Shall I prepare the quotation?",
    hinglish: "Team aapka bataya rate approve nahi kar payi. {qty} {unit} ke liye best price {price} per {unit} hai. Quotation bana doon?",
    hi: "टीम आपका बताया रेट मंज़ूर नहीं कर पाई। {qty} {unit} के लिए बेस्ट प्राइस {price} प्रति {unit} है। कोटेशन बना दूँ?",
  },
  approval_expired: {
    en: "Thank you for your patience. The best price we can hold for you is {price} per {unit} for {qty} {unit}. Shall I send the quotation?",
    hinglish: "Intezaar ke liye dhanyavaad. {qty} {unit} ke liye hum {price} per {unit} hold kar sakte hain. Quotation bhej doon?",
    hi: "इंतज़ार के लिए धन्यवाद। {qty} {unit} के लिए हम {price} प्रति {unit} होल्ड कर सकते हैं। कोटेशन भेज दूँ?",
  },
  approval_other_approved: {
    en: "Good news! Our team has approved your request. Let me know if you would like to go ahead with the order.",
    hinglish: "Khushkhabri! Team ne aapki request approve kar di hai. Order aage badhayein?",
    hi: "खुशखबरी! टीम ने आपकी रिक्वेस्ट मंज़ूर कर दी है। ऑर्डर आगे बढ़ाएँ?",
  },
  approval_other_rejected: {
    en: "Our team could not approve that request this time. Happy to proceed on our standard terms if that works for you.",
    hinglish: "Is baar team ye request approve nahi kar payi. Standard terms par aage badh sakte hain, bataiye.",
    hi: "इस बार टीम यह रिक्वेस्ट मंज़ूर नहीं कर पाई। स्टैंडर्ड शर्तों पर आगे बढ़ सकते हैं, बताइए।",
  },
  followup: {
    en: "Just checking in about {product}. Would you like a price for your next order or our latest catalogue?",
    hinglish: "{product} ke baare me follow up kar raha hoon. Agle order ka rate ya latest catalogue bhej doon?",
    hi: "{product} के बारे में फॉलो अप कर रहा हूँ। अगले ऑर्डर का रेट या नया कैटलॉग भेज दूँ?",
  },
  reorder: {
    en: "Your last order of {product} was on {date}. Shall we book your next order? Just reply with the quantity.",
    hinglish: "Aapka pichhla {product} order {date} ko aaya tha. Naya order book karein? Bas quantity bata dijiye.",
    hi: "आपका पिछला {product} ऑर्डर {date} को आया था। नया ऑर्डर बुक करें? बस मात्रा बता दीजिए।",
  },
  outreach: {
    en: "Namaste {name}, this is {mfr}. We would like to share our {product} range with you. Reply YES for the catalogue or STOP to opt out.",
    hinglish: "Namaste {name}, main {mfr} se baat kar raha hoon. Hum aapke saath apni {product} range share karna chahte hain. Catalogue ke liye YES likhiye, ya STOP.",
    hi: "नमस्ते {name}, मैं {mfr} से बात कर रहा हूँ। हम आपके साथ अपनी {product} रेंज साझा करना चाहते हैं। कैटलॉग के लिए YES लिखिए, या STOP।",
  },
};

export function phrase(lang: Lang, key: keyof typeof P | string, vars: Vars = {}): string {
  const entry = P[key] ?? P.generic;
  const tpl = entry[lang] ?? entry.en;
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  }).replace(/\s+([.,?!।])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

export function holdingMessage(lang: Lang): string {
  return phrase(lang, "escalate_hold");
}
