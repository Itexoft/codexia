import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Conversation, ChatMessage, ChatMode } from "@/types/chat";
import { CodexConfig, DEFAULT_CONFIG } from "@/types/codex";

interface ConversationStore {
  // Configuration
  config: CodexConfig;
  setConfig: (config: CodexConfig) => void;
  
  // Conversations
  conversations: Conversation[];
  currentConversationId: string | null;
  sessionDisconnected: boolean;
  pendingUserInput: string | null;
  pendingNewConversation: boolean;

  // Conversation management
  createConversation: (title?: string, mode?: ChatMode, sessionId?: string, instanceId?: string) => string;
  createConversationWithLatestSession: (title?: string, mode?: ChatMode, instanceId?: string) => Promise<string>;
  selectHistoryConversation: (conversation: Conversation) => void;
  deleteConversation: (id: string) => void;
  setCurrentConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;
  updateConversationMode: (id: string, mode: ChatMode) => void;
  toggleFavorite: (id: string) => void;

  // Session management
  setSessionDisconnected: (disconnected: boolean) => void;
  setPendingUserInput: (input: string | null) => void;
  addDisconnectionWarning: (conversationId: string) => void;
  setSessionLoading: (sessionId: string, loading: boolean) => void;
  setPendingNewConversation: (pending: boolean) => void;

  // Message management
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  updateLastMessage: (conversationId: string, content: string) => void;

  // Getters
  getCurrentConversation: () => Conversation | null;
  getCurrentMessages: () => ChatMessage[];
}

const generateTitle = (messages: ChatMessage[]): string => {
  const firstUserMessage = messages.find((msg) => msg.role === "user");
  if (firstUserMessage) {
    const content = firstUserMessage.content.trim();
    return content.length > 50 ? content.substring(0, 50) + "..." : content;
  }
  return "New Conversation";
};

