import React from 'react';
import { Linking, StyleSheet, Text, TextStyle } from 'react-native';

interface LinkableTextProps {
  text: string;
  style?: TextStyle;
  linkStyle?: TextStyle;
}

// URL regex that matches http(s) URLs and common social media patterns
const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(@[a-zA-Z0-9_]+)/g;

// Detect if a string looks like a URL (even without http://)
const isUrl = (text: string): boolean => {
  return text.startsWith('http://') || 
         text.startsWith('https://') || 
         text.startsWith('www.');
};

// Detect social media handles (starts with @)
const isSocialHandle = (text: string): boolean => {
  return text.startsWith('@') && text.length > 1;
};

// Convert text to a proper URL
const toUrl = (text: string): string => {
  if (text.startsWith('http://') || text.startsWith('https://')) {
    return text;
  }
  if (text.startsWith('www.')) {
    return `https://${text}`;
  }
  // For @ handles, we can't know which platform - just return as-is
  return text;
};

/**
 * LinkableText - Renders text with clickable URLs
 * 
 * Security notes:
 * - URLs open in the system browser via Linking.openURL (not embedded webview)
 * - No arbitrary HTML/JavaScript is rendered - just plain text with URL detection
 * - Links are clearly styled differently so users know they're tapping a link
 */
export function LinkableText({ text, style, linkStyle }: LinkableTextProps) {
  if (!text) return null;

  // Split text into parts (regular text and URLs)
  const parts: { text: string; isLink: boolean }[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        isLink: false,
      });
    }

    // Add the URL/handle
    const matchedText = match[0];
    
    // Only make it a link if it's a URL (not @ handles since we don't know the platform)
    if (isUrl(matchedText)) {
      parts.push({
        text: matchedText,
        isLink: true,
      });
    } else {
      // For @ handles, just render as regular text for now
      parts.push({
        text: matchedText,
        isLink: false,
      });
    }

    lastIndex = match.index + matchedText.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      isLink: false,
    });
  }

  // If no links found, just return plain text
  if (parts.length === 0 || parts.every(p => !p.isLink)) {
    return <Text style={style}>{text}</Text>;
  }

  const handleLinkPress = async (url: string) => {
    const fullUrl = toUrl(url);
    try {
      const canOpen = await Linking.canOpenURL(fullUrl);
      if (canOpen) {
        await Linking.openURL(fullUrl);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (part.isLink) {
          return (
            <Text
              key={index}
              style={[styles.link, linkStyle]}
              onPress={() => handleLinkPress(part.text)}
              suppressHighlighting={false}
            >
              {part.text}
            </Text>
          );
        }
        return <Text key={index}>{part.text}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
});
