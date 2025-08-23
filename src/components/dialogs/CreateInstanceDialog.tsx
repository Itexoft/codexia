import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface FormData {
  name: string
  host: string
  port: string
  username: string
  keyPath: string
}

interface CreateInstanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: { name: string; type: "local" | "ssh"; host?: string; port?: number; username?: string; keyPath?: string }) => void
}

export function CreateInstanceDialog({ open, onOpenChange, onCreate }: CreateInstanceDialogProps) {
  const [form, setForm] = useState<FormData>({ name: "", host: "", port: "22", username: "", keyPath: "" })

  const handleChange = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleCreate = () => {
    const type = form.host ? "ssh" : "local"
    onCreate({
      name: form.name,
      type,
      host: form.host || undefined,
      port: form.host ? Number(form.port) : undefined,
      username: form.host ? form.username : undefined,
      keyPath: form.host ? form.keyPath : undefined
    })
    setForm({ name: "", host: "", port: "22", username: "", keyPath: "" })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Instance</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder="Name" value={form.name} onChange={e => handleChange("name", e.target.value)} />
          <Input placeholder="Host" value={form.host} onChange={e => handleChange("host", e.target.value)} />
          <Input placeholder="Port" value={form.port} onChange={e => handleChange("port", e.target.value)} />
          <Input placeholder="Username" value={form.username} onChange={e => handleChange("username", e.target.value)} />
          <Input placeholder="Key Path" value={form.keyPath} onChange={e => handleChange("keyPath", e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!form.name}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

