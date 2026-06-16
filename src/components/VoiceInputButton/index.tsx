import React from 'react';

interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  className?: string;
}

// Voice input is temporarily disabled because it can crash the mobile browser.
export const VoiceInputButton: React.FC<VoiceInputButtonProps> = () => {
  return null;
};
