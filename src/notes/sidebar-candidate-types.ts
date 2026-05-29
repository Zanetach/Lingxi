import type { GeneratedImageCandidate } from "./note-image-task-manager";

export type CandidateStatus = "pending" | "ready" | "inserted" | "discarded";

export interface SidebarInputImage {
  base64: string;
  mimeType: string;
  role: "reference";
  fileName: string;
  sourcePath?: string;
}

export interface SidebarImageCandidate extends GeneratedImageCandidate {
  status: CandidateStatus;
  sessionId: number;
  sequence: number;
  sourcePrompt: string;
  sourceContext: unknown | null;
  sourceInputImages: SidebarInputImage[];
}

export interface FailedGenerationTask {
  id: string;
  prompt: string;
  context: unknown | null;
  inputImages: SidebarInputImage[];
  errorMessage: string;
  createdAt: number;
}

export interface SidebarCandidateCallbacks {
  updateButtons: () => void;
  getPendingTaskCount: () => number;
  onRegenerateCandidate: (candidateId: string) => Promise<void>;
}
