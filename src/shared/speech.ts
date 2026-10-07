// Text-to-speech through the browser's built-in speech synthesis (no network, no permission prompt).
// In production the same interface can be backed by a neural TTS service with a Swedish voice.
let current: SpeechSynthesisUtterance | null = null;

export function canSpeak(): boolean {
  try { return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; } catch { return false; }
}

function swedishVoice(): SpeechSynthesisVoice | undefined {
  try { return window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('sv')); } catch { return undefined; }
}

export function speak(text: string, onEnd?: () => void): boolean {
  if (!canSpeak() || !text.trim()) { onEnd?.(); return false; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ''));
    u.lang = 'sv-SE';
    const v = swedishVoice();
    if (v) u.voice = v;
    u.rate = 1.02;
    u.onend = () => { if (current === u) current = null; onEnd?.(); };
    u.onerror = () => { if (current === u) current = null; onEnd?.(); };
    current = u;
    window.speechSynthesis.speak(u);
    return true;
  } catch { onEnd?.(); return false; }
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  current = null;
}