// Export function to create conversation with latest running session or create new one
export const createConversationWithLatestSession = async (title?: string, mode: ChatMode = "agent", instanceId?: string): Promise<string> => {
  const store = useConversationStore.getState();

  // Always create a new conversation with timestamp format for consistency
  // This prevents UUID session IDs from being used
  return store.createConversation(title, mode, undefined, instanceId);
};

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set, get) => ({
      // Initial state
      config: DEFAULT_CONFIG,
      conversations: [],
      currentConversationId: null,
      sessionDisconnected: false,
      pendingUserInput: null,
      pendingNewConversation: false,

      // Configuration
      setConfig: (config) => {
        set({ config });
      },

      createConversation: (title?: string, mode: ChatMode = "agent", sessionId?: string, instanceId?: string) => {
        // Use provided sessionId or generate a codex-event-{uuid} format for the conversation
        const id = sessionId || `codex-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const state = get();
        
        // Check if conversation with this ID already exists (unlikely but possible)
        const existingConversation = state.conversations.find(conv => conv.id === id);
        if (existingConversation) {
          // Just set as current if it already exists
          set({ currentConversationId: id });
          return id;
        }

        const now = Date.now();
        const newConversation: Conversation = {
          id,
          title: title || "New Conversation",
          messages: [],
          mode,
          createdAt: now,
          updatedAt: now,
          isFavorite: false,
          instanceId,
        };

        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          currentConversationId: id,
          pendingNewConversation: true,
        }));

        return id;
      },

  // Expose helper that creates/selects a conversation using the latest running session
  createConversationWithLatestSession: createConversationWithLatestSession,

      // Select conversation from history (disk) - simplified for session_id only
      selectHistoryConversation: (conversation: Conversation) => {
        set(() => {
          console.log(`📁 selectHistoryConversation: ${conversation.id} (${conversation.title})`);
          // Simply set the current conversation ID - no need to merge into store
          // The selectedConversation prop will handle displaying the data
          return {
            currentConversationId: conversation.id,
          };
        });
      },

      deleteConversation: (id: string) => {
        set((state) => {
          const updatedConversations = state.conversations.filter(
            (conv) => conv.id !== id,
          );
          const newCurrentId =
            state.currentConversationId === id
              ? updatedConversations.length > 0
                ? updatedConversations[0].id
                : null
              : state.currentConversationId;
          
          console.log("deleteConversation", id)

          return {
            conversations: updatedConversations,
            currentConversationId: newCurrentId,
          };
        });
      },

      setCurrentConversation: (id: string) => {
        set({ currentConversationId: id });
      },

      updateConversationTitle: (id: string, title: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, title, updatedAt: Date.now() } : conv,
          ),
        }));
      },

      updateConversationMode: (id: string, mode: ChatMode) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, mode, updatedAt: Date.now() } : conv,
          ),
        }));
      },

      toggleFavorite: (id: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id 
              ? { ...conv, isFavorite: !conv.isFavorite, updatedAt: Date.now() } 
              : conv,
          ),
        }));
      },

      setSessionDisconnected: (disconnected: boolean) => {
        set({ sessionDisconnected: disconnected });
      },

      setPendingUserInput: (input: string | null) => {
        set({ pendingUserInput: input });
      },

      setPendingNewConversation: (pending: boolean) => {
        set({ pendingNewConversation: pending });
      },


      setSessionLoading: (sessionId: string, loading: boolean) => {
        set((state) => ({
          conversations: state.conversations.map(conv =>
            conv.id === sessionId
              ? { ...conv, isLoading: loading }
              : conv
          )
        }));
      },

      addDisconnectionWarning: (conversationId: string) => {
        const warningMessage: ChatMessage = {
          id: `${conversationId}-disconnection-warning-${Date.now()}`,
          role: "system",
          content: "⚠️ Codex session has been disconnected. Your previous conversation history cannot be resumed. Please start a new conversation to continue chatting with the AI assistant.",
          timestamp: Date.now(),
        };

        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id === conversationId) {
              return {
                ...conv,
                messages: [...conv.messages, warningMessage],
                updatedAt: Date.now(),
              };
            }
            return conv;
          }),
        }));
      },

      addMessage: (conversationId: string, message: ChatMessage) => {
        set((state) => {
          const updatedConversations = state.conversations.map((conv) => {
            if (conv.id === conversationId) {
              const updatedMessages = [...conv.messages, message];
              const title =
                conv.title === "New Conversation" &&
                updatedMessages.length === 1
                  ? generateTitle(updatedMessages)
                  : conv.title;

              return {
                ...conv,
                messages: updatedMessages,
                title,
                updatedAt: Date.now(),
              };
            }
            return conv;
          });

          return { conversations: updatedConversations };
        });
      },

      updateMessage: (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => {
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id === conversationId) {
              const updatedMessages = conv.messages.map((msg) => 
                msg.id === messageId ? { ...msg, ...updates } : msg
              );
              
              return {
                ...conv,
                messages: updatedMessages,
                updatedAt: Date.now(),
              };
            }
            return conv;
          }),
        }));
      },

      updateLastMessage: (conversationId: string, content: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id === conversationId && conv.messages.length > 0) {
              const updatedMessages = [...conv.messages];
              const lastMessage = updatedMessages[updatedMessages.length - 1];
              updatedMessages[updatedMessages.length - 1] = {
                ...lastMessage,
                content,
              };

              return {
                ...conv,
                messages: updatedMessages,
                updatedAt: Date.now(),
              };
            }
            return conv;
          }),
        }));
      },

      getCurrentConversation: () => {
        const { conversations, currentConversationId } = get();
        return (
          conversations.find((conv) => conv.id === currentConversationId) ||
          null
        );
      },

      getCurrentMessages: () => {
        const current = get().getCurrentConversation();
        return current?.messages || [];
      },
    }),
    {
      name: "conversation-storage", 
      version: 4,
      partialize: (state) => ({
        config: state.config,
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
      }),
      migrate: (persistedState: any, version: number) => {
        if (version < 4) {
          // Migrate from version 3: add config field
          persistedState.config = persistedState.config || DEFAULT_CONFIG;
        }

        return persistedState;
      },
    },
  ),
);
