// Fixed answer used when the law library has nothing relevant. Written by people, not generated,
// so Nirdesh never guesses about a law it cannot quote (handoff: "do NOT guess").

// Used when the library has related sections but the AI's answer could not be verified against them.
export const UNVERIFIED: Record<string, string> = {
  English: "Nirdesh found related sections in its library (shown below), but could not confirm the AI's answer word for word against them, so the AI's answer is not shown.",
  Hindi: "Nirdesh को अपनी लाइब्रेरी में संबंधित धाराएँ मिलीं (नीचे दी गई हैं), लेकिन AI के उत्तर की उनसे शब्दशः पुष्टि नहीं हो सकी, इसलिए AI का उत्तर नहीं दिखाया गया है।",
  Kannada: "Nirdesh ತನ್ನ ಗ್ರಂಥಾಲಯದಲ್ಲಿ ಸಂಬಂಧಿತ ವಿಭಾಗಗಳನ್ನು ಕಂಡುಕೊಂಡಿದೆ (ಕೆಳಗೆ ತೋರಿಸಲಾಗಿದೆ), ಆದರೆ AI ಉತ್ತರವನ್ನು ಅವುಗಳೊಂದಿಗೆ ಪದಶಃ ದೃಢಪಡಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ, ಆದ್ದರಿಂದ AI ಉತ್ತರವನ್ನು ತೋರಿಸಲಾಗಿಲ್ಲ.",
  Marathi: "Nirdesh ला त्याच्या ग्रंथालयात संबंधित कलमे सापडली (खाली दिली आहेत), पण AI च्या उत्तराची त्यांच्याशी शब्दशः खात्री करता आली नाही, म्हणून AI चे उत्तर दाखवलेले नाही.",
  Telugu: "Nirdesh తన గ్రంథాలయంలో సంబంధిత విభాగాలను కనుగొంది (కింద చూపబడ్డాయి), కానీ AI సమాధానాన్ని వాటితో పదశః ధృవీకరించలేకపోయింది, కాబట్టి AI సమాధానం చూపబడలేదు.",
};

