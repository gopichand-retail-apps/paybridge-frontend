import { api, type WorkspaceProfile } from './api'

export async function loadWorkspaceProfiles(): Promise<WorkspaceProfile[]> {
  return (await api.profiles()).accounts
}
