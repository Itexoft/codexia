import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu"
import { Monitor, Server, Check, X, Loader2, Plus } from "lucide-react"
import { CreateInstanceDialog } from "./dialogs/CreateInstanceDialog"

interface Instance {
  id: string
  name: string
  type: "local" | "ssh"
  status: "ready" | "error" | "connecting"
  host?: string
  port?: number
  username?: string
}

export function InstanceTabs() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const addInstance = (data: { name: string; type: "local" | "ssh"; host?: string; port?: number; username?: string }) => {
    const id = Math.random().toString(36).slice(2)
    const instance: Instance = { id, status: "ready", ...data }
    setInstances(prev => [...prev, instance])
    setActive(id)
  }

  const renameInstance = (id: string) => {
    const inst = instances.find(i => i.id === id)
    if (!inst) return
    const name = window.prompt("Rename instance", inst.name)
    if (name) setInstances(prev => prev.map(i => i.id === id ? { ...i, name } : i))
  }

  const settingsInstance = (id: string) => {
    void id
    window.alert("Settings not implemented")
  }

  const deleteInstance = (id: string) => {
    if (window.confirm("Delete instance?")) {
      setInstances(prev => prev.filter(i => i.id !== id))
      if (active === id) setActive(null)
    }
  }

  const typeIcon = (type: "local" | "ssh") => {
    return type === "ssh" ? <Server className="w-3 h-3" /> : <Monitor className="w-3 h-3" />
  }

  const statusIcon = (status: "ready" | "error" | "connecting") => {
    if (status === "ready") return <Check className="w-3 h-3 text-green-500" />
    if (status === "error") return <X className="w-3 h-3 text-red-500" />
    return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
  }

  return (
    <>
      <Tabs value={active || undefined} onValueChange={setActive} className="flex">
        <TabsList className="flex items-center gap-2">
          {instances.map(inst => (
            <ContextMenu key={inst.id}>
              <ContextMenuTrigger asChild>
                <TabsTrigger value={inst.id} className="flex items-center gap-1">
                  {typeIcon(inst.type)}
                  {statusIcon(inst.status)}
                  <span>{inst.name}</span>
                </TabsTrigger>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => renameInstance(inst.id)}>Rename</ContextMenuItem>
                <ContextMenuItem onSelect={() => settingsInstance(inst.id)}>Settings</ContextMenuItem>
                <ContextMenuItem variant="destructive" onSelect={() => deleteInstance(inst.id)}>Delete</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
          <Button size="sm" className="h-6 w-6 p-0" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
          </Button>
        </TabsList>
      </Tabs>
      <CreateInstanceDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreate={addInstance} />
    </>
  )
}

