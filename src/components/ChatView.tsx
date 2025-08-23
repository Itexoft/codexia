import React, { useState, useEffect, useMemo } from "react";
import { ChatInterface } from "./chat/ChatInterface";
import { ConversationTabs } from "./chat/ConversationTabs";
import { useConversationStore } from "@/stores/ConversationStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useInstanceStore } from "@/stores/InstanceStore";
import { sessionManager } from "@/services/sessionManager";
import { sessionLoader } from "@/services/sessionLoader";
import type { Conversation } from "@/types/chat";
import { invoke } from "@tauri-apps/api/core";
import { DebugInfo } from "./common/DebugInfo";

export const ChatView: React.FC = () => {
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [searchQueries, setSearchQueries] = useState({
    all: "",
    favorites: "",
    sessions: ""
  });
  const [historyConversations, setHistoryConversations] = useState<Conversation[]>([]);
  const [favoriteStatuses, setFavoriteStatuses] = useState<
    Record<string, boolean>
  >({});

  const {
    config,
    currentConversationId,
    conversations: allConversations,
    createConversationWithLatestSession,
    selectHistoryConversation,
    deleteConversation,
    setCurrentConversation,
    pendingNewConversation,
  } = useConversationStore();
  const { showSessionList, conversationListTab } = useLayoutStore();
  const { activeId } = useInstanceStore();

  // Don't auto-switch tabs to prevent unwanted tab changes when favoriting/deleting conversations
  // Users can manually switch tabs as needed

  // Clear selected conversation when starting a new conversation
  useEffect(() => {
    if (pendingNewConversation) {
      setSelectedConversation(null);
    }
  }, [pendingNewConversation]);

  // Also clear when currentConversationId changes to a new codex-event format (from toolbar button)
  useEffect(() => {
    if (currentConversationId && currentConversationId.startsWith('codex-event-')) {
      // Check if this is a new conversation (no messages)
      const currentConv = allConversations.find(conv => conv.id === currentConversationId);
      if (currentConv && currentConv.messages.length === 0) {
        setSelectedConversation(null);
      }
    }
  }, [currentConversationId, allConversations]);

  const loadHistory = async () => {
    try {
      const history = await sessionLoader.loadSessionsFromDisk();
      setHistoryConversations(history);

      const statuses: Record<string, boolean> = {};
      for (const conv of history) {
        statuses[conv.id] = await sessionLoader.isConversationFavorited(
          conv.id,
        );
      }
      setFavoriteStatuses(statuses);
    } catch (error) {
      console.error("Failed to load history conversations:", error);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const activeConversations = useMemo(() => allConversations.filter(c => !activeId || c.instanceId === activeId), [allConversations, activeId]);
  const filteredHistory = useMemo(() => historyConversations.filter(c => !activeId || c.instanceId === activeId), [historyConversations, activeId]);

  // Handle creating new conversation with latest session
  const handleCreateNewConversation = async () => {
    try {
      await createConversationWithLatestSession(undefined, "agent", activeId || undefined);
    } catch (error) {
      console.error("Failed to create new conversation:", error);
    }
  };

  // Handle conversation selection from history
  const handleConversationSelect = (conversation: Conversation) => {
    // Always create a new object to force re-render even if same conversation
    const conversationCopy = { ...conversation };
    
    // Store the selected conversation data
    setSelectedConversation(conversationCopy);

    // Use the new method to select history conversation with full data
    console.log("🔄 ChatView: Calling selectHistoryConversation", conversation.id);
    selectHistoryConversation(conversationCopy);
  };

  const handleSelectSession = (sessionId: string) => {
    // Set the current session ID for communication
    setCurrentConversation(sessionId);
  };

  const handleDeleteConversation = async (
    conversationId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    try {
      const conversation = historyConversations.find(
        (c) => c.id === conversationId,
      );
      if (conversation && conversation.filePath) {
        await invoke("delete_session_file", {
          filePath: conversation.filePath,
        });
      }
      deleteConversation(conversationId);
      setHistoryConversations((prev) =>
        prev.filter((c) => c.id !== conversationId),
      );
      setFavoriteStatuses((prev) => {
        const newStatus = { ...prev };
        delete newStatus[conversationId];
        return newStatus;
      });
    } catch (error) {
      console.error("Failed to delete conversation and session file:", error);
    }
  };

  const handleToggleFavorite = async (
    conversationId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    try {
      await sessionLoader.toggleFavorite(conversationId);

      // Update local favorite status
      setFavoriteStatuses((prev) => ({
        ...prev,
        [conversationId]: !prev[conversationId],
      }));
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  };

  const handleKillSession = async (sessionId: string) => {
    console.log(`💀 ChatView: Killing session ${sessionId}`);
    try {
      // First check if it's a timestamp format session
      const isTimestampFormat = sessionId.startsWith('codex-event-') && sessionId.includes('-') && 
        /\d{13}-[a-z0-9]+$/.test(sessionId.replace('codex-event-', ''));
      
      if (!isTimestampFormat) {
        console.log(`💀 Ignoring UUID session kill: ${sessionId}`);
        return;
      }

      // Extract the raw session ID for backend process management
      const rawSessionId = sessionId.replace('codex-event-', '');
      console.log(`🔄 Extracting raw session ID: ${rawSessionId}`);

      await sessionManager.stopSession(rawSessionId);
      console.log(`✅ Session stopped: ${sessionId}`);
      
      // Remove the conversation from the store to update UI
      deleteConversation(sessionId);
    } catch (error) {
      console.warn('Failed to kill session (session may have already been cleaned up):', error);
      // Don't throw error - session might have been cleaned up by hot reload or other reasons
    }
  };


  return (
    <div className="flex h-full min-h-0">
      {showSessionList && (
        <div className="w-64 border-r h-full overflow-y-auto flex-shrink-0">
          <div className="flex flex-col h-full bg-gray-50">
            
            <DebugInfo
              conversationListTab={conversationListTab}
              currentConversationId={currentConversationId}
              historyConversationsCount={filteredHistory.length}
              activeConversationsCount={activeConversations.length}
              searchQueries={searchQueries}
            />

            <ConversationTabs
              historyConversations={filteredHistory}
              favoriteStatuses={favoriteStatuses}
              activeConversations={activeConversations}
              currentConversationId={currentConversationId}
              activeSessionId={currentConversationId || ''}
              searchQueries={searchQueries}
              onSearchChange={setSearchQueries}
              onSelectConversation={handleConversationSelect}
              onToggleFavorite={handleToggleFavorite}
              onDeleteConversation={handleDeleteConversation}
              onSelectSession={handleSelectSession}
              onKillSession={handleKillSession}
              onRefreshConversations={loadHistory}
            />
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 h-full min-w-0">
        <ChatInterface
          sessionId={currentConversationId || ''}
          config={config}
          activeSessionId={currentConversationId || ''}
          onCreateSession={handleCreateNewConversation}
          onSelectSession={handleSelectSession}
          onCloseSession={deleteConversation}
          isSessionListVisible={false}
          selectedConversation={selectedConversation}
        />
      </div>
    </div>
  );
};
