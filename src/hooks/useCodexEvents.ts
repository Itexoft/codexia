import { useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ChatMessage, CodexEvent, ApprovalRequest } from '@/types/codex';
import { useConversationStore } from '../stores/ConversationStore';
import { useInstanceStore } from '../stores/InstanceStore';
import { StreamController, StreamControllerSink } from '@/utils/streamController';

interface UseCodexEventsProps {
  sessionId: string;
  onApprovalRequest: (request: ApprovalRequest) => void;
}

// Helper function to extract session ID from codex events
const getEventSessionId = (event: CodexEvent): string | null => {
  const { msg } = event;
  switch (msg.type) {
    case 'session_configured':
      return msg.session_id;
    default:
      return null; // For other events, we can't determine session ID, so process them
  }
};

export const useCodexEvents = ({ 
  sessionId, 
  onApprovalRequest
}: UseCodexEventsProps) => {
  const { addMessage, updateMessage, setSessionLoading, createConversation, conversations } = useConversationStore();
  const { activeId } = useInstanceStore();
  const streamController = useRef<StreamController>(new StreamController());
  const currentStreamingMessageId = useRef<string | null>(null);

  const addMessageToStore = (message: ChatMessage) => {
    // Ensure conversation exists
    const conversationExists = conversations.find(conv => conv.id === sessionId);
    if (!conversationExists) {
      console.log(`Creating conversation for session ${sessionId} from event`);
      createConversation('New Chat', 'agent', sessionId, activeId || undefined);
    }
    
    // Convert message format and add to store
    const conversationMessage = {
      id: message.id,
      role: message.type === 'user' ? 'user' as const : message.type === 'agent' ? 'assistant' as const : 'system' as const,
      content: message.content,
      timestamp: message.timestamp.getTime(),
    };
    console.log(`Adding message to session ${sessionId}:`, conversationMessage.content.substring(0, 100));
    addMessage(sessionId, conversationMessage);
  };

  // Create streaming sink for the controller
  const createStreamSink = useCallback((messageId: string): StreamControllerSink => {
    let accumulatedContent = '';
    
    return {
      insertLines: (lines: string[]) => {
        // Append new lines to accumulated content
        const newContent = lines.join('\n');
        if (accumulatedContent) {
          accumulatedContent += '\n' + newContent;
        } else {
          accumulatedContent = newContent;
        }
        updateMessage(sessionId, messageId, { content: accumulatedContent });
      },
      startAnimation: () => {
        // Animation started - could add visual indicators here
      },
      stopAnimation: () => {
        // Animation finished
      }
    };
  }, [sessionId, updateMessage]);

  const handleCodexEvent = (event: CodexEvent) => {
    const { msg } = event;
    
    switch (msg.type) {
      case 'session_configured':
        console.log('Session configured:', msg.session_id);
        // Session is now configured and ready
        break;
        
      case 'task_started':
        setSessionLoading(sessionId, true);
        // Clear any previous streaming state
        streamController.current.clearAll();
        currentStreamingMessageId.current = null;
        break;
        
      case 'task_complete':
        console.log('🔄 Task complete event received, setting loading to false');
        setSessionLoading(sessionId, false);
        // Finalize any ongoing stream
        if (currentStreamingMessageId.current) {
          streamController.current.finalize(true);
          currentStreamingMessageId.current = null;
        }
        break;
        
      case 'agent_message':
        // Handle complete message (fallback for non-streaming)
        if (msg.message && !currentStreamingMessageId.current) {
          const agentMessage: ChatMessage = {
            id: `${sessionId}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            type: 'agent',
            content: msg.message,
            timestamp: new Date(),
          };
          addMessageToStore(agentMessage);
        }
        break;
        
      case 'agent_message_delta':
        // Handle streaming delta
        if (!currentStreamingMessageId.current) {
          // Start new streaming message
          const messageId = `${sessionId}-stream-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
          currentStreamingMessageId.current = messageId;
          
          const streamingMessage: ChatMessage = {
            id: messageId,
            type: 'agent',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
          };
          addMessageToStore(streamingMessage);
          
          // Begin streaming with sink
          const sink = createStreamSink(messageId);
          streamController.current.begin(sink);
        }
        
        // Push delta to stream controller
        if (currentStreamingMessageId.current && msg.delta) {
          streamController.current.pushAndMaybeCommit(msg.delta);
        }
        break;
        
      case 'exec_approval_request':
        onApprovalRequest({
          id: event.id,
          type: 'exec',
          command: msg.command,
          cwd: msg.cwd,
        });
        break;
        
      case 'patch_approval_request':
        onApprovalRequest({
          id: event.id,
          type: 'patch',
          patch: msg.patch,
          files: msg.files,
        });
        break;
        
      case 'error':
        const errorMessage: ChatMessage = {
          id: `${sessionId}-error-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          type: 'system',
          content: `Error: ${msg.message}`,
          timestamp: new Date(),
        };
        addMessageToStore(errorMessage);
        setSessionLoading(sessionId, false);
        break;
        
      case 'shutdown_complete':
        console.log('Session shutdown completed');
        // Clean up streaming state on shutdown
        streamController.current.clearAll();
        currentStreamingMessageId.current = null;
        break;
        
      case 'background_event':
        console.log('Background event:', msg.message);
        break;
        
      case 'exec_command_begin':
        console.log('Command execution started');
        break;
        
      case 'exec_command_output_delta':
        console.log('Command output:', (msg as any).stream || '');
        break;
        
      case 'exec_command_end':
        console.log('Command execution completed');
        break;
        
      default:
        console.log('Unhandled event type:', msg.type);
    }
  };

  useEffect(() => {
    if (!sessionId) return;

    // Listen to the global codex-events channel
    const eventUnlisten = listen<CodexEvent>("codex-events", (event) => {
      const codexEvent = event.payload;
      
      // Check if this event is for our session
      const eventSessionId = getEventSessionId(codexEvent);
      const ourSessionId = sessionId.replace('codex-event-', '');
      
      if (eventSessionId && eventSessionId !== ourSessionId) {
        // This event is for a different session, ignore it
        return;
      }
      
      console.log(`Received codex event for session ${sessionId}:`, codexEvent);
      handleCodexEvent(codexEvent);
    });
    
    // Cleanup function
    return () => {
      eventUnlisten.then(fn => fn());
      // Clear streaming state when component unmounts or sessionId changes
      streamController.current.clearAll();
      currentStreamingMessageId.current = null;
    };
  }, [sessionId, createStreamSink]);

  return {};
};