export const NOT_IN_LIBRARY: Record<string, { one: string; steps: string[]; careful: string; reason: string }> = {
  English: {
    one: "This law is not in Nirdesh's library yet, so Nirdesh will not guess an answer.",
    steps: [
      "Read the official text on the government website linked below.",
      "Use “Prepare for legal aid” to download a summary of your question.",
      "Contact your District Legal Services Authority (DLSA) for free legal help, or a lawyer.",
    ],
    careful: "Nirdesh answers only from Acts uploaded to its library. This is general information, not legal advice.",
    reason: "No section of the uploaded Acts matches this question.",
  },
  Hindi: {
    one: "यह कानून अभी Nirdesh की लाइब्रेरी में नहीं है, इसलिए Nirdesh अनुमान से जवाब नहीं देगा।",
    steps: [
      "नीचे दी गई सरकारी वेबसाइट पर आधिकारिक पाठ पढ़ें।",
      "अपने प्रश्न का सारांश डाउनलोड करने के लिए “Prepare for legal aid” का उपयोग करें।",
      "मुफ़्त कानूनी सहायता के लिए अपने ज़िला विधिक सेवा प्राधिकरण (DLSA) या किसी वकील से संपर्क करें।",
    ],
    careful: "Nirdesh केवल अपनी लाइब्रेरी में अपलोड किए गए अधिनियमों से जवाब देता है। यह सामान्य जानकारी है, कानूनी सलाह नहीं।",
    reason: "अपलोड किए गए अधिनियमों का कोई भी भाग इस प्रश्न से मेल नहीं खाता।",
  },
  Kannada: {
    one: "ಈ ಕಾನೂನು ಇನ್ನೂ Nirdesh ಗ್ರಂಥಾಲಯದಲ್ಲಿ ಇಲ್ಲ, ಆದ್ದರಿಂದ Nirdesh ಊಹಿಸಿ ಉತ್ತರ ನೀಡುವುದಿಲ್ಲ.",
    steps: [
      "ಕೆಳಗೆ ನೀಡಿರುವ ಸರ್ಕಾರಿ ವೆಬ್‌ಸೈಟ್‌ನಲ್ಲಿ ಅಧಿಕೃತ ಪಠ್ಯವನ್ನು ಓದಿ.",
      "ನಿಮ್ಮ ಪ್ರಶ್ನೆಯ ಸಾರಾಂಶವನ್ನು ಡೌನ್‌ಲೋಡ್ ಮಾಡಲು “Prepare for legal aid” ಬಳಸಿ.",
      "ಉಚಿತ ಕಾನೂನು ನೆರವಿಗಾಗಿ ನಿಮ್ಮ ಜಿಲ್ಲಾ ಕಾನೂನು ಸೇವೆಗಳ ಪ್ರಾಧಿಕಾರ (DLSA) ಅಥವಾ ವಕೀಲರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    ],
    careful: "Nirdesh ತನ್ನ ಗ್ರಂಥಾಲಯಕ್ಕೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ಕಾಯ್ದೆಗಳಿಂದ ಮಾತ್ರ ಉತ್ತರಿಸುತ್ತದೆ. ಇದು ಸಾಮಾನ್ಯ ಮಾಹಿತಿ, ಕಾನೂನು ಸಲಹೆ ಅಲ್ಲ.",
    reason: "ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ಕಾಯ್ದೆಗಳ ಯಾವುದೇ ವಿಭಾಗ ಈ ಪ್ರಶ್ನೆಗೆ ಹೊಂದುವುದಿಲ್ಲ.",
  },
  Marathi: {
    one: "हा कायदा अद्याप Nirdesh च्या ग्रंथालयात नाही, त्यामुळे Nirdesh अंदाजाने उत्तर देणार नाही.",
    steps: [
      "खाली दिलेल्या सरकारी संकेतस्थळावर अधिकृत मजकूर वाचा.",
      "तुमच्या प्रश्नाचा सारांश डाउनलोड करण्यासाठी “Prepare for legal aid” वापरा.",
      "मोफत कायदेशीर मदतीसाठी तुमच्या जिल्हा विधी सेवा प्राधिकरणाशी (DLSA) किंवा वकिलाशी संपर्क साधा.",
    ],
    careful: "Nirdesh फक्त त्याच्या ग्रंथालयात अपलोड केलेल्या कायद्यांमधूनच उत्तर देते. ही सामान्य माहिती आहे, कायदेशीर सल्ला नाही.",
    reason: "अपलोड केलेल्या कायद्यांमधील कोणताही भाग या प्रश्नाशी जुळत नाही.",
  },
  Telugu: {
    one: "ఈ చట్టం ఇంకా Nirdesh గ్రంథాలయంలో లేదు, కాబట్టి Nirdesh ఊహించి సమాధానం ఇవ్వదు.",
    steps: [
      "కింద ఇచ్చిన ప్రభుత్వ వెబ్‌సైట్‌లో అధికారిక పాఠాన్ని చదవండి.",
      "మీ ప్రశ్న సారాంశాన్ని డౌన్‌లోడ్ చేయడానికి “Prepare for legal aid” ఉపయోగించండి.",
      "ఉచిత న్యాయ సహాయం కోసం మీ జిల్లా న్యాయ సేవల ప్రాధికార సంస్థ (DLSA) లేదా న్యాయవాదిని సంప్రదించండి.",
    ],
    careful: "Nirdesh తన గ్రంథాలయంలో అప్‌లోడ్ చేసిన చట్టాల నుండి మాత్రమే సమాధానం ఇస్తుంది. ఇది సాధారణ సమాచారం, న్యాయ సలహా కాదు.",
    reason: "అప్‌లోడ్ చేసిన చట్టాలలోని ఏ విభాగమూ ఈ ప్రశ్నకు సరిపోలడం లేదు.",
  },
};
