type MessageValue = string | MessageTree;
interface MessageTree {
  [key: string]: MessageValue;
}

function isMessageTree(value: MessageValue | undefined): value is MessageTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeMessagesWithFallback<T extends MessageTree>(
  fallback: T,
  messages: MessageTree,
): T {
  const merged: MessageTree = { ...fallback };

  for (const [key, value] of Object.entries(messages)) {
    const fallbackValue = fallback[key];
    merged[key] =
      isMessageTree(fallbackValue) && isMessageTree(value)
        ? mergeMessagesWithFallback(fallbackValue, value)
        : value;
  }

  return merged as T;
}
