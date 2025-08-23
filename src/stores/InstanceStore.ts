import { create } from "zustand"
import { Store } from "@tauri-apps/plugin-store"

export interface Instance {
  id: string
  name: string
  type: "local" | "ssh"
  status: "ready" | "error" | "connecting"
  host?: string
  port?: number
  username?: string
  keyPath?: string
}

interface InstanceState {
  instances: Instance[]
  activeId: string | null
  load: () => Promise<void>
  add: (inst: Instance) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  setActive: (id: string) => Promise<void>
}

const store = new Store("instances.store")

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  activeId: null,
  load: async () => {
    const instances = (await store.get<Instance[]>("instances")) || []
    const activeId = (await store.get<string>("activeId")) || null
    set({ instances, activeId })
  },
  add: async (inst: Instance) => {
    const instances = [...get().instances, inst]
    await store.set("instances", instances)
    await store.set("activeId", inst.id)
    await store.save()
    set({ instances, activeId: inst.id })
  },
  rename: async (id, name) => {
    const instances = get().instances.map(i => i.id === id ? { ...i, name } : i)
    await store.set("instances", instances)
    await store.save()
    set({ instances })
  },
  remove: async id => {
    const instances = get().instances.filter(i => i.id !== id)
    let activeId = get().activeId
    if (activeId === id) activeId = instances.length ? instances[0].id : null
    await store.set("instances", instances)
    await store.set("activeId", activeId)
    await store.save()
    set({ instances, activeId })
  },
  setActive: async id => {
    await store.set("activeId", id)
    await store.save()
    set({ activeId: id })
  }
}))
