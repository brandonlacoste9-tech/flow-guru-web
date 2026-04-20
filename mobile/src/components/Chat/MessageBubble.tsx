import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content }) => {
  const isUser = role === 'user';

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={styles.content}>{content}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    flexDirection: 'row',
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  assistantContainer: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: theme.borderRadius.sm,
  },
  assistantBubble: {
    backgroundColor: theme.colors.secondary,
    borderBottomLeftRadius: theme.borderRadius.sm,
  },
  content: {
    color: theme.colors.text,
    fontSize: 18, // Large readable text
    lineHeight: 26,
    fontWeight: '500',
  },
});
