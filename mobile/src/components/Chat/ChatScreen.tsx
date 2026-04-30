import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { Mic } from 'lucide-react-native';
import { theme } from '../../theme';
import { MessageBubble } from './MessageBubble';
import { ActionCard } from './ActionCard';
import { useVoice } from '../../hooks/useVoice';
import { getOrCreateGuestDeviceId } from '../../services/guestDeviceId';
import { sendAssistantMessage } from '../../services/flowGuruTrpc';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actionResult?: any;
}

export const ChatScreen: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: "Hello! I'm Flow Guru. Your smart personal assistant. Tap the mic to talk to me." }
  ]);
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<number | undefined>(undefined);
  const { isListening, transcript, startListening, stopListening, speak } = useVoice();
  const flatListRef = useRef<FlatList>(null);
  const glowAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for the mic button when listening
  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1.5,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      glowAnim.setValue(1);
    }
  }, [isListening]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const guestDeviceId = await getOrCreateGuestDeviceId();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let deviceLatitude: number | undefined;
      let deviceLongitude: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === Location.PermissionStatus.GRANTED) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          deviceLatitude = pos.coords.latitude;
          deviceLongitude = pos.coords.longitude;
        }
      } catch {
        /* directions still work if user names a start/end */
      }

      const data = await sendAssistantMessage({
        message: text,
        guestDeviceId,
        threadId,
        timeZone,
        language: 'en',
        deviceLatitude,
        deviceLongitude,
      });

      setThreadId(data.threadId);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply,
        actionResult: data.actionResult ?? undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      speak(data.reply);
    } catch (error: unknown) {
      console.error('Chat send failed:', error);
      const msg =
        error instanceof Error
          ? error.message
          : 'Could not reach Flow Guru. Set EXPO_PUBLIC_FLOW_GURU_API_URL to your site URL (e.g. https://floguru.com) and try again.';
      Alert.alert('Message failed', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (transcript && !isListening) sendMessage(transcript);
  }, [transcript, isListening]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View>
              <MessageBubble role={item.role} content={item.content} />
              {item.actionResult && (
                <ActionCard 
                  action={item.actionResult.action}
                  title={item.actionResult.title}
                  summary={item.actionResult.summary}
                  status={item.actionResult.status}
                  data={item.actionResult.data}
                />
              )}
            </View>
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          showsVerticalScrollIndicator={false}
        />

        {loading && <ActivityIndicator color={theme.colors.primary} style={styles.loader} size="large" />}

        <View style={styles.footer}>
          <Animated.View style={[styles.glowContainer, { transform: [{ scale: glowAnim }], opacity: isListening ? 1 : 0 }]}>
            <View style={styles.glow} />
          </Animated.View>
          
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.micButton, isListening && styles.micButtonActive]}
            onPress={isListening ? stopListening : startListening}
          >
            <Mic color="#FFFFFF" size={42} strokeWidth={2.5} />
          </TouchableOpacity>
          
          <Text style={[styles.statusText, { opacity: isListening ? 1 : 0.5 }]}>
            {isListening ? "Listening..." : "Tap to Speak"}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  messageList: {
    paddingTop: theme.spacing.xl,
    paddingBottom: 120, // Space for the big mic
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    backgroundColor: theme.colors.primary,
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  micButtonActive: {
    backgroundColor: theme.colors.primary, // Keep it blue or switch to secondary if preferred
  },
  glowContainer: {
    position: 'absolute',
    zIndex: 1,
  },
  glow: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.glow,
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
    marginTop: theme.spacing.md,
    letterSpacing: 0.5,
  },
  loader: {
    marginBottom: theme.spacing.xl,
  },
});
