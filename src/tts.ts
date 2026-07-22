// Text-to-speech using the Web Speech API
const synth: SpeechSynthesis = window.speechSynthesis;

function ttsSpeak(text: string, language: string): void {
    if (!text) return;
    // Cancel any in-progress speech before starting a new one
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    const voice = synth.getVoices().find((v) => v.lang === language);
    if (voice) {
        utterance.voice = voice;
    }
    synth.speak(utterance);
}

export function ttsMandarin(text: string): void {
    ttsSpeak(text, 'zh-CN');
}

export function ttsCantonese(text: string): void {
    ttsSpeak(text, 'zh-HK');
}
