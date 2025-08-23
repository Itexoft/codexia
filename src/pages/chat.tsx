import { ChatView } from "@/components/ChatView";
import { NotesView } from "@/components/NotesView";
import { useLayoutStore } from "@/stores/layoutStore";
import { useFolderStore } from "@/stores/FolderStore";
import { FileTree } from "@/components/filetree/FileTreeView";
import { FileViewer } from "@/components/filetree/FileViewer";
import { GitStatusView } from "@/components/filetree/GitStatusView";
import { DiffViewer } from "@/components/filetree/DiffViewer";
import { useState } from "react";
import { ConfigDialog } from "@/components/dialogs/ConfigDialog";
import { AppToolbar } from "@/components/layout/AppToolbar";
import { useConversationStore } from "@/stores/ConversationStore";
import { useInstanceStore } from "@/stores/InstanceStore";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { invoke } from "@tauri-apps/api/core";
import { GitBranch } from "lucide-react";

export default function ChatPage() {

  const {
    showFileTree,
    showFilePanel,
    activeTab,
    selectedFile,
    openFile,
    closeFile,
  } = useLayoutStore();

  const {
    config,
    setConfig,
    createConversationWithLatestSession,
  } = useConversationStore();
  const { activeId } = useInstanceStore();

  const { currentFolder } = useFolderStore();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [diffFile, setDiffFile] = useState<{ original: string; current: string; fileName: string } | null>(null);

  const handleDiffClick = async (filePath: string) => {
    try {
      console.log('handleDiffClick called with:', filePath);
      console.log('currentFolder:', currentFolder);
      
      // Try with currentFolder first, then fallback to direct path
      const fullPath = currentFolder ? `${currentFolder}/${filePath}` : filePath;
      console.log('Trying full path:', fullPath);
      
      const result = await invoke<{ original_content: string; current_content: string; has_changes: boolean }>("get_git_file_diff", {
        filePath: fullPath
      });
      
      if (result.has_changes) {
        // Clear selected file to avoid conflicts
        closeFile();
        // Set diff file and ensure panel is visible
        setDiffFile({
          original: result.original_content,
          current: result.current_content,
          fileName: filePath
        });
      }
    } catch (error) {
      console.error("Failed to get diff:", error);
      console.error("Tried path:", currentFolder ? `${currentFolder}/${filePath}` : filePath);
    }
  };

  // No auto-initialization - let user start conversations manually

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left Panel - File Tree and Git Status */}
      {showFileTree && (
        <div className="w-64 border-r h-full flex-shrink-0">
          <Tabs defaultValue="files" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="git">
                <GitBranch size={14} className="mr-1.5" />
                Git
              </TabsTrigger>
            </TabsList>
            <TabsContent value="files" className="flex-1 overflow-hidden mt-0">
              <FileTree
                currentFolder={currentFolder || undefined}
                onFileClick={(path) => {
                  console.log('ChatPage: opening file from FileTree', path);
                  setDiffFile(null); // Clear any existing diff view
                  openFile(path);
                }}
              />
            </TabsContent>
            <TabsContent value="git" className="flex-1 overflow-hidden mt-0">
              <GitStatusView
                currentFolder={currentFolder || undefined}
                onDiffClick={handleDiffClick}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 h-full flex min-w-0 overflow-hidden">
        {/* Middle Panel - FileViewer or DiffViewer */}
        {(showFilePanel && selectedFile) || diffFile ? (
          <div className="flex-1 min-w-0 border-r overflow-hidden">
            {diffFile ? (
              <div className="h-full flex flex-col">
                <div className="p-2 border-b bg-gray-50 flex items-center justify-between">
                  <span className="text-sm font-medium">Diff: {diffFile.fileName}</span>
                  <button
                    onClick={() => setDiffFile(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
                <DiffViewer
                  original={diffFile.original}
                  current={diffFile.current}
                  fileName={diffFile.fileName}
                />
              </div>
            ) : selectedFile ? (
              <FileViewer filePath={selectedFile} onClose={closeFile} />
            ) : null}
          </div>
        ) : null}

        {/* Right Panel - Chat/Notes */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <AppToolbar
            onOpenConfig={() => setIsConfigOpen(true)}
            onCreateNewSession={() => createConversationWithLatestSession(undefined, "agent", activeId || undefined)}
          />
          {activeTab === "chat" ? (
            <ChatView />
          ) : activeTab === "notes" ? (
            <NotesView />
          ) : null}
        </div>
      </div>

      <ConfigDialog
        isOpen={isConfigOpen}
        config={config}
        onClose={() => setIsConfigOpen(false)}
        onSave={(newConfig) => {
          setConfig(newConfig);
        }}
      />
    </div>
  );
}
