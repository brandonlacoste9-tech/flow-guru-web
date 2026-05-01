import { useState, useCallback, useEffect, useRef } from "react";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

export const useVoice = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const subsRef = useRef<Array<{ remove: () => void }>>([]);

  const clearSubs = useCallback(() => {
    for (const s of subsRef.current) {
      try {
        s.remove();
      } catch {
        /* ignore */
      }
    }
    subsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearSubs();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* ignore */
      }
    };
  }, [clearSubs]);

  const startListening = useCallback(async () => {
    try {
      setIsListening(true);
      setTranscript("");
      clearSubs();

      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        console.warn("Speech recognition permission not granted");
        setIsListening(false);
        return;
      }

      subsRef.current.push(
        ExpoSpeechRecognitionModule.addListener("result", event => {
          const t = event.results?.[0]?.transcript;
          if (t) setTranscript(t);
        }),
      );
      subsRef.current.push(
        ExpoSpeechRecognitionModule.addListener("error", () => {
          setIsListening(false);
          clearSubs();
        }),
      );
      subsRef.current.push(
        ExpoSpeechRecognitionModule.addListener("end", () => {
          setIsListening(false);
          clearSubs();
        }),
      );

      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
      });
    } catch (error) {
      console.error("Failed to start listening:", error);
      setIsListening(false);
      clearSubs();
    }
  }, [clearSubs]);

  const stopListening = useCallback(async () => {
    try {
      clearSubs();
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    } catch (error) {
      console.error("Failed to stop listening:", error);
      setIsListening(false);
    }
  }, [clearSubs]);

  const speak = useCallback((text: string) => {
    Speech.speak(text, {
      language: "en",
      pitch: 1.0,
      rate: 1.0,
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    Speech.stop();
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
};
