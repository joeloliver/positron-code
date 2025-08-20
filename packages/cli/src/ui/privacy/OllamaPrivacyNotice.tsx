/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text } from 'ink';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface OllamaPrivacyNoticeProps {
  onExit: () => void;
}

export const OllamaPrivacyNotice = ({ onExit }: OllamaPrivacyNoticeProps) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onExit();
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={Colors.AccentPurple}>
        Ollama Local Model Notice
      </Text>
      <Newline />
      <Text>
        <Text bold color={Colors.Gray}>
          {`\u00B7 `}
        </Text>
        You're using <Text bold>Ollama</Text> for local model inference.
      </Text>
      <Text>
        <Text bold color={Colors.Gray}>
          {`\u00B7 `}
        </Text>
        All data stays on your local network and is processed by your
        Ollama server.
      </Text>
      <Text>
        <Text bold color={Colors.Gray}>
          {`\u00B7 `}
        </Text>
        No data is sent to Google or any external services when using
        Ollama.
      </Text>
      <Text>
        <Text bold color={Colors.Gray}>
          {`\u00B7 `}
        </Text>
        Your conversations and code remain completely private within your
        infrastructure.
      </Text>
      <Newline />
      <Text>
        Learn more about Ollama at https://ollama.com
      </Text>
      <Newline />
      <Text color={Colors.Gray}>Press Esc to exit.</Text>
    </Box>
  );
};