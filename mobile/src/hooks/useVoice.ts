import { useState, useCallback, useEffect } from 'react';
import * as Speech from 'expo-speech';
import ExpoSpeechRecognition from 'expo-speech-recognition';

export const useVoice = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const startListening = useCallback(async () => {
    try {
      setIsListening(true);
      setTranscript('');
      
      // Request permissions
      const { status } = await ExpoSpeechRecognition.requestPermissionsAsync();
      if (status !== 'granted') {
          console.warn('Speech recognition permission not granted');
          setIsListening(false);
          return;
      }

      await ExpoSpeechRecognition.startAsync({
        lang: 'en-US',
        onResult: (event) => {
          if (event.results?.[0]?.transcript) {
            setTranscript(event.results[0].transcript);
          }
        },
        onEnd: () => {
          setIsListening(false);
        },
        onError: (err) => {
          console.error('Speech recognition error:', err);
          setIsListening(false);
        }
      });
    } catch (error) {
      console.error('Failed to start listening:', error);
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(async () => {
    try {
      await ExpoSpeechRecognition.stopAsync();
      setIsListening(false);
    } catch (error) {
      console.error('Failed to stop listening:', error);
    }
  }, []);

  const speak = useCallback((text: string) => {
    Speech.speak(text, {
      language: 'en',
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
